import { clamp } from './rng';
import { World, MAX_NATIONS } from './world';
import type { Nation, War, WarType, WarGoal } from './types';
import { declareWar, joinWar, sideOf } from './war';
import { projection, baseline } from './military';

/** Perceived power of target as estimated by observer (intelligence error). */
export function estimate(w: World, obs: Nation, target: Nation) {
  let e = obs.ai.estimate.get(target.id);
  if (e === undefined || (w.day + obs.id + target.id) % 365 === 0) {
    e = 1 + w.rng.normal(0, 0.35 * (1 - obs.intel));
    obs.ai.estimate.set(target.id, e);
  }
  return target.power * clamp(e, 0.4, 1.8);
}

function allyHelp(w: World, defender: Nation, attacker: Nation) {
  let s = 0;
  for (const pr of w.defensePartners(defender.id)) {
    if (pr.id === attacker.id) continue;
    const k = w.nations[pr.id];
    if (w.getRel(k.id, attacker.id) > 40) continue;
    const reach = w.borderNations(k.id).has(defender.id) || w.distNations(k.id, defender.id) < 1500 ? 1 : 0.25 + 0.75 * projection(k);
    const will = pr.c * (w.getRel(k.id, defender.id) + 100) / 200 * (1 - k.pol.weariness / 150) * (k.atWar.length ? 0.5 : 1);
    s += k.power * reach * will;
  }
  return s;
}

export function threatTo(w: World, n: Nation, o: Nation, land: boolean, sea: boolean) {
  const rel = w.getRel(n.id, o.id);
  const hostility = clamp((20 - rel) / 100, 0, 1.2);
  if (hostility <= 0) return 0;
  const prox = land ? 1 : sea ? 0.55 : 0.05 + 0.2 * projection(o);
  const allies = w.defensePartners(n.id).reduce((s, x) => s + w.nations[x.id].power * x.c * 0.4, 0);
  const ratio = estimate(w, n, o) / Math.max(10, n.power + allies);
  return clamp(ratio * hostility * prox * (0.5 + o.ambition + (o.ai.buildupTarget === n.id ? 1 : 0)), 0, 3);
}

/** monthly decisions for one nation */
export function aiMonthly(w: World, n: Nation) {
  if (!n.alive) return;
  const land = w.borderNations(n.id);
  const sea = w.seaNeighbors(n.id);
  // threat assessment
  n.ai.threat.clear();
  let fear = 0, top = -1;
  const consider = new Set<number>([...land, ...sea]);
  for (const o of w.nations) if (o.alive && o.power > n.power * 0.5 && projection(o) > 0.4 && w.getRel(n.id, o.id) < -50) consider.add(o.id);
  for (const id of consider) {
    const o = w.nations[id]; if (!o.alive || id === n.id) continue;
    const t = threatTo(w, n, o, land.has(id), sea.has(id));
    if (t > 0.05) n.ai.threat.set(id, t);
    if (t > fear) { fear = t; top = id; }
  }
  n.ai.fear = fear;
  // defence spending responds to fear and war
  const b = baseline(n);
  const base = b.budget / Math.max(0.05, n.eco.gdp) * 100;
  let target = clamp(base * (1 + fear * 0.8), 0.3, 8);
  if (n.atWar.length) target = Math.max(target, n.mil.mobLevel >= 3 ? 18 : n.mil.mobLevel >= 2 ? 9 : 5);
  if (n.eco.debt > 160) target *= 0.8;
  if (n.faction) target = 12;
  n.eco.milTarget = target;
  // fortify frontier facing the main threat
  if (top >= 0 && fear > 0.35) {
    for (const pid of w.ctrlList[n.id] || []) {
      const p = w.provinces[pid];
      if (p.neighbors.some((q) => w.provinces[q].ctrl === top)) p.fort = clamp(p.fort + 0.12 * (0.5 + fear), 0, n.atWar.length ? 5 : 3.5);
    }
    if (n.mil.mobLevel === 0 && fear > 0.9) n.mil.mobLevel = 1;
  }
  if (!n.atWar.length && n.mil.mobLevel > 1 && n.ai.buildup === 0 && fear < 0.6) n.mil.mobLevel = 1;
  if (!n.atWar.length && n.mil.mobLevel === 1 && fear < 0.3 && n.ai.buildup === 0) n.mil.mobLevel = 0;

  if (n.faction) { factionAi(w, n); return; }
  relationsDrift(w, n, land);
  seekAlliances(w, n, top, fear);
  supportFriends(w, n);
  joinOngoingWars(w, n);
  sanctionsReview(w, n);
  if (w.settings.aiWars) warPlanning(w, n, land, sea);
}

