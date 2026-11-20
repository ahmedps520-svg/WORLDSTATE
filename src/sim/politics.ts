import { clamp, sigmoid } from './rng';
import { World, MAX_NATIONS } from './world';
import type { Nation, GovType, Province } from './types';
import { declareWar, killNation } from './war';
import { computePowers } from './military';

const GOV_BASE: Record<GovType, number> = { fdem: 74, dem: 64, hyb: 55, auth: 54, one: 62, mon: 66, jun: 44, theo: 52, tran: 40, reb: 45 };
export const GOV_NAME: Record<GovType, string> = {
  fdem: 'Full democracy', dem: 'Flawed democracy', hyb: 'Hybrid regime', auth: 'Authoritarian state', one: 'One-party state',
  mon: 'Absolute monarchy', jun: 'Military junta', theo: 'Theocracy', tran: 'Transitional government', reb: 'Rebel administration',
};
const COUP_PRONE: Record<GovType, number> = { fdem: 0.01, dem: 0.12, hyb: 0.7, auth: 0.8, one: 0.3, mon: 0.45, jun: 1.6, theo: 0.35, tran: 1.2, reb: 0.6 };

export function politicsMonthly(w: World, n: Nation) {
  const pol = n.pol, e = n.eco;
  const perCap = e.gdp * 1000 / Math.max(0.01, n.pop);
  // stability target
  let t = GOV_BASE[n.gov];
  const econW = pol.repression > 0.5 ? 0.55 : 1; // autocracies are less sensitive to economic pain
  t += (e.growth - 2) * 2.0 * econW;
  t -= Math.max(0, e.inflation - 6) * 0.35 * econW;
  t -= Math.max(0, e.unemployment - 7) * 0.7 * econW;
  t += (pol.legitimacy - 50) * 0.22;
  t += pol.rally;
  t -= pol.weariness * 0.3;
  t -= n.coreLostFrac * 40;
  if (n.capital >= 0 && w.provinces[n.capital].ctrl !== n.id) t -= 15;
  t -= Math.min(15, pol.refugees / Math.max(0.1, n.pop) * 120);
  if (e.food < 0.9) t -= Math.max(0, w.market.food - 110) * 0.08 * (perCap < 8000 ? 1 : 0.3);
  t -= e.sanctions * 6 * econW;
  t += pol.repression * 14 * (pol.stability < 45 ? 1 : 0.4);
  t -= Math.max(0, 30 - n.leader.approval) * 0.2;
  if (n.faction) t = 45 + pol.rally;
  t = clamp(t, 3, 97);
  pol.stability += (t - pol.stability) * 0.12 + w.rng.normal(0, 0.8);
  pol.stability = clamp(pol.stability, 0, 100);
  pol.rally *= 0.88;
  pol.unrest = clamp((62 - pol.stability) * 1.3 + e.inflation / 4 + e.unemployment / 2, 0, 100);
  // legitimacy
  const ltarget = n.gov === 'fdem' || n.gov === 'dem' ? 55 + (n.leader.approval - 45) * 0.5 : 45 + (pol.stability - 50) * 0.4 + pol.repression * 10 - (w.day - pol.lastRegimeChange < 365 * 3 ? 15 : 0);
  pol.legitimacy += (clamp(ltarget, 5, 95) - pol.legitimacy) * 0.05;
  // leader approval
  const L = n.leader;
  const honeymoon = w.day - L.since < 200 ? 8 : 0;
  const at = 50 + (e.growth - 2) * 4 - Math.max(0, e.inflation - 5) * 0.8 + pol.rally * 1.2 - pol.weariness * 0.45 + honeymoon + (L.charisma - 0.5) * 12 - n.coreLostFrac * 30;
  L.approval += (clamp(at, 5, 92) - L.approval) * 0.1 + w.rng.normal(0, 1.2);
  L.approval = clamp(L.approval, 2, 98);
  pol.refugees *= 0.97;
  // coup risk & refugees decay
  pol.coupRisk = clamp((42 - pol.stability) / 42, 0, 1) * COUP_PRONE[n.gov] * (1 - pol.repression * 0.5) * (n.stats.warsLost > 0 && w.day - n.ai.lastWarEnd < 365 ? 1.8 : 1);
  // separatism drift per province
  if ((w.day + n.id) % 90 === 0) separatismUpdate(w, n);
  // aging leader
  if ((w.day + n.id) % 365 === 0) L.age++;
}

