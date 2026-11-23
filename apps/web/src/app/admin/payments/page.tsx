import type { Metadata } from 'next';
import { CARD_TELCO_LABEL, getCardSettings, getConfig, getManualMethods, getPixSettings } from '@accszone/core';
import { CardSettingsForm, ManualMethodsForm, PixSettingsForm } from '@/components/admin/payments-form';
import { PageHeader } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { getSiteUrl } from '@/lib/site';

export const metadata: Metadata = { title: 'Cổng nạp tiền' };

export default async function PaymentsPage() {
  await requireStaff();
  const [card, manual, pix, rates, siteUrl] = await Promise.all([getCardSettings(), getManualMethods(), getPixSettings(), getConfig('currency.rates').catch(() => ({}) as Record<string, number>), getSiteUrl()]);
  const { partnerKey, ...cardPublic } = card;
  return (
    <div className="space-y-5">
      <PageHeader title="Cổng nạp tiền" />
      <p className="text-sm text-zinc-500">
        Ngân hàng nằm ở <a href="/admin/settings" className="text-indigo-600 hover:underline">Cài đặt</a> (bank.accounts), USDT ở cấu hình usdt.trc20 / usdt.bep20. Trang này thêm thẻ cào, MoMo và các phương thức nạp thủ công khác.
      </p>
      {!rates.VND && <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Chưa có tỷ giá VND ở trang Tiền tệ: thẻ cào và MoMo (VND) sẽ không hiện cho khách.</p>}
      {/* Không gửi link API PIX ra trình duyệt */}
      <PixSettingsForm
        initial={{ enabled: pix.enabled, name: pix.name, currency: pix.currency, minAmount: pix.minAmount, maxAmount: pix.maxAmount }}
        hasCreateUrl={!!pix.createUrl}
        hasStatusUrl={!!pix.statusUrl}
        currencies={Object.keys(rates)}
      />
      {pix.enabled && !rates[pix.currency] && <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Chưa có tỷ giá {pix.currency} ở trang Tiền tệ: PIX sẽ không hiện cho khách.</p>}
      {/* Không gửi partner key ra trình duyệt */}
      <CardSettingsForm initial={{ ...cardPublic, partnerKey: '' }} hasKey={!!partnerKey} labels={CARD_TELCO_LABEL} callbackUrl={`${siteUrl}/api/webhooks/card`} />
      <ManualMethodsForm initial={manual} currencies={Object.keys(rates)} />
    </div>
  );
}
