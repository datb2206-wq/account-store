import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { prisma } from '@accszone/database';
import { ConfigForm } from '@/components/admin/config-form';
import { requireStaff } from '@/lib/auth';
import { CONFIG_SCHEMAS } from '@accszone/core';

export const metadata: Metadata = { title: 'Cấu hình' };

const HELP: Record<string, string> = {
  'usdt.trc20': 'Ví TRON bắt đầu bằng chữ T.',
  'usdt.bep20': 'Ví trên BNB Smart Chain, bắt đầu bằng 0x.',
  deposit: 'Áp dụng cho cả USDT và ngân hàng.',
  'bank.accounts': 'Tiền tệ phải có trong bảng tỷ giá nạp. Mã tiền tệ gồm 3 chữ cái, VD VND.',
  'currency.rates': 'Dùng quy đổi tiền nạp ngân hàng sang USD và hiển thị giá tham khảo. 1 USDT luôn bằng 1 USD.',
};

export default async function AdminSettingsPage() {
  await requireStaff();

  const rows = await prisma.systemConfig.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const host = (await headers()).get('host') ?? 'your-domain.com';
  const env = {
    BANK_WEBHOOK_SECRET: !!process.env.BANK_WEBHOOK_SECRET,
    TRONGRID_API_KEY: !!process.env.TRONGRID_API_KEY,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cấu hình</h1>

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Biến môi trường (.env)</h2>
        <p>
          <code>BANK_WEBHOOK_SECRET</code>: {env.BANK_WEBHOOK_SECRET ? '✅ đã đặt' : '⚠️ chưa đặt — nạp ngân hàng chỉ duyệt tay'}
        </p>
        <p>
          <code>TRONGRID_API_KEY</code>: {env.TRONGRID_API_KEY ? '✅ đã đặt' : '⚠️ chưa đặt — TronGrid giới hạn request thấp hơn (vẫn chạy được)'}
        </p>
        <p className="text-zinc-500">
          Webhook ngân hàng (Casso/SePay…): <code className="font-mono">POST https://{host}/api/webhooks/bank</code> với header{' '}
          <code>x-webhook-secret</code>.
        </p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {Object.keys(CONFIG_SCHEMAS).map((key) => (
          <ConfigForm
            key={key}
            configKey={key}
            description={HELP[key] ?? byKey.get(key)?.description ?? null}
            initial={byKey.get(key)?.value ?? null}
          />
        ))}
      </div>
    </div>
  );
}