function relationsDrift(w: World, n: Nation, land: Set<number>) {
  for (const o of w.nations) {
    if (!o.alive || o.id <= n.id) continue;
    const k = n.id * MAX_NATIONS + o.id;
    const base = w.relBase[k];
    let r = w.rel[k];
    let d = (base - r) * 0.02;
    if (w.isEnemy(n.id, o.id)) d -= 1.5;
    if (land.has(o.id)) {
      const claimsNO = [...n.claims].some((p) => w.provinces[p].ctrl === o.id);
      const claimsON = [...o.claims].some((p) => w.provinces[p].ctrl === n.id);
      if (claimsNO || claimsON) d -= 0.4;
    }
    if (w.sanctioning(n.id, o.id) || w.sanctioning(o.id, n.id)) d -= 0.4;
    // shared enemies
    for (const id of n.atWar) {
      const war = w.wars.find((x) => x.id === id); if (!war) continue;
      const sn = sideOf(war, n.id), so = sideOf(war, o.id);
      if (sn && so && sn === so) d += 1.2;
    }
    r = clamp(r + d, -100, 100);
    w.rel[k] = r; w.rel[o.id * MAX_NATIONS + n.id] = r;
  }
}

const NEUTRAL = new Set(['CH', 'AT', 'IE', 'MT', 'VA', 'LI', 'SM', 'AD', 'MC', 'CR', 'PA', 'TM', 'MN', 'BT', 'CY']);
function seekAlliances(w: World, n: Nation, top: number, fear: number) {
  if (top < 0 || fear < 0.6 || n.atWar.length) return;
  if ((w.day + n.id) % 180 > 30) return;
  if (NEUTRAL.has(n.code) && fear < 1.2) return;
  if (n.occupiedByEnemy > 0) return; // frozen conflicts block accession
  const threat = w.nations[top];
  const partners = w.defensePartners(n.id);
  const covered = partners.reduce((s, p) => s + w.nations[p.id].power * p.c, 0);
  if (covered > threat.power * 0.9) return;
  // try a defence organisation first
  for (const org of w.orgs) {
    if (org.kind !== 'defense' || org.dissolved !== undefined || org.members.includes(n.id)) continue;
    const lead = w.nations[org.leader];
    if (w.getRel(lead.id, threat.id) > -20) continue;
    const near = org.members.some((m) => w.borderNations(n.id).has(m) || w.nations[m].region === n.region);
    if (!near) continue;
    if (org.founded > w.day - 365 * 2 && org.founded > -9999) continue;
    const lastJoin = (org as typeof org & { _lastJoin?: number })._lastJoin ?? -9999;
    if (w.day - lastJoin < 365 * 2) continue;
    const vetoes = org.members.filter((m) => w.getRel(m, n.id) < 5);
    const avg = org.members.reduce((s, m) => s + w.getRel(m, n.id), 0) / Math.max(1, org.members.length);
    if (vetoes.length) {
      if (w.rng.chance(0.15)) w.pushNews('alliance', 3, `${w.nations[vetoes[0]].short} blocks ${n.short}'s bid to join ${org.id}`, undefined, [n.id, vetoes[0]]);
      continue;
    }
    if (avg > 38 && fear > 0.75) {
      (org as typeof org & { _lastJoin?: number })._lastJoin = w.day;
      org.members.push(n.id);
      for (const m of org.members) w.addRel(m, n.id, 15);
      w.addRel(n.id, threat.id, -20);
      w.pushNews('alliance', 5, `${n.short} joins the ${org.name}`, `The accession expands the alliance to ${org.members.length} members, angering ${threat.short}.`, [n.id, org.leader, threat.id]);
      return;
    }
  }
  // bilateral protector
  const cands = w.nations.filter((k) => k.alive && !k.faction && k.id !== n.id && k.power > threat.power * 0.35 && w.getRel(k.id, n.id) > 25 && w.getRel(k.id, threat.id) < -10 && !partners.some((p) => p.id === k.id));
  cands.sort((a, b) => b.power * (w.getRel(b.id, n.id) + 50) - a.power * (w.getRel(a.id, n.id) + 50));
  const k = cands[0];
  if (!k) return;
  const load = w.treaties.filter((t) => t.until === undefined && t.type === 'defense' && (t.a === k.id || t.b === k.id) && t.since > w.day - 365 * 5).length;
  const value = Math.min(25, Math.sqrt(n.eco.gdp) * 0.8 + (n.power / Math.max(1, threat.power)) * 20);
  const interest = w.getRel(k.id, n.id) * 0.7 - w.getRel(k.id, threat.id) * 0.4 + value - (threat.nukes > 0 && k.nukes === 0 ? 40 : 0) - k.pol.weariness * 0.4 - load * 15 - (k.gov === 'fdem' || k.gov === 'dem' ? 10 : 0);
  if (interest > 70 && w.rng.chance(0.35)) {
    w.treaties.push({ id: w.treatySeq++, a: k.id, b: n.id, type: 'defense', commitment: clamp(interest / 140, 0.35, 0.8), since: w.day });
    w.addRel(k.id, n.id, 15); w.addRel(k.id, threat.id, -10);
    w.pushNews('alliance', 4, `${k.short} and ${n.short} sign mutual defence pact`, `The agreement is widely seen as a response to pressure from ${threat.short}.`, [k.id, n.id, threat.id]);
  }
}

