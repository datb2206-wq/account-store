// Web chỉ THÊM job vào queue; apps/worker mới là nơi xử lý.
import { Queue } from 'bullmq';
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

const globalForQueue = globalThis as unknown as { queue?: Queue };

function getQueue() {
  globalForQueue.queue ??= new Queue(QUEUE_NAME, { connection: redisConnectionOptions(process.env.REDIS_URL) });
  return globalForQueue.queue;
}

export async function enqueueSupplierSync(supplierId: string, actorId: string) {
  const data: SyncSupplierData = { supplierId, trigger: 'manual', actorId };
  const job = await getQueue().add(JOBS.syncSupplier, data, { ...SYNC_JOB_OPTIONS, jobId: syncSupplierJobId(supplierId) });
  return job.id;
}

export async function enqueueOrderFulfillment(orderId: string) {
  await getQueue().add(JOBS.fulfillOrder, { orderId } satisfies FulfillOrderData, { ...FULFILL_JOB_OPTIONS, jobId: fulfillJobId(orderId) });
}

// Admin bấm "Kiểm tra lại ngay": job đang chờ backoff -> chạy ngay; chưa có job -> tạo mới
export async function retryOrderFulfillment(orderId: string) {
  const job = await getQueue().getJob(fulfillJobId(orderId));
  if (job) {
    if (await job.isDelayed()) {
      await job.promote();
      return 'promoted' as const;
    }
    return 'already-queued' as const;
  }
  await enqueueOrderFulfillment(orderId);
  return 'queued' as const;
}

// Worker có đang chạy không. getWorkersCount dựa vào CLIENT LIST, Redis managed (VD Upstash) không hỗ trợ
// nên luôn trả 0 -> dự phòng: worker chạy job định kỳ mỗi phút, có job vừa hoàn tất / đang chạy = worker sống.
const WORKER_ALIVE_MS = 3 * 60 * 1000;

export async function workerOnline() {
  try {
    const queue = getQueue();
    if ((await queue.getWorkersCount()) > 0) return true;
    if ((await queue.getActiveCount()) > 0) return true;
    const [last] = await queue.getJobs(['completed', 'failed'], 0, 0, false);
    return !!last?.finishedOn && Date.now() - last.finishedOn < WORKER_ALIVE_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Thông báo hàng loạt qua bot bán hàng
const BROADCAST_LAST_KEY = 'tg:broadcast:last';

export async function enqueueShopBroadcast(text: string, actorId: string) {
  const job = await getQueue().add(JOBS.tgBroadcast, { text, actorId }, { jobId: `tg-broadcast-${Date.now()}`, removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } });
  const { getRedis } = await import('./redis');
  await getRedis().set(BROADCAST_LAST_KEY, job.id ?? '', 'EX', 30 * 86400);
  return job.id;
}

export type ShopBroadcastStatus = { id: string; text: string; state: string; createdAt: number; total: number; sent: number; failed: number; done: boolean };

export async function lastShopBroadcast(): Promise<ShopBroadcastStatus | null> {
  try {
    const { getRedis } = await import('./redis');
    const id = await getRedis().get(BROADCAST_LAST_KEY);
    const job = id ? await getQueue().getJob(id) : null;
    if (!job) return null;
    const p = (typeof job.progress === 'object' ? job.progress : {}) as Partial<ShopBroadcastStatus>;
    return { id: job.id ?? '', text: String(job.data?.text ?? ''), state: await job.getState(), createdAt: job.timestamp, total: p.total ?? 0, sent: p.sent ?? 0, failed: p.failed ?? 0, done: !!p.done };
  } catch {
    return null;
  }
}
