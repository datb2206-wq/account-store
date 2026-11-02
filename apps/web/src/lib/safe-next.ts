// Chống open-redirect: chỉ chấp nhận đường dẫn nội bộ dạng "/abc", không nhận "//evil.com".
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null;
  }
  return value;
}