function supportFriends(w: World, n: Nation) {
  if (n.eco.gdp < 150 || n.atWar.length > 0 && n.eco.gdp < 2000) return;
  for (const war of w.wars) {
    if (war.status !== 'active' || sideOf(war, n.id)) continue;
    for (const s of ['a', 'd'] as const) {
      const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
      const friend = w.nations[S.leader];
      const enemy = w.nations[O.leader];
      const rf = w.getRel(n.id, friend.id), re = w.getRel(n.id, enemy.id);
      if (rf < 40 || re > -5) continue;
      if (s === 'a' && war.type !== 'liberation' && friend.faction == null && rf < 70) continue; // rarely arm aggressors
      const amount = n.eco.gdp * 0.00011 * (rf - re) / 100 * (n.gov === 'fdem' || n.gov === 'dem' ? 1 : 0.6); // $B/month
      if (amount < 0.05) continue;
      const m = friend.mil;
      const b = baseline(friend);
      m.armor += amount * 5 * Math.min(1, n.tech / 8);
      m.artillery += amount * 6;
      m.ammo = Math.min(45, m.ammo + amount * 0.9);
      m.airDefense += amount * 0.25;
      m.aircraft += amount * 0.15 * (n.tech > 8 ? 1 : 0.3);
      m.aidReceived += amount;
      friend.eco.reserves += amount * 0.3;
      friend.mil.morale = clamp(friend.mil.morale + 0.003, 0, 1);
      w.addRel(n.id, friend.id, 0.6);
      w.addRel(n.id, enemy.id, -0.8);
      void b;
      if (amount > 1 && w.rng.chance(0.12)) w.pushNews('diplomacy', amount > 4 ? 4 : 3, `${n.short} announces $${amount < 10 ? amount.toFixed(1) : Math.round(amount)}B military aid package for ${friend.short}`, `The package includes ${w.rng.pick(['air-defence systems', 'artillery ammunition', 'armoured vehicles', 'long-range missiles', 'drones and electronic warfare kits'])}.`, [n.id, friend.id], undefined, war.id);
    }
  }
}

