// Next build file này cho cả Node lẫn Edge: phần dùng thư viện Node (Redis, nodemailer...) nằm ở instrumentation-node.ts,
// chỉ import khi chạy Node (điều kiện viết thẳng để Next loại bỏ khỏi bản Edge).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMonitor } = await import('./instrumentation-node');
    await startMonitor();
  }
}
