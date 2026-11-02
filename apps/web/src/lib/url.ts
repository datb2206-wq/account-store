// Tạo href giữ lại các query param đang lọc, bỏ param rỗng
export function buildHref(path: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}
