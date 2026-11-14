import type { Metadata } from 'next';
import { getConfig } from '@accszone/core';
import { CurrencyEditor } from '@/components/admin/currency-editor';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { getCurrencySettings } from '@/lib/fx';

export const metadata: Metadata = { title: 'Tiền tệ' };
export const dynamic = 'force-dynamic';

export default async function CurrenciesPage() {
  await requireStaff();
  const [settings, banks] = await Promise.all([getCurrencySettings(), getConfig('bank.accounts').catch(() => [])]);
  const auto = !!process.env.FX_RATES_URL;

  return (
    <div className="space-y-5">
      <PageHeader title="Tiền tệ" count={settings.currencies.length} />
      <div className="space-y-1 text-sm text-zinc-500">
        <p>Số dư và thanh toán trên web luôn tính bằng <b>USD</b>. Các tiền tệ khác dùng để:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Hiện giá quy đổi tham khảo cho khách (VD &quot;≈ 260.000 ₫&quot;). Khách tự chọn tiền tệ ở thanh trên cùng, cạnh ô ngôn ngữ.</li>
          <li>Quy đổi tiền khách nạp qua ngân hàng sang USD.</li>
          <li>Quy đổi giá gốc của nguồn tính bằng VND (Via79) sang USD.</li>
        </ul>
        <p>
          Tỷ giá {auto ? <b className="text-emerald-700">đang tự cập nhật định kỳ</b> : <>chưa tự cập nhật (đặt biến <code>FX_RATES_URL</code> để bật)</>}. Nhập số không có dấu chấm/phẩy ngăn cách, VD <code>26300</code>.
        </p>
      </div>
      <Panel title="Danh sách tiền tệ">
        {/* Bảng chỉnh sửa dựng lại khi dữ liệu đổi (sau khi lưu) */}
        <CurrencyEditor
          key={JSON.stringify(settings)}
          initial={settings.currencies}
          defaultCurrency={settings.defaultCurrency}
          usedByBanks={[...new Set(banks.map((b) => b.currency))]}
        />
      </Panel>
    </div>
  );
}
