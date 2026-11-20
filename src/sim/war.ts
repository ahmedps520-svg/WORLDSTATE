import { clamp } from './rng';
import { World, MAX_NATIONS } from './world';
import type { War, WarSide, WarType, WarGoal, Nation, Province } from './types';
import { TERRAIN_DEF, TERRAIN_MOVE, computeSupply, supplyFactor, adPower, projection, perSoldierQuality, computePowers } from './military';
import { fmtDuration } from './calendar';

const CODENAMES = ['Iron Dawn', 'Northern Shield', 'Crimson Tide', 'Desert Lance', 'Silent Thunder', 'Black Sea Storm', 'Granite Wall', 'Eagle Strike', 'Burning Horizon',
  'Steel Rain', 'Polar Night', 'Jade Spear', 'Sovereign Resolve', 'Broken Arrow', 'Long Reach', 'Midnight Hammer', 'Rising Lion', 'Vigilant Sky', 'Swift Justice', 'Ember Fall'];

export interface DeclareOpts {
  type: WarType;
  goal: WarGoal;
  targets?: number[];
  callAllies?: boolean;
  user?: boolean;
  casusBelli?: string;
  surprise?: boolean;
}

function side(leader: number, members: number[], goal: WarGoal, day: number): WarSide {
  const joined = new Map<number, number>();
  for (const m of members) joined.set(m, day);
  return { leader, members: [...members], goal, exhaustion: 0, casualties: 0, lossesEquip: 0, provincesTaken: 0, joined };
}

export function warName(w: World, type: WarType, a: number, d: number, targets: number[]): string {
  const A = w.nations[a], D = w.nations[d];
  if (type === 'civil') return `${w.nations[A.faction ? A.faction.parent : d].short} Civil War`;
  if (type === 'independence') return `${A.short} War of Independence`;
  if (type === 'punitive') return `Operation ${w.rng.pick(CODENAMES)}`;
  if (type === 'intervention') return `${D.short} Intervention`;
  const base = `${A.short}–${D.short} ${type === 'border' ? 'Border War' : 'War'}`;
  const prior = w.wars.filter((x) => x.name.endsWith(base)).length;
  const ord = ['', 'Second ', 'Third ', 'Fourth ', 'Fifth '][prior] ?? `${prior + 1}th `;
  if (type === 'border' && targets.length && targets.length <= 3 && prior === 0 && w.rng.chance(0.5)) return `${w.provinces[targets[0]].name} War`;
  return ord + base;
}

export function declareWar(w: World, attackers: number[], defenders: number[], opts: DeclareOpts): War | null {
  attackers = [...new Set(attackers)].filter((x) => w.nations[x].alive);
  defenders = [...new Set(defenders)].filter((x) => w.nations[x].alive && !attackers.includes(x));
  if (!attackers.length || !defenders.length) return null;
  const a = attackers[0], d = defenders[0];
  // merge into an existing war between the same leaders
  const existing = w.wars.find((x) => x.status === 'active' && ((x.a.members.includes(a) && x.d.members.includes(d)) || (x.d.members.includes(a) && x.a.members.includes(d))));
  if (existing) {
    const sideA = existing.a.members.includes(a) ? 'a' : 'd';
    for (const m of attackers) joinWar(w, existing, m, sideA, true);
    for (const m of defenders) joinWar(w, existing, m, sideA === 'a' ? 'd' : 'a', true);
    return existing;
  }
  let targets = opts.targets ?? [];
  if (!targets.length) {
    if (opts.goal === 'claims' || opts.type === 'border') targets = [...w.nations[a].claims].filter((p) => defenders.includes(w.provinces[p].ctrl));
    if (!targets.length && (opts.type === 'border' || opts.goal === 'claims')) {
      // grab the most valuable border provinces
      const border = w.provinces.filter((p) => defenders.includes(p.ctrl) && p.neighbors.some((q) => attackers.includes(w.provinces[q].ctrl)));
      targets = border.sort((x, y) => y.value - x.value).slice(0, Math.max(1, Math.ceil(border.length * 0.35))).map((p) => p.id);
    }
  }
  const war: War = {
    id: w.warSeq++, name: warName(w, opts.type, a, d, targets), type: opts.type,
    a: side(a, attackers, opts.goal, w.day), d: side(d, defenders, 'defend', w.day),
    start: w.day, status: 'active', score: 0, targets, maxDepth: opts.type === 'border' ? 1 : 99, stalemateDays: 0, lastChange: w.day,
    peaceAttempts: 0, civilian: 0, flips: [], airCampaign: opts.type === 'punitive' ? 1 : 0.35, nuclear: false, initiatedByUser: !!opts.user,
    casusBelli: opts.casusBelli || defaultCasusBelli(w, opts, a, d),
  };
  w.wars.push(war);
  w.warStats.started++;
  w.nations[a].stats.warsStarted++;
  w.rebuildWarIndex();
  for (const m of [...attackers, ...defenders]) {
    const n = w.nations[m];
    n.ai.buildup = 0; n.ai.target = -1;
    n.pol.rally += attackers.includes(m) ? 6 + n.pol.nationalism * 6 : 14;
    if (n.mil.mobLevel < 2 && defenders.includes(m)) n.mil.mobLevel = 2;
    if (n.mil.mobLevel < 1) n.mil.mobLevel = 1;
  }
  // surprise: unprepared defenders
  if (opts.surprise) for (const m of defenders) w.nations[m].mil.readiness *= 0.6;
  for (const m of attackers) for (const dd of defenders) w.addRel(m, dd, -45);

  const A = w.nations[a], D = w.nations[d];
  const verb = opts.type === 'punitive' ? 'launches a strike campaign against' : opts.type === 'border' ? 'opens a border offensive against' : opts.type === 'intervention' ? 'intervenes militarily in' : opts.type === 'civil' ? 'rises up against' : 'declares war on';
  w.pushNews('war', 5, `${A.short} ${verb} ${D.short}`, `${war.casusBelli}. The conflict is being called the ${war.name}.`, [a, d], targetProv(w, war), war.id);
  if (opts.type !== 'civil' && opts.type !== 'independence') globalReaction(w, war);
  if (opts.callAllies !== false) {
    callToArms(w, war, 'd');
    callToArms(w, war, 'a');
  }
  return war;
}

function defaultCasusBelli(w: World, o: DeclareOpts, a: number, d: number) {
  const A = w.nations[a], D = w.nations[d];
  if (o.type === 'civil') return `${A.name} has taken up arms against the government of ${w.nations[A.faction?.parent ?? d].short}`;
  if (o.type === 'independence') return `${A.name} has declared independence`;
  if (o.goal === 'claims') return `${A.short} asserts historic claims over ${D.short}-held territory`;
  if (o.goal === 'regime') return `${A.short} seeks to topple the government in ${D.short}`;
  if (o.goal === 'punish') return `${A.short} cites security threats posed by ${D.short}`;
  if (o.goal === 'liberate') return `${A.short} vows to liberate its occupied territories`;
  return `${A.short} launches a full-scale invasion of ${D.short}`;
}

function targetProv(w: World, war: War) {
  if (war.targets.length) return war.targets[0];
  const d = w.nations[war.d.leader];
  return d.capital;
}

