import { World, type WorldData, MAX_NATIONS, dist } from './world';
import { militaryTick, computePowers, baseline } from './military';
import { warTick, declareWar, endWar, joinWar, provinceValue, killNation, type PeaceTerms } from './war';
import { economyDaily, economyMonthly, updateMarket, initMarket, globalEconomyMonthly } from './economy';
import { politicsMonthly, politicsDaily, spawnNation, reviveCheck, killIfEmpty, coup, revolution, startCivilWar, shiftAlignment } from './politics';
import { aiMonthly } from './ai';
import { eventsDaily } from './events';
import { isMonthStart } from './calendar';
import type { WarType, WarGoal, GovType } from './types';
import { clamp } from './rng';

export class Sim {
  w: World;
  version = 0;
  constructor(data: WorldData, seed?: number, scenario: 'present' | 'clean' = 'present') {
    this.w = new World(data, seed);
    for (const n of this.w.nations) { computePowers(n); baseline(n); }
    for (const p of this.w.provinces) p.value = provinceValue(p);
    initMarket(this.w);
    if (scenario === 'present') this.setupPresent();
    else this.cleanSlate();
    this.sample();
    this.snapshot();
  }

  private cleanSlate() {
    const w = this.w;
    for (const p of w.provinces) { if (p.ctrl !== p.owner) p.ctrl = p.owner; p.fort = 0; p.devast = 0; p.occupiedSince = -1; }
    for (const n of w.nations) { n.mil.mobLevel = 0; n.mil.mobilized = 0; n.pol.weariness = 0; }
    const ua = w.nations[w.byCode.get('UA')!]; ua.eco.milPct = ua.eco.milTarget = 3; ua.mil.active = 250;
    w.rebuildLists();
    w.pushNews('world', 3, 'WORLDSTATE initialised — clean slate', 'All borders at their de jure lines; no active conflicts.', []);
  }

  private setupPresent() {
    const w = this.w;
    const ru = w.byCode.get('RU')!, ua = w.byCode.get('UA')!;
    const war = declareWar(w, [ru], [ua], { type: 'invasion', goal: 'claims', callAllies: false, casusBelli: 'The war that began in February 2022 grinds on' });
    if (war) {
      war.name = 'Russia–Ukraine War';
      war.start = -1730; // 24 Feb 2022
      war.a.exhaustion = 38; war.d.exhaustion = 45;
      (war as typeof war & { _exFloor?: { a: number; d: number } })._exFloor = { a: 15, d: 18 };
      war.a.casualties = 900; war.d.casualties = 400; war.civilian = 14000 / 1000;
      war.targets = [...w.nations[ru].claims].filter((p) => w.provinces[p].owner === ua);
      war.flips = [];
    }
    // proxy support
    for (const c of ['US', 'GB', 'DE', 'FR', 'PL', 'CA', 'NL', 'SE', 'FI', 'DK', 'NO', 'JP', 'AU', 'IT', 'EE', 'LT', 'LV', 'CZ', 'BE', 'ES']) {
      const id = w.byCode.get(c)!;
      w.sanctions.add(id * MAX_NATIONS + ru);
    }
    // existing civil wars / insurgencies
    for (const f of w.factionSeeds()) {
      const parent = w.nations[w.byCode.get(f.parent)!];
      const provs = w.provinces.filter((p) => p.owner === parent.id && !p.capital && (Array.isArray(f.select)
        ? f.select.some(([lon, lat, r]) => dist(p.lon, p.lat, lon, lat) < r)
        : ((f.select.lonLt === undefined || p.lon < f.select.lonLt) && (f.select.latGt === undefined || p.lat > f.select.latGt) && (f.select.lonGt === undefined || p.lon > f.select.lonGt))));
      if (!provs.length) continue;
      const backers = f.backers.map((c) => w.byCode.get(c)!).filter((x) => x !== undefined);
      const fac = spawnNation(w, parent, provs.map((p) => p.id), 'insurgent', false, { name: f.name, short: f.short, colors: f.colors, backers, strength: f.id === 'RSF' ? 0.5 : f.id === 'NUG' ? 0.42 : 0.3 });
      if (fac) {
        const fw = w.wars.find((x) => x.a.leader === fac.id && x.status === 'active');
        if (fw) { fw.start = -this.w.rng.int(400, 1200); fw.name = `${parent.short} Civil War`; }
        for (const p of provs) { p.devast = 0.2; }
      }
    }
    w.news = w.news.filter((n) => n.imp >= 4).map((n) => ({ ...n, day: 0 }));
    w.timeline = [];
    w.pushNews('world', 4, 'WORLDSTATE initialised — 19 November 2026', 'Four wars are active. 196 governments are pursuing their own interests. The simulation is live.', []);
    w.rebuildLists();
  }

