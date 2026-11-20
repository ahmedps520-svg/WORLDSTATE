import { useState } from 'react';
import { app, store, useUI, select } from '../store';
import type { Nation, War, GovType } from '../sim/types';
import { Flag, NationChip, Stat, Section, Row, Icon } from './common';
import { LineChart, Sparkline, Bar } from './charts';
import { fmtMoney, fmtPop, fmtK, fmtPct, fmtArea, stabilityLabel, stabColor, relLabel, relColor, fmtNum } from './format';
import { assess } from './assess';
import { GOV_NAME } from '../sim/politics';
import { fmtDate, fmtDuration } from '../sim/calendar';
import { adPower, projection } from '../sim/military';
import { frontCache, sideOf } from '../sim/war';
import { MAX_NATIONS } from '../sim/world';

export function Inspector() {
  const sel = useUI((s) => s.selection);
  useUI((s) => s.tick);
  if (!sel) return null;
  const w = app.sim!.w;
  return (
    <aside className="inspector panel">
      <button className="close" onClick={() => store.set({ selection: null })}><Icon name="close" /></button>
      {sel.kind === 'nation' && w.nations[sel.id] && <NationPanel n={w.nations[sel.id]} />}
      {sel.kind === 'province' && w.provinces[sel.id] && <ProvincePanel id={sel.id} />}
      {sel.kind === 'war' && <WarPanel war={w.wars.find((x) => x.id === sel.id)!} />}
    </aside>
  );
}

const TABS = ['Overview', 'Economy', 'Military', 'Politics', 'Diplomacy', 'Territory', 'Act'] as const;

function rankOf(w: typeof app.sim extends null ? never : NonNullable<typeof app.sim>['w'], n: Nation, key: (x: Nation) => number) {
  const list = w.nations.filter((x) => x.alive && !x.faction).sort((a, b) => key(b) - key(a));
  return list.indexOf(n) + 1;
}

