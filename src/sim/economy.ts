import { clamp } from './rng';
import { World, dist } from './world';
import type { Nation } from './types';

export const CHOKEPOINTS: { id: string; name: string; lon: number; lat: number; oil: number; trade: number; food: number }[] = [
  { id: 'hormuz', name: 'Strait of Hormuz', lon: 56.4, lat: 26.6, oil: 0.2, trade: 0.05, food: 0 },
  { id: 'malacca', name: 'Strait of Malacca', lon: 100.5, lat: 3.2, oil: 0.06, trade: 0.25, food: 0.05 },
  { id: 'babmandeb', name: 'Bab-el-Mandeb', lon: 43.4, lat: 12.6, oil: 0.05, trade: 0.1, food: 0.03 },
  { id: 'suez', name: 'Suez Canal', lon: 32.5, lat: 30.4, oil: 0.04, trade: 0.1, food: 0.04 },
  { id: 'bosporus', name: 'Turkish Straits', lon: 29.0, lat: 41.1, oil: 0.03, trade: 0.03, food: 0.15 },
  { id: 'taiwan', name: 'Taiwan Strait', lon: 119.6, lat: 24.4, oil: 0.01, trade: 0.18, food: 0 },
  { id: 'panama', name: 'Panama Canal', lon: -79.7, lat: 9.1, oil: 0.01, trade: 0.05, food: 0.04 },
  { id: 'gibraltar', name: 'Strait of Gibraltar', lon: -5.6, lat: 35.95, oil: 0.01, trade: 0.04, food: 0.01 },
  { id: 'danish', name: 'Danish Straits', lon: 11.0, lat: 55.6, oil: 0.02, trade: 0.03, food: 0.02 },
];

let OIL_BASE = 0;
let FOOD_BASE = 0;
let WORLD_GDP0 = 0;

export function initMarket(w: World) {
  OIL_BASE = w.nations.reduce((s, n) => s + n.eco.oilProd, 0);
  FOOD_BASE = w.nations.reduce((s, n) => s + Math.max(0, n.eco.food - 1) * Math.sqrt(n.stats.startGdp || n.eco.gdp), 0);
  WORLD_GDP0 = w.nations.reduce((s, n) => s + n.eco.gdp, 0);
  for (const c of CHOKEPOINTS) w.market.chokepoints[c.id] = { open: 1, by: -1 };
  for (const n of w.nations) n.eco.reserves = Math.max(n.eco.reserves, n.eco.gdp * 0.08);
  updateMarket(w);
}

export function worldGdp(w: World) { return w.nations.reduce((s, n) => s + (n.alive ? n.eco.gdp : 0), 0); }

