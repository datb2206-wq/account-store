import { formatUsd } from '@/lib/format';

// Số tiền USD. translate="no": Google Translate/Chrome không đổi "$0.50" thành "0,50 đô la".
export function Money({ value, className }: { value: Parameters<typeof formatUsd>[0]; className?: string }) {
  return (
    <span translate="no" className={className}>
      {formatUsd(value)}
    </span>
  );
}