function joinOngoingWars(w: World, n: Nation) {
  if (n.pol.weariness > 50 || n.eco.gdp < 20) return;
  for (const war of w.wars) {
    if (war.status !== 'active' || sideOf(war, n.id) || war.type === 'civil' && war.d.leader !== n.id && w.getRel(n.id, war.d.leader) < 60) continue;
    for (const s of ['a', 'd'] as const) {
      const S = war[s], O = war[s === 'a' ? 'd' : 'a'];
      const friend = w.nations[S.leader], enemy = w.nations[O.leader];
      // obligation
      const pact = w.defensePartners(friend.id).find((p) => p.id === n.id);
      const rf = w.getRel(n.id, friend.id), re = w.getRel(n.id, enemy.id);
      let p = 0;
      if (pact && s === 'd') p = pact.c * 0.12 * (1 + (enemy.occupiedByEnemy > 0 ? 0 : 0.5));
      // opportunism: claims on enemy, and enemy is losing
      const claims = [...n.claims].filter((pid) => O.members.includes(w.provinces[pid].ctrl)).length;
      const losing = s === 'a' ? war.score > 25 : war.score < -25;
      if (claims && losing && re < -30) p += 0.06 * n.leader.hawk * w.settings.aggression;
      // ideological intervention: great powers backing friends who are losing badly
      const bloc = n.power + w.defensePartners(n.id).reduce((t, x) => t + w.nations[x.id].power * x.c * 0.4, 0);
      if (rf > 55 && re < -50 && (s === 'a' ? war.score < -40 : war.score > 40) && bloc > enemy.power * 0.8 && n.leader.hawk > 0.5) p += 0.04 * w.settings.aggression;
      if (enemy.nukes > 0 && n.nukes === 0) p *= 0.3;
      if (O.members.some((m) => w.getRel(n.id, m) > 30)) p *= 0.2;
      if (p > 0 && w.rng.chance(p)) {
        joinWar(w, war, n.id, s);
        if (claims) w.pushNews('war', 4, `${n.short} seizes the moment to press its claims against ${enemy.short}`, undefined, [n.id, enemy.id], undefined, war.id);
        return;
      }
    }
  }
}

function sanctionsReview(w: World, n: Nation) {
  if ((w.day + n.id) % 60 > 30) return;
  for (const o of w.nations) {
    if (!o.alive || o.id === n.id) continue;
    const k = n.id * MAX_NATIONS + o.id;
    const has = w.sanctions.has(k);
    const r = w.getRel(n.id, o.id);
    if (has && r > 0 && !aggressorNow(w, o.id)) { w.sanctions.delete(k); if (n.eco.gdp > 1000 && o.eco.gdp > 100) w.pushNews('diplomacy', 3, `${n.short} lifts sanctions on ${o.short}`, undefined, [n.id, o.id]); }
    else if (!has && r < -60 && (n.gov === 'fdem' || n.gov === 'dem') && n.eco.gdp > 200 && o.eco.gdp > 20 && w.rng.chance(0.05)) {
      w.sanctions.add(k);
      if (n.eco.gdp > 1000) w.pushNews('diplomacy', 3, `${n.short} imposes new sanctions on ${o.short}`, undefined, [n.id, o.id]);
    }
  }
}

function aggressorNow(w: World, id: number) { return w.wars.some((x) => x.status === 'active' && x.a.members.includes(id) && x.type !== 'liberation'); }

