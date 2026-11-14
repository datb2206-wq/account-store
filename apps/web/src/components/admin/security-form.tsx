'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import type { SecuritySettings } from '@/lib/security';
import { FormAlert } from './form-field';
import { Panel } from './ui';

type Form = Omit<SecuritySettings, 'captcha'> & { captcha: Omit<SecuritySettings['captcha'], 'secretKey'> & { secretKey: string } };

function NumberRow({ label, hint, unit, value, onChange }: { label: string; hint: string; unit: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      <div className="flex">
        <input className="input rounded-r-none tabular-nums" inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        <span className="grid place-items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-50 px-3 whitespace-nowrap text-zinc-500">{unit}</span>
      </div>
      <span className="mt-1 block text-xs text-zinc-400">{hint}</span>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium text-zinc-700">{label}</span>
        <span className="block text-xs text-zinc-400">{hint}</span>
      </span>
    </label>
  );
}

export function SecurityForm({ initial, hasSecret }: { initial: SecuritySettings; hasSecret: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Form>({ ...initial, captcha: { ...initial.captcha, secretKey: '' } });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((s) => ({ ...s, ...patch }));
  const setCaptcha = (patch: Partial<Form['captcha']>) => setF((s) => ({ ...s, captcha: { ...s.captcha, ...patch } }));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/security', 'PUT', f);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      return;
    }
    setSuccess('Đã lưu. Áp dụng trong vòng 1 phút.');
    setCaptcha({ secretKey: '' });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <FormAlert error={error} success={success} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Chống dò mật khẩu (brute force)" bodyClassName="space-y-4 p-5">
          <NumberRow label="Khóa IP nếu đăng nhập sai quá" unit="lần / 15 phút" hint="Khuyến nghị ≤ 5. Áp dụng cho mọi email đăng nhập từ cùng 1 IP." value={f.loginFailIpLimit} onChange={(n) => set({ loginFailIpLimit: n })} />
          <NumberRow label="Thời gian khóa IP" unit="giờ" hint="IP bị khóa không đăng nhập, đăng ký, mua hay nạp được. Gỡ tay ở trang Block IP." value={f.autoBlockHours} onChange={(n) => set({ autoBlockHours: n })} />
          <NumberRow label="Tạm khóa đăng nhập tài khoản nếu sai quá" unit="lần / 15 phút" hint="Khuyến nghị ≤ 10. Chống dò mật khẩu 1 tài khoản từ nhiều IP khác nhau." value={f.loginFailAccountLimit} onChange={(n) => set({ loginFailAccountLimit: n })} />
        </Panel>

        <Panel title="Kiểm soát truy cập" bodyClassName="space-y-4 p-5">
          <NumberRow label="Số tài khoản đăng ký tối đa của 1 IP" unit="tài khoản" hint="0 = không giới hạn. Chỉ tính các tài khoản đăng ký sau khi bật tính năng này." value={f.maxAccountsPerIp} onChange={(n) => set({ maxAccountsPerIp: n })} />
          <Toggle label="Admin / nhân viên chỉ đăng nhập 1 thiết bị" hint="Đăng nhập ở thiết bị mới thì thiết bị cũ bị đăng xuất ngay. Khuyến nghị bật." checked={f.singleSessionStaff} onChange={(v) => set({ singleSessionStaff: v })} />
          <Toggle label="Khách chỉ đăng nhập 1 thiết bị" hint="Chống chia sẻ tài khoản. Khách dùng điện thoại + máy tính sẽ bị đăng xuất qua lại." checked={f.singleSessionUser} onChange={(v) => set({ singleSessionUser: v })} />
        </Panel>

        <Panel title="Captcha chống spam (Cloudflare Turnstile)" bodyClassName="space-y-4 p-5">
          <Toggle label="Bật Captcha" hint="Miễn phí. Tạo khóa tại dash.cloudflare.com → Turnstile → Add widget (thêm tên miền web của bạn)." checked={f.captcha.enabled} onChange={(v) => setCaptcha({ enabled: v })} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Site Key</span>
            <input className="input font-mono text-xs" value={f.captcha.siteKey} onChange={(e) => setCaptcha({ siteKey: e.target.value })} placeholder="0x4AAAAAAA..." autoComplete="off" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Secret Key</span>
            <input
              className="input font-mono text-xs"
              type="password"
              name="turnstile-secret"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={f.captcha.secretKey}
              onChange={(e) => setCaptcha({ secretKey: e.target.value })}
              placeholder={hasSecret ? 'Đã lưu, để trống = giữ nguyên' : '0x4AAAAAAA...'}
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <Toggle label="Áp dụng khi đăng nhập" hint="" checked={f.captcha.onLogin} onChange={(v) => setCaptcha({ onLogin: v })} />
            <Toggle label="Áp dụng khi đăng ký" hint="" checked={f.captcha.onRegister} onChange={(v) => setCaptcha({ onRegister: v })} />
          </div>
        </Panel>
      </div>

      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu cài đặt bảo mật'}</button>
    </div>
  );
}
