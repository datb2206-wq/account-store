// Công việc tự động (Admin > Tự động hóa). Worker gọi runDueAutomations() định kỳ;
// admin bấm "Chạy ngay" thì gọi runAutomation(). Mọi loại chỉ XÓA dữ liệu cũ, không đụng tới tiền:
//   sold_stock      tài khoản đã bán (nội dung giao cho khách) -> bảo mật dữ liệu, giảm dung lượng DB
//   invalid_stock   tài khoản lỗi (INVALID) trong kho
//   audit_logs      nhật ký hoạt động
//   stale_deposits  yêu cầu nạp đã hết hạn / bị từ chối (chưa cộng tiền) + ảnh biên lai kèm theo
import { prisma } from '@accszone/database';

export const AUTOMATION_TYPES = {
  sold_stock: {
    label: 'Xóa tài khoản đã bán',
    hint: 'Xóa nội dung tài khoản đã giao cho khách sau khoảng thời gian đã chọn. Khách sẽ không xem lại được tài khoản của đơn cũ, nên nhắc khách tải về sau khi mua.',
  },
  invalid_stock: { label: 'Xóa tài khoản lỗi trong kho', hint: 'Xóa các tài khoản đã bị đánh dấu lỗi (INVALID).' },
  audit_logs: { label: 'Dọn nhật ký hoạt động', hint: 'Xóa nhật ký hoạt động (đăng nhập, thao tác admin...) cũ.' },
  stale_deposits: {
    label: 'Dọn yêu cầu nạp hết hạn / bị từ chối',
    hint: 'Chỉ xóa yêu cầu nạp chưa từng được cộng tiền (hết hạn hoặc bị từ chối) và ảnh biên lai kèm theo. Giao dịch đã cộng tiền luôn được giữ.',
  },
} as const;

export type AutomationType = keyof typeof AUTOMATION_TYPES;
export const isAutomationType = (t: string): t is AutomationType => t in AUTOMATION_TYPES;

// Thời gian tối thiểu: tránh lỡ tay đặt 0 giây xóa sạch dữ liệu mới
export const MIN_OLDER_THAN_SEC = 3600;
// Mỗi lần chạy xóa tối đa từng ấy dòng, phần còn lại để lần sau (không khóa bảng lâu)
const BATCH = 5000;
// Worker chạy công việc lại sau mỗi khoảng này
export const AUTOMATION_EVERY_MS = 5 * 60_000;

async function deleteBatch(type: AutomationType, cutoff: Date): Promise<{ count: number; noun: string }> {
  switch (type) {
    case 'sold_stock': {
      const rows = await prisma.stockItem.findMany({ where: { status: 'SOLD', soldAt: { lt: cutoff } }, select: { id: true }, take: BATCH });
      const { count } = await prisma.stockItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return { count, noun: 'tài khoản đã bán' };
    }
    case 'invalid_stock': {
      const rows = await prisma.stockItem.findMany({ where: { status: 'INVALID', createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH });
      const { count } = await prisma.stockItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return { count, noun: 'tài khoản lỗi' };
    }
    case 'audit_logs': {
      const rows = await prisma.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH });
      const { count } = await prisma.auditLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      return { count, noun: 'dòng nhật ký' };
    }
    case 'stale_deposits': {
      const rows = await prisma.transaction.findMany({
        where: { type: 'DEPOSIT', status: { in: ['EXPIRED', 'REJECTED'] }, createdAt: { lt: cutoff } },
        select: { id: true, proofImageUrl: true },
        take: BATCH,
      });
      const proofs = rows.map((r) => r.proofImageUrl).filter((k): k is string => !!k);
      const [, { count }] = await prisma.$transaction([
        prisma.uploadedFile.deleteMany({ where: { key: { in: proofs } } }),
        // Điều kiện status lặp lại: dòng vừa được duyệt giữa 2 câu lệnh thì không bị xóa
        prisma.transaction.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, status: { in: ['EXPIRED', 'REJECTED'] } } }),
      ]);
      return { count, noun: 'yêu cầu nạp' };
    }
  }
}

export async function runAutomation(taskId: string) {
  const task = await prisma.automationTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Công việc không tồn tại');
  if (!isAutomationType(task.type)) throw new Error(`Loại công việc không hợp lệ: ${task.type}`);
  const cutoff = new Date(Date.now() - Math.max(task.olderThanSec, MIN_OLDER_THAN_SEC) * 1000);
  let result: string;
  try {
    const { count, noun } = await deleteBatch(task.type, cutoff);
    result = count ? `Đã xóa ${count.toLocaleString('en-US')} ${noun}${count === BATCH ? ' (còn nữa, lần sau xóa tiếp)' : ''}` : `Không có ${noun} nào cần xóa`;
  } catch (err) {
    result = `Lỗi: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
  }
  await prisma.automationTask.update({ where: { id: taskId }, data: { lastRunAt: new Date(), lastResult: result } });
  return result;
}

// Chạy các công việc đang bật đã quá AUTOMATION_EVERY_MS kể từ lần chạy trước
export async function runDueAutomations(log: { info: (m: string) => void }) {
  const due = await prisma.automationTask.findMany({
    where: { isActive: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(Date.now() - AUTOMATION_EVERY_MS + 30_000) } }] },
    select: { id: true, name: true },
  });
  for (const t of due) log.info(`${t.name}: ${await runAutomation(t.id)}`);
  return { ran: due.length };
}
