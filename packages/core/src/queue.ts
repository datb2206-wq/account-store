// Định nghĩa queue dùng chung cho web (thêm job) và worker (xử lý job).
// File này KHÔNG import bullmq để web/worker tự tạo Queue với kết nối của mình.

export const QUEUE_NAME = 'accszone';

export const JOBS = {
  expireDeposits: 'expire-deposits',
  scanUsdt: 'scan-usdt',
  syncSuppliers: 'sync-suppliers', // định kỳ: tạo 1 job sync-supplier cho mỗi nhà cung cấp đang bật
  syncSupplier: 'sync-supplier',
  fulfillOrder: 'fulfill-order', // đặt hàng sang web gốc cho 1 đơn RESELLER
  sweepOrders: 'sweep-reseller-orders', // định kỳ: nhặt đơn RESELLER còn PENDING (kiểm tra lại / hết hạn)
  updateFx: 'update-fx-rates', // định kỳ (nếu đặt FX_RATES_URL): cập nhật currency.rates
  automations: 'run-automations',
  translations: 'process-translations', // mỗi phút: dịch tiếp tên / mô tả sản phẩm (Admin > Dịch sản phẩm)
  emailCampaigns: 'send-email-campaigns', // mỗi phút: gửi tiếp 1 đợt email chiến dịch // định kỳ: chạy công việc tự động (Admin > Tự động hóa)
} as const;

export interface FulfillOrderData {
  orderId: string;
}

export const fulfillJobId = (orderId: string) => `fulfill-${orderId}`;

// Lỗi mạng/5xx khi đặt hàng: thử lại 10s, 20s, 40s rồi mới hoàn tiền
export const FULFILL_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

export interface SyncSupplierData {
  supplierId: string;
  trigger: 'schedule' | 'manual';
  actorId?: string;
}

// BullMQ không nhận ioredis URL trực tiếp -> tách "redis://:pass@host:port/db" thành options
export function redisConnectionOptions(url: string | undefined) {
  if (!url) throw new Error('REDIS_URL chưa được cấu hình trong .env');
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    ...(u.protocol === 'rediss:' && { tls: {} }),
  };
}

// jobId cố định -> bấm "Đồng bộ ngay" nhiều lần khi job cũ chưa chạy xong không tạo job trùng
export const syncSupplierJobId = (supplierId: string) => `sync-supplier-${supplierId}`;

// Xóa job khi xong (kể cả lỗi) để jobId cố định dùng lại được; lịch sử nằm ở AuditLog
export const SYNC_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: true,
};
