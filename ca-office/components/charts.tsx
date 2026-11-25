'use client';

/** Ring chart. `parts` are drawn clockwise from 12 o'clock. */
export function Donut({ parts, size = 120, stroke = 14, center }: {
  parts: { value: number; color: string; label?: string }[]; size?: number; stroke?: number; center?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        {total > 0 && parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}>
              {p.label && <title>{`${p.label}: ${p.value}`}</title>}
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

/** Small completion ring, e.g. 12 of 30 filed. */
export function Ring({ done, total, size = 26 }: { done: number; total: number; size?: number }) {
  return (
    <span title={`${done} of ${total} completed`}>
      <Donut size={size} stroke={4} parts={[{ value: done, color: '#2563eb' }, { value: Math.max(total - done, 0), color: '#e2e8f0' }]} />
    </span>
  );
}

/** Multi-series line chart with labelled x axis. */
export function LineChart({ labels, series, height = 170 }: {
  labels: string[]; series: { name: string; color: string; values: number[] }[]; height?: number;
}) {
  const W = 360, H = height, L = 30, R = 30, T = 10, B = 24;
  const max = Math.max(5, ...series.flatMap((s) => s.values));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => L + (labels.length === 1 ? 0 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Performance chart">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(i * step)} y2={y(i * step)} stroke="#e2e8f0" />
            <text x={L - 6} y={y(i * step) + 3} textAnchor="end" fontSize="9" fill="#64748b">{i * step}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={l} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{l}</text>)}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{`${s.name}, ${labels[i]}: ${v}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-xs text-slate-500">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}
