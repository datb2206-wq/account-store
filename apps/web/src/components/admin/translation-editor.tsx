'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { apiRequest } from '@/lib/client-api';

export interface TranslationRow {
  key: string;
  defaults: Record<Locale, string>;
}

// Biến {name} trong câu: bản dịch phải giữ đúng bộ biến của bản gốc tiếng Anh
const vars = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort().join(' ');

export function TranslationEditor({
  rows,
  overrides,
  locales,
}: {
  rows: TranslationRow[];
  overrides: Partial<Record<Locale, Record<string, string>>>;
  locales: { code: Locale; name: string }[];
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>('en');
  const [drafts, setDrafts] = useState(
    () => Object.fromEntries(locales.map((l) => [l.code, { ...(overrides[l.code] ?? {}) }])) as Record<Locale, Record<string, string>>,
  );
  const [dirty, setDirty] = useState<Set<Locale>>(new Set());
  const [q, setQ] = useState('');
  const [section, setSection] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const sections = useMemo(() => [...new Set(rows.map((r) => r.key.split('.')[0]!))], [rows]);
  const draft = drafts[locale];
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!section || r.key.startsWith(`${section}.`)) &&
      (!onlyEdited || !!draft[r.key]?.trim()) &&
      (!needle ||
        r.key.toLowerCase().includes(needle) ||
        r.defaults.en.toLowerCase().includes(needle) ||
        r.defaults[locale].toLowerCase().includes(needle) ||
        (draft[r.key] ?? '').toLowerCase().includes(needle)),
  );
  const editedCount = Object.values(draft).filter((v) => v.trim()).length;
  const invalid = rows.filter((r) => draft[r.key]?.trim() && vars(draft[r.key]!) !== vars(r.defaults.en)).map((r) => r.key);

  function edit(key: string, value: string) {
    setDrafts((d) => ({ ...d, [locale]: { ...d[locale], [key]: value } }));
    setDirty((s) => new Set(s).add(locale));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const values = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()));
    const res = await apiRequest<{ saved: number }>('/api/admin/translations', 'PUT', { locale, values });
    setSaving(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.data.error ?? 'Lưu thất bại' });
      return;
    }
    setDirty((s) => {
      const next = new Set(s);
      next.delete(locale);
      return next;
    });
    setMessage({ ok: true, text: `Đã lưu ${res.data.saved} bản dịch tùy chỉnh cho ${locales.find((l) => l.code === locale)?.name}.` });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-zinc-100 p-1">
          {locales.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${locale === l.code ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              {l.name}
              {dirty.has(l.code) && <span className="ml-1 text-amber-500">●</span>}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo khóa hoặc nội dung…" className="input w-64" />
        <select value={section} onChange={(e) => setSection(e.target.value)} className="input w-44">
          <option value="">Tất cả mục</option>
          {sections.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600">
          <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} /> Chỉ dòng đã sửa ({editedCount})
        </label>
        <button type="button" onClick={save} disabled={saving || invalid.length > 0 || !dirty.has(locale)} className="btn-primary ml-auto">
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>

      {invalid.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {invalid.length} dòng thiếu/thừa biến {'{…}'} so với bản gốc: <span className="font-mono text-xs">{invalid.slice(0, 5).join(', ')}</span>
        </p>
      )}
      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-[220px_1fr_1fr] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          <span>Khóa</span>
          <span>Bản gốc{locale !== 'en' && ` (EN → ${locale.toUpperCase()})`}</span>
          <span>Bản dịch tùy chỉnh</span>
        </div>
        <ul className="divide-y divide-zinc-100">
          {visible.map((r) => {
            const value = draft[r.key] ?? '';
            const bad = !!value.trim() && vars(value) !== vars(r.defaults.en);
            return (
              <li key={r.key} className="grid grid-cols-[220px_1fr_1fr] items-start gap-4 px-4 py-2.5">
                <span className="font-mono text-[11px] break-all text-zinc-500">{r.key}</span>
                <div className="space-y-0.5 text-sm">
                  {locale !== 'en' && <p className="text-xs text-zinc-400">{r.defaults.en}</p>}
                  <p className="text-zinc-800">{r.defaults[locale]}</p>
                </div>
                <div className="flex items-start gap-1">
                  <textarea
                    value={value}
                    onChange={(e) => edit(r.key, e.target.value)}
                    placeholder={r.defaults[locale]}
                    rows={Math.min(4, Math.max(1, Math.ceil(r.defaults[locale].length / 60)))}
                    aria-invalid={bad || undefined}
                    className={`input text-sm ${value.trim() ? 'bg-amber-50/50' : ''}`}
                  />
                  {value && (
                    <button type="button" onClick={() => edit(r.key, '')} className="btn-ghost px-2 text-xs" title="Dùng lại bản gốc">↺</button>
                  )}
                </div>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-4 py-8 text-center text-sm text-zinc-500">Không có dòng nào khớp.</li>}
        </ul>
      </div>
      <p className="text-xs text-zinc-400">{visible.length} / {rows.length} dòng</p>
    </div>
  );
}
