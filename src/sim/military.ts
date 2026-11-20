import { clamp } from './rng';
import type { World } from './world';
import type { Nation, Province } from './types';

export const techMult = (t: number) => Math.pow(1.16, t);

export const TERRAIN_DEF: Record<string, number> = { plains: 1, forest: 1.25, hills: 1.4, mountains: 2.0, desert: 1.1, jungle: 1.65, arctic: 1.35, urban: 1.7 };
export const TERRAIN_MOVE: Record<string, number> = { plains: 1, forest: 0.8, hills: 0.7, mountains: 0.45, desert: 0.9, jungle: 0.5, arctic: 0.55, urban: 0.6 };
export const TERRAIN_SUPPLY: Record<string, number> = { plains: 1, forest: 1.2, hills: 1.3, mountains: 1.7, desert: 1.5, jungle: 1.7, arctic: 2.1, urban: 0.9 };

// baseline stocks per nation captured at start so production is calibrated to real inventories
type Base = { armor: number; artillery: number; aircraft: number; navy: number; ad: number; active: number; budget: number; missiles: number };
export function baseline(n: Nation): Base {
  const h = n as Nation & { _base?: Base };
  if (!h._base) h._base = { armor: n.mil.armor, artillery: n.mil.artillery, aircraft: n.mil.aircraft, navy: n.mil.navy, ad: n.mil.airDefense, active: n.mil.active, budget: Math.max(0.05, n.eco.gdp * n.eco.milPct / 100), missiles: n.mil.missiles };
  return h._base;
}

export function perSoldierQuality(n: Nation) {
  const m = n.mil;
  return techMult(n.tech) * (0.6 + 0.4 * m.training) * (0.7 + 0.3 * m.command) * (0.85 + 0.3 * m.experience);
}

export function computePowers(n: Nation) {
  const m = n.mil;
  const M = Math.max(0, m.active + m.mobilized);
  const EP = m.armor + 0.5 * m.artillery;
  const er = clamp(EP / Math.max(1, M * 1.2), 0.08, 1.5) / 1.5;
  const Q = perSoldierQuality(n);
  m.quality = Q;
  const supply = clamp(0.45 + 0.55 * Math.min(1, m.ammo / 12), 0.3, 1) * (0.55 + 0.45 * m.fuel);
  n.landPower = M * (0.35 + 0.65 * er) * Q * (0.35 + 0.65 * m.readiness) * (0.4 + 0.6 * m.morale) * supply;
  n.airPower = m.aircraft * Math.pow(1.22, n.tech) * (0.5 + 0.5 * m.training) * (0.4 + 0.6 * m.readiness);
  n.navalPower = m.navy * Math.pow(1.2, n.tech) * (0.6 + 0.4 * m.training);
  const ad = m.airDefense * Math.pow(1.18, n.tech) * 10;
  n.power = n.landPower + 0.35 * n.airPower + 0.5 * n.navalPower + 0.2 * ad;
}

export function adPower(n: Nation) { return n.mil.airDefense * Math.pow(1.18, n.tech) * 10; }
export function projection(n: Nation) { return clamp(n.navalPower / 900, 0, 1) * clamp(n.tech / 9, 0.3, 1.1); }

