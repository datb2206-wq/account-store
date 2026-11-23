import { NextResponse, type NextRequest } from 'next/server';

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// Chống CSRF lớp 2 (lớp 1 là cookie SameSite=Lax): request ghi dữ liệu phải đến từ chính site này
export function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

// LƯU Ý: x-forwarded-for chỉ tin được khi app đứng sau reverse proxy (Nginx/Cloudflare)
// tự ghi đè header này. Chạy trực tiếp ra Internet thì client có thể giả mạo.
export function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// URL tuyệt đối theo tên miền khách đang mở. Trên VPS (Next standalone sau nginx) req.url là http://0.0.0.0:3000,
// nên redirect phải lấy host / proto từ header nginx chuyển tới.
export function publicUrl(req: Request, path: string) {
  const h = req.headers;
  const host = h.get('host') ?? h.get('x-forwarded-host');
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return new URL(path, host ? `${proto}://${host}` : req.url);
}