  /** advance one simulated day */
  step() {
    const w = this.w;
    w.day++;
    const day = w.day;
    if (w.ctrlDirty) { w.rebuildLists(); for (const p of w.provinces) p.value = provinceValue(p); }
    for (const n of w.nations) if (n.alive) militaryTick(w, n);
    warTick(w);
    if (w.ctrlDirty) w.rebuildLists();
    economyDaily(w);
    for (const n of w.nations) {
      if (!n.alive) continue;
      if ((n.id + day) % 30 === 0) { economyMonthly(w, n); politicsMonthly(w, n); }
      if ((n.id * 7 + day) % 30 === 0) aiMonthly(w, n);
      politicsDaily(w, n);
    }
    eventsDaily(w);
    if (day % 7 === 0) updateMarket(w);
    if (day % 30 === 0) { globalEconomyMonthly(w); reviveCheck(w); killIfEmpty(w); }
    if (isMonthStart(day)) this.sample();
    if (day % 30 === 0) this.snapshot();
    this.version++;
  }

  sample() {
    const w = this.w;
    for (const n of w.nations) {
      if (!n.alive && n.hist.t.length && n.hist.t[n.hist.t.length - 1] > n.died) continue;
      const h = n.hist;
      h.t.push(w.day); h.gdp.push(+n.eco.gdp.toFixed(2)); h.pop.push(+n.pop.toFixed(3)); h.power.push(Math.round(n.power));
      h.area.push(Math.round(n.area)); h.stability.push(Math.round(n.pol.stability)); h.mil.push(Math.round(n.mil.active + n.mil.mobilized));
    }
    const g = w.globalHist;
    g.t.push(w.day); g.oil.push(+w.market.oil.toFixed(1)); g.food.push(Math.round(w.market.food)); g.tension.push(Math.round(w.market.tension));
    g.wars.push(w.wars.filter((x) => x.status === 'active').length); g.worldGdp.push(Math.round(w.nations.reduce((s, n) => s + (n.alive ? n.eco.gdp : 0), 0)));
  }

  snapshot() {
    const w = this.w;
    const ctrl = new Uint16Array(w.provinces.length), owner = new Uint16Array(w.provinces.length);
    w.provinces.forEach((p, i) => { ctrl[i] = p.ctrl; owner[i] = p.owner; });
    const last = w.snapshots[w.snapshots.length - 1];
    if (last && last.ctrl.every((v, i) => v === ctrl[i]) && last.owner.every((v, i) => v === owner[i])) return;
    w.snapshots.push({ day: w.day, ctrl, owner });
  }

