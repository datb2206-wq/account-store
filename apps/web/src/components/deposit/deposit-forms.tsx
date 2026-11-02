'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
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

// Tối đa 4 chữ số lẻ: giá sản phẩm đồng bộ từ nhà cung cấp được làm tròn tới 4 chữ số
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function DepositForms({ banks, networks, minUsd }: { banks: BankOption[]; networks: Network[]; minUsd: number }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.deposit;
  const [tab, setTab] = useState<'usdt' | 'bank'>(networks.length ? 'usdt' : 'bank');
  const [network, setNetwork] = useState<Network | undefined>(networks[0]);
  const [bankIndex, setBankIndex] = useState(banks[0]?.index ?? 0);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!banks.length && !networks.length) {
    return <div className="card text-sm text-zinc-600">{t.unavailable}</div>;
  }

  const bank = banks.find((b) => b.index === bankIndex);
  const bankPreview = bank && Number(amount) > 0 ? usd.format(Number(amount) / bank.rate) : null;

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

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'}`;

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
        {networks.length > 0 && <button type="button" className={tabClass(tab === 'usdt')} onClick={() => { setTab('usdt'); setAmount(''); }}>{t.tabCrypto}</button>}
        {banks.length > 0 && <button type="button" className={tabClass(tab === 'bank')} onClick={() => { setTab('bank'); setAmount(''); }}>{t.tabBank}</button>}
      </div>

      {tab === 'usdt' ? (
        <>
          <div>
            <p className="label">{t.network}</p>
            <div className="flex gap-2">
              {networks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNetwork(n)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${network === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  USDT · {n === 'TRC20' ? 'TRON (TRC20)' : 'BSC (BEP20)'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="usdt-amount" className="label">{t.amountUsdt}</label>
            <input id="usdt-amount" type="number" inputMode="numeric" min={Math.ceil(minUsd)} step={1} className="input" placeholder={fmt(t.minimum, { n: minUsd })} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-500">
              {t.uniqueHint}
            </p>
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
      <button type="submit" className="btn-primary w-full" disabled={pending || !(Number(amount) > 0)}>
        {pending ? t.creating : t.continue}
      </button>
    </form>
  );
}