/** rare daily political events */
export function politicsDaily(w: World, n: Nation) {
  const pol = n.pol;
  const L = n.leader;
  const ev = w.settings.events;
  // elections
  if ((n.gov === 'fdem' || n.gov === 'dem' || n.gov === 'hyb') && pol.nextElection > 0 && w.day >= pol.nextElection && !n.faction) election(w, n);
  // leader mortality
  const mort = L.age > 66 ? (L.age - 62) * 0.0000045 : 0.0000025;
  if (w.rng.chance(mort)) leaderDies(w, n);
  // coups
  if (!n.faction && pol.coupRisk > 0.05 && w.rng.chance(pol.coupRisk * 0.0012 * ev)) coup(w, n);
  // revolution / regime collapse
  if (pol.stability < 14 && pol.unrest > 70 && !n.faction && w.rng.chance(0.0018 * ev)) revolution(w, n);
  // armed insurgencies in fragile states
  if (pol.stability < 24 && !n.faction && !n.atWar.length && n.gov !== 'fdem' && (w.ctrlList[n.id] || []).length > 3 && w.rng.chance(0.00035 * ev)) startCivilWar(w, n, 'insurgent', 'years of state failure and a jihadist-separatist insurgency'.split(' and ')[w.rng.int(0, 1)]);
  // mass protests
  if (pol.unrest > 55 && w.rng.chance(0.0012 * ev * (pol.unrest / 60))) {
    const p = n.capital >= 0 ? n.capital : undefined;
    w.pushNews('politics', n.eco.gdp > 500 ? 4 : 3, w.rng.pick([`Mass protests sweep ${n.short}`, `Hundreds of thousands march against the government in ${n.short}`, `General strike paralyses ${n.short}`, `Riots erupt in ${n.short} over living costs`]), pol.repression > 0.5 ? 'Security forces respond with mass arrests.' : 'Opposition leaders demand early elections.', [n.id], p);
    if (pol.repression > 0.5) { pol.stability -= 1; pol.legitimacy -= 3; } else { L.approval -= 5; if (n.gov !== 'mon' && w.rng.chance(0.25)) snapElection(w, n); }
  }
}

function election(w: World, n: Nation) {
  const pol = n.pol, L = n.leader;
  const term = n.code === 'US' ? 4 : n.gov === 'hyb' ? 5 + w.rng.int(0, 1) : 4 + w.rng.int(0, 1);
  pol.nextElection = w.day + Math.round(term * 365.25);
  let p = sigmoid((L.approval - 46) / 7);
  if (n.gov === 'hyb') p = Math.min(0.97, p + 0.35);
  const termLimited = n.code === 'US' && w.day - L.since > 365 * 7;
  if (!termLimited && w.rng.chance(p)) {
    if (n.eco.gdp > 300 || w.rng.chance(0.3)) w.pushNews('politics', n.eco.gdp > 1500 ? 3 : 2, `${L.name} re-elected in ${n.short}`, `${L.title} ${L.name} secures another term.`, [n.id]);
    L.approval += 6;
    return;
  }
  // new leader: mood of electorate shapes stance
  const mood = { hawk: (n.ai.fear > 0.5 ? 0.15 : 0) - (pol.weariness > 35 ? 0.2 : 0) + (pol.nationalism - 0.5) * 0.2 };
  const old = L.name;
  n.leader = w.makeLeader(n, w.day, false, mood);
  shiftAlignment(w, n, w.rng.normal(0, 0.12) * (1 - n.leader.pragmatism));
  n.pol.rally = 0;
  const big = n.eco.gdp > 1000 || n.power > 3000;
  w.pushNews('politics', big ? 4 : 3, `${n.leader.name} wins ${n.short} election, ousting ${old}`, `The ${n.leader.trait.toLowerCase()} ${n.leader.title.toLowerCase()} promises ${n.leader.hawk > 0.6 ? 'a tougher line on national security' : n.leader.hawk < 0.35 ? 'diplomacy and de-escalation' : 'economic renewal'}.`, [n.id]);
}

function snapElection(w: World, n: Nation) {
  if (!(n.gov === 'fdem' || n.gov === 'dem' || n.gov === 'hyb')) return;
  const L = n.leader;
  w.pushNews('politics', 3, `${L.title} ${L.name} of ${n.short} resigns; snap elections called`, undefined, [n.id]);
  n.pol.nextElection = w.day + 60;
}

