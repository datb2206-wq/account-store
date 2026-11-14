// Worker BullMQ: chạy song song với web (pnpm dev chạy cả 2).
//   expire-deposits  mỗi 1 phút  -> đánh dấu yêu cầu nạp hết hạn
//   scan-usdt        mỗi 1 phút  -> tự phát hiện / xác nhận giao dịch USDT
//   sync-suppliers   mỗi N phút  -> tạo job sync-supplier cho từng nhà cung cấp đang bật
//   sweep-reseller-orders mỗi 1 phút -> đơn RESELLER còn PENDING: kiểm tra lại web gốc / hoàn tiền sau 24h
//   update-fx-rates  mỗi FX_UPDATE_HOURS giờ (chỉ khi đặt FX_RATES_URL) -> cập nhật tỷ giá currency.rates
//   run-automations  mỗi 5 phút  -> công việc tự động admin tạo (dọn dữ liệu cũ)
//   send-email-campaigns mỗi 1 phút -> gửi tiếp 1 đợt email chiến dịch
//   fulfill-order    theo sự kiện -> web đẩy vào ngay khi khách mua hàng RESELLER
import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@accszone/database';
import { AUTOMATION_EVERY_MS, decrypt, expireStaleDeposits, fulfillResellerOrder, getAdapter, notifyLowBalance, processEmailCampaigns, runDueAutomations, scanUsdtDeposits, sweepResellerOrders, syncSupplier, updateFxRates } from '@accszone/core';
import {
  FULFILL_JOB_OPTIONS,
  fulfillJobId,
  JOBS,
  QUEUE_NAME,
  redisConnectionOptions,
  SYNC_JOB_OPTIONS,
  syncSupplierJobId,
  type FulfillOrderData,
  type SyncSupplierData,
} from '@accszone/core/queue';

const SYNC_MINUTES = Number(process.env.SUPPLIER_SYNC_MINUTES || 10);
const FX_RATES_URL = process.env.FX_RATES_URL?.trim() || '';
const FX_UPDATE_HOURS = Number(process.env.FX_UPDATE_HOURS || 6);
// Worker bắt buộc maxRetriesPerRequest = null (BullMQ dùng lệnh block của Redis)
const connection = { ...redisConnectionOptions(process.env.REDIS_URL), maxRetriesPerRequest: null };

const log = (scope: string) => ({
  info: (msg: string) => console.log(`${new Date().toISOString()} [${scope}] ${msg}`),
  warn: (msg: string) => console.warn(`${new Date().toISOString()} [${scope}] ⚠ ${msg}`),
});

const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: { removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } },
});

// jobId cố định theo đơn: web vừa đẩy job mà job quét cũng nhặt đơn đó -> không chạy trùng
const enqueueFulfill = (orderId: string) =>
  queue.add(JOBS.fulfillOrder, { orderId } satisfies FulfillOrderData, { ...FULFILL_JOB_OPTIONS, jobId: fulfillJobId(orderId) });

// Số dư tại nguồn API dưới ngưỡng (Admin > Thông báo Telegram) -> báo Telegram. Lỗi ở đây không làm hỏng job đồng bộ.
async function checkSupplierBalance(supplierId: string) {
  try {
    const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true, adapter: true, baseUrl: true, apiKeyEnc: true } });
    const adapter = s && getAdapter(s.adapter);
    if (!s || !adapter?.getBalance) return;
    const balance = Number(await adapter.getBalance({ baseUrl: s.baseUrl, apiKey: decrypt(s.apiKeyEnc) }));
    if (Number.isFinite(balance)) await notifyLowBalance(supplierId, s.name, balance);
  } catch (err) {
    log('sync').warn(`balance check ${supplierId}: ${err instanceof Error ? err.message : err}`);
  }
}

