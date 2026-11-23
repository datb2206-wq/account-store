// Chạy 1 lần khi server Next khởi động. Worker chết hẳn thì không tự báo được -> web kiểm tra nhịp của worker
// (worker ghi Redis mỗi phút) mỗi 5 phút, quá 10 phút không thấy thì báo Telegram "lỗi nghiêm trọng".
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const [{ getRedis }, { reportSystemError, reportSystemOk }] = await Promise.all([import('./lib/redis'), import('@accszone/core')]);
  const startedAt = Date.now();
  const LIMIT_MS = 10 * 60_000;
  const check = async () => {
    if (Date.now() - startedAt < LIMIT_MS) return; // vừa deploy, worker có thể đang khởi động
    try {
      const last = Number(await getRedis().get('monitor:worker:heartbeat')) || 0;
      if (Date.now() - last > LIMIT_MS) {
        const mins = last ? `${Math.round((Date.now() - last) / 60_000)} phút` : 'không rõ bao lâu';
        await reportSystemError('worker', 'Worker (nạp USDT tự động, đồng bộ nguồn API, giao đơn API) đã dừng', `Không thấy worker hoạt động ${mins}. Kiểm tra container worker trên VPS.`);
      } else {
        await reportSystemOk('worker', 'Worker hoạt động lại bình thường');
      }
    } catch (err) {
      console.warn(`[monitor] worker check: ${err instanceof Error ? err.message : err}`);
    }
  };
  setInterval(() => void check(), 5 * 60_000).unref();
}
