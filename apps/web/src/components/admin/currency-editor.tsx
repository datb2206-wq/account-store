'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

interface Row {
  code: string;
  name: string;
  rate: string;
  decimals: string;
  enabled: boolean;
}

// Bảng tiền tệ: mã, tên, tỷ giá (1 USD = ?), số lẻ, bật hiển thị; chọn tiền mặc định
export function CurrencyEditor({
  initial,
  defaultCurrency,
  usedByBanks,
}: {
  initial: { code: string; name: string; rate: number; decimals: number; enabled: boolean }[];
  defaultCurrency: string;
  usedByBanks: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map((c) => ({ ...c, rate: String(c.rate), decimals: String(c.decimals) })));
  const [def, setDef] = useState(defaultCurrency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/currencies', 'PUT', {
      defaultCurrency: def,
      currencies: rows.map((r) => ({ code: r.code, name: r.name, rate: r.rate.replace(/[\s,]/g, ''), decimals: r.decimals, enabled: r.enabled })),
    });
    setPending(false);
    if (!res.ok) {
      const first = Object.values(res.data.fields ?? {}).flat()[0];
      setError(first ? `${res.data.error}: ${first}` : (res.data.error ?? 'Lưu thất bại'));
      return;
    }
    setSuccess('Đã lưu. Giá quy đổi trên web cập nhật trong vòng 1 phút.');
    router.refresh();
  }

  const usable = rows.filter((r) => r.code.length === 3);

  return (
    <div className="space-y-4">
      <FormAlert error={error} success={success} />

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Mã</th><th>Tên hiển thị</th><th>Tỷ giá (1 USD =)</th><th>Số lẻ</th><th>Hiển thị cho khách</th><th>Ví dụ $10</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const usd = r.code === 'USD';
              const rate = Number(r.rate.replace(/[\s,]/g, ''));
              const digits = Number(r.decimals);
              let sample = '—';
              try {
                if (r.code.length === 3 && rate > 0) {
                  sample = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: r.code, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(10 * rate);
                }
              } catch {
                sample = 'Mã không hợp lệ';
              }
              return (
                <tr key={i} className="odd:bg-zinc-50/60">
                  <td>
                    <input className="input w-20 font-mono uppercase" value={r.code} maxLength={3} disabled={usd} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} aria-label="Mã tiền tệ" />
                  </td>
                  <td><input className="input w-44" value={r.name} maxLength={50} onChange={(e) => update(i, { name: e.target.value })} aria-label="Tên" /></td>
                  <td><input className="input w-36 tabular-nums" inputMode="decimal" value={r.rate} disabled={usd} onChange={(e) => update(i, { rate: e.target.value })} aria-label="Tỷ giá" /></td>
                  <td>
                    <select className="input w-20" value={r.decimals} onChange={(e) => update(i, { decimals: e.target.value })} aria-label="Số lẻ">
                      {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={r.enabled} disabled={usd} onChange={(e) => update(i, { enabled: e.target.checked })} />
                      {r.enabled ? 'Bật' : 'Tắt'}
                    </label>
                  </td>
                  <td className="text-sm whitespace-nowrap text-zinc-600 tabular-nums">{sample}</td>
                  <td className="text-right">
                    {!usd && (
                      usedByBanks.includes(r.code)
                        ? <span className="text-xs text-zinc-400" title="Đang dùng cho tài khoản ngân hàng nhận nạp">Đang dùng nạp</span>
                        : <button type="button" className="btn-ghost text-xs text-red-600" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>Xóa</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn-ghost border border-zinc-200" onClick={() => setRows((rs) => [...rs, { code: '', name: '', rate: '', decimals: '2', enabled: true }])}>
        + Thêm tiền tệ
      </button>

      <div className="flex flex-wrap items-end gap-4 border-t border-zinc-100 pt-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Tiền tệ mặc định hiển thị cho khách</span>
          <select className="input w-72" value={def} onChange={(e) => setDef(e.target.value)}>
            <option value="AUTO">Tự động theo ngôn ngữ khách chọn</option>
            {usable.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn-primary ml-auto" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu tiền tệ'}</button>
      </div>
    </div>
  );
}