export function NationPanel({ n }: { n: Nation }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const w = app.sim!.w;
  const L = n.leader;
  const insights = assess(w, n);
  const chips: { t: string; c: string }[] = [];
  if (!n.alive) chips.push({ t: 'Defunct', c: 'gray' });
  if (n.atWar.length) chips.push({ t: 'At war', c: 'red' });
  if (n.faction) chips.push({ t: n.faction.kind === 'separatist' ? 'Separatist' : 'Insurgent', c: 'red' });
  if (n.eco.recession) chips.push({ t: 'Recession', c: 'amber' });
  if (n.eco.sanctions > 0.2) chips.push({ t: 'Sanctioned', c: 'amber' });
  if (n.nukes > 0) chips.push({ t: 'Nuclear', c: 'violet' });
  if (n.ai.buildup > 0) chips.push({ t: 'Mobilising', c: 'red' });
  for (const o of w.orgsOf(n.id).filter((o) => o.kind === 'defense')) chips.push({ t: o.id, c: 'blue' });
  return (
    <div className="nation">
      <div className="n-head">
        <div className="n-flag"><Flag n={n} size={54} /></div>
        <div>
          <h2>{n.name}</h2>
          <div className="muted">{GOV_NAME[n.gov]} · {n.region}</div>
          <div className="chips">{chips.map((c) => <span key={c.t} className={`tag ${c.c}`}>{c.t}</span>)}</div>
        </div>
      </div>
      <div className="leader">
        <div className="avatar">{L.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
        <div className="grow">
          <div><b>{L.title} {L.name}</b></div>
          <div className="muted small">{L.trait} · age {L.age} · in office {fmtDuration(Math.max(1, w.day - L.since))}</div>
        </div>
        <div className="approval" title="Approval rating"><div style={{ color: stabColor(L.approval) }}>{L.approval.toFixed(0)}%</div><small>approval</small></div>
      </div>
      <nav className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <div className="tab-body">
        {tab === 'Overview' && <Overview n={n} insights={insights} />}
        {tab === 'Economy' && <EconomyTab n={n} />}
        {tab === 'Military' && <MilitaryTab n={n} />}
        {tab === 'Politics' && <PoliticsTab n={n} />}
        {tab === 'Diplomacy' && <DiplomacyTab n={n} />}
        {tab === 'Territory' && <TerritoryTab n={n} />}
        {tab === 'Act' && <ActTab n={n} />}
      </div>
    </div>
  );
}

function Overview({ n, insights }: { n: Nation; insights: ReturnType<typeof assess> }) {
  const w = app.sim!.w;
  const h = n.hist;
  const perCap = n.eco.gdp * 1e3 / Math.max(0.001, n.pop);
  const owned = w.ownList[n.id]?.length || 0;
  const wars = n.atWar.map((id) => w.wars.find((x) => x.id === id)!).filter(Boolean);
  return (
    <>
      <Section title="Situation report">
        <ul className="insights">{insights.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}</ul>
      </Section>
      <div className="stats-grid">
        <Stat label="Population" value={fmtPop(n.pop)} sub={<Sparkline data={h.pop.slice(-60)} />} />
        <Stat label="GDP" value={fmtMoney(n.eco.gdp)} sub={<Sparkline data={h.gdp.slice(-60)} color="var(--green)" />} />
        <Stat label="Growth" value={fmtPct(n.eco.growth)} color={n.eco.growth < 0 ? 'var(--red)' : 'var(--green)'} sub={`$${fmtNum(perCap)} per capita`} />
        <Stat label="Stability" value={n.pol.stability.toFixed(0)} color={stabColor(n.pol.stability)} sub={stabilityLabel(n.pol.stability)} />
        <Stat label="Military power" value={fmtNum(n.power)} sub={`#${rankOf(w, n, (x) => x.power)} in the world`} />
        <Stat label="Territory" value={fmtArea(n.area)} sub={`${n.provinceCount} regions · ${owned} de jure`} />
      </div>
      {wars.length > 0 && <Section title="Active conflicts">{wars.map((war) => <WarRow key={war.id} war={war} me={n.id} />)}</Section>}
      <Section title="Alignment">
        <AlignBar v={w.west[n.id]} />
        <div className="chip-row">{w.defensePartners(n.id).slice(0, 14).map((p) => <NationChip key={p.id} n={w.nations[p.id]} />)}</div>
      </Section>
    </>
  );
}

export function AlignBar({ v }: { v: number }) {
  return (
    <div className="align">
      <span>Eastern bloc</span>
      <div className="align-track"><div className="align-dot" style={{ left: `${(v + 1) * 50}%` }} /></div>
      <span>Western bloc</span>
    </div>
  );
}

export function WarRow({ war, me }: { war: War; me?: number }) {
  const w = app.sim!.w;
  const side = me !== undefined ? sideOf(war, me) : 'a';
  const score = side === 'd' ? -war.score : war.score;
  return (
    <button className="war-row" onClick={() => select({ kind: 'war', id: war.id }, true)}>
      <div className="war-row-top"><b>{war.name}</b><span className={`tag ${war.status === 'active' ? 'red' : war.status === 'ceasefire' ? 'amber' : 'gray'}`}>{war.status}</span></div>
      <div className="war-sides">
        <span><Flag n={w.nations[war.a.leader]} size={12} /> {w.nations[war.a.leader].short}{war.a.members.length > 1 ? ` +${war.a.members.length - 1}` : ''}</span>
        <span className="vs">vs</span>
        <span><Flag n={w.nations[war.d.leader]} size={12} /> {w.nations[war.d.leader].short}{war.d.members.length > 1 ? ` +${war.d.members.length - 1}` : ''}</span>
      </div>
      <ScoreBar score={war.score} />
      {me !== undefined && <div className="muted small">{score > 10 ? 'Advantage' : score < -10 ? 'Disadvantage' : 'Even'} · {fmtDuration(w.day - war.start)}</div>}
    </button>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="score">
      <div className="score-a" style={{ width: `${50 + score / 2}%` }} />
      <div className="score-mid" />
    </div>
  );
}

function EconomyTab({ n }: { n: Nation }) {
  const w = app.sim!.w; const e = n.eco; const h = n.hist;
  return (
    <>
      <LineChart t={h.t} series={[{ name: 'GDP', color: 'var(--green)', data: h.gdp }]} fmt={fmtMoney} />
      <div className="stats-grid">
        <Stat label="GDP" value={fmtMoney(e.gdp)} sub={`#${rankOf(w, n, (x) => x.eco.gdp)} world`} />
        <Stat label="Growth" value={fmtPct(e.growth)} color={e.growth < 0 ? 'var(--red)' : 'var(--green)'} sub={`trend ${e.potential.toFixed(1)}%`} />
        <Stat label="Inflation" value={fmtPct(e.inflation)} color={e.inflation > 10 ? 'var(--orange)' : undefined} />
        <Stat label="Unemployment" value={fmtPct(e.unemployment)} />
        <Stat label="Public debt" value={`${e.debt.toFixed(0)}%`} sub="of GDP" color={e.debt > 120 ? 'var(--orange)' : undefined} />
        <Stat label="Reserves" value={fmtMoney(e.reserves)} />
      </div>
      <Section title="Structure">
        <Row k="Defence spending" v={`${e.milPct.toFixed(1)}% → ${e.milTarget.toFixed(1)}%`} />
        <Row k="Oil production" v={e.oilProd > 0 ? `${e.oilProd.toFixed(2)} Mb/d` : 'none'} />
        <Row k="Food self-sufficiency" v={`${Math.round(e.food * 100)}%`} c={e.food < 0.7 ? 'var(--orange)' : undefined} />
        <Row k="Trade openness" v={`${Math.round(e.tradeOpen * 100)}% of GDP`} />
        <Row k="Industrial capacity" v={<Bar value={e.industry} max={2} color="var(--accent)" />} />
        <Row k="Infrastructure" v={<Bar value={e.infrastructure} max={1} color="var(--blue)" />} />
        <Row k="Technology level" v={n.tech.toFixed(2)} />
        <Row k="Sanctions pressure" v={`${Math.round(e.sanctions * 100)}%`} c={e.sanctions > 0.2 ? 'var(--red)' : undefined} />
        <Row k="Naval blockade" v={`${Math.round(e.blockade * 100)}%`} c={e.blockade > 0.1 ? 'var(--red)' : undefined} />
        <Row k="Business cycle" v={e.cycle > 0.5 ? 'Expansion' : e.cycle < -0.5 ? 'Contraction' : 'Neutral'} />
      </Section>
    </>
  );
}

function MilitaryTab({ n }: { n: Nation }) {
  const w = app.sim!.w; const m = n.mil; const h = n.hist;
  const forts = (w.ctrlList[n.id] || []).filter((i) => w.provinces[i].fort > 1.5).length;
  return (
    <>
      <LineChart t={h.t} series={[{ name: 'Power', color: 'var(--accent)', data: h.power }, { name: 'Personnel (K)', color: 'var(--blue)', data: h.mil }]} fmt={(v) => fmtNum(v)} />
      <div className="stats-grid">
        <Stat label="Power index" value={fmtNum(n.power)} sub={`#${rankOf(w, n, (x) => x.power)} world`} />
        <Stat label="Land power" value={fmtNum(n.landPower)} />
        <Stat label="Air power" value={fmtNum(n.airPower)} />
        <Stat label="Naval power" value={fmtNum(n.navalPower)} sub={`projection ${Math.round(projection(n) * 100)}%`} />
        <Stat label="Air defence" value={fmtNum(adPower(n))} />
        <Stat label="Nuclear" value={n.nukes > 0 ? fmtNum(n.nukes) : '—'} sub={n.nukes > 0 ? 'warheads' : 'none'} />
      </div>
      <Section title="Forces">
        <Row k="Active personnel" v={fmtK(m.active)} />
        <Row k="Mobilised reservists" v={fmtK(m.mobilized)} />
        <Row k="Trained reserves" v={fmtK(m.reserves)} />
        <Row k="Mobilisation" v={['Peacetime', 'Heightened alert', 'Partial mobilisation', 'General mobilisation'][m.mobLevel]} c={m.mobLevel >= 2 ? 'var(--red)' : undefined} />
        <Row k="Tanks & AFVs" v={fmtNum(m.armor)} />
        <Row k="Artillery" v={fmtNum(m.artillery)} />
        <Row k="Combat aircraft" v={fmtNum(m.aircraft)} />
        <Row k="Naval strength" v={`${fmtNum(m.navy)} (×10 kt)`} />
        <Row k="Strike missiles" v={fmtNum(m.missiles)} />
      </Section>
      <Section title="Effectiveness">
        <Row k="Training" v={<Bar value={m.training} max={1} color="var(--blue)" />} />
        <Row k="Readiness" v={<Bar value={m.readiness} max={1} color="var(--accent)" />} />
        <Row k="Morale" v={<Bar value={m.morale} max={1} color={m.morale < 0.35 ? 'var(--red)' : 'var(--green)'} />} />
        <Row k="Command" v={<Bar value={m.command} max={1} color="var(--violet)" />} />
        <Row k="Combat experience" v={<Bar value={m.experience} max={1} color="var(--orange)" />} />
        <Row k="Ammunition" v={`${m.ammo.toFixed(0)} days`} c={m.ammo < 8 ? 'var(--red)' : undefined} />
        <Row k="Fuel security" v={`${Math.round(m.fuel * 100)}%`} c={m.fuel < 0.7 ? 'var(--orange)' : undefined} />
        <Row k="Intelligence" v={`${Math.round(n.intel * 100)}%`} />
        <Row k="Fortified regions" v={forts} />
        <Row k="Losses to date" v={`${fmtK(m.losses)} personnel · ${fmtNum(m.lossesEquip)} vehicles`} />
        {m.aidReceived > 0 && <Row k="Foreign aid received" v={fmtMoney(m.aidReceived)} />}
      </Section>
    </>
  );
}

function PoliticsTab({ n }: { n: Nation }) {
  const w = app.sim!.w; const p = n.pol; const h = n.hist;
  const sep = (w.ownList[n.id] || []).map((i) => w.provinces[i]).filter((x) => x.separatism > 35).sort((a, b) => b.separatism - a.separatism);
  return (
    <>
      <LineChart t={h.t} series={[{ name: 'Stability', color: 'var(--amber)', data: h.stability }]} />
      <Section title="Domestic politics">
        <Row k="Government" v={GOV_NAME[n.gov]} />
        <Row k="Stability" v={`${p.stability.toFixed(0)} — ${stabilityLabel(p.stability)}`} c={stabColor(p.stability)} />
        <Row k="Legitimacy" v={<Bar value={p.legitimacy} color="var(--blue)" />} />
        <Row k="Unrest" v={<Bar value={p.unrest} color="var(--red)" />} />
        <Row k="War weariness" v={<Bar value={p.weariness} color="var(--orange)" />} />
        <Row k="Nationalism" v={<Bar value={p.nationalism} max={1} color="var(--violet)" />} />
        <Row k="State repression" v={<Bar value={p.repression} max={1} color="var(--muted)" />} />
        <Row k="Coup risk" v={`${Math.round(p.coupRisk * 100)}%`} c={p.coupRisk > 0.3 ? 'var(--red)' : undefined} />
        <Row k="Next election" v={p.nextElection > 0 ? fmtDate(p.nextElection) : 'None scheduled'} />
        <Row k="Refugees hosted" v={p.refugees > 0.01 ? fmtPop(p.refugees) : '—'} />
        <Row k="Leader stance" v={`${n.leader.hawk > 0.65 ? 'Hawkish' : n.leader.hawk < 0.35 ? 'Dovish' : 'Moderate'} · ${n.leader.pragmatism > 0.6 ? 'pragmatic' : 'ideological'}`} />
        <Row k="Strategic ambition" v={<Bar value={n.ambition} max={1} color="var(--red)" />} />
      </Section>
      {sep.length > 0 && <Section title="Separatist pressure">{sep.slice(0, 8).map((x) => <button key={x.id} className="list-row" onClick={() => select({ kind: 'province', id: x.id }, true)}><span>{x.name}</span><Bar value={x.separatism} color="var(--red)" /></button>)}</Section>}
    </>
  );
}

function DiplomacyTab({ n }: { n: Nation }) {
  const w = app.sim!.w;
  const others = w.nations.filter((o) => o.alive && o.id !== n.id);
  const rel = others.map((o) => ({ o, r: w.getRel(n.id, o.id) })).sort((a, b) => b.r - a.r);
  const treaties = w.treaties.filter((t) => t.until === undefined && (t.a === n.id || t.b === n.id));
  const sanctionedBy = others.filter((o) => w.sanctioning(o.id, n.id));
  const sanctions = others.filter((o) => w.sanctioning(n.id, o.id));
  const threats = [...n.ai.threat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const show = (list: typeof rel) => list.map(({ o, r }) => (
    <div key={o.id} className="rel-row">
      <NationChip n={o} />
      <span className="rel-val" style={{ color: relColor(r) }}>{r.toFixed(0)}</span>
      <span className="muted small">{w.isEnemy(n.id, o.id) ? 'AT WAR' : relLabel(r)}</span>
    </div>
  ));
  return (
    <>
      <Section title="Memberships">
        <div className="chip-row">{w.orgsOf(n.id).map((o) => <span key={o.id} className="tag" style={{ borderColor: o.color, color: o.color }} title={o.name}>{o.id}</span>)}</div>
        {treaties.map((t) => { const o = w.nations[t.a === n.id ? t.b : t.a]; return <div key={t.id} className="kv"><span>{t.type === 'defense' ? 'Mutual defence' : t.type === 'partnership' ? 'Strategic partnership' : t.type}</span><NationChip n={o} /></div>; })}
      </Section>
      {threats.length > 0 && <Section title="Perceived threats">{threats.map(([id, t]) => <div key={id} className="rel-row"><NationChip n={w.nations[id]} /><Bar value={t} max={2} color="var(--red)" /></div>)}</Section>}
      <Section title="Closest partners">{show(rel.slice(0, 7))}</Section>
      <Section title="Most hostile">{show(rel.slice(-7).reverse())}</Section>
      {(sanctionedBy.length > 0 || sanctions.length > 0) && (
        <Section title="Sanctions">
          {sanctionedBy.length > 0 && <div className="muted small">Sanctioned by {sanctionedBy.length} nations</div>}
          <div className="chip-row">{sanctionedBy.slice(0, 16).map((o) => <NationChip key={o.id} n={o} />)}</div>
          {sanctions.length > 0 && <><div className="muted small">Imposes sanctions on</div><div className="chip-row">{sanctions.map((o) => <NationChip key={o.id} n={o} />)}</div></>}
        </Section>
      )}
    </>
  );
}

function TerritoryTab({ n }: { n: Nation }) {
  const w = app.sim!.w;
  const P = w.provinces;
  const ctrl = (w.ctrlList[n.id] || []).map((i) => P[i]);
  const lost = (w.ownList[n.id] || []).map((i) => P[i]).filter((p) => p.ctrl !== n.id);
  const occ = ctrl.filter((p) => p.owner !== n.id);
  const claims = [...n.claims].map((i) => P[i]).filter((p) => p.ctrl !== n.id);
  const h = n.hist;
  const list = (ps: typeof ctrl, extra?: (p: (typeof ctrl)[0]) => string) => (
    <div className="prov-list">{ps.slice(0, 40).map((p) => <button key={p.id} className="list-row" onClick={() => select({ kind: 'province', id: p.id }, true)}><span>{p.capital ? '★ ' : ''}{p.name}</span><span className="muted small">{extra ? extra(p) : fmtPop(p.pop)}</span></button>)}</div>
  );
  return (
    <>
      <LineChart t={h.t} series={[{ name: 'Area (km²)', color: 'var(--violet)', data: h.area }]} fmt={(v) => fmtArea(v)} />
      <div className="stats-grid">
        <Stat label="Controlled" value={fmtArea(n.area)} sub={`${ctrl.length} regions`} />
        <Stat label="Start of sim" value={fmtArea(n.stats.startArea)} sub={`${n.area >= n.stats.startArea ? '+' : ''}${(((n.area - n.stats.startArea) / Math.max(1, n.stats.startArea)) * 100).toFixed(1)}%`} />
        <Stat label="Peak" value={fmtArea(n.stats.peakArea)} />
      </div>
      {lost.length > 0 && <Section title={`Occupied by others (${lost.length})`}>{list(lost, (p) => w.nations[p.ctrl].short)}</Section>}
      {occ.length > 0 && <Section title={`Foreign territory held (${occ.length})`}>{list(occ, (p) => `from ${w.nations[p.owner].short}`)}</Section>}
      {claims.length > 0 && <Section title={`Unfulfilled claims (${claims.length})`}>{list(claims, (p) => w.nations[p.ctrl].short)}</Section>}
      <Section title="Regions">{list(ctrl.slice().sort((a, b) => b.pop - a.pop))}</Section>
    </>
  );
}

const GOVS: GovType[] = ['fdem', 'dem', 'hyb', 'auth', 'one', 'mon', 'jun', 'theo'];

function ActTab({ n }: { n: Nation }) {
  const sim = app.sim!; const w = sim.w;
  const pick = (purpose: string, cb: (id: number) => void) => store.set({ tool: { kind: 'pickNation', purpose, cb } });
  return (
    <>
      <Section title="Conflict">
        <div className="btn-grid">
          <button className="btn danger" onClick={() => store.set({ warDialog: { attackers: [n.id], defenders: [] } })}>Declare war…</button>
          <button className="btn" onClick={() => pick(`Choose a nation to defend ${n.short}`, (id) => { if (id !== n.id) sim.defensePact(n.id, id); })}>Sign defence pact…</button>
          <button className="btn" onClick={() => pick(`Choose a nation for ${n.short} to arm`, (id) => sim.militaryAid(n.id, id, 10))}>Send $10B arms…</button>
          <button className="btn" onClick={() => pick(`Choose a nation for ${n.short} to sanction`, (id) => sim.toggleSanction(n.id, id))}>Sanction…</button>
        </div>
      </Section>
      <Section title="Military posture">
        <div className="seg">{['Peace', 'Alert', 'Partial', 'Full'].map((l, i) => <button key={l} className={n.mil.mobLevel === i ? 'on' : ''} onClick={() => sim.mobilize(n.id, i)}>{l}</button>)}</div>
        <label className="slider">Defence spending target <b>{n.eco.milTarget.toFixed(1)}% GDP</b>
          <input type="range" min={0} max={25} step={0.5} value={n.eco.milTarget} onChange={(e) => sim.setMilSpending(n.id, +e.target.value)} /></label>
        <button className="btn" onClick={() => sim.fortify(n.id)}>Fortify all borders</button>
      </Section>
      <Section title="Leadership & regime">
        <label className="slider">Leader stance <b>{n.leader.hawk > 0.65 ? 'Hawk' : n.leader.hawk < 0.35 ? 'Dove' : 'Moderate'}</b>
          <input type="range" min={0} max={1} step={0.05} value={n.leader.hawk} onChange={(e) => sim.setLeaderStance(n.id, +e.target.value)} /></label>
        <label className="slider">Geopolitical alignment
          <div className="seg"><button onClick={() => sim.shiftAlign(n.id, -0.3)}>◀ East</button><button onClick={() => sim.shiftAlign(n.id, 0.3)}>West ▶</button></div></label>
        <select className="select" value={n.gov} onChange={(e) => sim.setGov(n.id, e.target.value as GovType)}>{GOVS.map((g) => <option key={g} value={g}>{GOV_NAME[g]}</option>)}</select>
        <div className="btn-grid">
          <button className="btn warn" onClick={() => sim.triggerCoup(n.id)}>Stage coup</button>
          <button className="btn warn" onClick={() => sim.triggerRevolution(n.id)}>Spark revolution</button>
          <button className="btn danger" onClick={() => sim.triggerCivilWar(n.id)}>Ignite civil war</button>
          <button className="btn" onClick={() => store.set({ tool: { kind: 'independence', picks: [] } })}>Carve out new state…</button>
        </div>
      </Section>
      <Section title="Economy">
        <div className="btn-grid">
          <button className="btn warn" onClick={() => sim.economicShock(n.id, -12)}>Financial crash</button>
          <button className="btn" onClick={() => sim.economicShock(n.id, 10)}>Economic boom</button>
        </div>
      </Section>
      <Section title="Territory">
        <div className="btn-grid">
          <button className="btn" onClick={() => store.set({ tool: { kind: 'transfer', to: n.id, annex: false } })}>Paint occupation…</button>
          <button className="btn" onClick={() => store.set({ tool: { kind: 'transfer', to: n.id, annex: true } })}>Paint annexation…</button>
          <button className="btn danger" onClick={() => pick(`Choose a nation for ${n.short} to annex outright`, (id) => { if (id !== n.id) sim.annexNation(n.id, id); })}>Annex nation…</button>
        </div>
      </Section>
      <p className="muted small">Sandbox actions take effect immediately; the AI reacts to them as if they happened in the world.</p>
      <div style={{ display: 'none' }}>{w.day}</div>
    </>
  );
}

// ------------------------------------------------------------------ province
function ProvincePanel({ id }: { id: number }) {
  const sim = app.sim!; const w = sim.w;
  const p = w.provinces[id];
  const C = w.nations[p.ctrl], O = w.nations[p.owner], K = w.nations[p.core];
  const claimants = w.nations.filter((n) => n.alive && n.claims.has(id) && n.id !== p.owner);
  const wars = w.wars.filter((x) => x.status === 'active' && frontCache(x)?.frontline.includes(id));
  return (
    <div className="nation">
      <div className="n-head">
        <div className="n-flag"><Flag n={C} size={44} /></div>
        <div>
          <h2>{p.capital ? '★ ' : ''}{p.name}</h2>
          <div className="muted">Region of {O.name}{p.dependency ? ` · ${p.feature}` : ''}</div>
          <div className="chips">
            {p.ctrl !== p.owner && <span className="tag red">Occupied by {C.short}</span>}
            {p.siege > 2 && <span className="tag red">Under assault {Math.round(p.siege)}%</span>}
            {!p.supplied && <span className="tag amber">Encircled</span>}
            {p.battle > 0.2 && <span className="tag orange">Active combat</span>}
            {p.capital && <span className="tag violet">Capital</span>}
          </div>
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Population" value={fmtPop(p.pop)} />
        <Stat label="Output" value={fmtMoney(p.gdp * (1 - 0.7 * p.devast))} />
        <Stat label="Area" value={fmtArea(p.area)} />
        <Stat label="Terrain" value={p.terrain[0].toUpperCase() + p.terrain.slice(1)} />
        <Stat label="Fortification" value={`${p.fort.toFixed(1)} / 5`} />
        <Stat label="Devastation" value={`${Math.round(p.devast * 100)}%`} color={p.devast > 0.3 ? 'var(--red)' : undefined} />
      </div>
      <Section title="Control & identity">
        <Row k="Controller" v={<NationChip n={C} />} />
        <Row k="De jure owner" v={<NationChip n={O} />} />
        <Row k="National identity" v={<NationChip n={K} />} />
        {p.occupiedSince >= 0 && <Row k="Occupied since" v={fmtDate(p.occupiedSince)} />}
        {claimants.length > 0 && <Row k="Claimed by" v={<span className="chip-row">{claimants.map((c) => <NationChip key={c.id} n={c} />)}</span>} />}
        <Row k="Separatism" v={<Bar value={p.separatism} color="var(--red)" />} />
        <Row k="Local unrest" v={<Bar value={p.unrest} color="var(--orange)" />} />
        <Row k="Strategic value" v={`${p.strategic.toFixed(1)}×${p.oil > 0.05 ? ' · oil fields' : ''}${p.coast ? ' · coastal' : ''}`} />
        <Row k="Largest city" v={p.urban ? fmtPop(p.urban / 1e6) : '—'} />
      </Section>
      {wars.length > 0 && <Section title="Front line">{wars.map((war) => <WarRow key={war.id} war={war} />)}</Section>}
      <Section title="Neighbours">
        <div className="chip-row">{p.neighbors.map((q) => <button key={q} className="chip" onClick={() => select({ kind: 'province', id: q }, true)}><Flag n={w.nations[w.provinces[q].ctrl]} size={12} />{w.provinces[q].name}</button>)}</div>
      </Section>
      <Section title="Sandbox">
        <div className="btn-grid">
          <button className="btn" onClick={() => store.set({ tool: { kind: 'pickNation', purpose: `Give ${p.name} to…`, cb: (n) => sim.transferProvince(id, n, true) } })}>Transfer to…</button>
          {p.ctrl !== p.owner && <button className="btn" onClick={() => sim.transferProvince(id, p.owner, false)}>Return to {O.short}</button>}
          <button className="btn danger" onClick={() => sim.declareIndependence([id])}>Declare independence</button>
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ war
function WarPanel({ war }: { war: War }) {
  const sim = app.sim!; const w = sim.w;
  if (!war) return null;
  const fc = frontCache(war);
  const air = (war as War & { _air?: { a: number; d: number } })._air;
  const recent = war.flips.slice(-12).reverse();
  const side = (s: 'a' | 'd') => {
    const S = war[s];
    return (
      <div className={`war-side ${s}`}>
        <div className="war-side-head"><Flag n={w.nations[S.leader]} size={26} /><div><b>{w.nations[S.leader].short}</b><div className="muted small">{s === 'a' ? 'Attackers' : 'Defenders'} · {S.goal}</div></div></div>
        <div className="chip-row">{S.members.filter((m) => m !== S.leader).map((m) => <NationChip key={m} n={w.nations[m]} />)}</div>
        <Row k="Casualties" v={fmtK(S.casualties)} />
        <Row k="Vehicles lost" v={fmtNum(S.lossesEquip)} />
        <Row k="Regions taken" v={S.provincesTaken} />
        <Row k="Exhaustion" v={<Bar value={S.exhaustion} color="var(--orange)" />} />
        {air && <Row k="Air superiority" v={`${Math.round((s === 'a' ? air.a : air.d) * 100)}%`} />}
        {fc && <Row k="Posture" v={fc.stance[s] ? 'Offensive' : 'Defensive'} c={fc.stance[s] ? 'var(--red)' : undefined} />}
      </div>
    );
  };
  const end = (terms: Parameters<typeof sim.forcePeace>[1], winner: 'a' | 'd') => sim.forcePeace(war.id, terms, winner);
  return (
    <div className="nation">
      <div className="war-head">
        <div className="muted small">{war.type.toUpperCase()} · began {fmtDate(war.start)}{war.end ? ` · ended ${fmtDate(war.end)}` : ''}</div>
        <h2>{war.name}</h2>
        <div className="muted">{war.casusBelli}</div>
        <div className="chips"><span className={`tag ${war.status === 'active' ? 'red' : war.status === 'ceasefire' ? 'amber' : 'gray'}`}>{war.status}</span>{war.nuclear && <span className="tag violet">{war.nukeCount || 1} nuclear strike{(war.nukeCount || 1) > 1 ? 's' : ''}</span>}{war.allowTreaty === false && war.allowCeasefire === false && war.status !== 'ended' && <span className="tag red">to the finish</span>}{war.outcome && <span className="tag">{war.outcome}</span>}</div>
      </div>
      <div className="score-wrap"><span>{w.nations[war.a.leader].short}</span><ScoreBar score={war.score} /><span>{w.nations[war.d.leader].short}</span></div>
      <div className="muted small center">War score {war.score >= 0 ? '+' : ''}{war.score.toFixed(0)} · {fmtDuration((war.end ?? w.day) - war.start)} · {fmtK(war.civilian)} civilian deaths</div>
      {war.status === 'active' && (
        <div className="war-actions">
          <button className="btn warn" onClick={() => end('ceasefire', 'a')}>Ceasefire now</button>
          <button className="btn" onClick={() => end('white', 'd')}>Stop the war (pre-war borders)</button>
        </div>
      )}
      {war.status === 'ceasefire' && (
        <div className="war-actions">
          <button className="btn danger" onClick={() => sim.resumeWar(war.id)}>Resume fighting</button>
          <button className="btn" onClick={() => end('white', 'd')}>Make peace (pre-war borders)</button>
        </div>
      )}
      {war.status !== 'ended' && (
        <div className="rule-row">
          <label className="check"><input id={`wt-${war.id}`} type="checkbox" checked={war.allowTreaty !== false} onChange={(e) => sim.setWarRules(war.id, { allowTreaty: e.target.checked })} /> Peace treaty allowed</label>
          <label className="check"><input id={`wc-${war.id}`} type="checkbox" checked={war.allowCeasefire !== false} onChange={(e) => sim.setWarRules(war.id, { allowCeasefire: e.target.checked })} /> Ceasefire allowed</label>
          <label className="check"><input id={`wn-${war.id}`} type="checkbox" checked={!!war.nukesAllowed} onChange={(e) => sim.setWarRules(war.id, { nukesAllowed: e.target.checked })} /> Nuclear weapons authorised</label>
        </div>
      )}
      <div className="war-sides-grid">{side('a')}{side('d')}</div>
      {war.targets.length > 0 && <Section title="War aims"><div className="chip-row">{war.targets.slice(0, 20).map((p) => <button key={p} className="chip" onClick={() => select({ kind: 'province', id: p }, true)}><Flag n={w.nations[w.provinces[p].ctrl]} size={12} />{w.provinces[p].name}</button>)}</div></Section>}
      <Section title="Recent territorial changes">
        {recent.length === 0 && <div className="muted small">No regions have changed hands.</div>}
        {recent.map((f, i) => <button key={i} className="list-row" onClick={() => select({ kind: 'province', id: f.p }, true)}><span>{w.provinces[f.p].name}</span><span className="muted small">{w.nations[f.from].short} → {w.nations[f.to].short} · {fmtDate(f.day)}</span></button>)}
      </Section>
      {war.status !== 'ended' && (
        <Section title="Impose an outcome">
          <div className="btn-grid">
            <button className="btn" onClick={() => end('cede_occupied', 'a')}>{w.nations[war.a.leader].short} keeps occupied land</button>
            <button className="btn" onClick={() => end('cede_occupied', 'd')}>{w.nations[war.d.leader].short} keeps occupied land</button>
            <button className="btn danger" onClick={() => end(war.type === 'civil' ? 'overthrow' : war.type === 'independence' ? 'independence' : 'annex', 'a')}>{w.nations[war.a.leader].short} total victory</button>
            <button className="btn danger" onClick={() => end(war.type === 'civil' || war.type === 'independence' ? 'collapse' : 'puppet', 'd')}>{w.nations[war.d.leader].short} total victory</button>
          </div>
          <div className="btn-grid">
            <button className="btn" onClick={() => store.set({ tool: { kind: 'pickNation', purpose: `Join ${war.name} on ${w.nations[war.a.leader].short}'s side`, cb: (id) => sim.joinWar(war.id, id, 'a') } })}>Add nation to attackers…</button>
            <button className="btn" onClick={() => store.set({ tool: { kind: 'pickNation', purpose: `Join ${war.name} on ${w.nations[war.d.leader].short}'s side`, cb: (id) => sim.joinWar(war.id, id, 'd') } })}>Add nation to defenders…</button>
          </div>
        </Section>
      )}
      <div style={{ display: 'none' }}>{MAX_NATIONS}</div>
    </div>
  );
}
