// Cài đặt bảo mật (Admin > Bảo mật): chống dò mật khẩu, giới hạn tài khoản / IP, 1 thiết bị, Captcha.
// Đọc SystemConfig "security", nhớ 60 giây trong RAM; chưa cấu hình -> SECURITY_DEFAULTS (giống hành vi cũ).
import { getConfig, type ConfigValue } from '@accszone/core';

export type SecuritySettings = ConfigValue<'security'>;

export const SECURITY_DEFAULTS: SecuritySettings = {
  loginFailIpLimit: 5,
  autoBlockHours: 24,
  loginFailAccountLimit: 10,
  maxAccountsPerIp: 0,
  singleSessionStaff: false,
  singleSessionUser: false,
  captcha: { enabled: false, siteKey: '', secretKey: '', onLogin: true, onRegister: true },
};

const TTL_MS = 60_000;
let cached: { value: SecuritySettings; at: number } | null = null;

export function clearSecurityCache() {
  cached = null;
}

export async function getSecurity(): Promise<SecuritySettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = SECURITY_DEFAULTS;
  try {
    value = await getConfig('security');
  } catch {} // chưa cấu hình / lỗi -> mặc định
  cached = { value, at: Date.now() };
  return value;
}

// Captcha đang bật cho form này và đã nhập đủ khóa
export function captchaActive(s: SecuritySettings, form: 'login' | 'register') {
  const c = s.captcha;
  return c.enabled && !!c.siteKey && !!c.secretKey && (form === 'login' ? c.onLogin : c.onRegister);
}

// Xác minh Cloudflare Turnstile ở server. Lỗi mạng tới Cloudflare -> coi như không qua (an toàn hơn).
export async function verifyCaptcha(secretKey: string, token: unknown, ip: string) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return data?.success === true;
  } catch {
    return false;
  }
}

export const CAPTCHA_ERROR = 'Please complete the captcha';