export function joinWar(w: World, war: War, nid: number, s: 'a' | 'd', silent = false) {
  const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
  if (S.members.includes(nid) || O.members.includes(nid) || !w.nations[nid].alive) return;
  S.members.push(nid);
  S.joined.set(nid, w.day);
  const n = w.nations[nid];
  if (n.mil.mobLevel < 1) n.mil.mobLevel = 1;
  for (const o of O.members) w.addRel(nid, o, -40);
  w.rebuildWarIndex();
  const total = war.a.members.length + war.d.members.length;
  if (!silent) w.pushNews('war', 4, `${n.short} enters the ${war.name} on the side of ${w.nations[S.leader].short}`, undefined, [nid, S.leader, O.leader], w.nations[nid].capital, war.id);
  const majors = [...war.a.members, ...war.d.members].filter((m) => w.nations[m].eco.gdp > 1200 || w.nations[m].power > 3000).length;
  if (total >= 7 && majors >= 3 && !war.name.startsWith('Great') && war.type !== 'civil' && war.type !== 'punitive') {
    const old = war.name;
    war.name = `Great ${regionAdj(w, war)} War`;
    w.pushNews('war', 5, `${old} escalates into the ${war.name}`, `${total} nations are now belligerents.`, [war.a.leader, war.d.leader], undefined, war.id);
  }
}

function regionAdj(w: World, war: War) {
  const regions = [...war.a.members, ...war.d.members].map((m) => w.nations[m].region);
  const c: Record<string, number> = {}; for (const r of regions) c[r] = (c[r] || 0) + 1;
  const top = Object.entries(c).sort((x, y) => y[1] - x[1])[0][0];
  const names: Record<string, string> = { WEu: 'European', EEu: 'European', MEa: 'Middle Eastern', NAf: 'Saharan', SSA: 'African', SAs: 'Asian', EAs: 'Pacific', SEA: 'Pacific', CAs: 'Eurasian', NA: 'American', CAm: 'Caribbean', SAm: 'South American', OCE: 'Pacific' };
  const set = new Set(regions);
  if (set.size >= 4) return 'World';
  return names[top] || 'Regional';
}

/** treaty partners and friends decide whether to join */
export function callToArms(w: World, war: War, s: 'a' | 'd') {
  const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
  const leader = S.leader;
  const partners = w.defensePartners(leader);
  const invokedOrgs = new Set<string>();
  for (const pr of partners) {
    if (S.members.includes(pr.id) || O.members.includes(pr.id)) continue;
    const n = w.nations[pr.id];
    if (n.faction) continue;
    const rel = w.getRel(pr.id, leader);
    let pJoin = pr.c * (rel + 100) / 170;
    if (s === 'a') pJoin *= war.type === 'punitive' ? 0 : 0.25 + n.leader.hawk * 0.4; // offensive wars rarely trigger treaties
    if (O.members.some((o) => w.nations[o].nukes > 0) && n.nukes === 0) pJoin *= 0.55;
    if (O.members.some((o) => w.getRel(pr.id, o) > 30)) pJoin *= 0.4;
    pJoin *= 1 - n.pol.weariness / 140;
    if (n.atWar.length) pJoin *= 0.6;
    // is the threatened territory core? (defensive obligation strongest when the homeland is attacked)
    if (war.type === 'punitive') pJoin *= 0.4;
    if (!w.settings.autoJoin && !war.initiatedByUser) pJoin *= 0.5;
    if (w.rng.chance(clamp(pJoin, 0, 0.97))) {
      if (pr.via !== 'treaty' && !invokedOrgs.has(pr.via) && s === 'd') {
        invokedOrgs.add(pr.via);
        const org = w.orgs.find((o) => o.id === pr.via);
        w.pushNews('alliance', 5, `${org?.id === 'NATO' ? 'NATO invokes Article 5' : `${org?.name} invokes collective defence`} for ${w.nations[leader].short}`, undefined, [leader], w.nations[leader].capital, war.id);
      }
      joinWar(w, war, pr.id, s);
    } else if (s === 'd' && rel > 20) {
      // support short of war
      w.pushNews('diplomacy', 3, `${n.short} pledges support to ${w.nations[leader].short} but stays out of the fighting`, undefined, [pr.id, leader], undefined, war.id);
    }
  }
}

function globalReaction(w: World, war: War) {
  const a = war.a.leader, d = war.d.leader;
  const A = w.nations[a];
  const aggression = war.a.goal === 'regime' || war.a.goal === 'annex' ? 1.2 : war.a.goal === 'claims' ? 0.8 : war.a.goal === 'liberate' ? 0.3 : 0.7;
  let sanctioners: number[] = [];
  for (const n of w.nations) {
    if (!n.alive || war.a.members.includes(n.id) || war.d.members.includes(n.id) || n.faction) continue;
    const relD = w.getRel(n.id, d), relA = w.getRel(n.id, a);
    const dem = n.gov === 'fdem' || n.gov === 'dem' ? 1.3 : 0.7;
    const delta = -aggression * (6 + 18 * Math.max(0, relD) / 100) * dem + Math.max(0, relA) * 0.05;
    w.addRel(n.id, a, delta);
    const core = w.west[n.id] > 0.7 || (w.west[n.id] > 0.35 && (n.gov === 'fdem' || n.gov === 'dem') && n.eco.gdp > 150);
    if (core && relA < 15 && relD > 0 && aggression >= 0.7 && (A.eco.gdp > 30 || relD > 30)) {
      if (!w.sanctioning(n.id, a)) { w.sanctions.add(n.id * MAX_NATIONS + a); sanctioners.push(n.id); }
    }
  }
  if (sanctioners.length >= 5) {
    w.pushNews('diplomacy', 4, `${sanctioners.length} nations impose sanctions on ${A.short}`, `Measures target banking, energy and technology exports.`, [a, ...sanctioners.slice(0, 4)]);
  }
  // Security Council
  const p5 = ['US', 'GB', 'FR', 'RU', 'CN'].map((c) => w.byCode.get(c)!).filter((x) => w.nations[x].alive);
  const veto = p5.find((p) => war.a.members.includes(p) || w.getRel(p, a) > 30);
  if (w.rng.chance(0.85)) {
    if (veto !== undefined) w.pushNews('diplomacy', 3, `${w.nations[veto].short} vetoes UN Security Council resolution on the ${war.name}`, `The resolution demanded an immediate withdrawal of ${A.short} forces.`, [veto, a]);
    else w.pushNews('diplomacy', 4, `UN Security Council condemns ${A.short}, demands ceasefire`, `The resolution passed with no vetoes, authorising coordinated sanctions.`, [a, d]);
  }
}

// ------------------------------------------------------------------ daily war step
interface FrontCache { day: number; force: Float32Array; side: Int8Array; supply: Map<number, Int16Array>; axes: Set<number>; stance: { a: boolean; d: boolean }; capHops: Int16Array | null; ratio: number; frontline: number[]; pressure: Float32Array }
const CACHE = new Map<number, FrontCache>();
export function frontCache(id: number) { return CACHE.get(id); }

export function sideOf(war: War, nid: number): 'a' | 'd' | null { return war.a.members.includes(nid) ? 'a' : war.d.members.includes(nid) ? 'd' : null; }

export function warTick(w: World) {
  for (const war of w.wars) {
    if (war.status === 'ceasefire') { ceasefireTick(w, war); continue; }
    if (war.status !== 'active') continue;
    // drop dead members
    for (const s of ['a', 'd'] as const) war[s].members = war[s].members.filter((m) => w.nations[m].alive);
    if (!war.a.members.length || !war.d.members.length) { endWar(w, war, war.a.members.length ? 'a' : 'd', 'collapse'); continue; }
    if (!war.a.members.includes(war.a.leader)) war.a.leader = war.a.members[0];
    if (!war.d.members.includes(war.d.leader)) war.d.leader = war.d.members[0];
    let fc = CACHE.get(war.id);
    if (!fc || w.day - fc.day >= 3 || w.ctrlDirty) { fc = allocate(w, war, fc); CACHE.set(war.id, fc); }
    combat(w, war, fc);
    airWar(w, war, fc);
    updateExhaustion(w, war);
    updateScore(w, war);
    if ((w.day + war.id * 7) % 7 === 0) decideStance(w, war, fc);
    if ((w.day + war.id * 3) % 15 === 0) peaceCheck(w, war);
  }
}

