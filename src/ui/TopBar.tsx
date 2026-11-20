import { useState } from 'react';
import { app, store, useUI, SPEEDS } from '../store';
import { fmtDateLong, dayOfDate, dateOf } from '../sim/calendar';
import { skipDays } from '../loop';
import { Icon } from './common';
import { fmtMoney } from './format';

export function TopBar() {
  useUI((s) => s.tick);
  const paused = useUI((s) => s.paused);
  const speed = useUI((s) => s.speed);
  const skipping = useUI((s) => s.skipping);
  const replay = useUI((s) => s.replay);
  const [menu, setMenu] = useState(false);
  const [target, setTarget] = useState('');
  const w = app.sim!.w;
  const d = dateOf(w.day);
  const wars = w.wars.filter((x) => x.status === 'active').length;
  const cease = w.wars.filter((x) => x.status === 'ceasefire').length;
  const worldGdp = w.nations.reduce((s, n) => s + (n.alive ? n.eco.gdp : 0), 0);
  const tension = w.market.tension;
  const tColor = tension > 70 ? 'var(--red)' : tension > 45 ? 'var(--orange)' : tension > 28 ? 'var(--amber)' : 'var(--green)';
  const doSkip = (days: number) => { setMenu(false); skipDays(days); };
  const goTo = () => {
    const m = target.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return;
    const day = dayOfDate(+m[1], +m[2] - 1, +m[3]);
    if (day > w.day) doSkip(day - w.day);
  };
  return (
    <header className="topbar">
      <div className="brand" onClick={() => store.set({ panel: 'overview' })} title="World overview">
        <svg width="26" height="26" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="1.6" /><path d="M3 16h26M16 3c5 4 5 22 0 26M16 3c-5 4-5 22 0 26" fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity=".6" /><circle cx="22" cy="11" r="2.4" fill="var(--red)" /></svg>
        <div><div className="brand-name">WORLDSTATE</div><div className="brand-sub">Geopolitical simulation</div></div>
      </div>

      <div className="clock">
        <div className="date">
          <div className="date-main">{fmtDateLong(w.day)}</div>
          <div className="date-sub">Day {w.day.toLocaleString()} · {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]}{skipping ? ` · advancing ${Math.round(((w.day - skipping.start) / Math.max(1, skipping.target - skipping.start)) * 100)}%` : ''}</div>
        </div>
        <div className="time-ctl">
          <button className="ic" title="Slower ( - )" onClick={() => store.set({ speed: Math.max(0, speed - 1) })}><Icon name="slower" /></button>
          <button className={`ic play ${paused ? '' : 'on'}`} title="Play / pause (Space)" disabled={replay !== null} onClick={() => store.set({ paused: !paused })}><Icon name={paused ? 'play' : 'pause'} size={20} /></button>
          <button className="ic" title="Faster ( + )" onClick={() => store.set({ speed: Math.min(SPEEDS.length - 1, speed + 1) })}><Icon name="faster" /></button>
          <div className="speed-dots" title={SPEEDS[speed].label}>
            {SPEEDS.map((s, i) => <button key={s.label} className={i <= speed ? 'on' : ''} onClick={() => store.set({ speed: i, paused: false })} title={s.label} />)}
          </div>
          <span className="speed-label">{paused ? 'Paused' : SPEEDS[speed].label}</span>
          <div className="skip">
            <button className="ic" title="Skip ahead" onClick={() => setMenu(!menu)}><Icon name="skip" /></button>
            {menu && (
              <div className="skip-menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-title">Advance time</div>
                {[['+1 week', 7], ['+1 month', 30], ['+6 months', 182], ['+1 year', 365], ['+5 years', 1826], ['+10 years', 3652], ['+25 years', 9131]].map(([l, n]) => (
                  <button key={l} onClick={() => doSkip(n as number)}>{l}</button>
                ))}
                <div className="menu-title">Advance to date</div>
                <div className="row"><input type="date" value={target} min={`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`} onChange={(e) => setTarget(e.target.value)} /><button onClick={goTo}>Go</button></div>
              </div>
            )}
          </div>
          {skipping && <button className="ic stop" title="Stop" onClick={() => store.set({ skipping: null })}>■</button>}
        </div>
      </div>

      <div className="indicators">
        <Ind label="Tension" value={<><span style={{ color: tColor }}>{Math.round(tension)}</span><small>/100</small></>} bar={tension} color={tColor} />
        <Ind label="Active wars" value={<>{wars}{cease ? <small> +{cease} frozen</small> : null}</>} color={wars ? 'var(--red)' : undefined} onClick={() => store.set({ panel: 'wars' })} />
        <Ind label="Brent crude" value={`$${w.market.oil.toFixed(0)}`} color={w.market.oil > 100 ? 'var(--orange)' : undefined} />
        <Ind label="Food index" value={Math.round(w.market.food)} color={w.market.food > 130 ? 'var(--orange)' : undefined} />
        <Ind label="World GDP" value={<>{fmtMoney(worldGdp)} <small style={{ color: w.market.worldGrowth < 1 ? 'var(--red)' : 'var(--green)' }}>{w.market.worldGrowth >= 0 ? '+' : ''}{w.market.worldGrowth.toFixed(1)}%</small></>} />
        <button className="ic search-btn" title="Search (Ctrl+K)" onClick={() => store.set({ search: true })}><Icon name="search" /></button>
      </div>
    </header>
  );
}

function Ind({ label, value, color, bar, onClick }: { label: string; value: React.ReactNode; color?: string; bar?: number; onClick?: () => void }) {
  return (
    <div className={`ind ${onClick ? 'click' : ''}`} onClick={onClick}>
      <div className="ind-label">{label}</div>
      <div className="ind-value" style={color && bar === undefined ? { color } : undefined}>{value}</div>
      {bar !== undefined && <div className="ind-bar"><div style={{ width: `${bar}%`, background: color }} /></div>}
    </div>
  );
}