/** weekly: commodity markets & chokepoints */
export function updateMarket(w: World) {
  const P = w.provinces;
  // chokepoints: contested when a belligerent controls nearby coast
  let oilLoss = 0, tradeLoss = 0, foodLoss = 0;
  for (const c of CHOKEPOINTS) {
    const st = w.market.chokepoints[c.id] || (w.market.chokepoints[c.id] = { open: 1, by: -1 });
    let open = 1, by = -1;
    for (const p of P) {
      if (Math.abs(p.lat - c.lat) > 6 || Math.abs(p.lon - c.lon) > 7) continue;
      if (!p.coast) continue;
      const d = dist(p.lon, p.lat, c.lon, c.lat);
      if (d > 380) continue;
      const n = w.nations[p.ctrl];
      if (n.atWar.length) {
        const intensity = n.atWar.map((id) => w.wars.find((x) => x.id === id)).filter(Boolean).length;
        const navalShare = n.navalPower > 30 || n.mil.missiles > 20 ? 0.55 : 0.75;
        const o = Math.min(open, navalShare - Math.min(0.2, intensity * 0.05) + (d > 250 ? 0.2 : 0));
        if (o < open) { open = o; by = n.id; }
      }
    }
    const ss = st as typeof st & { dis?: boolean; at?: number };
    if (!ss.dis && open < 0.85 && by >= 0 && w.day - (ss.at ?? -999) > 120) { ss.dis = true; ss.at = w.day; w.pushNews('economy', 4, `Shipping through the ${c.name} disrupted by fighting`, `Insurers suspend coverage as ${w.nations[by].short} forces operate nearby.`, [by]); }
    if (ss.dis && open >= 0.97) { ss.dis = false; w.pushNews('economy', 3, `${c.name} reopens to commercial traffic`, undefined, []); }
    st.open += (clamp(open, 0.05, 1) - st.open) * 0.5;
    st.by = by;
    oilLoss += c.oil * (1 - st.open);
    tradeLoss += c.trade * (1 - st.open);
    foodLoss += c.food * (1 - st.open);
  }
  // oil supply: producing provinces under owner control and undamaged
  let supply = 0;
  const prod = new Float64Array(w.nations.length);
  for (const p of P) {
    if (p.oil <= 0) continue;
    // fields produce for whoever holds them; occupied fields run at reduced output
    const out = p.oil * (p.ctrl === p.owner ? 1 : 0.35) * (1 - p.devast * 0.85) * (1 - p.battle * 0.6);
    prod[p.ctrl] += out;
    supply += out * (1 - w.nations[p.ctrl].eco.sanctions * 0.12);
  }
  for (const n of w.nations) n.eco.oilProd = prod[n.id];
  // producers invest when prices are high and let fields decline when they are low
  const capRate = clamp(0.004 + 0.012 * (w.market.oil - 72) / 72, -0.015, 0.04) / 52;
  for (const p of P) if (p.oil > 0 && p.ctrl === p.owner && p.battle < 0.05) p.oil *= 1 + capRate;
  supply *= 1 - oilLoss;
  const wg = worldGdp(w);
  const demand = OIL_BASE * Math.pow(wg / WORLD_GDP0, 0.45);
  w.market.oilSupply = supply;
  w.market.oilDemand = demand;
  const target = clamp(74 * Math.pow(demand / Math.max(1, supply), 4.2), 22, 320);
  w.market.oil += (target - w.market.oil) * 0.35;
  // food
  let fsup = 0;
  for (const n of w.nations) {
    if (n.eco.food <= 1) continue;
    let ok = 0, tot = 0;
    for (const pid of w.ownList[n.id] || []) { const p = P[pid]; tot += p.area; if (p.ctrl === p.owner) ok += p.area * (1 - p.devast * 0.7) * (1 - p.battle * 0.5); }
    fsup += (n.eco.food - 1) * Math.sqrt(n.stats.startGdp || 50) * (tot ? ok / tot : 1) * (1 - n.eco.blockade * 0.6);
  }
  fsup *= 1 - foodLoss * 1.5;
  const fTarget = clamp(100 * Math.pow(FOOD_BASE / Math.max(1, fsup), 2.2) * (1 + (w.market.oil - 74) / 600), 60, 400);
  w.market.food += (fTarget - w.market.food) * 0.3;
  (w.market as typeof w.market & { tradeLoss?: number }).tradeLoss = tradeLoss;
}

