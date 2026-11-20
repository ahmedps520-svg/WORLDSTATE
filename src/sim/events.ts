import { clamp } from './rng';
import type { World } from './world';
import type { Nation } from './types';
import { HAZARDS } from '../data/nations';
import { declareWar } from './war';
import { evaluateTargets } from './ai';

const QUAKE_REGIONS = ['JP', 'TR', 'IR', 'ID', 'CL', 'PE', 'MX', 'NP', 'PK', 'AF', 'CN', 'PH', 'IT', 'GR', 'EC', 'NZ', 'TW', 'HT', 'GT'];

export function eventsDaily(w: World) {
  const ev = w.settings.events;
  const alive = w.nations.filter((n) => n.alive && !n.faction);
  // natural disasters (~25/yr world-wide, most minor)
  if (w.rng.chance(0.07 * ev)) disaster(w, alive);
  // pandemic (very rare)
  if (w.rng.chance(0.000045 * ev)) pandemic(w, alive);
  // border skirmishes between hostile neighbours
  if (w.rng.chance(0.012 * ev)) skirmish(w, alive);
  // diplomacy colour: summits, expulsions, trade disputes
  if (w.rng.chance(0.03 * ev)) diplomaticEvent(w, alive);
  // terror / cyber
  if (w.rng.chance(0.008 * ev)) securityEvent(w, alive);
  // tech / economy
  if (w.rng.chance(0.006 * ev)) techEvent(w, alive);
  // weapons tests by isolated states
  if (w.rng.chance(0.004 * ev)) weaponsTest(w, alive);
}

function disaster(w: World, alive: Nation[]) {
  const n = w.rng.weighted(alive, (x) => (HAZARDS[x.code] ? 4 * HAZARDS[x.code].length : 0.3) * Math.sqrt(x.pop + 1));
  if (!n) return;
  const hz = HAZARDS[n.code] || 'fsd';
  const kind = w.rng.pick(hz.split(''));
  const provs = (w.ctrlList[n.id] || []).map((i) => w.provinces[i]);
  if (!provs.length) return;
  const pool = kind === 's' ? provs.filter((x) => x.coast) : provs;
  const p = w.rng.weighted(pool.length ? pool : provs, (x) => Math.sqrt(x.pop + 0.05))!;
  const sev = Math.pow(w.rng.next(), 2.2); // most are small
  const poor = n.eco.gdp * 1000 / Math.max(0.1, n.pop) < 6000 ? 2.5 : 1;
  let deaths = 0, title = '', imp = 2, gdpHit = 0;
  if (kind === 'q') {
    const mag = (5.8 + sev * 2.4).toFixed(1);
    deaths = Math.round(Math.pow(sev, 3) * Math.min(p.pop, 6) * 2500 * poor * (QUAKE_REGIONS.includes(n.code) ? 1 : 0.4));
    title = `Magnitude ${mag} earthquake strikes near ${p.name}, ${n.short}`;
    gdpHit = sev * 0.04;
  } else if (kind === 's') {
    const cat = 1 + Math.round(sev * 4);
    deaths = Math.round(Math.pow(sev, 3) * 6000 * poor);
    title = `${['Tropical storm', 'Category 2 cyclone', 'Category 3 hurricane', 'Category 4 super typhoon', 'Category 5 super typhoon'][cat - 1]} makes landfall near ${p.name}`;
    gdpHit = sev * 0.03;
  } else if (kind === 'f') {
    deaths = Math.round(Math.pow(sev, 3) * 5000 * poor);
    title = `Catastrophic floods hit ${n.short}; ${p.name} under water`;
    gdpHit = sev * 0.03;
  } else {
    deaths = n.eco.food < 0.8 && poor > 1 ? Math.round(Math.pow(sev, 2) * 20000) : 0;
    title = deaths > 1000 ? `Drought pushes ${n.short} toward famine` : `Severe drought grips ${n.short}`;
    gdpHit = sev * 0.02;
    if (n.eco.food > 1.1) w.market.food += sev * 12;
  }
  if (sev < 0.2 && deaths < 50) return;
  imp = deaths > 20000 ? 5 : deaths > 2000 ? 4 : deaths > 200 ? 3 : 2;
  p.pop = Math.max(0.001, p.pop - deaths / 1e6);
  p.devast = clamp(p.devast + gdpHit * 2.5, 0, 1);
  n.pol.stability -= sev * 6 * (n.gov === 'fdem' ? 0.5 : 1);
  n.leader.approval += w.rng.normal(-2, 4);
  w.pushNews('disaster', imp, title, deaths ? `At least ${deaths.toLocaleString()} people have been killed.` : 'Damage is extensive.', [n.id], p.id);
  // international aid improves relations
  if (imp >= 4) for (const o of alive) if (o.eco.gdp > 500 && w.getRel(o.id, n.id) > -20) w.addRel(o.id, n.id, 3);
}