// ------------------------------------------------------------------ war planning
interface Plan { target: number; desire: number; type: WarType; goal: WarGoal; ratio: number }

export function evaluateTargets(w: World, n: Nation, land: Set<number>, sea: Set<number>): Plan[] {
  const out: Plan[] = [];
  const cands = new Set<number>([...land, ...sea]);
  if (projection(n) > 0.55) for (const o of w.nations) if (o.alive && w.getRel(n.id, o.id) < -60) cands.add(o.id);
  for (const id of cands) {
    const t = w.nations[id];
    if (!t.alive || t.faction || w.isEnemy(n.id, id) || w.areAllied(n.id, id)) continue;
    const rel = w.getRel(n.id, id);
    // distant targets must actually matter: a real rival, not a micro-state
    if (!land.has(id) && !sea.has(id) && (rel > -65 || (t.eco.gdp < 60 && t.power < n.power * 0.04))) continue;
    const help = allyHelp(w, t, n);
    const myHelp = w.defensePartners(n.id).reduce((s, p) => s + w.nations[p.id].power * p.c * 0.25, 0);
    let ratio = (n.power + myHelp) / Math.max(5, estimate(w, n, t) + help);
    if (!land.has(id)) {
      // amphibious operations are hard: the target's navy and its allies' fleets stand in the way
      const navD = t.navalPower + w.defensePartners(t.id).reduce((s, p) => s + w.nations[p.id].navalPower * p.c * projection(w.nations[p.id]), 0);
      ratio *= 0.3 + 0.35 * Math.min(1, n.navalPower / Math.max(1, navD * 2.5));
    }
    const claims = [...n.claims].filter((p) => w.provinces[p].ctrl === id);
    const claimValue = claims.reduce((s, p) => s + w.provinces[p].value, 0);
    const tValue = (w.ctrlList[id] || []).reduce((s, p) => s + w.provinces[p].value, 0) || 1;
    let d = n.ambition * 30 + n.leader.hawk * 25;
    d += Math.min(28, claims.length ? 12 + 30 * claimValue / tValue : 0);
    d += Math.max(0, -rel) * 0.35;
    if (t.atWar.length) d += 12;
    if (t.pol.stability < 30) d += 10;
    if (n.pol.stability < 35 && ['auth', 'jun', 'one', 'theo'].includes(n.gov)) d += 8;
    if (t.nukes > 0) d -= n.nukes > 0 ? 35 : 70;
    d -= n.pol.weariness * 0.5;
    if (w.day - n.ai.lastWarEnd < 900) d -= 30;
    if (n.gov === 'fdem') d -= 38; else if (n.gov === 'dem') d -= 24;
    d -= Math.min(15, n.eco.tradeOpen * 8) + (w.west[id] > 0.5 && n.eco.gdp < 3000 ? 8 : 0);
    if (n.atWar.length) d -= 25;
    if (rel > 0) d -= rel * 0.6;
    d -= 10; // international norms
    d *= w.settings.aggression;
    const adjacent = land.has(id);
    let type: WarType = 'invasion', goal: WarGoal = 'annex';
    if (!adjacent && !sea.has(id)) { type = 'punitive'; goal = 'punish'; }
    else if (claims.length && (ratio < 3.5 || n.leader.pragmatism > 0.5)) { type = 'border'; goal = 'claims'; }
    else if (w.west[n.id] * w.west[id] < -0.2 && ratio > 3) { type = 'invasion'; goal = 'regime'; }
    if (type === 'punitive') { d += 12; if (n.gov === 'fdem' || n.gov === 'dem') d += 10; } // stand-off strikes are cheap
    const need = type === 'border' ? 1.25 : type === 'punitive' ? 1.6 : 2.2;
    if (ratio < need) d -= (need - ratio) * 40;
    out.push({ target: id, desire: d, type, goal, ratio });
  }
  return out.sort((a, b) => b.desire - a.desire);
}