function allocate(w: World, war: War, prev?: FrontCache): FrontCache {
  const P = w.provinces;
  const N = P.length;
  const sideArr = new Int8Array(N); // 1 = a, 2 = d, 0 neither
  const aSet = new Set(war.a.members), dSet = new Set(war.d.members);
  for (const p of P) sideArr[p.id] = aSet.has(p.ctrl) ? 1 : dSet.has(p.ctrl) ? 2 : 0;
  const force = new Float32Array(N);
  const pressure = prev?.pressure ?? new Float32Array(N);
  // naval control decides whether sea links are usable
  const navA = war.a.members.reduce((s, m) => s + w.nations[m].navalPower * projection(w.nations[m]) + w.nations[m].navalPower * 0.3, 0);
  const navD = war.d.members.reduce((s, m) => s + w.nations[m].navalPower * projection(w.nations[m]) + w.nations[m].navalPower * 0.3, 0);
  const seaA = navA >= navD * 0.7, seaD = navD >= navA * 0.7;
  const supply = new Map<number, Int16Array>();
  for (const m of [...war.a.members, ...war.d.members]) {
    const s = aSet.has(m) ? aSet : dSet;
    supply.set(m, computeSupply(w, m, (c) => s.has(c) || w.areAllied(c, m), s === aSet ? seaA : seaD));
  }
  for (const p of P) {
    if (!sideArr[p.id]) continue;
    const hops = supply.get(p.ctrl);
    p.supplied = !hops || hops[p.id] >= 0;
  }
  // frontline provinces per side
  const frontline: number[] = [];
  const isFront = new Uint8Array(N);
  for (const p of P) {
    const s = sideArr[p.id]; if (!s) continue;
    let f = false;
    for (const q of p.neighbors) if (sideArr[q] && sideArr[q] !== s) { f = true; break; }
    if (!f && ((s === 1 && seaA) || (s === 2 && seaD))) for (const l of p.sea) if (sideArr[l.to] && sideArr[l.to] !== s) { f = true; break; }
    if (f) { isFront[p.id] = 1; frontline.push(p.id); }
  }
  // capital distances for objective selection
  const capHops = bfsFrom(w, w.nations[war.d.leader].capital);
  // axes are recomputed in decideStance; keep previous
  const axes = prev?.axes ?? new Set<number>();
  const stance = prev?.stance ?? { a: war.type !== 'punitive', d: false };
  // distribute each member's committed land power
  for (const m of [...war.a.members, ...war.d.members]) {
    const n = w.nations[m];
    const s = aSet.has(m) ? 1 : 2;
    const commit = commitment(w, n, war, s === 1 ? 'a' : 'd');
    const pow = n.landPower * commit;
    if (pow <= 0) continue;
    let own = frontline.filter((i) => P[i].ctrl === m && sideArr[i] === s);
    let factor = 1;
    if (!own.length) {
      // expeditionary: deploy into allied frontline provinces
      const allyFront = frontline.filter((i) => sideArr[i] === s);
      if (!allyFront.length) continue;
      const contiguous = [...w.borderNations(m)].some((b) => (s === 1 ? aSet : dSet).has(b));
      factor = contiguous ? 0.65 : 0.12 + 0.5 * projection(n);
      own = allyFront;
    }
    let tw = 0;
    const wts = own.map((i) => {
      const p = P[i];
      let wt = 1 + pressure[i] * 2.5 + (p.capital ? 1.5 : 0) + (p.core === m ? 0.6 : 0);
      if (axes.has(i)) wt += 3;
      for (const q of p.neighbors) if (axes.has(q) && sideArr[q] !== s) { wt += 2.5; break; }
      tw += wt; return wt;
    });
    own.forEach((i, k) => { force[i] += pow * factor * wts[k] / tw; });
  }
  // garrison: unoccupied interior provinces keep token forces
  for (const p of P) if (sideArr[p.id] && !isFront[p.id]) force[p.id] += 0;
  let powA = 0, powD = 0;
  for (const i of frontline) { if (sideArr[i] === 1) powA += force[i]; else if (sideArr[i] === 2) powD += force[i]; }
  return { day: w.day, force, side: sideArr, supply, axes, stance, capHops, ratio: powA / Math.max(1, powD), frontline, pressure };
}

export function commitment(w: World, n: Nation, war: War, s: 'a' | 'd') {
  const wars = n.atWar.map((id) => w.wars.find((x) => x.id === id)!).filter(Boolean);
  if (!wars.length) return 0;
  const prio = (x: War) => {
    const ss = sideOf(x, n.id);
    if (!ss) return 0;
    const S = x[ss];
    const defendingHome = ss === 'd' && w.provinces.some((p) => p.owner === n.id && S === x.d && x.a.members.includes(p.ctrl));
    if (S.leader === n.id) return defendingHome ? 4 : 3;
    return defendingHome ? 3 : 1;
  };
  const tot = wars.reduce((s, x) => s + prio(x), 0);
  const mine = prio(war);
  const gar = 0.12 + (n.ai.fear > 0.5 ? 0.1 : 0);
  let lead = war[s].leader === n.id ? 1 : 0.55; // co-belligerents commit partially
  if ((war.type === 'civil' || war.type === 'independence') && s === 'd' && !n.faction) lead *= 0.7; // internal security ties down forces
  return (1 - gar) * (mine / Math.max(1, tot)) * lead;
}

function bfsFrom(w: World, start: number): Int16Array {
  const P = w.provinces;
  const h = new Int16Array(P.length).fill(-1);
  if (start < 0) return h;
  const q = [start]; h[start] = 0; let head = 0;
  while (head < q.length) {
    const i = q[head++];
    for (const j of P[i].neighbors) if (h[j] < 0) { h[j] = h[i] + 1; q.push(j); }
    for (const l of P[i].sea) if (h[l.to] < 0) { h[l.to] = h[i] + 2; q.push(l.to); }
  }
  return h;
}

function airSuperiority(w: World, war: War) {
  const air = (s: WarSide) => s.members.reduce((t, m) => t + w.nations[m].airPower * commitment(w, w.nations[m], war, s === war.a ? 'a' : 'd') * (s.leader === m ? 1 : 0.6), 0);
  const ad = (s: WarSide) => s.members.reduce((t, m) => t + adPower(w.nations[m]) * (s.leader === m ? 1 : 0.3), 0);
  const aA = air(war.a), aD = air(war.d), adA = ad(war.a), adD = ad(war.d);
  const supA = aA / Math.max(1, aA + aD + adD * 0.6);
  const supD = aD / Math.max(1, aA + aD + adA * 0.6);
  return { supA, supD, aA, aD };
}

