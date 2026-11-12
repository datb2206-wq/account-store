// Khối giao diện dùng chung cho các trang Admin
export function PageHeader({ title, count, children }: { title: React.ReactNode; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-zinc-800">
        {title}
        {count !== undefined && <span className="ml-2 text-sm font-normal text-zinc-400">({count.toLocaleString('en-US')})</span>}
      </h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Khung trắng có tiêu đề in hoa và vạch màu bên trái */
export function Panel({ title, action, children, className = '', bodyClassName = 'p-5' }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`rounded-xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3.5">
          <h2 className="border-l-[3px] border-indigo-400 pl-2.5 text-[13px] font-semibold tracking-wide text-zinc-800 uppercase">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TONES = {
  indigo: 'bg-indigo-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
} as const;

/** Ô số liệu nhỏ: icon tròn màu + con số + nhãn */
export function MiniStat({ icon, value, label, tone = 'indigo' }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone?: keyof typeof TONES }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-white ${TONES[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold text-zinc-800 tabular-nums">{value}</p>
        <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{label}</p>
      </div>
    </div>
  );
}

/** Ô lọc có nút "Tìm" và "Xóa lọc", dùng form GET */
export function FilterBar({ children, resetHref, active }: { children: React.ReactNode; resetHref: string; active: boolean }) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      {children}
      <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-600">Tìm kiếm</button>
      {active && <a href={resetHref} className="inline-flex items-center rounded-lg bg-red-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-600">Xóa lọc</a>}
    </form>
  );
}
