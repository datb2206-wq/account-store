// Biểu đồ cột vẽ bằng SVG phía server (không cần thư viện). Rê chuột lên cột để xem số liệu.
interface Series {
  label: string;
  color: string;
  values: number[];
}

const W = 760;
const H = 260;
const PAD = { top: 12, right: 8, bottom: 26, left: 44 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const short = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : v.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function BarChart({ labels, series, format = (v: number) => `$${v.toFixed(2)}` }: { labels: string[]; series: Series[]; format?: (v: number) => string }) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, labels.length);
  const barW = Math.max(2, (slot * 0.7) / series.length);
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const empty = series.every((s) => s.values.every((v) => v === 0));

  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-center gap-4 text-xs text-zinc-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#eef0f4" />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#9aa1ad">{short(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => {
            const x0 = PAD.left + i * slot + (slot - barW * series.length) / 2;
            return (
              <g key={label}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  return (
                    <rect key={s.label} x={x0 + si * barW} y={y(v)} width={barW - 0.5} height={Math.max(0, PAD.top + plotH - y(v))} rx="1.5" fill={s.color}>
                      <title>{`${label} · ${s.label}: ${format(v)}`}</title>
                    </rect>
                  );
                })}
                {(labels.length <= 16 || i % 2 === 0) && (
                  <text x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#9aa1ad">{label}</text>
                )}
              </g>
            );
          })}
        </svg>
        {empty && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Chưa có dữ liệu trong tháng này</p>}
      </div>
    </div>
  );
}