function combat(w: World, war: War, fc: FrontCache) {
  const P = w.provinces;
  const { supA, supD } = airSuperiority(w, war);
  (war as War & { _air?: { a: number; d: number } })._air = { a: supA, d: supD };
  const done = new Set<number>();
  let flipsToday = 0;
  const losses = new Map<number, number>();
  const addLoss = (nid: number, powerLost: number) => { losses.set(nid, (losses.get(nid) || 0) + powerLost); };
  for (const pid of fc.frontline) fc.pressure[pid] *= 0.9;

  for (const qid of fc.frontline) {
    if (done.has(qid)) continue;
    const q = P[qid];
    const qs = fc.side[qid];
    if (!qs) continue;
    const atkSide = qs === 1 ? 2 : 1;
    const atkKey = atkSide === 1 ? 'a' : 'd';
    if (!fc.stance[atkKey]) continue;
    if (atkSide === 1 && war.type === 'punitive') continue;
    // border wars: attackers only push toward targets
    if (atkSide === 1 && war.type === 'border' && !war.targets.includes(qid) && q.owner !== war.a.leader) continue;
    // nuclear deterrence: limited advances into a nuclear power's heartland
    const qOwner = w.nations[q.owner];
    if (qOwner.nukes > 0 && fc.side[qid] && q.core === q.owner && !w.settings.nukes) {
      const atkNuke = war[atkKey].members.some((m) => w.nations[m].nukes > 0);
      if (q.owner !== war[atkKey].leader && (fc.capHops && fc.capHops[qid] >= 0 && fc.capHops[qid] < 4) && !atkNuke) continue;
    }
    const airMod = 1 + 0.55 * ((atkSide === 1 ? supA : supD) - 0.4);
    let O = 0;
    let topContributor = -1, topF = 0;
    let amph = true;
    const atkNb: number[] = [];
    for (const pid of q.neighbors) if (fc.side[pid] === atkSide) { atkNb.push(pid); amph = false; }
    if (!atkNb.length) for (const l of q.sea) if (fc.side[l.to] === atkSide) atkNb.push(l.to);
    if (!atkNb.length) continue;
    for (const pid of atkNb) {
      const p = P[pid];
      const enemiesOfP = p.neighbors.filter((x) => fc.side[x] === qs).length || 1;
      const focus = fc.axes.has(qid) ? 3 : 0.45;
      const hops = fc.supply.get(p.ctrl);
      const sup = hops ? supplyFactor(p, hops[pid], w.nations[p.ctrl].eco.infrastructure) : 0.5;
      const f = fc.force[pid] * 0.6 * focus / (focus + (enemiesOfP - 1) * 0.6) * sup;
      O += f;
      if (f > topF) { topF = f; topContributor = p.ctrl; }
    }
    O *= airMod * (amph ? 0.45 : 1);
    if (O <= 0) continue;
    const defN = w.nations[q.ctrl];
    const hopsD = fc.supply.get(q.ctrl);
    const supD2 = hopsD ? supplyFactor(q, hopsD[qid], defN.eco.infrastructure) : 0.6;
    const encircled = hopsD ? hopsD[qid] < 0 : false;
    const frontage = 0.6 + 0.4 * Math.sqrt(q.area / 25000);
    const defAir = 1 + 0.35 * ((atkSide === 1 ? supD : supA) - 0.4);
    let D = (fc.force[qid] + 0.4) * TERRAIN_DEF[q.terrain] * (1 + 0.17 * q.fort) * (q.urban > 1e6 ? 1.25 : 1) * supD2 * (q.core === q.ctrl ? 1.15 : 1) * (encircled ? 0.35 : 1) * defAir / frontage;
    D *= 0.4 + 0.6 * defN.mil.morale;
    if (defN.faction && q.core !== q.ctrl) D *= 1.35 + q.unrest / 200; // insurgents melt into friendly terrain
    if (war.type === 'civil' || war.type === 'independence') D *= 1.25;
    const r = O / Math.max(0.05, D);
    const move = TERRAIN_MOVE[q.terrain] * Math.pow(25000 / Math.max(2000, q.area), 0.25);
    let dP: number;
    if (r > 1.15) dP = Math.min(40, 1.4 * Math.pow(r - 1.15, 1.6)) * move * (0.8 + 0.4 * w.rng.next());
    else if (r > 0.9) dP = -0.3;
    else dP = -3 * (1 - r);
    if (q.siegeBy !== atkSide) { q.siege = 0; q.siegeBy = atkSide; }
    q.siege = clamp(q.siege + dP, 0, 120);
    fc.pressure[qid] = Math.min(3, fc.pressure[qid] + Math.min(1, r) * 0.25);
    // losses
    const E = Math.min(O, D) * 0.55 + 0.1 * Math.max(O, D);
    const lossA = E * 0.0024 * Math.pow(D / O, 0.4);
    const lossD = E * 0.0018 * Math.pow(O / Math.max(0.05, D), 0.4) * (encircled ? 2.5 : 1);
    for (const pid of atkNb) { const share = fc.force[pid] / Math.max(1e-6, atkNb.reduce((s, x) => s + fc.force[x], 0)); addLoss(P[pid].ctrl, lossA * share); }
    addLoss(q.ctrl, lossD);
    q.battle = Math.min(1, q.battle * 0.9 + 0.12 + Math.min(0.4, E / 400));
    q.devast = clamp(q.devast + 0.0008 * Math.min(3, E / 60), 0, 1);
    // civilians
    const dens = q.pop / Math.max(1, q.area / 10000);
    const civ = Math.min(q.pop * 0.00002, E * 0.000004 * (0.5 + Math.min(4, dens)) * (q.urban > 1e6 ? 1.6 : 1));
    q.pop = Math.max(0.001, q.pop - civ);
    war.civilian += civ * 1000;
    w.nations[q.owner].stats.civilian += civ * 1000;
    displace(w, q, 0.0015 * Math.min(1, E / 80));
    if (encircled) q.encircledDays++;
    if (q.siege >= 100 || (encircled && q.encircledDays > 40 && r > 0.6)) {
      done.add(qid);
      const prevCtrl = q.ctrl;
      let to = topContributor >= 0 ? topContributor : war[atkKey].leader;
      if (war[atkKey].members.includes(q.owner)) to = q.owner; // liberation returns to owner
      if (encircled && q.encircledDays > 20) {
        const trapped = fc.force[qid] / Math.max(0.5, perSoldierQuality(defN));
        defN.mil.active = Math.max(0.1, defN.mil.active - trapped * 0.3);
        if (trapped > 5) w.pushNews('battle', 4, `${Math.round(trapped)},000 ${defN.short} troops trapped as ${q.name} pocket collapses`, undefined, [q.ctrl, to], qid, war.id);
      }
      w.setControl(qid, to, 'capture');
      war.flips.push({ day: w.day, p: qid, from: prevCtrl, to });
      war[atkKey].provincesTaken++;
      war.lastChange = w.day;
      flipsToday++;
      announceCapture(w, war, q, prevCtrl, to);
    }
  }
  // apply casualties
  for (const [nid, pl] of losses) applyLosses(w, war, nid, pl, supA, supD);
  if (flipsToday === 0) war.stalemateDays++; else war.stalemateDays = 0;
}

function announceCapture(w: World, war: War, q: Province, from: number, to: number) {
  const T = w.nations[to], F = w.nations[from];
  const imp = q.capital ? 5 : q.urban > 1.5e6 || q.strategic > 2 ? 4 : q.urban > 4e5 ? 3 : 2;
  if (q.capital) return; // capital news handled in world.onCapitalLost
  let title: string;
  if (q.owner === to) title = `${T.short} liberates ${q.name} from ${F.short}`;
  else if (q.oil > 0.15) title = `${T.short} seizes the oil region around ${q.name}`;
  else if (q.urban > 1.5e6) title = `${q.name} falls to ${T.short} after heavy fighting`;
  else title = w.rng.pick([`${T.short} forces capture ${q.name}`, `${T.short} advances into ${q.name}`, `${F.short} loses control of ${q.name}`, `${q.name} changes hands as ${T.short} pushes forward`]);
  w.pushNews('battle', imp, title, undefined, [to, from], q.id, war.id);
}

function displace(w: World, q: Province, frac: number) {
  if (frac <= 0) return;
  const moved = q.pop * frac;
  q.pop -= moved;
  // to the nearest neutral neighbouring nation, otherwise internal
  const n = w.nations[q.owner];
  const neutral = q.neighbors.map((i) => w.provinces[i]).find((p) => !w.isEnemy(p.ctrl, q.ctrl) && p.ctrl !== q.ctrl && w.nations[p.ctrl].atWar.length === 0);
  if (neutral) {
    neutral.pop += moved;
    w.nations[neutral.ctrl].pol.refugees += moved;
  } else {
    const safe = (w.ctrlList[q.owner] || []).map((i) => w.provinces[i]).filter((p) => p.battle < 0.05);
    if (safe.length) { const p = safe[Math.floor(w.rng.next() * safe.length)]; p.pop += moved; n.pol.refugees += moved * 0.3; }
  }
}

