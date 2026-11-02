'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert, FormField } from './form-field';

// Form cho từng key SystemConfig. Server vẫn validate theo CONFIG_SCHEMAS của key đó.
type Values = Record<string, unknown>;
interface Field {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'checkbox';
  hint?: string;
}

const NETWORK_FIELDS: Field[] = [
  { key: 'enabled', label: 'Bật nhận tiền qua mạng này', type: 'checkbox' },
  { key: 'wallet', label: 'Địa chỉ ví nhận USDT' },
  { key: 'contract', label: 'Contract USDT', hint: 'Giữ nguyên nếu không chắc chắn' },
  { key: 'minConfirmations', label: 'Số confirmations tối thiểu', type: 'number' },
];

const FIELDS: Record<string, Field[]> = {
  'usdt.trc20': NETWORK_FIELDS,
  'usdt.bep20': NETWORK_FIELDS,
  deposit: [
    { key: 'minAmountUsd', label: 'Nạp tối thiểu (USD)', type: 'number' },
    { key: 'expireMinutes', label: 'Yêu cầu nạp hết hạn sau (phút)', type: 'number' },
  ],
  'site.general': [
    { key: 'name', label: 'Tên website' },
    { key: 'logoUrl', label: 'Logo', hint: 'File trong apps/web/public (VD /logo.svg) hoặc URL https. Để trống = logo mặc định.' },
    { key: 'supportTelegram', label: 'Telegram hỗ trợ', hint: 'Username, không có @' },
    { key: 'supportEmail', label: 'Email hỗ trợ' },
    { key: 'supportHours', label: 'Giờ hỗ trợ', hint: 'VD 24/7 hoặc 8:00–22:00 GMT+7' },
    { key: 'businessContact', label: 'Liên hệ hợp tác', hint: 'Username Telegram, email hoặc URL https. Để trống = mở widget hỗ trợ.' },
    { key: 'supplierContact', label: 'Liên hệ nhà cung cấp' },
    { key: 'channelUrl', label: 'Kênh thông báo' },
    { key: 'resellerApiUrl', label: 'Trang Reseller API' },
    { key: 'maintenance', label: 'Bảo trì: khách không vào được shop, không mua và nạp được. Nhân viên vẫn dùng bình thường.', type: 'checkbox' },
  ],
};

const TITLES: Record<string, string> = {
  'usdt.trc20': 'Nạp USDT · TRC20',
  'usdt.bep20': 'Nạp USDT · BEP20',
  deposit: 'Giới hạn nạp tiền',
  'bank.accounts': 'Tài khoản ngân hàng nhận tiền',
  'currency.rates': 'Tỷ giá nạp',
  'site.general': 'Thông tin website',
};

interface BankRow {
  bankName: string;
  accountNo: string;
  accountName: string;
  currency: string;
}

const BANK_COLUMNS: [keyof BankRow, string][] = [
  ['bankName', 'Ngân hàng'],
  ['accountNo', 'Số tài khoản'],
  ['accountName', 'Chủ tài khoản'],
  ['currency', 'Tiền tệ'],
];

function BankAccounts({ rows, onChange }: { rows: BankRow[]; onChange: (rows: BankRow[]) => void }) {
  const update = (i: number, key: keyof BankRow, value: string) => onChange(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
          {BANK_COLUMNS.map(([key, label]) => (
            <input key={key} className="input" placeholder={label} aria-label={label} value={row[key]} onChange={(e) => update(i, key, e.target.value)} />
          ))}
          <button type="button" className="btn-ghost justify-start text-xs text-red-600 sm:col-span-2" onClick={() => onChange(rows.filter((_, n) => n !== i))}>Xóa tài khoản này</button>
        </div>
      ))}
      <button type="button" className="btn-ghost border border-zinc-200" onClick={() => onChange([...rows, { bankName: '', accountNo: '', accountName: '', currency: 'VND' }])}>+ Thêm tài khoản</button>
    </div>
  );
}

type RateRow = [code: string, rate: string];

function Rates({ rows, onChange }: { rows: RateRow[]; onChange: (rows: RateRow[]) => void }) {
  const update = (i: number, row: RateRow) => onChange(rows.map((r, n) => (n === i ? row : r)));
  return (
    <div className="space-y-2">
      {rows.map(([code, rate], i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm whitespace-nowrap text-zinc-500">1 USD =</span>
          <input className="input" inputMode="decimal" aria-label={`Tỷ giá ${code}`} disabled={code === 'USD'} value={rate} onChange={(e) => update(i, [code, e.target.value])} />
          <input className="input w-24 font-mono" aria-label="Mã tiền tệ" disabled={code === 'USD'} value={code} onChange={(e) => update(i, [e.target.value.toUpperCase(), rate])} />
          <button type="button" className="btn-ghost px-2 text-xs text-red-600" disabled={code === 'USD'} onClick={() => onChange(rows.filter((_, n) => n !== i))}>Xóa</button>
        </div>
      ))}
      <button type="button" className="btn-ghost border border-zinc-200" onClick={() => onChange([...rows, ['', '']])}>+ Thêm tiền tệ</button>
    </div>
  );
}

export function ConfigForm({ configKey, description, initial }: { configKey: string; description: string | null; initial: unknown }) {
  const router = useRouter();
  const fields = FIELDS[configKey];
  const [values, setValues] = useState<Values>((initial ?? {}) as Values);
  const [banks, setBanks] = useState<BankRow[]>(Array.isArray(initial) ? (initial as BankRow[]) : []);
  const [rates, setRates] = useState<RateRow[]>(Object.entries((initial ?? { USD: 1 }) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function payload() {
    if (configKey === 'bank.accounts') return banks;
    if (configKey === 'currency.rates') return Object.fromEntries(rates.map(([code, rate]) => [code, Number(rate)]));
    return values;
  }

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest(`/api/admin/config/${encodeURIComponent(configKey)}`, 'PUT', { value: payload() });
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      return;
    }
    setSuccess('Đã lưu');
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">{TITLES[configKey] ?? configKey}</h2>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      <FormAlert error={error} success={success} />

      {configKey === 'bank.accounts' && <BankAccounts rows={banks} onChange={setBanks} />}
      {configKey === 'currency.rates' && <Rates rows={rates} onChange={setRates} />}
      {fields?.map((f) => {
        const id = `${configKey}-${f.key}`;
        if (f.type === 'checkbox') {
          return (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))} />
              {f.label}
            </label>
          );
        }
        return (
          <FormField key={f.key} label={f.label} htmlFor={id} hint={f.hint}>
            <input
              id={id}
              className="input"
              type={f.type ?? 'text'}
              step="any"
              value={String(values[f.key] ?? '')}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: f.type === 'number' ? e.target.valueAsNumber : e.target.value }))}
            />
          </FormField>
        );
      })}

      <button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu'}</button>
    </section>
  );
}
