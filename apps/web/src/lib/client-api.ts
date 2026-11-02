// crypto.randomUUID chỉ có trên HTTPS/localhost -> fallback khi truy cập qua IP LAN bằng http
export function newIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Dùng trong Client Component. Gặp 401 (access token hết hạn) -> tự refresh 1 lần rồi gọi lại.
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; fields?: Record<string, string[] | undefined> };
}

export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<ApiResult<T>> {
  // FormData (tải file): gửi nguyên, trình duyệt tự đặt Content-Type multipart kèm boundary
  const isForm = body instanceof FormData;
  const send = () =>
    fetch(url, {
      method,
      headers: { ...(body === undefined || isForm ? undefined : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

  try {
    let res = await send();
    if (res.status === 401) {
      const refreshed = await fetch('/api/auth/refresh', { method: 'POST' });
      if (refreshed.ok) res = await send();
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error, please try again' } as ApiResult<T>['data'] };
  }
}