function applyLosses(w: World, war: War, nid: number, powerLost: number, supA: number, supD: number) {
  const n = w.nations[nid];
  const Q = Math.max(0.3, n.mil.quality * (0.35 + 0.65 * n.mil.readiness));
  const personnel = powerLost / Q; // thousands
  const m = n.mil;
  const fromMob = Math.min(m.mobilized, personnel * 0.5);
  m.mobilized -= fromMob;
  m.active = Math.max(0.05, m.active - (personnel - fromMob));
  m.losses += personnel;
  const M = Math.max(1, m.active + m.mobilized);
  const s = sideOf(war, nid) === 'a' ? supD : supA; // enemy air power kills armour
  const eqLoss = personnel * (m.armor / M) * (0.7 + s * 0.8);
  m.armor = Math.max(0, m.armor - eqLoss);
  m.artillery = Math.max(0, m.artillery - personnel * (m.artillery / M) * 0.5);
  m.ammo = Math.max(0, m.ammo - personnel * 0.02);
  m.lossesEquip += eqLoss;
  n.stats.casualties += personnel;
  const sd = sideOf(war, nid);
  if (sd) { war[sd].casualties += personnel; war[sd].lossesEquip += eqLoss; }
  w.warStats.totalCasualties += personnel;
  // replacements: reserves flow into the mobilised pool when mobilised
  if (m.mobLevel >= 2 && m.reserves > 0) { const r = Math.min(m.reserves, personnel * 0.6); m.reserves -= r; m.mobilized += r; }
  computePowers(n);
}

function airWar(w: World, war: War, fc: FrontCache) {
  // strategic strikes: precision weapons and air power degrade the enemy economy and forces
  for (const s of ['a', 'd'] as const) {
    const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
    const leader = w.nations[S.leader];
    const target = w.nations[O.leader];
    const sup = (war as War & { _air?: { a: number; d: number } })._air?.[s] ?? 0.3;
    const intensity = (s === 'a' ? war.airCampaign : 0.3) * (0.3 + sup);
    const missiles = Math.min(leader.mil.missiles, 0.4 * intensity + (war.type === 'punitive' ? 0.6 : 0));
    leader.mil.missiles -= missiles;
    const strike = (leader.airPower * sup * 0.00002 + missiles * 0.05) * intensity;
    if (strike <= 0) continue;
    const intercept = clamp(adPower(target) / (adPower(target) + leader.airPower * 0.4 + missiles * 80), 0.05, 0.85);
    const eff = strike * (1 - intercept);
    target.mil.armor = Math.max(0, target.mil.armor - eff * 3);
    target.mil.aircraft = Math.max(0, target.mil.aircraft - eff * 0.3);
    target.mil.airDefense = Math.max(0, target.mil.airDefense - eff * 0.08);
    target.mil.navy = Math.max(0, target.mil.navy - eff * 0.02 * (leader.navalPower > target.navalPower ? 2 : 0.5));
    target.eco.infrastructure = clamp(target.eco.infrastructure - eff * 0.0006, 0.05, 1);
    // strategic sites
    if (w.rng.chance(clamp(eff * 0.05, 0, 0.25))) {
      const cand = (w.ctrlList[target.id] || []).map((i) => w.provinces[i]).filter((p) => p.strategic > 1.5 || p.oil > 0.1);
      const p = cand.length ? w.rng.pick(cand) : undefined;
      if (p) {
        p.devast = clamp(p.devast + 0.05, 0, 1);
        if (w.rng.chance(0.25)) w.pushNews('battle', war.type === 'punitive' ? 4 : 3, w.rng.pick([`${leader.short} strikes ${p.oil > 0.1 ? 'energy infrastructure' : 'military targets'} near ${p.name}`, `Missile barrage hits ${p.name}`, `${leader.short} air raids target ${p.name}`]), undefined, [leader.id, target.id], p.id, war.id);
      }
    }
    // own losses
    leader.mil.aircraft = Math.max(0, leader.mil.aircraft - strike * intercept * 0.15);
    O.exhaustion = clamp(O.exhaustion + eff * 0.02, 0, 100);
  }
  void fc;
}

function updateExhaustion(w: World, war: War) {
  for (const s of ['a', 'd'] as const) {
    const S = war[s];
    const L = w.nations[S.leader];
    const pop = S.members.reduce((t, m) => t + w.nations[m].pop, 0);
    const casRatio = S.casualties / Math.max(0.5, pop); // thousand per million
    const defending = s === 'd' || war.type === 'liberation';
    const dem = L.gov === 'fdem' || L.gov === 'dem';
    let k = (dem ? 0.55 : 2.2) * (defending ? 8 : 1) * (0.6 + L.pol.nationalism);
    if (war.type === 'civil' || war.type === 'independence') k *= 2;
    const fromCas = 100 * (1 - Math.exp(-casRatio / k));
    const days = w.day - Math.max(0, war.start);
    const rebel = !!L.faction;
    const fromTime = Math.min(rebel ? 15 : 35, days / (defending ? 70 : 40) * (dem ? 1.3 : 0.8) * (rebel ? 0.3 : 1));
    const floor = (war as War & { _exFloor?: { a: number; d: number } })._exFloor?.[s] ?? 0;
    const eco = (clamp(-L.eco.growth * 2, 0, 20) + L.eco.inflation / 10) * (defending ? 0.5 : 1);
    const target = clamp(floor + fromCas * 0.65 + fromTime + eco - L.pol.rally * 0.5, 0, 100);
    S.exhaustion += (target - S.exhaustion) * 0.03;
    for (const m of S.members) {
      const n = w.nations[m];
      n.pol.weariness += (S.exhaustion * (m === S.leader ? 1 : 0.6) - n.pol.weariness) * 0.02;
    }
  }
}

function valueOfLoss(w: World, war: War, by: WarSide, from: WarSide) {
  // fraction of 'from' side's owned value that 'by' holds
  let tot = 0, held = 0;
  for (const p of w.provinces) {
    if (!from.members.includes(p.owner)) continue;
    const v = p.value;
    tot += v;
    if (by.members.includes(p.ctrl)) held += v;
  }
  return tot ? held / tot : 0;
}

function updateScore(w: World, war: War) {
  if ((w.day + war.id) % 5 !== 0) return;
  const occD = valueOfLoss(w, war, war.a, war.d);
  const occA = valueOfLoss(w, war, war.d, war.a);
  const dCap = w.nations[war.d.leader].capital;
  const aCap = w.nations[war.a.leader].capital;
  const capD = dCap >= 0 && war.a.members.includes(w.provinces[dCap].ctrl) ? 20 : 0;
  const capA = aCap >= 0 && war.d.members.includes(w.provinces[aCap].ctrl) ? 20 : 0;
  const ex = (war.d.exhaustion - war.a.exhaustion) * 0.3;
  let tgt = 0;
  if (war.targets.length) tgt = war.targets.filter((p) => war.a.members.includes(w.provinces[p].ctrl)).length / war.targets.length * 30;
  war.score = clamp(occD * 160 - occA * 160 + capD - capA + ex + tgt, -100, 100);
}

