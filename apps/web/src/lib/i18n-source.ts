// Tên/mô tả đã dịch sang tiếng Anh giữ bản gốc của web nguồn ở khóa 'src' (xem packages/core/src/translate.ts).
// Form admin chỉ gửi các ngôn ngữ hiển thị -> khi lưu phải giữ lại 'src', nếu không đồng bộ sau sẽ tưởng nguồn đổi tên.
export function keepSource(before: unknown, next: Record<string, string>): Record<string, string> {
  const src = before && typeof before === 'object' && !Array.isArray(before) ? (before as Record<string, unknown>).src : undefined;
  return typeof src === 'string' ? { ...next, src } : next;
}
