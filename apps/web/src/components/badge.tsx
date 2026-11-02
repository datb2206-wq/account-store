const tones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  gray: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
} as const;

// Màu mặc định theo các giá trị enum trong schema
const statusTone: Record<string, keyof typeof tones> = {
  ACTIVE: 'green',
  COMPLETED: 'green',
  PENDING: 'yellow',
  PENDING_VERIFY: 'yellow',
  BANNED: 'red',
  FAILED: 'red',
  REJECTED: 'red',
  REFUNDED: 'gray',
  EXPIRED: 'gray',
  SUPER_ADMIN: 'blue',
  STAFF: 'blue',
  USER: 'gray',
};

export function Badge({ value, tone, label }: { value: string; tone?: keyof typeof tones; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        tones[tone ?? statusTone[value] ?? 'gray']
      }`}
    >
      {label ?? value}
    </span>
  );
}
