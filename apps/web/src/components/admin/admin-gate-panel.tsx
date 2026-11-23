'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';
import { Panel } from './ui';

// Link đăng nhập admin bí mật (chỉ super admin thấy)
export function AdminGatePanel({ url: initialUrl }: { url: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(action: 'rotate' | 'disable') {
    const ask =
      action === 'rotate'
        ? url
          ? 'Đổi link mới? Link cũ hết tác dụng ngay, mọi admin / nhân viên phải dùng link mới để đăng nhập.'
          : 'Bật link đăng nhập admin bí mật? Sau đó /admin sẽ ẩn với người ngoài, admin / nhân viên phải mở link này mới đăng nhập được.'
        : 'Tắt link bí mật? Trang /admin và đăng nhập admin sẽ mở lại như trước.';
    if (!window.confirm(ask)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/security/admin-gate', 'POST', { action });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Thất bại');
    const next = (res.data as { url?: string | null }).url ?? null;
    setUrl(next);
    setShow(!!next);
    setSuccess(next ? 'Đã tạo link mới. Lưu lại link này ở nơi an toàn (VD lưu dấu trang trình duyệt).' : 'Đã tắt link bí mật.');
    router.refresh();
  }

  return (
    <Panel title="Link đăng nhập admin bí mật" bodyClassName="space-y-4 p-5">
      <FormAlert error={error} success={success} />
      <p className="text-sm text-zinc-500">
        Bật lên thì người ngoài vào <code className="rounded bg-zinc-100 px-1">/admin</code> chỉ thấy trang chủ, và tài khoản admin / nhân viên <b>không đăng nhập được</b> ở trang đăng nhập thường
        (báo sai mật khẩu). Muốn vào admin phải mở đúng link bí mật dưới đây, sau đó đăng nhập như bình thường. Mỗi trình duyệt chỉ cần mở link 1 lần (nhớ 90 ngày).
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">{show ? url : url.replace(/\/k\/.+$/, '/k/••••••••••••••••••••')}</code>
            <button type="button" className="btn-ghost border border-zinc-200" onClick={() => setShow((s) => !s)}>{show ? 'Ẩn' : 'Hiện'}</button>
            <button type="button" className="btn-ghost border border-zinc-200" onClick={() => void navigator.clipboard?.writeText(url).then(() => setSuccess('Đã copy link.'))}>Copy</button>
          </div>
          <p className="text-xs text-amber-700">⚠️ Không gửi link này lên nhóm chat công khai. Chỉ đưa cho nhân viên bạn tin tưởng. Lộ link thì bấm &quot;Đổi link mới&quot;.</p>
        </div>
      ) : (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">Đang tắt: /admin và đăng nhập admin mở như bình thường.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => void run('rotate')}>{url ? 'Đổi link mới' : 'Bật link bí mật'}</button>
        {url && <button type="button" className="btn-ghost border border-zinc-200" disabled={pending} onClick={() => void run('disable')}>Tắt</button>}
      </div>
    </Panel>
  );
}