function leaderDies(w: World, n: Nation) {
  const old = n.leader;
  const autocratic = ['auth', 'one', 'mon', 'jun', 'theo'].includes(n.gov);
  n.leader = w.makeLeader(n, w.day);
  shiftAlignment(w, n, w.rng.normal(0, 0.1));
  w.pushNews('politics', n.eco.gdp > 800 || n.power > 2000 ? 5 : 3, `${old.title} ${old.name} of ${n.short} dies at ${old.age}`, autocratic ? `A succession struggle is under way. ${n.leader.name} emerges as the new leader.` : `${n.leader.name} is sworn in as successor.`, [n.id]);
  if (autocratic) {
    n.pol.stability -= 12;
    if (n.pol.stability < 30 && w.rng.chance(0.3)) startCivilWar(w, n, 'insurgent', 'succession');
  }
}

export function coup(w: World, n: Nation, forced = false) {
  const success = forced || w.rng.chance(0.55);
  if (!success) {
    w.pushNews('politics', 3, `Coup attempt fails in ${n.short}`, `Loyalist forces arrest the plotters; a wave of purges follows.`, [n.id], n.capital);
    n.pol.stability -= 4; n.pol.repression = clamp(n.pol.repression + 0.1, 0, 1); n.mil.command *= 0.95;
    return;
  }
  const old = n.leader;
  n.gov = 'jun';
  n.leader = w.makeLeader(n, w.day, false, { hawk: 0.15 });
  n.leader.title = 'General';
  n.leader.trait = 'Junta leader';
  n.pol.stability = clamp(n.pol.stability - 6, 5, 100);
  n.pol.legitimacy = 30; n.pol.lastRegimeChange = w.day; n.pol.repression = 0.7;
  n.pol.nextElection = 0;
  const swing = w.rng.normal(-0.1, 0.35);
  shiftAlignment(w, n, swing);
  for (const o of w.nations) if (o.alive && (o.gov === 'fdem' || o.gov === 'dem')) w.addRel(o.id, n.id, -12);
  w.pushNews('politics', n.eco.gdp > 300 ? 5 : 4, `Military seizes power in ${n.short}`, `${old.title} ${old.name} has been detained. ${n.leader.name} heads a ruling military council${Math.abs(swing) > 0.3 ? (swing < 0 ? ' and expels Western diplomats' : ' and seeks Western recognition') : ''}.`, [n.id], n.capital);
}

export function revolution(w: World, n: Nation) {
  // collapse may produce a new order or a civil war
  if (w.rng.chance(n.gov === 'fdem' || n.gov === 'dem' ? 0.12 : 0.35)) { startCivilWar(w, n, 'insurgent', 'revolution'); return; }
  const prev = n.gov;
  const wasAutocracy = ['auth', 'one', 'mon', 'jun', 'theo'].includes(prev);
  n.gov = wasAutocracy ? (w.rng.chance(0.55) ? 'tran' : 'hyb') : w.rng.chance(0.5) ? 'auth' : 'tran';
  const old = n.leader;
  n.leader = w.makeLeader(n, w.day);
  n.pol.stability = 35; n.pol.legitimacy = 45; n.pol.lastRegimeChange = w.day; n.pol.repression = n.gov === 'auth' ? 0.6 : 0.2;
  if (n.gov === 'tran' || n.gov === 'hyb') n.pol.nextElection = w.day + 365;
  shiftAlignment(w, n, w.rng.normal(wasAutocracy ? 0.25 : -0.2, 0.25));
  w.pushNews('politics', 5, `Revolution in ${n.short}: government of ${old.name} overthrown`, `${n.leader.name} leads a ${n.gov === 'tran' ? 'transitional council promising free elections' : 'new regime'}.`, [n.id], n.capital);
}

