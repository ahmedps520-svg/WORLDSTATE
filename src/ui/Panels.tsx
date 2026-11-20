import { useState, useMemo } from 'react';
import { app, store, useUI, select, type Panel } from '../store';
import type { Nation } from '../sim/types';
import type { World } from '../sim/world';
import { Flag, NationChip, Section, Row, Icon, Stat } from './common';
import { LineChart, Bar } from './charts';
import { WarRow } from './Inspector';
import { fmtMoney, fmtPop, fmtK, fmtArea, fmtNum, fmtPct, stabColor } from './format';
import { fmtDate, fmtDuration, yearOf } from '../sim/calendar';
import { serialize, deserialize } from '../sim/save';
import { CHOKEPOINTS } from '../sim/economy';

const RAIL: { id: Exclude<Panel, null>; icon: string; label: string }[] = [
  { id: 'overview', icon: 'globe', label: 'World' },
  { id: 'wars', icon: 'war', label: 'Wars' },
  { id: 'diplomacy', icon: 'dip', label: 'Diplomacy' },
  { id: 'rankings', icon: 'rank', label: 'Rankings' },
  { id: 'history', icon: 'hist', label: 'History' },
  { id: 'sandbox', icon: 'tool', label: 'Sandbox' },
  { id: 'settings', icon: 'gear', label: 'Settings' },
];

export function LeftRail() {
  const panel = useUI((s) => s.panel);
  useUI((s) => s.tick);
  const wars = app.sim!.w.wars.filter((x) => x.status === 'active').length;
  return (
    <nav className="rail">
      {RAIL.map((r) => (
        <button key={r.id} className={panel === r.id ? 'on' : ''} onClick={() => store.set({ panel: panel === r.id ? null : r.id })} title={r.label}>
          <Icon name={r.icon} size={20} />
          <span>{r.label}</span>
          {r.id === 'wars' && wars > 0 && <i className="badge">{wars}</i>}
        </button>
      ))}
    </nav>
  );
}