/** monthly macro update for one nation */
export function economyMonthly(w: World, n: Nation) {
  const e = n.eco, pol = n.pol;
  const m = w.market;
  const perCap = e.gdp * 1000 / Math.max(0.01, n.pop);
  // business cycle
  e.cycle = e.cycle * 0.86 + m.globalCycle * 0.12 + w.rng.normal(0, 0.55);
  let g = e.potential + e.cycle * 1.1;
  g += (pol.stability - 55) * 0.035;
  g -= Math.max(0, e.inflation - 8) * 0.045;
  g -= Math.max(0, e.debt - 110) * 0.012;
  // energy
  const oilRev = e.oilProd * 365 * m.oil / 1000 / Math.max(1, e.gdp); // share of GDP
  const oilShock = (m.oil - 74) / 74;
  g += oilShock * (oilRev * 12 - (1 - Math.min(1, oilRev * 4)) * 1.1);
  // food prices hurt poor importers
  if (e.food < 0.9) g -= (m.food - 100) / 100 * (1 - e.food) * (perCap < 8000 ? 2 : 0.5);
  // sanctions, blockade, trade disruption
  g -= e.sanctions * (2.5 + e.tradeOpen * 3.5);
  g -= e.blockade * e.tradeOpen * 6;
  const tl = (m as typeof m & { tradeLoss?: number }).tradeLoss || 0;
  g -= tl * e.tradeOpen * 8;
  g += (m.worldGrowth - 3) * 0.25 * Math.min(1.5, e.tradeOpen);
  // war
  if (n.atWar.length) {
    const ownBattles = (w.ownList[n.id] || []).reduce((s, i) => s + w.provinces[i].battle, 0);
    g -= 1.2 + Math.min(10, ownBattles * 0.8);
    g += n.mil.mobLevel >= 2 ? 0.8 : 0; // war-economy stimulus
    g -= Math.min(6, n.mil.mobilized / Math.max(1, n.pop * 1000) * 250);
  }
  // occupation of own land
  g -= n.coreLostFrac * 6;
  g -= Math.min(3, pol.refugees / Math.max(0.1, n.pop) * 30);
  if (n.faction) g = Math.min(g, 0.5) - 1;
  g = clamp(g, -25, 14);
  e.growth = e.growth * 0.5 + g * 0.5;
  // recession tracking
  if (e.growth < -0.3) {
    e.recessionMonths++;
    if (!e.recession && e.recessionMonths >= 3) {
      e.recession = true;
      if (e.gdp > 60) w.pushNews('economy', e.gdp > 1000 ? 4 : 3, `${n.short} enters recession`, `Output is contracting at an annualised ${(-e.growth).toFixed(1)}%.`, [n.id]);
      pol.stability -= 2;
    }
  } else {
    if (e.recession && e.growth > 0.8) {
      e.recession = false;
      if (e.gdp > 200) w.pushNews('economy', 2, `${n.short} exits recession`, undefined, [n.id]);
    }
    e.recessionMonths = 0;
  }
  // inflation
  let iTarget = n.gov === 'fdem' ? 2.4 : n.gov === 'dem' ? 3.8 : 5.5;
  iTarget += n.mil.mobLevel * 2.5 + oilShock * 3 * (oilRev > 0.05 ? -0.3 : 1) + Math.max(0, m.food - 100) * 0.04 * (perCap < 10000 ? 1 : 0.3);
  iTarget += e.sanctions * 6 + e.blockade * 15 + (e.debt > 120 && e.reserves < e.gdp * 0.05 ? 15 : 0);
  if (e.growth > e.potential + 2) iTarget += 1.5;
  e.inflation += (iTarget - e.inflation) * 0.08 + w.rng.normal(0, 0.15);
  e.inflation = clamp(e.inflation, -2, 900);
  // unemployment (Okun)
  const uTarget = clamp(5.5 - (e.growth - e.potential) * 0.6 + (n.faction ? 15 : 0) + (perCap < 5000 ? 4 : 0), 1.5, 40);
  e.unemployment += (uTarget - e.unemployment) * 0.12;
  // public finance
  const milMove = (e.milTarget - e.milPct) * 0.08;
  e.milPct = clamp(e.milPct + milMove, 0, 45);
  const deficit = (e.milPct - 1.8) * 0.7 + 2 - e.taxRate * 4 + (e.recession ? 2 : 0) + n.mil.mobLevel * 1.2;
  e.debt = clamp(e.debt + deficit / 12 - e.debt * (e.growth + e.inflation) / 100 / 12, 0, 400);
  e.reserves = Math.max(0, e.reserves + e.gdp * (-deficit / 100 + 0.01 + oilRev * (m.oil - 60) / 600) / 12);
  // debt crisis
  if (e.debt > 120 && e.reserves < e.gdp * 0.04 && w.rng.chance(0.03)) {
    w.pushNews('economy', e.gdp > 500 ? 5 : 4, `${n.short} defaults on its sovereign debt`, `Bond yields soar and the currency collapses; the IMF is called in.`, [n.id]);
    for (const p of w.ctrlList[n.id] || []) w.provinces[p].gdp *= 0.9;
    e.debt *= 0.65; e.inflation += 25; pol.stability -= 14; n.leader.approval -= 15;
    m.globalCycle -= e.gdp / 20000;
  }
  // technology
  const frontier = Math.max(...w.nations.filter((x) => x.alive).map((x) => x.tech));
  const rd = clamp(perCap / 60000, 0.05, 1.2);
  const dt = (0.012 + 0.03 * rd + 0.06 * Math.max(0, frontier - n.tech) / Math.max(1, frontier) * Math.min(1.2, e.tradeOpen + 0.3)) * (1 - e.sanctions * 0.4) * (pol.stability > 30 ? 1 : 0.4);
  n.techGrowth = dt * 12;
  n.tech = clamp(n.tech + dt / 12 * 12 / 12, 0, 15);
  // industry tracks tech & investment
  e.industry = clamp(e.industry + (clamp(0.3 + n.tech / 9, 0.2, 1.9) - e.industry) * 0.002 - (n.atWar.length ? 0.0005 : 0), 0.15, 2);
  e.infrastructure = clamp(e.infrastructure + (clamp(perCap / 50000 * 0.6 + 0.25, 0.15, 1) - e.infrastructure) * 0.01, 0.05, 1);
  // sanctions pressure from sanctioning share of world GDP
  let sp = 0, tot = 0;
  for (const o of w.nations) if (o.alive && o.id !== n.id) { tot += o.eco.gdp; if (w.sanctioning(o.id, n.id)) sp += o.eco.gdp; }
  e.sanctions += (clamp(sp / Math.max(1, tot) * 1.1, 0, 0.9) - e.sanctions) * 0.25;
  // blockade from naval war
  let blk = 0;
  for (const id of n.atWar) {
    const war = w.wars.find((x) => x.id === id); if (!war) continue;
    const mine = war.a.members.includes(n.id) ? war.a : war.d, other = mine === war.a ? war.d : war.a;
    const nOwn = mine.members.reduce((s, x) => s + w.nations[x].navalPower, 0);
    const nEn = other.members.reduce((s, x) => s + w.nations[x].navalPower, 0);
    if (nEn > nOwn * 1.5) blk = Math.max(blk, clamp((nEn - nOwn * 1.5) / (nEn + 1), 0, 0.85));
  }
  e.blockade += (blk - e.blockade) * 0.3;
}