export function shiftAlignment(w: World, n: Nation, d: number) {
  const before = w.west[n.id];
  const after = clamp(before + d, -1, 1);
  w.west[n.id] = after;
  const delta = after - before;
  if (Math.abs(delta) < 0.01) return;
  for (const o of w.nations) {
    if (!o.alive || o.id === n.id) continue;
    const k = n.id * MAX_NATIONS + o.id;
    const ch = 40 * delta * w.west[o.id];
    w.relBase[k] = clamp(w.relBase[k] + ch, -100, 100);
    w.relBase[o.id * MAX_NATIONS + n.id] = w.relBase[k];
    w.addRel(n.id, o.id, ch * 0.5);
  }
  // leaving alliances that no longer fit
  for (const org of w.orgsOf(n.id)) {
    if (org.leader === n.id || org.kind !== 'defense' || Math.abs(w.west[org.leader]) < 0.3) continue;
    const leaderWest = w.west[org.leader];
    if (Math.sign(leaderWest) !== Math.sign(after) && Math.abs(after) > 0.35 && w.getRel(n.id, org.leader) < 10) {
      org.members = org.members.filter((m) => m !== n.id);
      w.pushNews('alliance', 4, `${n.short} withdraws from the ${org.name}`, undefined, [n.id, org.leader]);
    }
  }
}

function separatismUpdate(w: World, n: Nation) {
  const P = w.provinces;
  const capP = n.capital >= 0 ? P[n.capital] : null;
  for (const pid of w.ownList[n.id] || []) {
    const p = P[pid];
    let d = 0;
    if (p.core !== p.owner) d += 3 - Math.min(2.5, (w.day - p.ownedSince) / 3650);
    if (p.ctrl !== p.owner) d += 1;
    d += (55 - n.pol.stability) / 30;
    if (capP) d += Math.min(1, Math.hypot(p.lon - capP.lon, p.lat - capP.lat) / 40);
    if (n.gov === 'fdem') d -= 0.8;
    d -= 0.7;
    p.separatism = clamp(p.separatism + d, 0, 100);
    p.unrest = clamp(p.unrest + (n.pol.unrest - p.unrest) * 0.3 + (p.core !== p.owner ? 4 : 0), 0, 100);
  }
  // independence movement
  if (n.faction || n.atWar.length > 1) return;
  const hot = (w.ownList[n.id] || []).map((i) => P[i]).filter((p) => p.separatism > 72 && p.ctrl === n.id && !p.capital);
  if (!hot.length) return;
  const seed = hot.sort((a, b) => b.separatism - a.separatism)[0];
  const pr = (n.pol.stability < 40 ? 0.12 : 0.025) * w.settings.events;
  if (!w.rng.chance(pr)) return;
  // cluster contiguous separatist provinces
  const cluster = new Set<number>([seed.id]);
  const q = [seed.id];
  while (q.length && cluster.size < 12) {
    const i = q.shift()!;
    for (const j of P[i].neighbors) if (!cluster.has(j) && P[j].owner === n.id && P[j].ctrl === n.id && P[j].separatism > 55 && !P[j].capital && (P[j].core === seed.core || P[j].core2 === seed.core || P[j].core === n.id)) { cluster.add(j); q.push(j); }
  }
  if (n.gov === 'fdem' && n.pol.stability > 50) {
    // referendum
    const pass = w.rng.chance(0.35);
    w.pushNews('politics', 4, `${seed.name} holds independence referendum — ${pass ? 'secession approved' : 'voters reject independence'}`, undefined, [n.id], seed.id);
    if (pass) spawnNation(w, n, [...cluster], 'separatist', true);
    else for (const i of cluster) P[i].separatism -= 35;
    return;
  }
  spawnNation(w, n, [...cluster], 'separatist', false);
}

