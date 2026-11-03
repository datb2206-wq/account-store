'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BankIcon, CoinIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/config';
import { translateError } from '@/i18n/errors';
import { rich } from '@/i18n/rich';
import { apiRequest } from '@/lib/client-api';

export interface BankOption {
  index: number;
  bankName: string;
  currency: string;
  rate: number; // số đơn vị tiền tệ / 1 USD
}

type Network = 'TRC20' | 'BEP20';
type Tab = 'bank' | 'usdt';

const NETWORK_LABEL: Record<Network, [string, string]> = { TRC20: ['TRC20', 'TRON'], BEP20: ['BEP20', 'BNB Smart Chain'] };

// Tối đa 4 chữ số lẻ: giá sản phẩm đồng bộ từ nhà cung cấp được làm tròn tới 4 chữ số
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Bước 1 của nạp tiền: chọn phương thức + số tiền -> tạo yêu cầu, chuyển sang trang chi tiết
// (ví + QR / số tài khoản, gửi TxID hoặc biên lai). Cả 2 tab luôn hiện; phương thức chưa cấu hình thì báo chưa hỗ trợ.
export function DepositForms({ banks, networks, minUsd }: { banks: BankOption[]; networks: Network[]; minUsd: number }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.deposit;
  const [tab, setTab] = useState<Tab>(banks.length || !networks.length ? 'bank' : 'usdt');
  const [network, setNetwork] = useState<Network | undefined>(networks[0]);
  const [bankIndex, setBankIndex] = useState(banks[0]?.index ?? 0);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bank = banks.find((b) => b.index === bankIndex);
  const bankPreview = bank && Number(amount) > 0 ? usd.format(Number(amount) / bank.rate) : null;
  const available = tab === 'bank' ? banks.length > 0 : networks.length > 0;
  const steps = tab === 'bank' ? [t.bankStep1, t.bankStep2, t.bankStep3] : [t.usdtStep1, t.usdtStep2, t.usdtStep3];

  function switchTo(next: Tab) {
    setTab(next);
    setAmount('');
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res =
      tab === 'bank'
        ? await apiRequest<{ deposit: { id: string } }>('/api/deposits/bank', 'POST', { accountIndex: bankIndex, amount })
        : await apiRequest<{ deposit: { id: string } }>('/api/deposits/usdt', 'POST', { network, amount });
    if (!res.ok) {
      setPending(false);
      const message = res.data.error && !res.data.fields ? res.data.error : Object.values(res.data.fields ?? {})[0]?.[0];
      setError(message ? translateError(message, d) : t.createFailed);
      return;
    }
    router.push(`/dashboard/deposit/${res.data.deposit.id}`);
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'bank', label: t.tabBank, icon: <BankIcon size={17} /> },
    { key: 'usdt', label: t.tabCrypto, icon: <CoinIcon size={17} /> },
  ];

  return (
    <form onSubmit={submit} className="card space-y-5">
      <div role="tablist" aria-label={t.title} className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
        {tabs.map((it) => (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={tab === it.key}
            onClick={() => switchTo(it.key)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              tab === it.key ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {it.icon} {it.label}
          </button>
        ))}
      </div>

      <ol className="grid gap-2 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600" aria-label={t.stepsTitle}>
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[11px] font-bold text-white">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      {!available ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{t.methodUnavailable}</p>
      ) : tab === 'usdt' ? (
        <>
          <div>
            <p className="label">{t.network}</p>
            <div className="grid grid-cols-2 gap-2">
              {networks.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={network === n}
                  onClick={() => setNetwork(n)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${network === n ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-zinc-200 hover:bg-zinc-50'}`}
                >
                  <span className={`block text-sm font-semibold ${network === n ? 'text-blue-700' : 'text-zinc-800'}`}>USDT · {NETWORK_LABEL[n][0]}</span>
                  <span className="block text-xs text-zinc-500">{NETWORK_LABEL[n][1]}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="usdt-amount" className="label">{t.amountUsdt}</label>
            <input id="usdt-amount" type="number" inputMode="numeric" min={Math.ceil(minUsd)} step={1} className="input" placeholder={fmt(t.minimum, { n: minUsd })} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-500">{t.uniqueHint}</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="bank" className="label">{t.bank}</label>
            <select id="bank" className="input" value={bankIndex} onChange={(e) => setBankIndex(Number(e.target.value))}>
              {banks.map((b) => (
                <option key={b.index} value={b.index}>{b.bankName} ({b.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bank-amount" className="label">{fmt(t.amountIn, { currency: bank?.currency ?? '' })}</label>
            <input id="bank-amount" inputMode="decimal" className="input" placeholder={bank ? fmt(t.minimumApprox, { n: Math.ceil(minUsd * bank.rate).toLocaleString('en-US') }) : ''} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[,\s]/g, ''))} />
            <p className="mt-1 text-xs text-zinc-500">
              {bankPreview ? <>{rich(t.receiveApprox, { amount: <b>{bankPreview}</b> })} · </> : null}
              {fmt(t.rate, { rate: bank?.rate.toLocaleString('en-US') ?? '', currency: bank?.currency ?? '' })}
            </p>
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {available && (
        <button type="submit" className="btn-primary w-full py-2.5" disabled={pending || !(Number(amount) > 0)}>
          {pending ? t.creating : t.continue}
        </button>
      )}
    </form>
  );
}
