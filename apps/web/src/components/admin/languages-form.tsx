'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LOCALE_META, LOCALES, type Locale } from '@/i18n/config';
import { apiRequest } from '@/lib/client-api';
import { Flag } from '@/components/i18n/flag';
import { FormAlert } from './form-field';
import { Panel } from './ui';

// Ngôn ngữ khách chọn được trên web + bot Telegram, và ngôn ngữ mặc định cho khách mới
export function LanguagesForm({ initial }: { initial: { enabled: Locale[]; defaultLocale: Locale } }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Locale[]>(initial.enabled);
  const [def, setDef] = useState<Locale>(initial.defaultLocale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggle = (l: Locale) => {
    const next = enabled.includes(l) ? enabled.filter((x) => x !== l) : LOCALES.filter((x) => x === l || enabled.includes(x));
    if (next.length === 0) return;
    setEnabled(next);
    if (!next.includes(def)) setDef(next[0]!);
  };

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/languages', 'PUT', { enabled, defaultLocale: def });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu. Áp dụng cho khách sau tối đa 30 giây.');
    router.refresh();
  }

  return (
    <Panel title="Ngôn ngữ hiển thị" bodyClassName="space-y-4 p-5">
      <FormAlert error={error} success={success} />
      <p className="text-sm text-zinc-500">
        Ngôn ngữ đang bật hiện ở nút chọn ngôn ngữ trên web và bot Telegram. Khách mới (chưa chọn) thấy ngôn ngữ theo trình duyệt nếu ngôn ngữ đó đang bật, không thì thấy <b>ngôn ngữ mặc định</b>.
        Tắt 1 ngôn ngữ không xóa bản dịch, bật lại là dùng tiếp.
      </p>
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-3 py-2">Ngôn ngữ</th>
              <th className="px-3 py-2 text-center">Hiển thị</th>
              <th className="px-3 py-2 text-center">Mặc định</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {LOCALES.map((l) => {
              const on = enabled.includes(l);
              return (
                <tr key={l} className={on ? '' : 'text-zinc-400'}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2"><Flag locale={l} /> {LOCALE_META[l].name} <code className="text-xs text-zinc-400">{l}</code></span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={on} disabled={on && enabled.length === 1} onChange={() => toggle(l)} aria-label={`Hiển thị ${LOCALE_META[l].name}`} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="radio" name="default-locale" checked={def === l} disabled={!on} onChange={() => setDef(l)} aria-label={`Mặc định ${LOCALE_META[l].name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => void save()}>{pending ? 'Đang lưu…' : 'Lưu ngôn ngữ'}</button>
    </Panel>
  );
}