/** creates a breakaway nation; peaceful=true for negotiated secession */
export function spawnNation(w: World, parent: Nation, provs: number[], kind: 'separatist' | 'insurgent', peaceful: boolean, opts?: { name?: string; short?: string; colors?: string[]; backers?: number[]; revive?: number; strength?: number }) {
  const P = w.provinces;
  if (!provs.length) return null;
  const main = P[provs.slice().sort((a, b) => P[b].pop - P[a].pop)[0]];
  let n: Nation;
  if (opts?.revive !== undefined && !w.nations[opts.revive].alive) {
    n = w.nations[opts.revive];
    n.alive = true; n.died = -1; n.faction = peaceful ? null : { parent: parent.id, kind, backers: opts?.backers || [] };
    n.gov = 'tran';
    w.pushNews('politics', 5, `${n.name} is reborn as ${main.name} rises against ${parent.short}`, undefined, [n.id, parent.id], main.id);
  } else {
    const id = w.nations.length;
    const baseName = main.name.replace(/^(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\s+/, '');
    const name = opts?.name ?? (kind === 'separatist' ? `${w.rng.pick(['Republic of', 'Free State of', 'Federation of', "People's Republic of"])} ${baseName}` : `${baseName} ${w.rng.pick(['Liberation Front', 'Revolutionary Council', 'National Army', 'Popular Front', 'Salvation Movement'])}`);
    const short = opts?.short ?? (kind === 'separatist' ? baseName : `${baseName} rebels`);
    const colors = opts?.colors ?? genColors(w);
    n = {
      ...JSON.parse(JSON.stringify({ ...parent, claims: [], ai: null, hist: null, leader: null, faction: null })),
      id, code: 'X' + id, name, short, alive: true, flag: '', flagColors: colors, flagDesign: w.rng.int(0, 11), color: `hsl(${w.rng.int(0, 359)} ${w.rng.int(35, 60)}% ${w.rng.int(40, 60)}%)`,
      faction: peaceful ? null : { parent: parent.id, kind, backers: opts?.backers || [] }, gov: peaceful ? 'tran' : 'reb', claims: new Set(),
      hist: { t: [], gdp: [], pop: [], power: [], area: [], stability: [], mil: [] },
      ai: { threat: new Map(), target: -1, buildup: 0, buildupTarget: -1, lastWarEnd: w.day, lastDecision: w.day, fear: 0, estimate: new Map(), crisisWith: -1 },
      created: w.day, died: -1, successorOf: parent.id, nukes: 0, capital: main.id, atWar: [],
      stats: { casualties: 0, civilian: 0, warsStarted: 0, warsWon: 0, warsLost: 0, provincesGained: 0, provincesLost: 0, peakArea: 0, startArea: 0, startGdp: 0, startPop: 0 },
    } as Nation;
    const fresh = n as Nation & { _base?: unknown; _ind0?: unknown };
    fresh._base = undefined;
    fresh._ind0 = undefined;
    w.nations.push(n);
    w.byCode.set(n.code, id);
  }
  n.leader = w.makeLeader(n, w.day, false, { hawk: 0.1 });
  if (n.faction) n.leader.title = kind === 'separatist' ? 'Chairman' : 'Commander';
  // forces: share of parent proportional to population + defections
  const popShare = provs.reduce((s, i) => s + P[i].pop, 0) / Math.max(0.01, parent.pop);
  const defect = opts?.strength ?? (peaceful ? popShare * 0.6 : clamp(popShare * 0.8 + (50 - parent.pol.stability) / 200, 0.05, 0.45));
  const m = n.mil, pm = parent.mil;
  m.active = Math.max(2, pm.active * defect); m.reserves = pm.reserves * defect * 0.5; m.mobilized = 0; m.mobLevel = peaceful ? 0 : 2;
  m.armor = pm.armor * defect * 0.8; m.artillery = pm.artillery * defect * 0.8; m.aircraft = pm.aircraft * defect * 0.25; m.navy = pm.navy * defect * 0.2;
  m.airDefense = pm.airDefense * defect * 0.3; m.missiles = pm.missiles * defect * 0.1; m.morale = 0.7; m.readiness = 0.8; m.losses = 0; m.lossesEquip = 0; m.aidReceived = 0;
  if (!peaceful) { pm.active -= m.active; pm.armor -= m.armor; pm.artillery -= m.artillery; pm.aircraft -= m.aircraft; }
  n.eco = { ...parent.eco, debt: 40, reserves: 1, sanctions: 0, blockade: 0, milTarget: peaceful ? 2 : 8, milPct: peaceful ? 2 : 8, oilProd: provs.reduce((s, i) => s + P[i].oil, 0) };
  n.pol = { ...parent.pol, stability: 50, legitimacy: 50, rally: 15, weariness: 0, nextElection: 0, refugees: 0, crisis: 0, lastRegimeChange: w.day };
  w.west[n.id] = w.west[parent.id] * -0.3 + w.rng.normal(0, 0.3);
  for (const o of w.nations) { if (o.id === n.id) continue; w.setRel(n.id, o.id, w.getRel(parent.id, o.id) * -0.4); w.relBase[n.id * MAX_NATIONS + o.id] = w.relBase[o.id * MAX_NATIONS + n.id] = w.getRel(n.id, o.id); }
  w.setRel(n.id, parent.id, peaceful ? -10 : -80);
  for (const b of opts?.backers || []) w.setRel(n.id, b, 60);
  for (const i of provs) {
    const p = P[i];
    if (p.capital) continue;
    if (peaceful) { w.setOwner(i, n.id); w.setControl(i, n.id, 'treaty'); p.core = n.id; }
    else w.setControl(i, n.id, 'revolt');
    p.separatism = 0;
  }
  for (const p of P) p.capital = p.capital && p.owner !== n.id ? p.capital : false;
  if (P[main.id].ctrl === n.id) { P[main.id].capital = peaceful; n.capital = main.id; }
  // parent's capital flag restore
  const pc = parent.capital; if (pc >= 0 && P[pc].owner === parent.id) P[pc].capital = true;
  w.rebuildLists();
  computePowers(n);
  if (peaceful) {
    w.pushNews('politics', 5, `${n.name} becomes independent from ${parent.short}`, `A new nation of ${(n.pop || 0).toFixed(1)} million people is born.`, [n.id, parent.id], main.id);
  } else {
    declareWar(w, [n.id], [parent.id], { type: kind === 'separatist' ? 'independence' : 'civil', goal: kind === 'separatist' ? 'independence' : 'overthrow', callAllies: false });
  }
  return n;
}

export function startCivilWar(w: World, n: Nation, kind: 'insurgent' | 'separatist', cause: string) {
  const P = w.provinces;
  const own = (w.ctrlList[n.id] || []).map((i) => P[i]).filter((p) => p.owner === n.id && !p.capital);
  if (own.length < 2) { revolutionFallback(w, n); return; }
  // rebels take peripheral / unhappy provinces, contiguous from a seed
  const capP = n.capital >= 0 ? P[n.capital] : own[0];
  const scored = own.map((p) => ({ p, s: p.unrest + p.separatism + Math.hypot(p.lon - capP.lon, p.lat - capP.lat) * 2 + w.rng.next() * 30 })).sort((a, b) => b.s - a.s);
  const target = Math.max(1, Math.round(own.length * w.rng.range(0.15, 0.4)));
  const cluster = new Set<number>([scored[0].p.id]);
  const q = [scored[0].p.id];
  while (q.length && cluster.size < target) {
    const i = q.shift()!;
    for (const j of P[i].neighbors) if (!cluster.has(j) && P[j].ctrl === n.id && P[j].owner === n.id && !P[j].capital) { cluster.add(j); q.push(j); if (cluster.size >= target) break; }
  }
  const f = spawnNation(w, n, [...cluster], kind, false);
  if (f) w.pushNews('war', 5, `Civil war erupts in ${n.short}`, `Following ${cause}, ${f.name} has seized ${cluster.size} region${cluster.size > 1 ? 's' : ''}.`, [n.id, f.id], f.capital);
}

function revolutionFallback(w: World, n: Nation) {
  n.gov = 'tran'; n.pol.stability = 30; n.leader = w.makeLeader(n, w.day);
  w.pushNews('politics', 4, `Government collapses in ${n.short}`, `${n.leader.name} heads an interim authority.`, [n.id]);
}

function genColors(w: World) {
  const palette = ['#c8102e', '#ffffff', '#1f4fa8', '#111111', '#f2c230', '#2a7a3b', '#e36414', '#5b2a86', '#0e9aa7', '#7a1f1f', '#d9d2b6', '#3c5a99'];
  const a = w.rng.pick(palette); let b = w.rng.pick(palette); while (b === a) b = w.rng.pick(palette);
  let c = w.rng.pick(palette); while (c === a || c === b) c = w.rng.pick(palette);
  return [a, b, c];
}

export function reviveCheck(w: World) {
  // dead nations whose cores are restless may rise again
  for (const dead of w.nations) {
    if (dead.alive || dead.faction || dead.died < 0) continue;
    if (w.day - dead.died < 365 * 3) continue;
    const cores = w.provinces.filter((p) => p.core === dead.id);
    if (!cores.length) continue;
    const occupier = w.nations[cores[0].ctrl];
    if (!occupier.alive || occupier.pol.stability > 45) continue;
    if (!w.rng.chance(0.02 * w.settings.events)) continue;
    spawnNation(w, occupier, cores.filter((p) => p.ctrl === occupier.id).map((p) => p.id), 'separatist', false, { revive: dead.id });
  }
}

export function killIfEmpty(w: World) {
  for (const n of w.nations) {
    if (!n.alive) continue;
    if ((w.ctrlList[n.id] || []).length === 0 && (w.ownList[n.id] || []).length === 0) killNation(w, n.id, 'left without territory');
  }
}

export type { Province };