  // ------------------------------------------------------------------ sandbox API
  startWar(attackers: number[], defenders: number[], type: WarType, goal: WarGoal, callAllies: boolean) {
    const w = this.w;
    const war = declareWar(w, attackers, defenders, { type, goal, callAllies, user: true });
    if (war) for (const m of attackers.slice(1)) joinWar(w, war, m, 'a', true);
    this.version++;
    return war;
  }
  forcePeace(warId: number, terms: PeaceTerms, winner: 'a' | 'd') {
    const war = this.w.wars.find((x) => x.id === warId); if (!war || war.status === 'ended') return;
    if (war.status === 'ceasefire') { war.status = 'active'; this.w.rebuildWarIndex(); }
    endWar(this.w, war, winner, terms); this.version++;
  }
  joinWar(warId: number, nid: number, side: 'a' | 'd') {
    const war = this.w.wars.find((x) => x.id === warId); if (!war) return;
    joinWar(this.w, war, nid, side); this.version++;
  }
  createAlliance(name: string, members: number[]) {
    const w = this.w;
    const leader = members.slice().sort((a, b) => w.nations[b].power - w.nations[a].power)[0];
    const id = name.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 6) || 'ALLY';
    w.orgs.push({ id, name, kind: 'defense', leader, members: [...members], commitment: 0.8, color: `hsl(${w.rng.int(0, 359)} 70% 60%)`, founded: w.day });
    for (const a of members) for (const b of members) if (a < b) { w.addRel(a, b, 30); w.relBase[a * MAX_NATIONS + b] += 25; w.relBase[b * MAX_NATIONS + a] += 25; }
    w.pushNews('alliance', 5, `${name} founded`, `Members: ${members.map((m) => w.nations[m].short).join(', ')}.`, members);
    this.version++;
  }
  defensePact(a: number, b: number) {
    const w = this.w;
    w.treaties.push({ id: w.treatySeq++, a, b, type: 'defense', commitment: 0.75, since: w.day });
    w.addRel(a, b, 25);
    w.pushNews('alliance', 4, `${w.nations[a].short} and ${w.nations[b].short} sign mutual defence treaty`, undefined, [a, b]);
    this.version++;
  }
  leaveOrg(orgId: string, nid: number) {
    const o = this.w.orgs.find((x) => x.id === orgId); if (!o) return;
    o.members = o.members.filter((m) => m !== nid);
    this.w.pushNews('alliance', 4, `${this.w.nations[nid].short} leaves the ${o.name}`, undefined, [nid]);
    this.version++;
  }
  setRelation(a: number, b: number, v: number) {
    const w = this.w;
    w.setRel(a, b, v);
    w.relBase[a * MAX_NATIONS + b] = w.relBase[b * MAX_NATIONS + a] = v;
    this.version++;
  }
  toggleSanction(a: number, b: number) {
    const w = this.w; const k = a * MAX_NATIONS + b;
    if (w.sanctions.has(k)) w.sanctions.delete(k); else { w.sanctions.add(k); w.addRel(a, b, -15); w.pushNews('diplomacy', 3, `${w.nations[a].short} imposes sanctions on ${w.nations[b].short}`, undefined, [a, b]); }
    this.version++;
  }
  transferProvince(pid: number, to: number, annex: boolean) {
    const w = this.w;
    w.setControl(pid, to, 'user');
    if (annex) w.setOwner(pid, to);
    w.rebuildLists();
    this.version++;
  }
  triggerCoup(nid: number) { coup(this.w, this.w.nations[nid], true); this.version++; }
  triggerRevolution(nid: number) { revolution(this.w, this.w.nations[nid]); this.version++; }
  triggerCivilWar(nid: number) { startCivilWar(this.w, this.w.nations[nid], 'insurgent', 'a breakdown of state authority'); this.version++; }
  declareIndependence(pids: number[]) {
    const w = this.w; const parent = w.nations[w.provinces[pids[0]].owner];
    spawnNation(w, parent, pids, 'separatist', false); this.version++;
  }
  setGov(nid: number, gov: GovType) {
    const n = this.w.nations[nid]; n.gov = gov; n.pol.lastRegimeChange = this.w.day;
    if (gov === 'fdem' || gov === 'dem' || gov === 'hyb') n.pol.nextElection = this.w.day + 365 * 4; else n.pol.nextElection = 0;
    this.version++;
  }
  setLeaderStance(nid: number, hawk: number) { this.w.nations[nid].leader.hawk = clamp(hawk, 0, 1); this.version++; }
  shiftAlign(nid: number, d: number) { shiftAlignment(this.w, this.w.nations[nid], d); this.version++; }
  economicShock(nid: number, pct: number) {
    const w = this.w; const n = w.nations[nid];
    for (const p of w.ctrlList[nid] || []) w.provinces[p].gdp *= 1 + pct / 100;
    n.eco.cycle += pct / 5;
    w.pushNews('economy', 4, pct < 0 ? `Financial crash devastates ${n.short}` : `${n.short} economy booms`, undefined, [nid]);
    this.version++;
  }
  militaryAid(from: number, to: number, billions: number) {
    const w = this.w; const t = w.nations[to];
    t.mil.armor += billions / 0.008 * 0.3; t.mil.artillery += billions / 0.003 * 0.2; t.mil.ammo = Math.min(45, t.mil.ammo + 10); t.mil.aircraft += billions * 0.4; t.mil.airDefense += billions * 0.2;
    t.mil.aidReceived += billions; w.addRel(from, to, 10);
    w.pushNews('diplomacy', 3, `${w.nations[from].short} sends $${billions}B in military aid to ${t.short}`, undefined, [from, to]);
    computePowers(t); this.version++;
  }
  mobilize(nid: number, level: number) { this.w.nations[nid].mil.mobLevel = clamp(level, 0, 3); this.version++; }
  setMilSpending(nid: number, pct: number) { const e = this.w.nations[nid].eco; e.milTarget = pct; this.version++; }
  fortify(nid: number) { for (const p of this.w.ctrlList[nid] || []) { const pr = this.w.provinces[p]; if (pr.neighbors.some((q) => this.w.provinces[q].ctrl !== nid)) pr.fort = Math.min(5, pr.fort + 1.5); } this.version++; }
  annexNation(victor: number, victim: number) {
    const w = this.w;
    for (const p of w.provinces) if (p.owner === victim || p.ctrl === victim) { w.setControl(p.id, victor, 'user'); w.setOwner(p.id, victor); }
    killNation(w, victim, `annexed by ${w.nations[victor].short}`);
    w.rebuildLists(); this.version++;
  }
}
