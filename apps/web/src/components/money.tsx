import { formatFx, type Fx, type Locale } from '@/i18n/config';
import { formatUsd } from '@/lib/format';

// Số tiền USD. translate="no": Google Translate/Chrome không đổi "$0.50" thành "0,50 đô la".
export function Money({ value, className }: { value: Parameters<typeof formatUsd>[0]; className?: string }) {
  return (
    <span translate="no" className={className}>
      {formatUsd(value)}
    </span>
  );
}

// Số tiền USD hiện theo tiền khách đang chọn (VD R$ 99,50), quy đổi theo tỷ giá. Không có tỷ giá thì hiện USD.
export function LocalMoney({ value, fx, locale, className }: { value: Parameters<typeof formatUsd>[0]; fx: Fx; locale: Locale; className?: string }) {
  return (
    <span translate="no" className={className}>
      {(value != null && formatFx(value.toString(), fx, locale, false)) || formatUsd(value)}
    </span>
  );
}