function decideStance(w: World, war: War, fc: FrontCache) {
  const P = w.provinces;
  const ratio = fc.ratio;
  // attackers
  const A = w.nations[war.a.leader], D = w.nations[war.d.leader];
  const goalsMet = war.targets.length > 0 && war.targets.every((p) => war.a.members.includes(P[p].ctrl));
  let aOff = war.type !== 'punitive' && war.a.exhaustion < 78 && A.mil.morale > 0.2 && ratio > 0.55;
  if ((war.type === 'border' || war.a.goal === 'claims') && goalsMet) aOff = false;
  let dOff = war.d.exhaustion < 85 && (1 / Math.max(0.01, ratio) > 1.05 || (D.occupiedByEnemy > 0 && 1 / ratio > 0.8 && D.mil.morale > 0.45));
  if (war.type === 'punitive') dOff = false;
  if (war.d.members.every((m) => w.provinces.every((p) => p.owner !== m || !war.a.members.includes(p.ctrl))) && war.d.exhaustion > 40) dOff = false;
  fc.stance = { a: aOff, d: dOff };
  // choose axes for each offensive side
  fc.axes = new Set();
  for (const s of [1, 2] as const) {
    if ((s === 1 && !aOff) || (s === 2 && !dOff)) continue;
    const S = s === 1 ? war.a : war.d;
    const cands = fc.frontline.filter((i) => fc.side[i] !== s && fc.side[i] !== 0);
    const scored = cands.map((i) => {
      const p = P[i];
      let sc = p.value * (war.targets.includes(i) && s === 1 ? 3 : 1);
      if (S.members.includes(p.owner)) sc += 4; // liberate own land
      if (s === 1 && fc.capHops && fc.capHops[i] >= 0 && (war.a.goal === 'regime' || war.a.goal === 'annex')) sc += 6 / (1 + fc.capHops[i]);
      sc -= (fc.force[i] / Math.max(1, avg(fc.force, cands))) * 1.2;
      sc -= TERRAIN_DEF[p.terrain] - 1 + p.fort * 0.25;
      if (!p.supplied) sc += 2;
      return { i, sc: sc + w.rng.next() * 0.8 };
    }).sort((x, y) => y.sc - x.sc);
    const k = Math.max(1, Math.round(scored.length * 0.25));
    for (const c of scored.slice(0, k)) fc.axes.add(c.i);
  }
  // escalate mobilisation when losing
  for (const S of [war.a, war.d]) {
    const L = w.nations[S.leader];
    const losing = (S === war.a ? war.score < -10 : war.score > 10) || L.occupiedByEnemy > 0;
    if (losing && L.mil.mobLevel < 3 && w.rng.chance(0.25 + L.leader.hawk * 0.3)) {
      L.mil.mobLevel++;
      w.pushNews('war', 3, L.mil.mobLevel === 3 ? `${L.short} declares general mobilisation` : `${L.short} orders partial mobilisation`, undefined, [L.id], L.capital, war.id);
      L.pol.stability -= L.mil.mobLevel === 3 ? 4 : 2;
    }
  }
  // nuclear escalation (only when permitted)
  if (w.settings.nukes) nuclearCheck(w, war);
}

function avg(f: Float32Array, idx: number[]) { if (!idx.length) return 1; let s = 0; for (const i of idx) s += f[i]; return s / idx.length; }

function nuclearCheck(w: World, war: War) {
  for (const s of ['a', 'd'] as const) {
    const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
    const L = w.nations[S.leader];
    if (L.nukes <= 0 || war.nuclear) continue;
    const desperate = L.coreLostFrac > 0.3 || (L.capital >= 0 && w.provinces[L.capital].neighbors.some((q) => O.members.includes(w.provinces[q].ctrl)));
    if (!desperate) continue;
    if (!w.rng.chance(0.012 * L.leader.hawk * (1 - L.leader.pragmatism * 0.6))) continue;
    // tactical strike on the most important enemy-held frontline province
    const cands = w.provinces.filter((p) => O.members.includes(p.ctrl) && p.neighbors.some((q) => S.members.includes(w.provinces[q].ctrl)));
    const t = cands.sort((a, b) => b.battle - a.battle)[0];
    if (!t) continue;
    war.nuclear = true;
    L.nukes -= 1;
    const dead = t.pop * 0.12;
    t.pop -= dead; t.devast = 1; t.siege = 0;
    war.civilian += dead * 1000;
    const victim = w.nations[t.ctrl];
    victim.mil.active *= 0.92; victim.mil.armor *= 0.9; victim.mil.morale *= 0.6;
    for (const n of w.nations) if (n.alive && n.id !== L.id) w.addRel(n.id, L.id, -45);
    w.market.globalCycle -= 2.5;
    w.market.tension = 100;
    w.pushNews('war', 5, `${L.short} detonates a tactical nuclear weapon near ${t.name}`, `The first wartime nuclear use since 1945 kills an estimated ${Math.round(dead * 1000)},000 people. World markets crash.`, [L.id, victim.id], t.id, war.id);
  }
}

// ------------------------------------------------------------------ peace
export type PeaceTerms = 'white' | 'cede_targets' | 'cede_occupied' | 'annex' | 'puppet' | 'ceasefire' | 'independence' | 'overthrow' | 'collapse';

function peaceCheck(w: World, war: War) {
  const P = w.provinces;
  const A = w.nations[war.a.leader], D = w.nations[war.d.leader];
  const days = w.day - war.start;
  if (days < 20) return;
  const dOcc = D.ownedCount ? D.occupiedByEnemy / D.ownedCount : 0;
  const capFallen = D.capital >= 0 && war.a.members.includes(P[D.capital].ctrl);
  const aCapFallen = A.capital >= 0 && war.d.members.includes(P[A.capital].ctrl);
  const goalsMet = war.targets.length > 0 && war.targets.every((p) => war.a.members.includes(P[p].ctrl));

  // total collapse of defender
  if ((capFallen && dOcc > 0.55 && (D.pol.stability < 35 || war.d.exhaustion > 55)) || D.provinceCount === 0) {
    if (war.type === 'civil') return endWar(w, war, 'a', A.faction?.kind === 'separatist' ? 'independence' : 'overthrow');
    if (war.type === 'independence') return endWar(w, war, 'a', 'independence');
    const terms: PeaceTerms = war.a.goal === 'annex' || dOcc > 0.92 ? (A.leader.hawk > 0.55 || dOcc > 0.92 ? 'annex' : 'puppet') : war.a.goal === 'regime' ? 'puppet' : 'cede_occupied';
    return endWar(w, war, 'a', terms);
  }
  const aOcc = A.ownedCount ? A.occupiedByEnemy / A.ownedCount : 0;
  if ((aCapFallen && aOcc > 0.55 && war.a.exhaustion > 50) || A.provinceCount === 0) {
    if (war.type === 'civil' || war.type === 'independence') return endWar(w, war, 'd', 'collapse');
    return endWar(w, war, 'd', 'white');
  }
  // attackers achieved limited goals
  if (goalsMet && war.type !== 'civil') {
    const accept = (war.d.exhaustion > 62 && war.score > 30) || war.d.exhaustion > 78 || D.pol.stability < 22 || w.rng.chance(0.01 + war.peaceAttempts * 0.004);
    war.peaceAttempts++;
    if (accept && w.rng.chance(0.35)) return endWar(w, war, 'a', w.rng.chance(0.5) ? 'ceasefire' : 'cede_targets');
    if (war.peaceAttempts === 1) w.pushNews('diplomacy', 3, `${D.short} rejects ${A.short}'s terms for peace`, `${A.short} demanded formal cession of occupied territory.`, [D.id, A.id], undefined, war.id);
  }
  // exhausted attacker
  if (war.a.exhaustion > 72 && war.score < 25) {
    if (war.type === 'civil' || war.type === 'independence') {
      const fac = w.nations[war.a.leader];
      if (fac.provinceCount <= 1 && w.rng.chance(0.3)) return endWar(w, war, 'd', 'collapse');
      if (war.d.exhaustion > 45 && w.rng.chance(0.1)) return endWar(w, war, 'd', 'ceasefire');
    } else if (w.rng.chance(0.4)) return endWar(w, war, 'd', war.score > 5 && A.occupiedByEnemy === 0 ? 'ceasefire' : 'white');
  }
  // losing attacker
  if (war.score < -35 && war.a.exhaustion > 45 && w.rng.chance(0.4)) {
    if (war.type === 'civil' || war.type === 'independence') { if (w.nations[war.a.leader].provinceCount <= 1) return endWar(w, war, 'd', 'collapse'); return; }
    return endWar(w, war, 'd', 'white');
  }
  // exhausted defender with significant losses
  if (war.d.exhaustion > 75 && war.score > 30 && war.type !== 'civil' && w.rng.chance(0.3)) {
    if (war.type !== 'independence' && war.a.goal !== 'regime' && w.rng.chance(0.55)) return endWar(w, war, 'a', 'ceasefire');
    return endWar(w, war, 'a', war.type === 'independence' ? 'independence' : war.a.goal === 'regime' ? 'puppet' : 'cede_occupied');
  }
  // phony war: no way to reach each other
  const fc = CACHE.get(war.id);
  if (fc && fc.frontline.length === 0 && days > 120 && w.rng.chance(0.25)) return endWar(w, war, 'a', war.score > 5 ? 'ceasefire' : 'white');
  if (days > 240 && war.a.casualties + war.d.casualties < 2 && war.type !== 'punitive' && w.rng.chance(0.3)) return endWar(w, war, 'a', 'white');
  // stalemate
  if (war.stalemateDays > 160 && war.a.exhaustion > 35 && war.d.exhaustion > 30) {
    const pr = 0.03 + (war.a.exhaustion + war.d.exhaustion) / 1500 + (mediator(w, war) >= 0 ? 0.04 : 0);
    if (w.rng.chance(pr)) return endWar(w, war, 'a', 'ceasefire');
  }
  // rebels in civil wars that hold territory for years may win independence / recognition
  if ((war.type === 'independence') && days > 900 && war.score > 10 && w.rng.chance(0.05)) return endWar(w, war, 'a', 'independence');
}

