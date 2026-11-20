import { useState } from 'react';
import { fmtMonth } from '../sim/calendar';

export function Sparkline({ data, color = 'var(--accent)', w = 90, h = 24 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...data), hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - lo) / span) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

export interface Series { name: string; color: string; data: number[] }

/** Multi-series line chart over simulation days. */
export function LineChart({ t, series, h = 150, fmt = (v: number) => v.toFixed(0), log = false }: { t: number[]; series: Series[]; h?: number; fmt?: (v: number) => string; log?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340, H = h, padL = 4, padR = 4, padT = 8, padB = 18;
  if (t.length < 2) return <div className="chart-empty">History builds as time passes…</div>;
  const tr = (v: number) => (log ? Math.log10(Math.max(1e-3, v)) : v);
  const all = series.flatMap((s) => s.data.map(tr)).filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const x = (i: number) => padL + (i / (t.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (tr(v) - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = [0, Math.floor((t.length - 1) / 2), t.length - 1];
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(t.length - 1, Math.round(((fx - padL) / (W - padL - padR)) * (t.length - 1)))));
  };
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={padL} x2={W - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} className="grid" />)}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round"
            points={s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 4} className="tick" textAnchor={i === 0 ? 'start' : i === t.length - 1 ? 'end' : 'middle'}>{fmtMonth(t[i])}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="cursor" />}
        {hover !== null && series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r={2.8} fill={s.color} />)}
      </svg>
      <div className="chart-legend">
        {hover !== null && <span className="muted">{fmtMonth(t[hover])}</span>}
        {series.map((s) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name}{' '}<b>{fmt(hover !== null ? s.data[hover] : s.data[s.data.length - 1])}</b></span>
        ))}
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'var(--accent)' }: { value: number; max?: number; color?: string }) {
  return <div className="bar"><div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} /></div>;
}