/** daily upkeep: production, mobilisation, readiness, morale drift */
export function militaryTick(w: World, n: Nation) {
  const m = n.mil, e = n.eco;
  const b = baseline(n);
  const atWar = n.atWar.length > 0;
  const budget = Math.max(0.01, e.gdp * e.milPct / 100);
  const budgetRatio = clamp(budget / b.budget, 0.05, 6);
  const warEco = m.mobLevel >= 3 ? 2.6 : m.mobLevel >= 2 ? 1.8 : 1;
  const ind = clamp(e.industry, 0.2, 2) * (1 - 0.5 * e.sanctions) * (0.6 + 0.4 * e.infrastructure);
  const prod = (budgetRatio * 0.7 + 0.3) * warEco * ind / Math.max(0.3, baselineIndustry(n));
  const yr = 1 / 365;
  // production vs retirement (3%/yr peacetime)
  const decay = atWar ? 0.015 : 0.03;
  m.armor += (b.armor * 0.03 * prod - m.armor * decay) * yr;
  m.artillery += (b.artillery * 0.03 * prod - m.artillery * decay) * yr;
  m.aircraft += (b.aircraft * 0.035 * prod - m.aircraft * decay) * yr;
  m.navy += (b.navy * 0.03 * Math.min(prod, 1.8) - m.navy * decay) * yr;
  m.airDefense += (b.ad * 0.04 * prod - m.airDefense * 0.04) * yr;
  m.missiles += (b.missiles * 0.08 * prod - m.missiles * 0.05) * yr + (atWar ? 0 : 0);
  // ammunition: produced continuously, consumed by combat elsewhere
  m.ammo = clamp(m.ammo + 0.11 * prod * (atWar ? 1.2 : 1), 0, 45);
  // personnel
  const activeTarget = b.active * Math.sqrt(budgetRatio) * (atWar ? 1.15 : 1);
  m.active += (activeTarget - m.active) * 0.06 * yr * (atWar ? 3 : 1);
  m.active = Math.max(0.1, m.active);
  // mobilisation
  const mobTarget = mobilisationTarget(n);
  const dm = mobTarget - m.mobilized;
  // reserve armies (Finland, Israel, Korea, Taiwan...) call up within days once the homeland is attacked
  const homeAttacked = atWar && n.occupiedByEnemy > 0;
  m.mobilized += dm * (dm > 0 ? (atWar ? (homeAttacked || m.reserves > m.active ? 0.06 : 0.025) : 0.012) : 0.02);
  if (m.mobilized < 0) m.mobilized = 0;
  // readiness / training
  const rTarget = atWar ? 0.95 : 0.45 + 0.12 * m.mobLevel + 0.15 * m.training;
  m.readiness += (rTarget - m.readiness) * 0.01;
  const tTarget = clamp(0.35 + n.tech / 22 + Math.min(0.15, e.milPct / 30), 0.25, 0.95);
  m.training += (tTarget - m.training) * 0.0008 + (atWar ? 0.00025 : 0);
  if (m.mobilized > m.active) m.training -= 0.00015; // raw recruits dilute quality
  m.training = clamp(m.training, 0.15, 0.98);
  if (atWar) m.experience = clamp(m.experience + 0.0012, 0, 0.95); else m.experience = Math.max(0.1, m.experience - 0.00012);
  // morale drifts to a base from legitimacy and stability
  const base = 0.3 + n.pol.stability / 250 + n.pol.legitimacy / 400 + (n.pol.rally / 200) - n.pol.weariness / 300;
  m.morale += (clamp(base, 0.1, 0.95) - m.morale) * 0.02;
  // fuel security
  const need = 0.15 + e.gdp / 2500;
  const own = e.oilProd;
  const importAccess = clamp(1 - e.blockade * 0.8 - e.sanctions * 0.35, 0, 1) * clamp(110 / Math.max(40, w.market.oil), 0.4, 1.2);
  m.fuel = clamp((own + need * importAccess) / need, 0.2, 1);
  computePowers(n);
}

function baselineIndustry(n: Nation) {
  const anyN = n as Nation & { _ind0?: number };
  if (anyN._ind0 === undefined) anyN._ind0 = n.eco.industry;
  return anyN._ind0;
}

export function mobilisationTarget(n: Nation) {
  const m = n.mil;
  const pool = n.pop * 1000; // thousand people
  switch (m.mobLevel) {
    case 1: return m.reserves * 0.15;
    case 2: return m.reserves * 0.4 + Math.min(pool * 0.004, m.active * 0.6 + 40);
    case 3: return m.reserves * 0.9 + Math.min(pool * 0.018, m.active * 2.5 + 150);
    default: return 0;
  }
}

/** Supply network: BFS from hubs through friendly-controlled provinces (and safe sea lanes). */
export function computeSupply(w: World, nid: number, friendly: (c: number) => boolean, seaOk: boolean): Int16Array {
  const P = w.provinces;
  const hops = new Int16Array(P.length).fill(-1);
  const n = w.nations[nid];
  const own = w.ctrlList[nid] || [];
  const hubs: number[] = [];
  if (n.capital >= 0 && P[n.capital].ctrl === nid) hubs.push(n.capital);
  const sorted = own.filter((i) => P[i].owner === nid || P[i].core === nid).sort((a, b) => P[b].gdp - P[a].gdp);
  for (const i of sorted.slice(0, 3)) if (!hubs.includes(i)) hubs.push(i);
  if (!hubs.length && own.length) hubs.push(own[0]);
  for (const [pid, by] of w.beachheads) if (by === nid && P[pid].ctrl === nid && !hubs.includes(pid)) hubs.push(pid);
  // foreign bases: any friendly nation's capital that is land connected acts as a depot for expeditionary forces
  const q: number[] = [];
  for (const h of hubs) { hops[h] = 0; q.push(h); }
  let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const p = P[i];
    const nh = hops[i] + 1;
    for (const j of p.neighbors) {
      if (hops[j] >= 0) continue;
      const c = P[j].ctrl;
      if (c !== nid && !friendly(c)) continue;
      hops[j] = nh; q.push(j);
    }
    if (seaOk) for (const l of p.sea) {
      if (hops[l.to] >= 0) continue;
      const c = P[l.to].ctrl;
      if (c !== nid && !friendly(c)) continue;
      hops[l.to] = nh + 1; q.push(l.to);
    }
  }
  return hops;
}

export function supplyFactor(p: Province, hops: number, infra: number) {
  if (hops < 0) return 0.25;
  return clamp(1 / (1 + 0.05 * hops * TERRAIN_SUPPLY[p.terrain] / (0.5 + infra)), 0.3, 1);
}
