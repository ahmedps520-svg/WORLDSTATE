import type { ReactNode } from 'react';
import type { Nation } from '../sim/types';
import { flagDataUrl } from '../map/flags';
import { select } from '../store';

export function Flag({ n, size = 20 }: { n: Nation; size?: number }) {
  const src = flagDataUrl(n);
  return <img className="flag" src={src} width={Math.round(size * 4 / 3)} height={size} alt="" draggable={false} />;
}

export function NationChip({ n, sub, onClick }: { n: Nation; sub?: ReactNode; onClick?: () => void }) {
  return (
    <button className={`chip ${n.alive ? '' : 'dead'}`} onClick={onClick ?? (() => select({ kind: 'nation', id: n.id }, true))} title={n.name}>
      <Flag n={n} size={14} />
      <span>{n.short}</span>
      {sub !== undefined && <span className="chip-sub">{sub}</span>}
    </button>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="sec">
      <header><h4>{title}</h4>{right}</header>
      {children}
    </section>
  );
}

export function Row({ k, v, c }: { k: ReactNode; v: ReactNode; c?: string }) {
  return <div className="kv"><span>{k}</span><b style={c ? { color: c } : undefined}>{v}</b></div>;
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
    pause: <g fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></g>,
    slower: <path d="M11 6l-7 6 7 6zM20 6l-7 6 7 6z" fill="currentColor" />,
    faster: <path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor" />,
    globe: <g fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17" /></g>,
    war: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 19L19 5M14 5h5v5M19 19L5 5M10 5H5v5" /></g>,
    dip: <g fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M2.5 19c.8-3.5 3-5 4.5-5s3.7 1.5 4.5 5M12.5 19c.8-3.5 3-5 4.5-5s3.7 1.5 4.5 5" /></g>,
    rank: <g fill="currentColor"><rect x="4" y="12" width="4" height="8" rx="1" /><rect x="10" y="6" width="4" height="14" rx="1" /><rect x="16" y="9" width="4" height="11" rx="1" /></g>,
    hist: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2" /></g>,
    tool: <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M14.5 4.5a4 4 0 0 0-5 5L4 15l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" /></g>,
    gear: <g fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></g>,
    close: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
    search: <g fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" strokeLinecap="round" /></g>,
    news: <g fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 12h8M8 15h5" /></g>,
    plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
    minus: <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
    home: <path d="M4 11l8-6 8 6v8h-5v-5H9v5H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
    skip: <g fill="currentColor"><path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" /><rect x="19" y="6" width="2" height="12" rx="1" /></g>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>{p[name]}</svg>;
}
