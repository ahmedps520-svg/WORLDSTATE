import { useEffect, useMemo, useState } from 'react';
import { app, store, useUI, select, type MapMode } from '../store';
import type { WarType, WarGoal, NewsItem } from '../sim/types';
import { Flag, NationChip, Icon } from './common';
import { NationPicker } from './Panels';
import { fmtDate } from '../sim/calendar';
import { evaluateTargets } from '../sim/ai';

const CAT_COLOR: Record<string, string> = { war: 'var(--red)', battle: 'var(--orange)', diplomacy: 'var(--blue)', alliance: 'var(--blue)', politics: 'var(--violet)', economy: 'var(--green)', disaster: 'var(--amber)', world: 'var(--muted)' };

function openNews(n: NewsItem) {
  if (n.war !== undefined && n.cat !== 'battle') select({ kind: 'war', id: n.war }, true);
  else if (n.prov !== undefined) { select({ kind: 'nation', id: n.nations[0] ?? app.sim!.w.provinces[n.prov].ctrl }); const p = app.sim!.w.provinces[n.prov]; app.flyTo(p.lon, p.lat, 4); }
  else if (n.nations.length) select({ kind: 'nation', id: n.nations[0] }, true);
  else if (n.loc) app.flyTo(n.loc[0], n.loc[1], 2);
}