function pandemic(w: World, alive: Nation[]) {
  const origin = w.rng.weighted(alive, (x) => x.pop)!;
  w.pushNews('disaster', 5, `WHO declares a global pandemic as novel virus spreads from ${origin.short}`, 'Borders close, supply chains seize up and economies brace for lockdowns.', [origin.id]);
  w.market.globalCycle -= 4.5;
  for (const n of alive) {
    n.eco.cycle -= 2 + w.rng.next() * 2;
    n.pol.stability -= 4;
    for (const pid of w.ctrlList[n.id] || []) w.provinces[pid].pop *= 0.9985;
  }
}

function skirmish(w: World, alive: Nation[]) {
  const pairs: [Nation, Nation, number][] = [];
  for (const n of alive) {
    if (n.atWar.length) continue;
    for (const b of w.borderNations(n.id)) {
      if (b <= n.id) continue;
      const o = w.nations[b];
      if (!o.alive || o.faction || o.atWar.length) continue;
      const r = w.getRel(n.id, b);
      if (r < -35) pairs.push([n, o, -r]);
    }
  }
  const pick = w.rng.weighted(pairs, (x) => x[2] - 30);
  if (!pick) return;
  const [a, b] = pick;
  const border = (w.ctrlList[a.id] || []).map((i) => w.provinces[i]).find((p) => p.neighbors.some((q) => w.provinces[q].ctrl === b.id));
  const dead = w.rng.int(2, 60);
  a.mil.active -= dead / 2000; b.mil.active -= dead / 2000;
  w.addRel(a.id, b.id, -6);
  const blamed = w.rng.chance(0.5) ? a : b;
  w.pushNews('war', 3, w.rng.pick([`Deadly clash on the ${a.short}–${b.short} border`, `${dead} killed as ${a.short} and ${b.short} troops exchange fire`, `${blamed.short} accused of cross-border shelling`]), `Both sides blame each other; reinforcements are being moved up.`, [a.id, b.id], border?.id);
  for (const p of [a, b]) if (p.mil.mobLevel < 1) p.mil.mobLevel = 1;
  // escalation into a border war between hawkish governments
  const esc = 0.07 * Math.max(a.leader.hawk, b.leader.hawk) * w.settings.aggression * (a.nukes && b.nukes ? 0.4 : 1);
  if (w.settings.aiWars && w.rng.chance(esc)) {
    const att = a.power * a.leader.hawk > b.power * b.leader.hawk ? a : b;
    const def = att === a ? b : a;
    const plan = evaluateTargets(w, att, w.borderNations(att.id), w.seaNeighbors(att.id)).find((p) => p.target === def.id);
    if (att.gov !== 'fdem' && plan && plan.ratio > 1.3 && plan.desire > 25) declareWar(w, [att.id], [def.id], { type: 'border', goal: 'claims', casusBelli: `Border clashes escalate into open conflict` });
  }
}

function diplomaticEvent(w: World, alive: Nation[]) {
  const big = alive.filter((n) => n.eco.gdp > 300);
  const a = w.rng.pick(big); const b = w.rng.pick(big);
  if (!a || !b || a === b || w.isEnemy(a.id, b.id)) return;
  const r = w.getRel(a.id, b.id);
  if (r > 20) {
    w.addRel(a.id, b.id, 6);
    if (w.rng.chance(0.5)) w.pushNews('diplomacy', 2, w.rng.pick([`${a.short} and ${b.short} hold summit, pledge closer ties`, `${a.short}–${b.short} trade agreement signed`, `${a.short} and ${b.short} announce joint military exercises`]), undefined, [a.id, b.id]);
  } else if (r < -20) {
    w.addRel(a.id, b.id, -5);
    w.pushNews('diplomacy', 2, w.rng.pick([`${a.short} expels ${b.short} diplomats over espionage allegations`, `${a.short} slaps tariffs on ${b.short} imports`, `Talks between ${a.short} and ${b.short} collapse`, `${a.short} recalls ambassador from ${b.short}`]), undefined, [a.id, b.id]);
    if (a.eco.gdp > 2000 && b.eco.gdp > 2000) { a.eco.cycle -= 0.3; b.eco.cycle -= 0.3; }
  } else if (w.rng.chance(0.3)) {
    w.addRel(a.id, b.id, 3);
  }
}