function warPlanning(w: World, n: Nation, land: Set<number>, sea: Set<number>) {
  if (n.eco.gdp < 3 || n.mil.active < 3) return;
  // ongoing buildup
  if (n.ai.buildup > 0) {
    const t = w.nations[n.ai.buildupTarget];
    if (!t || !t.alive || w.isEnemy(n.id, t.id)) { n.ai.buildup = 0; n.ai.buildupTarget = -1; return; }
    const plan = evaluateTargets(w, n, land, sea).find((p) => p.target === t.id);
    n.ai.buildup += 30;
    if (!plan || plan.desire < 42) {
      w.pushNews('diplomacy', 4, `${n.short} pulls troops back from the ${t.short} border; crisis eases`, `Diplomats credit ${deterrer(w, t, n)} for de-escalation.`, [n.id, t.id], t.capital);
      n.ai.buildup = 0; n.ai.buildupTarget = -1; n.ai.lastWarEnd = w.day - 600;
      w.addRel(n.id, t.id, 5);
      return;
    }
    if (n.ai.buildup >= 60 + w.rng.int(0, 60)) {
      n.ai.buildup = 0; n.ai.buildupTarget = -1;
      const surprise = !w.rng.chance(t.intel);
      declareWar(w, [n.id], [t.id], { type: plan.type, goal: plan.goal, surprise });
    }
    return;
  }
  if ((w.day + n.id * 13) % 60 > 30) return;
  const plans = evaluateTargets(w, n, land, sea);
  const best = plans[0];
  if (!best || best.desire < 50 + w.rng.next() * 14) return;
  // start a crisis: troops mass at the border
  n.ai.buildup = 1; n.ai.buildupTarget = best.target;
  if (n.mil.mobLevel < 2) n.mil.mobLevel = best.type === 'punitive' ? 1 : 2;
  const t = w.nations[best.target];
  const detected = w.rng.chance(clamp(t.intel + 0.2, 0, 1));
  if (detected) {
    t.mil.mobLevel = Math.max(t.mil.mobLevel, 1);
    t.mil.readiness = Math.min(1, t.mil.readiness + 0.15);
    for (const pid of w.ctrlList[t.id] || []) { const p = w.provinces[pid]; if (p.neighbors.some((q) => w.provinces[q].ctrl === n.id)) p.fort = Math.min(4, p.fort + 0.6); }
    const what = best.type === 'punitive' ? `${n.short} moves strike aircraft and missile batteries within range of ${t.short}` : `Satellite imagery shows ${n.short} massing forces on the ${t.short} border`;
    w.pushNews('war', 4, what, `${t.short} raises its alert level and calls on partners for support.`, [n.id, t.id], t.capital);
    // allies of target issue warnings, worsening relations with aggressor
    for (const pr of w.defensePartners(t.id)) w.addRel(pr.id, n.id, -8 * pr.c);
  }
}

function deterrer(w: World, t: Nation, n: Nation) {
  const p = w.defensePartners(t.id).sort((a, b) => w.nations[b.id].power - w.nations[a.id].power)[0];
  if (p) return `pressure from ${w.nations[p.id].short}`;
  void n;
  return 'back-channel talks';
}

function factionAi(w: World, n: Nation) {
  // rebels seek foreign backers
  if (!n.faction) return;
  for (const b of n.faction.backers) {
    const B = w.nations[b];
    if (!B.alive) continue;
    const amount = Math.min(1.5, B.eco.gdp * 0.0003);
    n.mil.armor += amount * 6;
    n.mil.ammo = Math.min(40, n.mil.ammo + 1.5);
    n.mil.aidReceived += amount;
  }
}

export function warsInvolving(w: World, id: number): War[] { return w.wars.filter((x) => x.status !== 'ended' && sideOf(x, id)); }