async function processJob(job: Job) {
  switch (job.name) {
    case JOBS.expireDeposits: {
      const { count } = await expireStaleDeposits();
      if (count > 0) log('expire').info(`marked ${count} deposit(s) as EXPIRED`);
      return { expired: count };
    }

    case JOBS.scanUsdt: {
      const result = await scanUsdtDeposits(log('usdt'));
      if (result.credited || result.autoMatched || result.errors) log('usdt').info(JSON.stringify(result));
      return result;
    }

    case JOBS.syncSuppliers: {
      const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, select: { id: true } });
      for (const s of suppliers) {
        await queue.add(JOBS.syncSupplier, { supplierId: s.id, trigger: 'schedule' } satisfies SyncSupplierData, {
          ...SYNC_JOB_OPTIONS,
          jobId: syncSupplierJobId(s.id),
        });
      }
      return { queued: suppliers.length };
    }

    case JOBS.syncSupplier: {
      const data = job.data as SyncSupplierData;
      try {
        const result = await syncSupplier(data.supplierId);
        log('sync').info(JSON.stringify(result));
        await checkSupplierBalance(data.supplierId);
        await prisma.auditLog.create({
          data: { actorId: data.actorId ?? null, action: 'supplier.sync', entity: 'Supplier', entityId: data.supplierId, after: { ...result, trigger: data.trigger } },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('sync').warn(`supplier ${data.supplierId}: ${message}`);
        await prisma.auditLog.create({
          data: { actorId: data.actorId ?? null, action: 'supplier.sync.failed', entity: 'Supplier', entityId: data.supplierId, after: { error: message, trigger: data.trigger, attempt: job.attemptsMade + 1 } },
        });
        throw err;
      }
    }

    case JOBS.fulfillOrder: {
      const { orderId } = job.data as FulfillOrderData;
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      return { outcome: await fulfillResellerOrder(orderId, { isLastAttempt }, log('order')) };
    }

    case JOBS.sweepOrders: {
      const ids = await sweepResellerOrders(log('order'));
      for (const orderId of ids) await enqueueFulfill(orderId);
      return { queued: ids.length };
    }

    case JOBS.emailCampaigns:
      return processEmailCampaigns(log('email'));

    case JOBS.automations:
      return runDueAutomations(log('auto'));

    case JOBS.updateFx:
      if (!FX_RATES_URL) return { skipped: true };
      return updateFxRates(FX_RATES_URL, log('fx'));

    default:
      throw new Error(`Unknown job: ${job.name}`);
  }
}

async function main() {
  // upsertJobScheduler: idempotent, khởi động lại worker không tạo lịch trùng
  await queue.upsertJobScheduler(JOBS.expireDeposits, { every: 60_000 }, { name: JOBS.expireDeposits });
  await queue.upsertJobScheduler(JOBS.scanUsdt, { every: 60_000 }, { name: JOBS.scanUsdt });
  await queue.upsertJobScheduler(JOBS.syncSuppliers, { every: SYNC_MINUTES * 60_000 }, { name: JOBS.syncSuppliers });
  await queue.upsertJobScheduler(JOBS.sweepOrders, { every: 60_000 }, { name: JOBS.sweepOrders });
  await queue.upsertJobScheduler(JOBS.emailCampaigns, { every: 60_000 }, { name: JOBS.emailCampaigns });
  await queue.upsertJobScheduler(JOBS.automations, { every: AUTOMATION_EVERY_MS }, { name: JOBS.automations });
  if (FX_RATES_URL) {
    await queue.upsertJobScheduler(JOBS.updateFx, { every: FX_UPDATE_HOURS * 3600_000 }, { name: JOBS.updateFx });
    await queue.add(JOBS.updateFx, {}, { jobId: `fx-startup-${Date.now()}` }); // chạy 1 lần ngay khi khởi động
  } else {
    await queue.removeJobScheduler(JOBS.updateFx); // đã tắt FX_RATES_URL -> gỡ lịch cũ
  }

  const worker = new Worker(QUEUE_NAME, processJob, { connection, concurrency: 3 });
  worker.on('failed', (job, err) => log('worker').warn(`job ${job?.name} (${job?.id}) failed: ${err.message}`));
  worker.on('error', (err) => log('worker').warn(`worker error: ${err.message}`));
  log('worker').info(`started — queue "${QUEUE_NAME}", supplier sync every ${SYNC_MINUTES} min`);

  const shutdown = async (signal: string) => {
    log('worker').info(`${signal} received, shutting down…`);
    await worker.close(); // chờ job đang chạy xong
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