function securityEvent(w: World, alive: Nation[]) {
  if (w.rng.chance(0.55)) {
    const n = w.rng.weighted(alive, (x) => (100 - x.pol.stability) * Math.sqrt(x.pop));
    if (!n) return;
    const p = n.capital;
    const dead = Math.round(Math.pow(w.rng.next(), 2) * 120 + 3);
    n.pol.rally += 3; n.pol.stability -= 1;
    w.pushNews('politics', dead > 50 ? 4 : 3, `${dead > 50 ? 'Major terrorist attack' : 'Bombing'} kills ${dead} in ${n.short}`, undefined, [n.id], p);
  } else {
    const hostile = alive.filter((x) => x.tech > 6 && x.intel > 0.5);
    const a = w.rng.pick(hostile); if (!a) return;
    const targets = alive.filter((x) => w.getRel(a.id, x.id) < -40 && x.eco.gdp > 100);
    const t = w.rng.pick(targets); if (!t) return;
    t.eco.cycle -= 0.4;
    const attributed = w.rng.chance(t.intel);
    if (attributed) w.addRel(a.id, t.id, -6);
    w.pushNews('world', 3, `Cyberattack cripples ${w.rng.pick(['power grid', 'banking system', 'port logistics', 'government networks', 'pipeline operations'])} in ${t.short}`, attributed ? `Officials attribute the attack to hackers linked to ${a.short}.` : 'The perpetrators remain unidentified.', attributed ? [t.id, a.id] : [t.id]);
  }
}

function techEvent(w: World, alive: Nation[]) {
  const n = w.rng.weighted(alive, (x) => x.eco.gdp * x.tech);
  if (!n) return;
  if (w.rng.chance(0.6)) {
    n.tech += 0.15; n.eco.cycle += 0.5;
    w.pushNews('world', 2, w.rng.pick([`${n.short} unveils breakthrough in ${w.rng.pick(['fusion energy', 'quantum computing', 'battery storage', 'artificial intelligence', 'hypersonic propulsion', 'semiconductor fabrication'])}`, `${n.short} launches next-generation military satellite constellation`, `${n.short} commissions new aircraft carrier`]), undefined, [n.id]);
    if (w.rng.chance(0.3)) n.mil.navy += 3;
  } else {
    // commodity discovery
    const provs = (w.ctrlList[n.id] || []).map((i) => w.provinces[i]);
    const p = w.rng.pick(provs); if (!p) return;
    p.oil += 0.15 + w.rng.next() * 0.4;
    w.pushNews('economy', 3, `Major oil field discovered near ${p.name}, ${n.short}`, undefined, [n.id], p.id);
  }
}

function weaponsTest(w: World, alive: Nation[]) {
  const rogue = alive.filter((x) => w.west[x.id] < -0.5 && (x.nukes > 0 || x.mil.missiles > 30));
  const n = w.rng.pick(rogue); if (!n) return;
  const nuclear = n.nukes > 0 && w.rng.chance(0.15);
  for (const o of alive) if (w.west[o.id] > 0.4) w.addRel(o.id, n.id, nuclear ? -8 : -3);
  w.market.tension = clamp(w.market.tension + (nuclear ? 6 : 2), 0, 100);
  w.pushNews('war', nuclear ? 4 : 3, nuclear ? `${n.short} conducts underground nuclear test` : `${n.short} test-fires ${w.rng.pick(['intercontinental ballistic missile', 'hypersonic glide vehicle', 'submarine-launched missile', 'cruise missiles'])}`, undefined, [n.id], n.capital);
}
