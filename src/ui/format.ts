export const fmtNum = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
export function fmtMoney(b: number) {
  if (!Number.isFinite(b)) return '—';
  if (Math.abs(b) >= 1000) return `$${(b / 1000).toFixed(b >= 10000 ? 1 : 2)}T`;
  if (Math.abs(b) >= 1) return `$${b.toFixed(b >= 100 ? 0 : 1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}
export function fmtPop(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)}B`;
  if (m >= 1) return `${m.toFixed(m >= 100 ? 0 : 1)}M`;
  return `${Math.round(m * 1000)}K`;
}
export function fmtK(k: number) {
  if (k >= 1000) return `${(k / 1000).toFixed(2)}M`;
  if (k >= 1) return `${Math.round(k).toLocaleString()}K`;
  return `${Math.round(k * 1000)}`;
}
export const fmtPct = (v: number, d = 1) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(d)}%`;
export const fmtSigned = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
export const fmtArea = (km: number) => (km >= 1e6 ? `${(km / 1e6).toFixed(2)}M km²` : km >= 1000 ? `${Math.round(km / 1000).toLocaleString()}K km²` : `${Math.round(km)} km²`);
export function stabilityLabel(s: number) { return s > 75 ? 'Very stable' : s > 60 ? 'Stable' : s > 45 ? 'Fragile' : s > 30 ? 'Unstable' : s > 15 ? 'Crisis' : 'Collapse'; }
export function relLabel(r: number) { return r > 70 ? 'Close allies' : r > 40 ? 'Friendly' : r > 10 ? 'Cordial' : r > -10 ? 'Neutral' : r > -40 ? 'Cool' : r > -70 ? 'Hostile' : 'Bitter enemies'; }
export function stabColor(s: number) { return s > 65 ? 'var(--green)' : s > 45 ? 'var(--amber)' : s > 25 ? 'var(--orange)' : 'var(--red)'; }
export function relColor(r: number) { return r > 40 ? 'var(--green)' : r > 10 ? '#8bc79a' : r > -10 ? 'var(--muted)' : r > -40 ? 'var(--orange)' : 'var(--red)'; }