function mediator(w: World, war: War) {
  let best = -1, bs = 0;
  for (const n of w.nations) {
    if (!n.alive || n.faction || sideOf(war, n.id) || n.eco.gdp < 400) continue;
    const s = Math.min(w.getRel(n.id, war.a.leader), w.getRel(n.id, war.d.leader));
    if (s > 15 && s * n.eco.gdp > bs) { bs = s * n.eco.gdp; best = n.id; }
  }
  return best;
}

export function endWar(w: World, war: War, winner: 'a' | 'd', terms: PeaceTerms) {
  const P = w.provinces;
  const W = war[winner], L = war[winner === 'a' ? 'd' : 'a'];
  const Wn = w.nations[W.leader], Ln = w.nations[L.leader];
  const allMembers = [...war.a.members, ...war.d.members];
  const inWar = (c: number) => allMembers.includes(c);
  let text = '';
  const provincesTo = (fn: (p: Province) => void) => { for (const p of P) fn(p); };

  if (terms === 'ceasefire') {
    war.status = 'ceasefire';
    war.ceasefireDay = w.day;
    for (const p of P) { if (inWar(p.ctrl)) { p.siege = 0; p.siegeBy = -1; } }
    const med = mediator(w, war);
    text = `Front lines are frozen${med >= 0 ? ` after mediation by ${w.nations[med].short}` : ''}. Occupied territories remain contested.`;
    w.pushNews('diplomacy', 5, `Ceasefire agreed in the ${war.name}`, text, [war.a.leader, war.d.leader, ...(med >= 0 ? [med] : [])], undefined, war.id);
    w.rebuildWarIndex();
    for (const m of allMembers) { const n = w.nations[m]; if (n.atWar.length === 0) n.mil.mobLevel = Math.min(n.mil.mobLevel, 1); }
    war.outcome = 'Ceasefire — frozen conflict';
    CACHE.delete(war.id);
    return;
  }
  war.status = 'ended';
  war.end = w.day;
  w.warStats.ended++;
  const ceded: number[] = [];
  switch (terms) {
    case 'white':
      provincesTo((p) => { if (inWar(p.owner) && inWar(p.ctrl) && p.ctrl !== p.owner && sideOf(war, p.ctrl) !== sideOf(war, p.owner)) w.setControl(p.id, p.owner, 'treaty'); });
      text = `A status quo peace restores pre-war borders.`;
      war.outcome = 'White peace';
      break;
    case 'cede_targets':
    case 'cede_occupied': {
      provincesTo((p) => {
        if (!inWar(p.owner) || !inWar(p.ctrl) || p.ctrl === p.owner) return;
        const ctrlSide = sideOf(war, p.ctrl), ownSide = sideOf(war, p.owner);
        if (ctrlSide === ownSide) return;
        const keep = ctrlSide === winner && (terms === 'cede_occupied' || war.targets.includes(p.id) || w.nations[p.ctrl].claims.has(p.id));
        if (keep) { ceded.push(p.id); w.setOwner(p.id, p.ctrl); } else w.setControl(p.id, p.owner, 'treaty');
      });
      text = ceded.length ? `${Ln.short} cedes ${ceded.length} region${ceded.length > 1 ? 's' : ''} including ${P[ceded[0]].name} to ${Wn.short}.` : 'Pre-war borders are restored.';
      war.outcome = ceded.length ? `${Wn.short} victory — territorial cession` : 'Negotiated peace';
      break;
    }
    case 'annex': {
      for (const m of L.members) {
        const n = w.nations[m];
        provincesTo((p) => { if (p.owner === m && W.members.includes(p.ctrl)) { ceded.push(p.id); w.setOwner(p.id, p.ctrl); } });
        const left = P.filter((p) => p.owner === m);
        if (!left.length || left.every((p) => W.members.includes(p.ctrl) || p.ctrl !== m)) killNation(w, m, `annexed by ${Wn.short}`);
        else provincesTo((p) => { if (p.owner === m && p.ctrl !== m && sideOf(war, p.ctrl) === winner) w.setControl(p.id, m, 'treaty'); });
        void n;
      }
      provincesTo((p) => { if (W.members.includes(p.owner) && L.members.includes(p.ctrl)) w.setControl(p.id, p.owner, 'treaty'); });
      text = `${Wn.short} annexes ${ceded.length} regions.`;
      war.outcome = `${Wn.short} conquest`;
      break;
    }
    case 'puppet': {
      provincesTo((p) => {
        if (!inWar(p.owner) || !inWar(p.ctrl) || p.ctrl === p.owner || sideOf(war, p.ctrl) === sideOf(war, p.owner)) return;
        if (sideOf(war, p.ctrl) === winner && w.nations[p.ctrl].claims.has(p.id)) { ceded.push(p.id); w.setOwner(p.id, p.ctrl); }
        else w.setControl(p.id, p.owner, 'treaty');
      });
      installRegime(w, Ln.id, Wn.id);
      text = `A new government aligned with ${Wn.short} takes power in ${Ln.short}.`;
      war.outcome = `${Wn.short} victory — regime change`;
      break;
    }
    case 'independence': {
      const fac = w.nations[war.a.leader];
      provincesTo((p) => { if (p.ctrl === fac.id) { w.setOwner(p.id, fac.id); p.core = fac.id; } });
      provincesTo((p) => { if (p.owner === fac.id && p.ctrl !== fac.id) w.setControl(p.id, fac.id, 'treaty'); });
      const parent = fac.faction ? fac.faction.parent : war.d.leader;
      fac.faction = null;
      fac.gov = w.rng.pick(['hyb', 'auth', 'dem', 'tran'] as const);
      w.relocateCapital(fac.id);
      w.setRel(fac.id, parent, -40);
      text = `${fac.name} is recognised as a sovereign state.`;
      war.outcome = `${fac.short} independence`;
      w.pushNews('politics', 5, `${fac.name} wins independence from ${w.nations[parent].short}`, text, [fac.id, parent], fac.capital, war.id);
      break;
    }
    case 'overthrow': {
      const fac = w.nations[war.a.leader];
      const parent = w.nations[fac.faction ? fac.faction.parent : war.d.leader];
      provincesTo((p) => { if (p.ctrl === fac.id) w.setControl(p.id, parent.id, 'treaty'); });
      parent.gov = w.rng.pick(['tran', 'jun', 'auth', 'hyb'] as const);
      parent.leader = { ...fac.leader, title: 'President', since: w.day };
      parent.pol.stability = 30; parent.pol.legitimacy = 35; parent.pol.lastRegimeChange = w.day;
      // backers become friends
      for (const b of fac.faction?.backers || []) w.addRel(parent.id, b, 50);
      parent.mil.active += fac.mil.active * 0.7; parent.mil.armor += fac.mil.armor * 0.7;
      killNation(w, fac.id, 'became the government');
      text = `${fac.name} seizes the capital and forms a new government in ${parent.short}.`;
      war.outcome = `${fac.short} victory — government overthrown`;
      w.pushNews('politics', 5, `${fac.short} topples the government of ${parent.short}`, text, [parent.id], parent.capital, war.id);
      break;
    }
    case 'collapse': {
      const fac = w.nations[war.a.leader];
      if (fac.faction) {
        const parent = fac.faction.parent;
        provincesTo((p) => { if (p.ctrl === fac.id) w.setControl(p.id, parent, 'treaty'); });
        killNation(w, fac.id, 'defeated');
        text = `${fac.name} has been defeated and its remaining forces disbanded.`;
        war.outcome = `${w.nations[parent].short} victory`;
      } else {
        provincesTo((p) => { if (inWar(p.owner) && inWar(p.ctrl) && p.ctrl !== p.owner) w.setControl(p.id, p.owner, 'treaty'); });
        war.outcome = 'Collapse';
      }
      break;
    }
  }
  w.rebuildWarIndex();
  // aftermath
  for (const m of W.members) { const n = w.nations[m]; if (n.alive) { n.stats.warsWon++; n.leader.approval = clamp(n.leader.approval + 12, 0, 100); n.pol.stability = clamp(n.pol.stability + 4, 0, 100); } }
  for (const m of L.members) { const n = w.nations[m]; if (n.alive) { n.stats.warsLost++; n.leader.approval = clamp(n.leader.approval - 18, 0, 100); n.pol.stability = clamp(n.pol.stability - 8, 0, 100); n.ai.lastWarEnd = w.day; } }
  for (const m of allMembers) {
    const n = w.nations[m]; if (!n.alive) continue;
    n.ai.lastWarEnd = w.day;
    if (n.atWar.length === 0) { n.mil.mobLevel = Math.min(n.mil.mobLevel, 1); n.pol.rally = 0; }
  }
  // lost cores become irredentist claims
  for (const pid of ceded) { const p = P[pid]; if (p.core !== p.owner && w.nations[p.core]?.alive) w.nations[p.core].claims.add(pid); }
  // lift some sanctions when the aggressor lost or after white peace
  if (winner === 'd' || terms === 'white') for (const k of [...w.sanctions]) { if (k % MAX_NATIONS === war.a.leader && w.rng.chance(0.4)) w.sanctions.delete(k); }
  if (terms !== 'independence' && terms !== 'overthrow') {
    const dur = fmtDuration(w.day - war.start);
    w.pushNews('diplomacy', 5, terms === 'white' ? `${war.name} ends in a negotiated peace` : `${war.name} ends: ${war.outcome}`, `${text} The war lasted ${dur} and cost ${Math.round(war.a.casualties + war.d.casualties).toLocaleString()},000 military casualties.`, [war.a.leader, war.d.leader], ceded[0] ?? undefined, war.id);
  }
  CACHE.delete(war.id);
}