/** daily: compound growth into provinces, recover/decay */
export function economyDaily(w: World) {
  const P = w.provinces;
  const N = w.nations;
  const gdp = new Float64Array(N.length);
  const pop = new Float64Array(N.length);
  for (const p of P) {
    const owner = N[p.owner], ctrl = N[p.ctrl];
    const occupied = p.ctrl !== p.owner;
    const rate = occupied ? -0.06 : owner.eco.growth / 100;
    p.gdp *= 1 + rate / 365;
    const pg = (occupied ? -0.4 : owner.popGrowth) / 100 * (owner.pol.stability < 25 ? 0.3 : 1);
    p.pop *= 1 + pg / 365;
    if (p.battle > 0) p.battle *= 0.93; if (p.battle < 0.01) p.battle = 0;
    if (p.battle === 0 && p.devast > 0) p.devast = Math.max(0, p.devast - 0.0003 * (0.5 + owner.eco.infrastructure));
    const eff = p.gdp * (1 - 0.7 * p.devast);
    let share = 1;
    if (occupied) share = 0.3;
    else if (p.core !== p.owner) share = clamp(0.5 + (w.day - p.ownedSince) / (365 * 20), 0.5, 1);
    gdp[p.ctrl] += eff * share;
    pop[p.ctrl] += p.pop;
    void ctrl;
  }
  for (const n of N) {
    if (!n.alive) continue;
    n.eco.gdp = Math.max(0.05, gdp[n.id]);
    n.pop = Math.max(0.0005, pop[n.id]);
  }
}

export function globalEconomyMonthly(w: World) {
  const m = w.market;
  m.globalCycle = m.globalCycle * 0.9 + w.rng.normal(0, 0.35) - Math.max(0, (m.oil - 110) / 80) * 0.25;
  const alive = w.nations.filter((n) => n.alive);
  const tot = alive.reduce((s, n) => s + n.eco.gdp, 0);
  m.worldGrowth = alive.reduce((s, n) => s + n.eco.gdp * n.eco.growth, 0) / Math.max(1, tot);
  if (m.worldGrowth < 0.5 && !(w as World & { _globalRec?: boolean })._globalRec) {
    (w as World & { _globalRec?: boolean })._globalRec = true;
    w.pushNews('economy', 5, 'World economy slides into global recession', `Global growth has fallen to ${m.worldGrowth.toFixed(1)}%.`, []);
  } else if (m.worldGrowth > 2 && (w as World & { _globalRec?: boolean })._globalRec) {
    (w as World & { _globalRec?: boolean })._globalRec = false;
    w.pushNews('economy', 3, 'Global economy returns to growth', undefined, []);
  }
  // tension index
  const wars = w.wars.filter((x) => x.status === 'active');
  const buildups = alive.filter((n) => n.ai.buildup > 0).length;
  let hostility = 0, cnt = 0;
  const majors = alive.filter((n) => n.eco.gdp > 800);
  for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) { hostility += Math.max(0, -w.getRel(majors[i].id, majors[j].id)); cnt++; }
  const majorWar = wars.filter((x) => [...x.a.members, ...x.d.members].some((mm) => w.nations[mm].eco.gdp > 1500)).length;
  const t = clamp(12 + wars.length * 5 + majorWar * 12 + buildups * 6 + (cnt ? hostility / cnt : 0) * 0.5 + (m.oil > 110 ? 6 : 0), 0, 100);
  m.tension += (t - m.tension) * 0.3;
}
