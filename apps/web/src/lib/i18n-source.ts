// Tên/mô tả đã dịch sang tiếng Anh giữ bản gốc của web nguồn ở khóa 'src' (xem packages/core/src/translate.ts).
// Form admin chỉ gửi các ngôn ngữ hiển thị -> khi lưu phải giữ lại 'src', nếu không đồng bộ sau sẽ tưởng nguồn đổi tên.
// lock: true/false = đặt / bỏ khóa bản dịch ('lock' trong JSON), undefined = giữ như cũ.
export function keepSource(before: unknown, next: Record<string, string>, lock?: boolean): Record<string, string> {
  const b = before && typeof before === 'object' && !Array.isArray(before) ? (before as Record<string, unknown>) : {};
  const { src: _s, lock: _l, ...out } = next as Record<string, string>;
  if (typeof b.src === 'string') out.src = b.src;
  if (lock ?? !!b.lock) out.lock = '1';
  return out;
}