function ceasefireTick(w: World, war: War) {
  if ((w.day + war.id) % 30 !== 0) return;
  const since = w.day - (war.ceasefireDay ?? w.day);
  const A = w.nations[war.a.leader], D = w.nations[war.d.leader];
  if (!A.alive || !D.alive) { war.status = 'ended'; war.end = w.day; return; }
  // formalise frozen lines into a treaty after some years
  if (since > 365 * 2 && w.rng.chance(0.03)) {
    war.status = 'active';
    w.rebuildWarIndex();
    endWar(w, war, war.score >= 0 ? 'a' : 'd', war.score > 10 ? 'cede_occupied' : 'white');
    return;
  }
  // breakdown
  const revanche = (D.occupiedByEnemy > 0 ? D.leader.hawk : 0) * (D.power / Math.max(1, A.power));
  const greed = A.leader.hawk * A.ambition * (A.power / Math.max(1, D.power)) * 0.5;
  const pr = (Math.max(revanche, greed) * 0.04 + w.market.tension / 4000) * w.settings.aggression * (since > 180 ? 1 : 0.2);
  if (w.rng.chance(pr)) {
    war.status = 'active';
    war.stalemateDays = 0;
    war.a.exhaustion *= 0.6; war.d.exhaustion *= 0.6;
    w.rebuildWarIndex();
    const breaker = revanche > greed ? D : A;
    w.pushNews('war', 5, `Ceasefire collapses as ${breaker.short} resumes hostilities in the ${war.name}`, undefined, [A.id, D.id], undefined, war.id);
  }
}

export function killNation(w: World, nid: number, cause: string) {
  const n = w.nations[nid];
  if (!n.alive) return;
  n.alive = false;
  n.died = w.day;
  n.deathCause = cause;
  w.treaties.forEach((t) => { if ((t.a === nid || t.b === nid) && t.until === undefined) t.until = w.day; });
  for (const o of w.orgs) o.members = o.members.filter((m) => m !== nid);
  for (const k of [...w.sanctions]) if (Math.floor(k / MAX_NATIONS) === nid || k % MAX_NATIONS === nid) w.sanctions.delete(k);
  for (const war of w.wars) for (const s of [war.a, war.d]) s.members = s.members.filter((m) => m !== nid);
  w.rebuildWarIndex();
  if (!n.faction) w.pushNews('politics', 5, `${n.name} ceases to exist as an independent state`, `It was ${cause}.`, [nid]);
}

export function installRegime(w: World, nid: number, patron: number) {
  const n = w.nations[nid];
  const P = w.nations[patron];
  n.gov = P.gov === 'fdem' || P.gov === 'dem' ? 'tran' : 'auth';
  n.leader = w.makeLeader(n, w.day, false, { hawk: -0.2 });
  n.leader.trait = 'Collaborator';
  n.pol.stability = 30; n.pol.legitimacy = 25; n.pol.lastRegimeChange = w.day;
  w.west[nid] = w.west[patron] * 0.8;
  for (const m of w.nations) if (m.alive) w.setRel(nid, m.id, w.getRel(patron, m.id) * 0.7);
  w.setRel(nid, patron, 75);
  w.treaties.push({ id: w.treatySeq++, a: patron, b: nid, type: 'defense', commitment: 0.6, since: w.day });
  n.mil.mobLevel = 0; n.mil.mobilized = 0;
}

export function provinceValue(p: Province) {
  return (0.3 + Math.sqrt(p.gdp) * 0.25 + Math.sqrt(p.pop) * 0.4) * p.strategic;
}