export function NewsFeed() {
  useUI((s) => s.tick);
  const open = useUI((s) => s.feedOpen);
  const filter = useUI((s) => s.newsFilter);
  const w = app.sim!.w;
  const items = w.news.filter((n) => (filter === 'all' ? n.imp >= 2 : filter === 'major' ? n.imp >= 4 : n.cat === filter || (filter === 'war' && n.cat === 'battle'))).slice(-60).reverse();
  return (
    <section className={`feed panel ${open ? '' : 'collapsed'}`}>
      <header onClick={() => store.set({ feedOpen: !open })}>
        <span className="live-dot" /> <b>World Wire</b>
        <span className="grow" />
        {open && <div className="feed-filters" onClick={(e) => e.stopPropagation()}>
          {['all', 'major', 'war', 'diplomacy', 'politics', 'economy', 'disaster'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => store.set({ newsFilter: f })}>{f}</button>)}
        </div>}
        <span className="muted">{open ? '▾' : '▴'}</span>
      </header>
      {open && (
        <div className="feed-list">
          {items.map((n) => (
            <button key={n.id} className={`news imp${n.imp}`} onClick={() => openNews(n)}>
              <i style={{ background: CAT_COLOR[n.cat] }} />
              <div className="news-meta"><span>{fmtDate(n.day)}</span><span style={{ color: CAT_COLOR[n.cat] }}>{n.cat}</span>
                <span className="news-flags">{n.nations.slice(0, 3).map((id) => w.nations[id] && <Flag key={id} n={w.nations[id]} size={10} />)}</span></div>
              <div className="news-title">{n.title}</div>
              {n.body && n.imp >= 4 && <div className="news-body">{n.body}</div>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const MODES: { id: MapMode; label: string }[] = [
  { id: 'flags', label: 'Flags' }, { id: 'political', label: 'Political' }, { id: 'alliances', label: 'Alliances' }, { id: 'relations', label: 'Relations' },
  { id: 'stability', label: 'Stability' }, { id: 'economy', label: 'Growth' }, { id: 'military', label: 'Military' }, { id: 'devastation', label: 'War damage' },
  { id: 'population', label: 'Population' }, { id: 'terrain', label: 'Terrain' },
];
const LEGENDS: Partial<Record<MapMode, [string, string][]>> = {
  stability: [['#7a1f24', 'Collapse'], ['#d9a43c', 'Fragile'], ['#2f8a5f', 'Stable']],
  economy: [['#b3322c', '−6%'], ['#565d68', '0%'], ['#43c07a', '+7%']],
  military: [['#24405e', 'Weak'], ['#4fa0d8', 'Strong'], ['#bfe3ff', 'Superpower']],
  relations: [['#e9c46a', 'Selected'], ['#3d7fe0', 'Ally'], ['#3fb27f', 'Friendly'], ['#b3322c', 'Hostile'], ['#e0352b', 'At war']],
  devastation: [['#26303a', 'Untouched'], ['#b8452a', 'Devastated'], ['#ff6a3d', 'Fighting']],
  population: [['#2c4157', 'Sparse'], ['#8fb7c9', 'Dense'], ['#f4f0d8', 'Urban']],
  terrain: [['#6f8f5a', 'Plains'], ['#3f6b45', 'Forest'], ['#8a8a5c', 'Hills'], ['#8b7b6b', 'Mountains'], ['#c9a96a', 'Desert'], ['#2f6e4a', 'Jungle'], ['#c9d4dc', 'Arctic']],
};

export function MapModes() {
  const mode = useUI((s) => s.mapMode);
  const sel = useUI((s) => s.selection);
  const w = app.sim!.w;
  const legend = mode === 'alliances' ? w.orgs.filter((o) => o.kind === 'defense' && o.members.length > 2 && o.dissolved === undefined).map((o) => [o.color, o.id] as [string, string]).concat([['#7a6fb0', 'Bilateral pact'], ['#4a5260', 'Unaligned']]) : LEGENDS[mode];
  return (
    <div className="modes">
      {legend && <div className="legend panel">{mode === 'relations' && sel?.kind !== 'nation' && <div className="muted small">Select a country to see its relations.</div>}{legend.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>}
      {mode === 'flags' && <div className="legend panel"><span><i className="hatch" />Occupied</span><span><i style={{ background: '#ff4632' }} />Front line</span><span><i style={{ border: '1px dashed #fff', background: 'transparent' }} />Pre-war border</span><span><i style={{ border: '1px dashed #ffc83c', background: 'transparent' }} />Encircled</span></div>}
      <div className="mode-bar panel">{MODES.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => store.set({ mapMode: m.id })}>{m.label}</button>)}</div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const w = app.sim!.w;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.cat}`} onClick={() => { if (t.war !== undefined) select({ kind: 'war', id: t.war }, true); else if (t.nid !== undefined) select({ kind: 'nation', id: t.nid }, true); store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })); }}>
          <span className="toast-kicker">Breaking</span>
          <div className="toast-title">{t.nid !== undefined && w.nations[t.nid] && <Flag n={w.nations[t.nid]} size={14} />} {t.title}</div>
          {t.body && <div className="toast-body">{t.body}</div>}
        </button>
      ))}
    </div>
  );
}

const TYPES: { id: WarType; label: string; desc: string; goal: WarGoal }[] = [
  { id: 'invasion', label: 'Full invasion', desc: 'Drive on the capital. Aim to conquer or topple the government.', goal: 'annex' },
  { id: 'border', label: 'Border conflict', desc: 'Limited offensive to seize claimed or border regions, then dig in.', goal: 'claims' },
  { id: 'punitive', label: 'Strike campaign', desc: 'Air and missile strikes on military and economic targets. No ground advance.', goal: 'punish' },
  { id: 'intervention', label: 'Intervention', desc: 'Military operation to install a friendly government.', goal: 'regime' },
  { id: 'liberation', label: 'Liberation war', desc: 'Reclaim territory and lost national lands.', goal: 'liberate' },
];

export function WarDialog() {
  const dlg = useUI((s) => s.warDialog);
  const [type, setType] = useState<WarType>('invasion');
  const [allies, setAllies] = useState(true);
  const [treaty, setTreaty] = useState(true);
  const [cease, setCease] = useState(true);
  const [nukes, setNukes] = useState(false);
  if (!dlg) return null;
  const sim = app.sim!; const w = sim.w;
  const set = (p: Partial<NonNullable<typeof dlg>>) => store.set({ warDialog: { ...dlg, ...p } });
  const power = (ids: number[]) => ids.reduce((s, m) => s + w.nations[m].power, 0);
  const pa = power(dlg.attackers), pd = power(dlg.defenders);
  const t = TYPES.find((x) => x.id === type)!;
  const allyHint = dlg.defenders.flatMap((d) => w.defensePartners(d).map((p) => p.id)).filter((x, i, a) => a.indexOf(x) === i && !dlg.attackers.includes(x) && !dlg.defenders.includes(x));
  const est = dlg.attackers.length === 1 && dlg.defenders.length === 1 ? evaluateTargets(w, w.nations[dlg.attackers[0]], new Set([dlg.defenders[0]]), new Set()).find((p) => p.target === dlg.defenders[0]) : undefined;
  const noBorder = dlg.attackers.length > 0 && dlg.defenders.length > 0 && !dlg.attackers.some((a) => { const b = w.borderNations(a); return dlg.defenders.some((d) => b.has(d)); });
  const go = () => {
    const war = sim.startWar(dlg.attackers, dlg.defenders, type, t.goal, allies, { allowTreaty: treaty, allowCeasefire: cease, nukes });
    store.set({ warDialog: null, paused: false });
    if (war) select({ kind: 'war', id: war.id }, true);
  };
  return (
    <div className="modal-bg" onClick={() => store.set({ warDialog: null })}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <header><h3>Declare war</h3><button className="close" onClick={() => store.set({ warDialog: null })}><Icon name="close" /></button></header>
        <div className="war-builder">
          <div className="wb-side a">
            <h5>Aggressors</h5>
            <div className="chip-row">{dlg.attackers.map((id) => <NationChip key={id} n={w.nations[id]} onClick={() => set({ attackers: dlg.attackers.filter((x) => x !== id) })} />)}</div>
            <NationPicker exclude={[...dlg.attackers, ...dlg.defenders]} onPick={(id) => set({ attackers: [...dlg.attackers, id] })} />
            <div className="muted small">Power {Math.round(pa).toLocaleString()}</div>
          </div>
          <div className="wb-vs">VS</div>
          <div className="wb-side d">
            <h5>Targets</h5>
            <div className="chip-row">{dlg.defenders.map((id) => <NationChip key={id} n={w.nations[id]} onClick={() => set({ defenders: dlg.defenders.filter((x) => x !== id) })} />)}</div>
            <NationPicker exclude={[...dlg.attackers, ...dlg.defenders]} onPick={(id) => set({ defenders: [...dlg.defenders, id] })} />
            <div className="muted small">Power {Math.round(pd).toLocaleString()}</div>
          </div>
        </div>
        <div className="wb-types">{TYPES.map((x) => <button key={x.id} className={type === x.id ? 'on' : ''} onClick={() => setType(x.id)}><b>{x.label}</b><span>{x.desc}</span></button>)}</div>
        <div className="wb-rules">
          <h5>Rules of this war</h5>
          <label className="check"><input id="wr-allies" type="checkbox" checked={allies} onChange={(e) => setAllies(e.target.checked)} /> Allies decide whether to honour their treaties</label>
          <label className="check"><input id="wr-treaty" type="checkbox" checked={treaty} onChange={(e) => setTreaty(e.target.checked)} /> Can end in a peace treaty <span className="muted small">(negotiated cession or return to pre-war borders)</span></label>
          <label className="check"><input id="wr-cease" type="checkbox" checked={cease} onChange={(e) => setCease(e.target.checked)} /> Can end in a ceasefire <span className="muted small">(front lines frozen)</span></label>
          <label className="check"><input id="wr-nukes" type="checkbox" checked={nukes} onChange={(e) => setNukes(e.target.checked)} /> Nuclear weapons authorised <span className="muted small">(nuclear-armed sides may strike, and the other side may retaliate)</span></label>
          {!treaty && !cease && <div className="muted small red">Fight to the finish: this war only ends when one side is conquered or collapses, or when you end it yourself.</div>}
          {nukes && ![...dlg.attackers, ...dlg.defenders].some((id) => w.nations[id].nukes > 0) && <div className="muted small amber">Neither side currently has nuclear weapons.</div>}
        </div>
        {noBorder && <div className="warn-box">These countries share no land border. Forces will make amphibious landings, or airborne drops into landlocked countries, to seize a foothold and push inland. Naval and air strength decide whether landings succeed.</div>}
        {allyHint.length > 0 && allies && <div className="warn-box">Treaty partners that may intervene: <span className="chip-row">{allyHint.slice(0, 14).map((id) => <NationChip key={id} n={w.nations[id]} />)}</span></div>}
        {est && <div className="muted small">Intelligence assessment: effective strength ratio {est.ratio.toFixed(2)} : 1 once allies are counted{est.ratio < 1 ? ' — a risky gamble.' : '.'}</div>}
        <footer><button className="btn" onClick={() => store.set({ warDialog: null })}>Cancel</button><button className="btn danger" disabled={!dlg.attackers.length || !dlg.defenders.length} onClick={go}>Declare war</button></footer>
      </div>
    </div>
  );
}

export function SearchBox() {
  const open = useUI((s) => s.search);
  const [q, setQ] = useState('');
  const w = app.sim!.w;
  const res = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    const ns = w.nations.filter((n) => n.alive && (n.name.toLowerCase().includes(ql) || n.code.toLowerCase() === ql)).slice(0, 6).map((n) => ({ kind: 'nation' as const, id: n.id, label: n.name, sub: 'Country' }));
    const ps = w.provinces.filter((p) => p.name.toLowerCase().startsWith(ql)).slice(0, 8).map((p) => ({ kind: 'province' as const, id: p.id, label: p.name, sub: w.nations[p.ctrl].short }));
    const ws = w.wars.filter((x) => x.name.toLowerCase().includes(ql)).slice(0, 4).map((x) => ({ kind: 'war' as const, id: x.id, label: x.name, sub: x.status }));
    return [...ns, ...ws, ...ps];
  }, [q, w.day]);
  if (!open) return null;
  const close = () => { store.set({ search: false }); setQ(''); };
  return (
    <div className="modal-bg top" onClick={close}>
      <div className="search panel" onClick={(e) => e.stopPropagation()}>
        <input autoFocus className="input big" placeholder="Search countries, regions, wars…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && res[0]) { select(res[0], true); close(); } }} />
        {res.map((r) => <button key={r.kind + r.id} className="list-row" onClick={() => { select(r, true); close(); }}>{r.kind === 'nation' && <Flag n={w.nations[r.id]} size={14} />}<span className="grow">{r.label}</span><span className="muted small">{r.sub}</span></button>)}
      </div>
    </div>
  );
}

export function ToolBanner() {
  const tool = useUI((s) => s.tool);
  const sim = app.sim!;
  if (!tool) return null;
  const text = tool.kind === 'pickNation' ? tool.purpose : tool.kind === 'transfer' ? `Click regions to give them to ${sim.w.nations[tool.to].short} (${tool.annex ? 'annex' : 'occupy'})` : `Click regions to include in the new state — ${tool.picks.length} selected`;
  return (
    <div className="tool-banner panel">
      <span>{text}</span>
      {tool.kind === 'independence' && <button className="btn small" disabled={!tool.picks.length} onClick={() => { sim.declareIndependence(tool.picks); store.set({ tool: null }); }}>Create state</button>}
      <button className="btn small" onClick={() => store.set({ tool: null })}>{tool.kind === 'pickNation' ? 'Cancel' : 'Done'}</button>
    </div>
  );
}

export function SkipOverlay() {
  const sk = useUI((s) => s.skipping);
  useUI((s) => s.tick);
  if (!sk) return null;
  const w = app.sim!.w;
  const pct = ((w.day - sk.start) / Math.max(1, sk.target - sk.start)) * 100;
  return (
    <div className="skip-overlay panel">
      <div>Fast-forwarding to <b>{fmtDate(sk.target)}</b></div>
      <div className="bar"><div style={{ width: `${pct}%`, background: 'var(--accent)' }} /></div>
      <div className="muted small">{fmtDate(w.day)} · {w.news.length ? w.news[w.news.length - 1].title : ''}</div>
    </div>
  );
}

export function useHotkeys() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const s = store.get();
      if (e.key === 'Escape') { store.set({ selection: s.warDialog || s.search ? s.selection : null, tool: null, warDialog: null, search: false }); return; }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); store.set({ paused: !s.paused }); }
      else if (e.key === '+' || e.key === '=') store.set({ speed: Math.min(7, s.speed + 1) });
      else if (e.key === '-') store.set({ speed: Math.max(0, s.speed - 1) });
      else if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); store.set({ search: true }); }
      else if (e.key === 'Escape') store.set({ selection: null, tool: null, warDialog: null, search: false });
      else if (e.key >= '1' && e.key <= '9' && !e.ctrlKey) { const modes: MapMode[] = ['flags', 'political', 'alliances', 'relations', 'stability', 'economy', 'military', 'devastation', 'population']; store.set({ mapMode: modes[+e.key - 1] }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