export function Drawer() {
  const panel = useUI((s) => s.panel);
  useUI((s) => s.tick);
  if (!panel) return null;
  const title = RAIL.find((r) => r.id === panel)?.label;
  return (
    <aside className="drawer panel">
      <header className="drawer-head"><h3>{title}</h3><button className="close" onClick={() => store.set({ panel: null })}><Icon name="close" /></button></header>
      <div className="drawer-body">
        {panel === 'overview' && <OverviewPanel />}
        {panel === 'wars' && <WarsPanel />}
        {panel === 'diplomacy' && <DiplomacyPanel />}
        {panel === 'rankings' && <RankingsPanel />}
        {panel === 'history' && <HistoryPanel />}
        {panel === 'sandbox' && <SandboxPanel />}
        {panel === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
}

function alive(w: World) { return w.nations.filter((n) => n.alive && !n.faction); }

function OverviewPanel() {
  const w = app.sim!.w; const g = w.globalHist;
  const majors = alive(w).sort((a, b) => b.power - a.power).slice(0, 6);
  const unstable = alive(w).filter((n) => n.pol.stability < 30).sort((a, b) => a.pol.stability - b.pol.stability).slice(0, 6);
  const crises = w.nations.filter((n) => n.alive && n.ai.buildup > 0);
  const choke = CHOKEPOINTS.map((c) => ({ c, s: w.market.chokepoints[c.id] })).filter((x) => x.s && x.s.open < 0.95);
  const born = w.nations.filter((n) => n.created > 0 && !n.faction && n.alive);
  const dead = w.nations.filter((n) => !n.alive && n.died > 0 && !n.faction);
  return (
    <>
      <div className="stats-grid">
        <Stat label="Sovereign states" value={alive(w).length} sub={`${born.length} new · ${dead.length} extinct`} />
        <Stat label="Active wars" value={w.wars.filter((x) => x.status === 'active').length} sub={`${w.wars.length} since start`} color="var(--red)" />
        <Stat label="War casualties" value={fmtK(w.warStats.totalCasualties)} sub="military, all wars" />
      </div>
      <Section title="Global indicators">
        <LineChart t={g.t} series={[{ name: 'Tension', color: 'var(--red)', data: g.tension }, { name: 'Oil $', color: 'var(--amber)', data: g.oil }, { name: 'Food', color: 'var(--green)', data: g.food.map((v) => v / 2) }]} />
      </Section>
      {crises.length > 0 && <Section title="Brewing crises">{crises.map((n) => <div key={n.id} className="kv"><NationChip n={n} /><span className="muted small">massing forces vs</span><NationChip n={w.nations[n.ai.buildupTarget]} /></div>)}</Section>}
      {choke.length > 0 && <Section title="Disrupted chokepoints">{choke.map(({ c, s }) => <Row key={c.id} k={c.name} v={`${Math.round((1 - s.open) * 100)}% disrupted`} c="var(--orange)" />)}</Section>}
      <Section title="Great powers">{majors.map((n) => <div key={n.id} className="rel-row"><NationChip n={n} /><span className="muted small">{fmtMoney(n.eco.gdp)}</span><Bar value={n.power} max={majors[0].power} /></div>)}</Section>
      {unstable.length > 0 && <Section title="States in crisis">{unstable.map((n) => <div key={n.id} className="rel-row"><NationChip n={n} /><span style={{ color: stabColor(n.pol.stability) }}>{n.pol.stability.toFixed(0)}</span><span className="muted small">{n.atWar.length ? 'at war' : n.eco.recession ? 'recession' : ''}</span></div>)}</Section>}
    </>
  );
}

function WarsPanel() {
  const w = app.sim!.w;
  const [show, setShow] = useState<'active' | 'all'>('active');
  const list = w.wars.filter((x) => show === 'all' || x.status !== 'ended').slice().reverse();
  const longest = w.wars.slice().sort((a, b) => ((b.end ?? w.day) - b.start) - ((a.end ?? w.day) - a.start)).slice(0, 5);
  const deadliest = w.wars.slice().sort((a, b) => (b.a.casualties + b.d.casualties) - (a.a.casualties + a.d.casualties)).slice(0, 5);
  return (
    <>
      <button className="btn danger wide" onClick={() => store.set({ warDialog: { attackers: [], defenders: [] } })}>Start a new war…</button>
      <div className="seg"><button className={show === 'active' ? 'on' : ''} onClick={() => setShow('active')}>Ongoing</button><button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>All ({w.wars.length})</button></div>
      {list.length === 0 && <div className="empty">The world is at peace — for now.</div>}
      {list.map((war) => <WarRow key={war.id} war={war} />)}
      <Section title="Longest conflicts">{longest.map((x) => <button key={x.id} className="list-row" onClick={() => select({ kind: 'war', id: x.id }, true)}><span>{x.name}</span><span className="muted small">{fmtDuration((x.end ?? w.day) - x.start)}</span></button>)}</Section>
      <Section title="Deadliest conflicts">{deadliest.map((x) => <button key={x.id} className="list-row" onClick={() => select({ kind: 'war', id: x.id }, true)}><span>{x.name}</span><span className="muted small">{fmtK(x.a.casualties + x.d.casualties)} casualties</span></button>)}</Section>
    </>
  );
}

function DiplomacyPanel() {
  const sim = app.sim!; const w = sim.w;
  const [creating, setCreating] = useState<number[] | null>(null);
  const [name, setName] = useState('');
  const orgs = w.orgs.filter((o) => o.dissolved === undefined && o.members.length);
  const power = (ids: number[]) => ids.reduce((s, m) => s + w.nations[m].power, 0);
  const pacts = w.treaties.filter((t) => t.until === undefined && t.type === 'defense').slice(-12).reverse();
  return (
    <>
      <Section title="Alliances & blocs" right={<button className="btn small" onClick={() => setCreating([])}>+ New alliance</button>}>
        {creating && (
          <div className="creator">
            <input className="input" placeholder="Alliance name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="chip-row">{creating.map((id) => <NationChip key={id} n={w.nations[id]} onClick={() => setCreating(creating.filter((x) => x !== id))} />)}</div>
            <NationPicker onPick={(id) => !creating.includes(id) && setCreating([...creating, id])} />
            <div className="btn-grid">
              <button className="btn" disabled={creating.length < 2 || !name} onClick={() => { sim.createAlliance(name, creating); setCreating(null); setName(''); }}>Found alliance</button>
              <button className="btn" onClick={() => setCreating(null)}>Cancel</button>
            </div>
          </div>
        )}
        {orgs.sort((a, b) => power(b.members) - power(a.members)).map((o) => (
          <details key={o.id} className="org">
            <summary><i style={{ background: o.color }} /><b>{o.id}</b><span className="muted small">{o.name}</span><span className="grow" /><span className="muted small">{o.members.length} · {o.kind}</span></summary>
            <Row k="Combined power" v={fmtNum(power(o.members))} />
            <Row k="Combined GDP" v={fmtMoney(o.members.reduce((s, m) => s + w.nations[m].eco.gdp, 0))} />
            {o.kind === 'defense' && <Row k="Commitment" v={`${Math.round(o.commitment * 100)}%`} />}
            <div className="chip-row">{o.members.map((m) => <NationChip key={m} n={w.nations[m]} />)}</div>
          </details>
        ))}
      </Section>
      <Section title="Recent defence pacts">{pacts.map((t) => <div key={t.id} className="kv"><NationChip n={w.nations[t.a]} /><span className="muted small">{t.since > 0 ? fmtDate(t.since) : 'pre-2026'}</span><NationChip n={w.nations[t.b]} /></div>)}</Section>
      <Section title="Sanctions regime"><Row k="Active sanction links" v={w.sanctions.size} /></Section>
    </>
  );
}

export function NationPicker({ onPick, exclude = [] }: { onPick: (id: number) => void; exclude?: number[] }) {
  const w = app.sim!.w;
  const [q, setQ] = useState('');
  const list = useMemo(() => w.nations.filter((n) => n.alive && !exclude.includes(n.id) && (q ? n.name.toLowerCase().includes(q.toLowerCase()) || n.code.toLowerCase() === q.toLowerCase() : true)).sort((a, b) => b.power - a.power).slice(0, q ? 30 : 12), [q, exclude, w.day]);
  return (
    <div className="picker">
      <input className="input" placeholder="Search nations…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chip-row">{list.map((n) => <NationChip key={n.id} n={n} onClick={() => { onPick(n.id); setQ(''); }} />)}</div>
    </div>
  );
}

const RANK_COLS: { id: string; label: string; v: (n: Nation, w: World) => number; f: (v: number) => string }[] = [
  { id: 'power', label: 'Military', v: (n) => n.power, f: fmtNum },
  { id: 'gdp', label: 'GDP', v: (n) => n.eco.gdp, f: fmtMoney },
  { id: 'pc', label: 'GDP/cap', v: (n) => n.eco.gdp * 1e3 / Math.max(0.001, n.pop), f: (v) => `$${fmtNum(v)}` },
  { id: 'growth', label: 'Growth', v: (n) => n.eco.growth, f: (v) => fmtPct(v) },
  { id: 'pop', label: 'Population', v: (n) => n.pop, f: fmtPop },
  { id: 'area', label: 'Territory', v: (n) => n.area, f: fmtArea },
  { id: 'gain', label: 'Δ Territory', v: (n) => n.area - n.stats.startArea, f: (v) => `${v >= 0 ? '+' : '−'}${fmtArea(Math.abs(v))}` },
  { id: 'stab', label: 'Stability', v: (n) => n.pol.stability, f: (v) => v.toFixed(0) },
  { id: 'cas', label: 'Casualties', v: (n) => n.stats.casualties, f: fmtK },
  { id: 'tech', label: 'Technology', v: (n) => n.tech, f: (v) => v.toFixed(2) },
];

function RankingsPanel() {
  const w = app.sim!.w;
  const [col, setCol] = useState('power');
  const [asc, setAsc] = useState(false);
  const c = RANK_COLS.find((x) => x.id === col)!;
  const rows = alive(w).map((n) => ({ n, v: c.v(n, w) })).sort((a, b) => (asc ? a.v - b.v : b.v - a.v)).slice(0, 60);
  const top = rows[0]?.v || 1;
  return (
    <>
      <div className="seg wrap">{RANK_COLS.map((x) => <button key={x.id} className={col === x.id ? 'on' : ''} onClick={() => (col === x.id ? setAsc(!asc) : (setCol(x.id), setAsc(false)))}>{x.label}</button>)}</div>
      <div className="rank-list">
        {rows.map((r, i) => (
          <button key={r.n.id} className="rank-row" onClick={() => select({ kind: 'nation', id: r.n.id }, true)}>
            <span className="rank-i">{i + 1}</span><Flag n={r.n} size={14} /><span className="grow">{r.n.short}</span>
            <span className="rank-bar"><i style={{ width: `${Math.max(2, Math.min(100, Math.abs(r.v / top) * 100))}%` }} /></span>
            <b>{c.f(r.v)}</b>
          </button>
        ))}
      </div>
    </>
  );
}

function HistoryPanel() {
  const w = app.sim!.w;
  const replay = useUI((s) => s.replay);
  const [cat, setCat] = useState('all');
  const snaps = w.snapshots;
  const items = w.timeline.filter((t) => cat === 'all' || t.cat === cat).slice().reverse().slice(0, 200);
  let lastYear = -1;
  return (
    <>
      <Section title="Border time-lapse">
        <div className="muted small">{snaps.length} snapshots recorded. Drag to see the map as it was.</div>
        <input className="range wide" type="range" min={0} max={Math.max(0, snaps.length - 1)} value={replay ?? snaps.length - 1}
          onChange={(e) => { const v = +e.target.value; store.set({ replay: v >= snaps.length - 1 ? null : v, paused: true }); }} />
        <div className="kv"><span>{snaps.length ? fmtDate(snaps[0].day) : ''}</span><b>{replay !== null && snaps[replay] ? fmtDate(snaps[replay].day) : 'Live'}</b><span>{fmtDate(w.day)}</span></div>
        <ReplayPlayer />
      </Section>
      <Section title="World timeline">
        <div className="seg wrap">{['all', 'war', 'battle', 'diplomacy', 'alliance', 'politics', 'economy', 'disaster'].map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="timeline">
          {items.length === 0 && <div className="empty">Major events will be recorded here.</div>}
          {items.map((t, i) => {
            const y = yearOf(t.day); const head = y !== lastYear; lastYear = y;
            return (
              <div key={i}>
                {head && <div className="tl-year">{y}</div>}
                <button className={`tl-item ${t.cat}`} onClick={() => { if (t.war !== undefined) select({ kind: 'war', id: t.war }, true); else if (t.prov !== undefined) select({ kind: 'province', id: t.prov }, true); else if (t.nations[0] !== undefined) select({ kind: 'nation', id: t.nations[0] }, true); }}>
                  <span className="tl-date">{fmtDate(t.day).slice(0, -5)}</span><span>{t.title}</span>
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function ReplayPlayer() {
  const [playing, setPlaying] = useState(false);
  const w = app.sim!.w;
  const start = () => {
    if (playing) return;
    setPlaying(true);
    let i = 0;
    const tick = () => {
      if (i >= w.snapshots.length - 1) { store.set({ replay: null }); setPlaying(false); return; }
      store.set({ replay: i, paused: true }); i++;
      setTimeout(tick, 140);
    };
    tick();
  };
  return <button className="btn" onClick={start} disabled={playing || w.snapshots.length < 3}>{playing ? 'Playing…' : '▶ Play time-lapse'}</button>;
}

function SandboxPanel() {
  const sim = app.sim!; const w = sim.w;
  const tool = useUI((s) => s.tool);
  const [a, setA] = useState(-1), [b, setB] = useState(-1), [rel, setRel] = useState(0);
  return (
    <>
      <p className="muted small">You are an invisible hand. Every change ripples through the simulation — governments, markets and alliances react on their own.</p>
      <Section title="Quick scenarios">
        <div className="btn-grid">
          {[['Taiwan crisis', 'CN', 'TW', 'invasion'], ['Korean war', 'KP', 'KR', 'invasion'], ['Baltic flashpoint', 'RU', 'EE', 'invasion'], ['Gulf war', 'IR', 'SA', 'invasion'], ['Kashmir war', 'IN', 'PK', 'border'], ['Essequibo grab', 'VE', 'GY', 'border']].map(([label, x, y, t]) => (
            <button key={label} className="btn" onClick={() => { const war = sim.startWar([w.byCode.get(x)!], [w.byCode.get(y)!], t as 'invasion', t === 'border' ? 'claims' : 'annex', true); if (war) { select({ kind: 'war', id: war.id }, true); store.set({ paused: false }); } }}>{label}</button>
          ))}
        </div>
      </Section>
      <Section title="Set relations between two nations">
        <div className="kv"><span>{a >= 0 ? <NationChip n={w.nations[a]} onClick={() => setA(-1)} /> : 'Nation A'}</span><span>{b >= 0 ? <NationChip n={w.nations[b]} onClick={() => setB(-1)} /> : 'Nation B'}</span></div>
        {(a < 0 || b < 0) && <NationPicker onPick={(id) => (a < 0 ? setA(id) : setB(id))} />}
        {a >= 0 && b >= 0 && <>
          <label className="slider">Relationship <b>{rel}</b><input type="range" min={-100} max={100} value={rel} onChange={(e) => setRel(+e.target.value)} /></label>
          <div className="btn-grid"><button className="btn" onClick={() => sim.setRelation(a, b, rel)}>Apply</button><button className="btn" onClick={() => sim.toggleSanction(a, b)}>{w.sanctioning(a, b) ? 'Lift' : 'Impose'} sanctions</button><button className="btn" onClick={() => sim.defensePact(a, b)}>Defence pact</button></div>
        </>}
      </Section>
      <Section title="Map tools">
        {tool?.kind === 'transfer' && <div className="tool-info">Painting {tool.annex ? 'annexation' : 'occupation'} for {w.nations[tool.to].short}. Click regions on the map. <button className="btn small" onClick={() => store.set({ tool: null })}>Done</button></div>}
        {tool?.kind === 'independence' && <div className="tool-info">Selected {tool.picks.length} region(s). <button className="btn small" disabled={!tool.picks.length} onClick={() => { sim.declareIndependence(tool.picks); store.set({ tool: null }); }}>Declare new state</button> <button className="btn small" onClick={() => store.set({ tool: null })}>Cancel</button></div>}
        {!tool && <div className="btn-grid">
          <button className="btn" onClick={() => store.set({ tool: { kind: 'pickNation', purpose: 'Pick the nation that will receive territory', cb: (id) => store.set({ tool: { kind: 'transfer', to: id, annex: true } }) } })}>Redraw borders…</button>
          <button className="btn" onClick={() => store.set({ tool: { kind: 'independence', picks: [] } })}>Create a breakaway state…</button>
        </div>}
      </Section>
      <Section title="World rules"><WorldRules /></Section>
    </>
  );
}

function WorldRules() {
  const w = app.sim!.w; const s = w.settings;
  const [, force] = useState(0);
  const set = (p: Partial<typeof s>) => { Object.assign(s, p); force((x) => x + 1); };
  const aggr = ['Peaceful', 'Restrained', 'Realistic', 'Volatile', 'Chaotic'];
  const ai = Math.round((s.aggression - 0.25) / 0.4375);
  return (
    <>
      <label className="slider">AI aggression <b>{aggr[Math.max(0, Math.min(4, ai))]}</b>
        <input type="range" min={0.25} max={2} step={0.05} value={s.aggression} onChange={(e) => set({ aggression: +e.target.value })} /></label>
      <label className="slider">Random event frequency <b>{s.events.toFixed(1)}×</b>
        <input type="range" min={0} max={3} step={0.1} value={s.events} onChange={(e) => set({ events: +e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={s.aiWars} onChange={(e) => set({ aiWars: e.target.checked })} /> AI nations may start wars</label>
      <label className="check"><input type="checkbox" checked={s.autoJoin} onChange={(e) => set({ autoJoin: e.target.checked })} /> Allies honour defence treaties</label>
      <label className="check"><input type="checkbox" checked={s.nukes} onChange={(e) => set({ nukes: e.target.checked })} /> Allow nuclear escalation (otherwise deterrence only)</label>
    </>
  );
}

function SettingsPanel() {
  const sim = app.sim!;
  const arrows = useUI((s) => s.showArrows);
  const labels = useUI((s) => s.showLabels);
  const [msg, setMsg] = useState('');
  const save = () => {
    try { localStorage.setItem('worldstate-save', serialize(sim)); setMsg(`Saved ${fmtDate(sim.w.day)}`); } catch { setMsg('Browser storage is full — use Export instead.'); }
  };
  const load = () => {
    try { const t = localStorage.getItem('worldstate-save'); if (!t) { setMsg('No quick-save found.'); return; } deserialize(sim, t); store.set({ selection: null, replay: null }); setMsg('Loaded.'); } catch (e) { setMsg('Load failed: ' + (e as Error).message); }
  };
  const exportFile = () => {
    const blob = new Blob([serialize(sim)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `worldstate-${yearOf(sim.w.day)}.json`; a.click();
  };
  const importFile = (f: File) => f.text().then((t) => { deserialize(sim, t); store.set({ selection: null, replay: null }); setMsg('Imported.'); }).catch((e) => setMsg('Import failed: ' + e.message));
  return (
    <>
      <Section title="Display">
        <label className="check"><input type="checkbox" checked={arrows} onChange={(e) => store.set({ showArrows: e.target.checked })} /> Offensive arrows</label>
        <label className="check"><input type="checkbox" checked={labels} onChange={(e) => store.set({ showLabels: e.target.checked })} /> Country labels</label>
      </Section>
      <Section title="Save & load">
        <div className="btn-grid">
          <button className="btn" onClick={save}>Quick save</button><button className="btn" onClick={load}>Quick load</button>
          <button className="btn" onClick={exportFile}>Export file</button>
          <label className="btn">Import file<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        </div>
        {msg && <div className="muted small">{msg}</div>}
      </Section>
      <Section title="New world">
        <div className="btn-grid">
          <button className="btn" onClick={() => { location.hash = 'present'; location.reload(); }}>Present day (2026)</button>
          <button className="btn" onClick={() => { location.hash = 'clean'; location.reload(); }}>Clean slate — no wars</button>
        </div>
      </Section>
      <Section title="Controls">
        <Row k="Play / pause" v="Space" /><Row k="Speed" v="+ / −" /><Row k="Search" v="Ctrl + K" /><Row k="Zoom" v="Scroll · double-click" /><Row k="Inspect region" v="Shift + click" /><Row k="Close panels" v="Esc" />
      </Section>
      <p className="muted small">Leaders are fictional. Starting data approximates late-2026 conditions; everything after day one is emergent.</p>
    </>
  );
}
