import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { RNG, clamp } from './rng';
import type { Nation, Province, War, Org, Treaty, NewsItem, Market, Settings, Snapshot, Terrain, GovType, Leader, NewsCat } from './types';
import { NATION_SEEDS, MIL_OVERRIDE, OIL, GAS, FOOD, POP_GROWTH, CULTURE } from '../data/nations';
import { ORGS, TREATIES, RELATIONS, CLAIMS, EXTRA_CORES, OCCUPATIONS, FACTIONS } from '../data/world2026';
import { POOLS } from '../data/names';

export interface RawProvince { n: string; c: string; f: string; x: number; y: number; cx: number; cy: number; a: number; w: number; u: number; t: string; cap: number; co: number; s: number; d: string | 0; syn: number }
export interface WorldData { topology: Topology<{ provinces: GeometryCollection }>; provinces: RawProvince[]; sea: [number, number, number][] }

export const MAX_NATIONS = 420;

const OIL_FIELDS: [string, number, number, number][] = [
  ['RU', 73.4, 61.25, 0.45], ['RU', 76.6, 66.1, 0.2], ['RU', 55, 51.8, 0.1], ['RU', 68.2, 58.2, 0.1], ['RU', 142.7, 47, 0.05],
  ['SA', 50.1, 26.4, 0.9], ['IQ', 47.8, 30.5, 0.7], ['IQ', 44.4, 35.5, 0.25], ['IR', 48.7, 31.3, 0.8], ['US', -102.1, 32, 0.45],
  ['US', -95.4, 29.8, 0.15], ['US', -103, 48, 0.12], ['US', -148.5, 70.2, 0.06], ['US', -90, 29.9, 0.1], ['CA', -113.5, 53.5, 0.85],
  ['AE', 54.4, 24.2, 0.9], ['CN', 125, 46.6, 0.2], ['CN', 84.9, 45.6, 0.2], ['CN', 118.5, 37.4, 0.2], ['KZ', 51.9, 47.1, 0.7],
  ['LY', 19, 29, 0.7], ['NG', 7, 4.8, 0.9], ['VE', -71.6, 10.6, 0.4], ['VE', -64, 8.6, 0.6], ['BR', -41, -22.5, 0.9],
  ['MX', -92, 18.5, 0.8], ['NO', 5.7, 59, 0.9], ['GB', -2.1, 57.1, 0.9], ['DZ', 6, 31.7, 0.8], ['AO', 12.2, -5.5, 0.8],
  ['GY', -58.2, 6.8, 1], ['AZ', 49.9, 40.4, 1], ['KW', 47.9, 29.3, 1], ['QA', 51.5, 25.3, 1], ['OM', 56.5, 21, 0.9],
  ['SS', 31.6, 9.5, 1], ['SY', 40.5, 35.3, 1], ['EG', 29.5, 30.8, 0.6],
];

const FLAG_OK = new Set(NATION_SEEDS.map((s) => s.code));

const NAMED_COLORS: Record<string, string> = {
  US: '#3b6fb6', RU: '#b8483f', CN: '#c99a2e', IN: '#e08b3a', GB: '#c2465d', FR: '#4a63b8', DE: '#6b6f78', JP: '#d1d1d1',
  UA: '#e6c94a', PL: '#d9667a', TR: '#c44444', IR: '#4f9a5c', SA: '#2f8a52', BR: '#3faa5a', CA: '#cf5b5b', AU: '#e09b46',
};

export function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function nationColor(code: string, id: number) {
  if (NAMED_COLORS[code]) return NAMED_COLORS[code];
  const h = (hashStr(code) % 360 + id * 137.508) % 360;
  const s = 38 + (hashStr(code + 's') % 30);
  const l = 44 + (hashStr(code + 'l') % 20);
  return `hsl(${h.toFixed(0)} ${s}% ${l}%)`;
}

const WEST: Record<string, number> = { W: 0.9, w: 0.45, N: 0, r: -0.5, R: -0.95, c: -0.35, C: -0.8, X: -0.75 };

export class World {
  day = 0;
  seed: number;
  rng: RNG;
  nations: Nation[] = [];
  provinces: Province[] = [];
  wars: War[] = [];
  orgs: Org[] = [];
  treaties: Treaty[] = [];
  rel: Float32Array;
  relBase: Float32Array;
  west: Float32Array; // alignment axis -1..1 per nation
  sanctions = new Set<number>(); // a*MAX+b : a sanctions b
  news: NewsItem[] = [];
  newsSeq = 0;
  warSeq = 0;
  treatySeq = 0;
  market: Market;
  settings: Settings = { aggression: 1, nukes: false, events: 1, autoJoin: true, aiWars: true };
  snapshots: Snapshot[] = [];
  byCode = new Map<string, number>();
  ctrlDirty = true;
  ctrlList: number[][] = [];
  ownList: number[][] = [];
  flipped: { p: number; from: number; to: number; day: number }[] = [];
  enemy: Uint8Array; // war index: enemy[a*MAX+b] = 1 when at war
  beachheads = new Map<number, number>(); // province -> nation that landed there (sea/air supplied)
  flashes: { p: number; big: boolean }[] = []; // nuclear detonations for the renderer
  nukeSites: { p: number; day: number; by: number }[] = [];
  topology: WorldData['topology'];
  timeline: { day: number; title: string; cat: NewsCat; nations: number[]; prov?: number; war?: number }[] = [];
  warStats = { started: 0, ended: 0, totalCasualties: 0 };
  globalHist: { t: number[]; oil: number[]; food: number[]; tension: number[]; wars: number[]; worldGdp: number[] } = { t: [], oil: [], food: [], tension: [], wars: [], worldGdp: [] };
  onNews: ((n: NewsItem) => void) | null = null;

  constructor(data: WorldData, seed = 20261119) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.topology = data.topology;
    this.rel = new Float32Array(MAX_NATIONS * MAX_NATIONS);
    this.relBase = new Float32Array(MAX_NATIONS * MAX_NATIONS);
    this.west = new Float32Array(MAX_NATIONS);
    this.enemy = new Uint8Array(MAX_NATIONS * MAX_NATIONS);
    this.market = { oil: 74, food: 100, oilSupply: 0, oilDemand: 0, chokepoints: {}, globalCycle: 0, worldGrowth: 3, tension: 30 };
    this.initNations();
    this.initProvinces(data);
    this.initDerived();
    this.initDiplomacy();
  }

  // ------------------------------------------------------------------ init
  private initNations() {
    for (const s of NATION_SEEDS) {
      const id = this.nations.length;
      const tech = s.tech;
      const mo = MIL_OVERRIDE[s.code];
      const gdpPer = s.gdp / Math.max(0.01, s.active);
      const armor = mo ? mo[0] : Math.round(s.active * 1.1 * clamp(gdpPer / 2.5, 0.15, 1.4));
      const art = mo ? mo[1] : Math.round(s.active * 1.0 * clamp(gdpPer / 2.5, 0.15, 1.4));
      const air = mo ? mo[2] : Math.round(Math.min(s.active * 0.25, s.gdp * 0.08) * clamp(tech / 6, 0.3, 1.2));
      const ad = mo ? mo[3] : Math.round(Math.min(30, s.gdp * s.milPct / 100 * 0.6 + s.active * 0.01));
      const navy = mo ? mo[4] : Math.round(s.gdp * 0.004 * clamp(tech / 6, 0.3, 1.4));
      const gov = s.gov as GovType;
      const growth = POP_GROWTH[s.code] ?? defaultPopGrowth(s.region, s.gdp / Math.max(0.01, s.pop));
      const perCap = (s.gdp * 1000) / Math.max(0.001, s.pop);
      const potential = potentialGrowth(perCap, s.region);
      const n: Nation = {
        id, code: s.code, name: s.name, short: shortName(s.name), alive: true,
        flag: FLAG_OK.has(s.code) ? `flags/${s.code.toLowerCase()}.svg` : '',
        color: nationColor(s.code, id), region: s.region, align: s.align, culture: CULTURE[s.code] || 'west_af', gov,
        leader: null as unknown as Leader, faction: null,
        pop: s.pop, popGrowth: growth, area: 0, capital: -1, tech, techGrowth: 0, intel: clamp(0.25 + tech / 14 + (s.align === 'W' ? 0.08 : 0), 0.2, 0.95),
        ambition: ambitionOf(s.code, gov), nukes: s.nukes,
        eco: {
          gdp: s.gdp, potential, growth: potential, inflation: inflationOf(s.code, gov), unemployment: 6, debt: debtOf(s.code, perCap),
          reserves: s.gdp * 0.12, taxRate: taxOf(gov, perCap), milPct: s.milPct, milTarget: s.milPct, oilProd: OIL[s.code] || 0, gas: GAS[s.code] || 0,
          food: FOOD[s.code] ?? 0.95, industry: clamp(0.3 + tech / 9 + (['CN', 'DE', 'JP', 'KR', 'TW'].includes(s.code) ? 0.35 : 0), 0.2, 1.8),
          infrastructure: clamp(perCap / 50000 * 0.6 + 0.25, 0.15, 1), tradeOpen: tradeOpenOf(s.code, s.gdp), sanctions: 0, blockade: 0, cycle: 0, recession: false, recessionMonths: 0,
        },
        pol: {
          stability: stabilityOf(s.code, gov), legitimacy: 60, unrest: 20, warSupport: 50, nationalism: nationalismOf(s.code), repression: repressionOf(gov),
          rally: 0, weariness: 0, nextElection: 0, coupRisk: 0, refugees: 0, crisis: 0, lastRegimeChange: -9999,
        },
        mil: {
          active: s.active, reserves: s.reserve, mobilized: 0, mobLevel: 0, armor, artillery: art, aircraft: air, airDefense: ad, navy,
          missiles: Math.round(s.gdp * s.milPct / 100 * 0.3 + (['IR', 'KP', 'RU', 'CN', 'US', 'IL'].includes(s.code) ? 60 : 0)),
          ammo: 30, fuel: 1, quality: 1, training: trainingOf(s.code, gov, tech), readiness: 0.6, morale: 0.65, command: commandOf(s.code, gov, tech),
          experience: experienceOf(s.code), losses: 0, lossesEquip: 0, aidReceived: 0,
        },
        stats: { casualties: 0, civilian: 0, warsStarted: 0, warsWon: 0, warsLost: 0, provincesGained: 0, provincesLost: 0, peakArea: 0, startArea: 0, startGdp: s.gdp, startPop: s.pop },
        hist: { t: [], gdp: [], pop: [], power: [], area: [], stability: [], mil: [] },
        claims: new Set(),
        power: 0, landPower: 0, airPower: 0, navalPower: 0, provinceCount: 0, ownedCount: 0, occupiedByEnemy: 0, coreLostFrac: 0, atWar: [],
        ai: { threat: new Map(), target: -1, buildup: 0, buildupTarget: -1, lastWarEnd: -9999, lastDecision: -this.rng.int(0, 30), fear: 0, estimate: new Map(), crisisWith: -1 },
        created: 0, died: -1,
      };
      n.leader = this.makeLeader(n, 0, true);
      // every world is slightly different: personalities and ambitions vary per seed
      n.leader.hawk = clamp(n.leader.hawk + this.rng.normal(0, 0.07), 0.02, 0.98);
      n.ambition = clamp(n.ambition + this.rng.normal(0, 0.05), 0, 1);
      if (gov === 'fdem' || gov === 'dem' || gov === 'hyb') n.pol.nextElection = this.rng.int(60, 365 * 4);
      if (s.code === 'UA') { n.mil.mobLevel = 3; n.mil.mobilized = 0; n.pol.rally = 10; n.pol.weariness = 45; n.eco.growth = 2; n.mil.experience = 0.85; n.mil.morale = 0.55; n.mil.readiness = 0.95; }
      if (s.code === 'RU') { n.mil.mobLevel = 2; n.mil.mobilized = 250; n.pol.weariness = 30; n.mil.experience = 0.8; n.mil.readiness = 0.9; }
      this.nations.push(n);
      this.byCode.set(s.code, id);
      this.west[id] = WEST[s.align] ?? 0;
    }
  }

  private initProvinces(data: WorldData) {
    const geoms = data.topology.objects.provinces.geometries;
    const nb = topojson.neighbors(geoms as any);
    data.provinces.forEach((r, i) => {
      const nid = this.byCode.get(r.c);
      if (nid === undefined) throw new Error('unknown nation ' + r.c);
      const n = this.nations[nid];
      const p: Province = {
        id: i, name: r.n, feature: r.f, owner: nid, ctrl: nid, core: nid, core2: -1, lon: r.x, lat: r.y, cx: r.cx, cy: r.cy, area: r.a,
        pop: n.pop * r.w, gdp: 0, urban: r.u, terrain: r.t as Terrain, coast: !!r.co, capital: !!r.cap, dependency: r.d,
        neighbors: nb[i], sea: [], fort: 0, devast: 0, unrest: 10, separatism: Math.min(60, r.s), oil: 0, siege: 0, siegeBy: -1, supplied: true,
        encircledDays: 0, occupiedSince: -1, ownedSince: -9999, battle: 0, lastFlip: -9999, strategic: 1, value: 1,
      };
      this.provinces.push(p);
    });
    for (const [a, b, km] of data.sea) {
      this.provinces[a].sea.push({ to: b, km });
      this.provinces[b].sea.push({ to: a, km });
    }
    // per-nation shares
    const byNation: Province[][] = this.nations.map(() => []);
    for (const p of this.provinces) byNation[p.owner].push(p);
    for (const n of this.nations) {
      const list = byNation[n.id];
      const ws = list.reduce((s, p) => s + p.pop, 0) || 1;
      for (const p of list) {
        p.pop = n.pop * (p.pop / ws);
        // dependencies are economically lighter
        p.gdp = n.eco.gdp * (p.pop / n.pop) * (p.dependency ? 0.6 : 1);
      }
      const gs = list.reduce((s, p) => s + p.gdp, 0) || 1;
      for (const p of list) p.gdp *= n.eco.gdp / gs;
      // capital
      let cap = list.find((p) => p.capital && !p.dependency);
      if (!cap) cap = list.slice().sort((a, b) => b.pop - a.pop)[0];
      for (const p of list) p.capital = false;
      if (cap) { cap.capital = true; n.capital = cap.id; }
      // oil distribution
      const fields = OIL_FIELDS.filter((f) => f[0] === n.code);
      if (n.eco.oilProd > 0) {
        if (fields.length) {
          let assigned = 0;
          for (const [, lon, lat, share] of fields) {
            const best = list.reduce((b, p) => (dist(p.lon, p.lat, lon, lat) < dist(b.lon, b.lat, lon, lat) ? p : b), list[0]);
            best.oil += share; assigned += share;
          }
          if (assigned < 1) { const rest = (1 - assigned) / list.length; for (const p of list) p.oil += rest; }
        } else {
          const ta = list.reduce((s, p) => s + p.area, 0) || 1;
          for (const p of list) p.oil = p.area / ta;
        }
        for (const p of list) p.oil *= n.eco.oilProd; // absolute Mb/d per region
      }
      n.stats.startArea = list.reduce((s, p) => s + p.area, 0);
    }
    for (const p of this.provinces) {
      p.strategic = 1 + (p.capital ? 2 : 0) + (p.oil > 0.15 ? 1 : 0) + (p.urban > 1e6 ? 0.6 : 0) + (p.coast ? 0.2 : 0);
    }
  }

  private initDerived() {
    this.rebuildLists();
    for (const n of this.nations) { n.stats.peakArea = n.area; }
  }

  private initDiplomacy() {
    const N = this.nations.length;
    // computed baselines
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = this.nations[i], b = this.nations[j];
      let r = 40 * this.west[i] * this.west[j];
      if (a.region === b.region) r += 8;
      if (similarGov(a.gov, b.gov)) r += 6;
      if ((a.align === 'R' && b.align === 'C') || (a.align === 'C' && b.align === 'R')) r += 25;
      if ((a.align === 'X' && (b.align === 'R' || b.align === 'C')) || (b.align === 'X' && (a.align === 'R' || a.align === 'C'))) r += 20;
      r += this.rng.range(-6, 6);
      this.setRel(i, j, r);
    }
    // organisations
    for (const o of ORGS) {
      const members = o.members.map((c) => this.byCode.get(c)).filter((x): x is number => x !== undefined);
      this.orgs.push({ id: o.id, name: o.name, kind: o.kind, leader: this.byCode.get(o.leader)!, members, commitment: o.commitment, color: o.color, founded: -9999 });
      const bonus = o.kind === 'defense' ? 30 : o.kind === 'economic' ? 22 : 6;
      for (const a of members) for (const b of members) if (a < b) this.addRel(a, b, bonus);
    }
    for (const [ca, cb, type, c] of TREATIES) {
      const a = this.byCode.get(ca)!, b = this.byCode.get(cb)!;
      this.treaties.push({ id: this.treatySeq++, a, b, type, commitment: c, since: -9999 });
      this.addRel(a, b, type === 'defense' ? 25 : 12);
    }
    for (const [ca, cb, v] of RELATIONS) {
      const a = this.byCode.get(ca), b = this.byCode.get(cb);
      if (a === undefined || b === undefined) continue;
      this.setRel(a, b, v);
    }
    // neighbours friction
    for (const p of this.provinces) for (const q of p.neighbors) {
      const a = p.owner, b = this.provinces[q].owner;
      if (a < b) this.addRel(a, b, -0.15);
    }
    this.relBase.set(this.rel);

    // claims
    for (const [cc, tc, sel] of CLAIMS) {
      const c = this.byCode.get(cc)!, t = this.byCode.get(tc)!;
      for (const p of this.selectProvinces(t, sel)) this.nations[c].claims.add(p.id);
    }
    for (const [cc, oc, [lon, lat, r]] of EXTRA_CORES) {
      const c = this.byCode.get(cc)!, o = this.byCode.get(oc)!;
      for (const p of this.provinces) if (p.owner === o && dist(p.lon, p.lat, lon, lat) < r) { p.core = c; p.core2 = o; this.nations[c].claims.add(p.id); p.separatism = Math.max(p.separatism, 15); }
    }
    for (const [cc, oc, [lon, lat, r]] of OCCUPATIONS) {
      const c = this.byCode.get(cc)!, o = this.byCode.get(oc)!;
      for (const p of this.provinces) if (p.owner === o && dist(p.lon, p.lat, lon, lat) < r) { p.ctrl = c; p.occupiedSince = -900; p.devast = 0.45; p.fort = 3; }
    }
    // fortify the Ukrainian line
    const ua = this.byCode.get('UA')!, ru = this.byCode.get('RU')!;
    for (const p of this.provinces) {
      if (p.ctrl === ua && p.neighbors.some((q) => this.provinces[q].ctrl === ru)) { p.fort = 4.2; p.devast = Math.max(p.devast, 0.25); }
      if (p.ctrl === ru && p.owner === ua) p.fort = 3.2;
    }
    this.rebuildLists();
  }

  selectProvinces(owner: number, sel: 'all' | [number, number, number] | string): Province[] {
    const list = this.provinces.filter((p) => p.owner === owner);
    if (sel === 'all') return list;
    if (typeof sel === 'string') {
      if (sel.startsWith('w<')) { const lon = +sel.slice(2); return list.filter((p) => p.lon < lon); }
      if (sel.startsWith('feature:')) { const f = sel.slice(8); return list.filter((p) => p.feature === f); }
      return [];
    }
    const [lon, lat, r] = sel;
    const hits = list.filter((p) => dist(p.lon, p.lat, lon, lat) < r);
    if (hits.length) return hits;
    const near = list.slice().sort((a, b) => dist(a.lon, a.lat, lon, lat) - dist(b.lon, b.lat, lon, lat))[0];
    return near && dist(near.lon, near.lat, lon, lat) < r * 2.5 ? [near] : [];
  }

  factionSeeds() { return FACTIONS; }

  // ------------------------------------------------------------------ relations
  getRel(a: number, b: number) { return a === b ? 100 : this.rel[a * MAX_NATIONS + b]; }
  setRel(a: number, b: number, v: number) { v = clamp(v, -100, 100); this.rel[a * MAX_NATIONS + b] = v; this.rel[b * MAX_NATIONS + a] = v; }
  addRel(a: number, b: number, d: number) { if (a !== b) this.setRel(a, b, this.getRel(a, b) + d); }
  isEnemy(a: number, b: number) { return this.enemy[a * MAX_NATIONS + b] === 1; }
  sanctioning(a: number, b: number) { return this.sanctions.has(a * MAX_NATIONS + b); }

  rebuildWarIndex() {
    this.enemy.fill(0);
    for (const n of this.nations) n.atWar = [];
    for (const w of this.wars) {
      if (w.status !== 'active') continue;
      for (const a of w.a.members) for (const d of w.d.members) { this.enemy[a * MAX_NATIONS + d] = 1; this.enemy[d * MAX_NATIONS + a] = 1; }
      for (const m of [...w.a.members, ...w.d.members]) this.nations[m].atWar.push(w.id);
    }
  }

  defensePartners(a: number): { id: number; c: number; via: string }[] {
    const out = new Map<number, { id: number; c: number; via: string }>();
    for (const t of this.treaties) {
      if (t.until !== undefined || t.type !== 'defense') continue;
      if (t.a === a) out.set(t.b, { id: t.b, c: t.commitment, via: 'treaty' });
      else if (t.b === a) out.set(t.a, { id: t.a, c: t.commitment, via: 'treaty' });
    }
    for (const o of this.orgs) {
      if (o.dissolved !== undefined || o.kind !== 'defense' || !o.members.includes(a)) continue;
      for (const m of o.members) if (m !== a) { const prev = out.get(m); if (!prev || prev.c < o.commitment) out.set(m, { id: m, c: o.commitment, via: o.id }); }
    }
    return [...out.values()].filter((x) => this.nations[x.id].alive);
  }

  orgsOf(a: number) { return this.orgs.filter((o) => o.dissolved === undefined && o.members.includes(a)); }
  areAllied(a: number, b: number) { return this.defensePartners(a).some((x) => x.id === b); }

  // ------------------------------------------------------------------ territory
  rebuildLists() {
    const N = this.nations.length;
    this.ctrlList = Array.from({ length: N }, () => []);
    this.ownList = Array.from({ length: N }, () => []);
    for (const p of this.provinces) { this.ctrlList[p.ctrl].push(p.id); this.ownList[p.owner].push(p.id); }
    for (const n of this.nations) {
      const cl = this.ctrlList[n.id];
      n.provinceCount = cl.length;
      n.area = cl.reduce((s, i) => s + this.provinces[i].area, 0);
      n.ownedCount = this.ownList[n.id].length;
      n.occupiedByEnemy = this.ownList[n.id].filter((i) => this.provinces[i].ctrl !== n.id).length;
      let cores = 0, lost = 0;
      // occupied homeland hurts fully; land formally ceded long ago weighs less
      for (const p of this.provinces) if (p.core === n.id) { cores += p.pop + 0.01; if (p.ctrl !== n.id) lost += (p.pop + 0.01) * (p.owner === n.id ? 1 : this.day - p.ownedSince > 3650 ? 0.1 : 0.35); }
      n.coreLostFrac = cores ? lost / cores : 0;
      n.stats.peakArea = Math.max(n.stats.peakArea, n.area);
    }
    this.ctrlDirty = false;
  }

  setControl(pid: number, to: number, reason: 'capture' | 'treaty' | 'revolt' | 'user' | 'collapse' = 'capture') {
    const p = this.provinces[pid];
    const from = p.ctrl;
    if (from === to) return;
    p.ctrl = to;
    if (this.beachheads.has(pid) && this.beachheads.get(pid) !== to) this.beachheads.delete(pid);
    p.siege = 0; p.siegeBy = -1;
    p.lastFlip = this.day;
    p.encircledDays = 0;
    if (to !== p.owner) p.occupiedSince = this.day; else p.occupiedSince = -1;
    if (reason === 'capture') { p.fort = Math.min(p.fort, 0.6); p.devast = clamp(p.devast + 0.12, 0, 1); }
    this.flipped.push({ p: pid, from, to, day: this.day });
    this.ctrlDirty = true;
    this.nations[from].stats.provincesLost++;
    this.nations[to].stats.provincesGained++;
    if (p.capital && from === p.owner) this.onCapitalLost(from, pid);
  }

  setOwner(pid: number, to: number) {
    const p = this.provinces[pid];
    if (p.owner === to) return;
    if (p.capital) { p.capital = false; this.relocateCapital(p.owner); }
    p.owner = to;
    p.ownedSince = this.day;
    if (p.ctrl === to) p.occupiedSince = -1;
    this.flipped.push({ p: pid, from: p.ctrl, to: p.ctrl, day: this.day });
    this.ctrlDirty = true;
  }

  onCapitalLost(nid: number, pid: number) {
    const n = this.nations[nid];
    n.pol.stability = clamp(n.pol.stability - 18, 0, 100);
    n.mil.morale = clamp(n.mil.morale - 0.15, 0.05, 1);
    const moved = this.relocateCapital(nid, pid);
    const p = this.provinces[pid];
    this.pushNews('war', 5, `${this.nations[p.ctrl].short} forces capture ${n.short}'s capital, ${p.name}`,
      moved >= 0 ? `The government has relocated to ${this.provinces[moved].name}.` : `The government has collapsed into disarray.`, [nid, p.ctrl], pid);
  }

  relocateCapital(nid: number, lost = -1): number {
    const n = this.nations[nid];
    const cands = this.provinces.filter((p) => p.owner === nid && p.ctrl === nid && p.id !== lost);
    for (const p of this.provinces) if (p.owner === nid && p.id !== lost && p.capital) p.capital = false;
    if (!cands.length) { n.capital = lost; return -1; }
    const best = cands.reduce((b, p) => (p.pop * (p.core === nid ? 1 : 0.3) > b.pop * (b.core === nid ? 1 : 0.3) ? p : b), cands[0]);
    if (lost >= 0) this.provinces[lost].capital = false;
    best.capital = true;
    n.capital = best.id;
    return best.id;
  }

  // ------------------------------------------------------------------ leaders
  makeLeader(n: Nation, day: number, initial = false, mood?: { hawk?: number }): Leader {
    const pool = POOLS[n.culture] || POOLS.west_af;
    const f = this.rng.pick(pool.f), l = this.rng.pick(pool.l);
    const name = pool.order === 'lf' ? `${l} ${f}` : `${f} ${l}`;
    const autoc = ['auth', 'one', 'mon', 'jun', 'theo'].includes(n.gov);
    let hawk = clamp(this.rng.normal(autoc ? 0.55 : 0.4, 0.18) + (mood?.hawk ?? 0), 0.02, 0.98);
    if (initial) {
      const base: Record<string, number> = { RU: 0.82, KP: 0.85, IR: 0.72, CN: 0.62, IL: 0.75, US: 0.62, AZ: 0.65, VE: 0.6, TR: 0.6, PK: 0.6, IN: 0.55, ER: 0.7, RW: 0.6, SA: 0.5, ET: 0.55, UA: 0.6 };
      if (base[n.code] !== undefined) hawk = base[n.code];
    }
    const traits = hawk > 0.72 ? ['Hardliner', 'Nationalist', 'Militarist', 'Revanchist'] : hawk < 0.3 ? ['Dove', 'Reformer', 'Diplomat', 'Technocrat'] : ['Pragmatist', 'Populist', 'Centrist', 'Technocrat', 'Statesman'];
    return {
      name, title: leaderTitle(n), age: initial ? this.rng.int(48, 76) : this.rng.int(42, 70), since: initial ? -this.rng.int(200, 3000) : day,
      hawk, pragmatism: this.rng.range(0.25, 0.9), charisma: this.rng.range(0.2, 0.9), approval: this.rng.range(38, 62), trait: this.rng.pick(traits),
    };
  }

  // ------------------------------------------------------------------ news
  pushNews(cat: NewsCat, imp: number, title: string, body: string | undefined, nations: number[], prov?: number, war?: number) {
    const p = prov !== undefined && prov >= 0 ? this.provinces[prov] : undefined;
    const item: NewsItem = { id: this.newsSeq++, day: this.day, cat, imp, title, body, nations, prov: p ? p.id : undefined, war, loc: p ? [p.lon, p.lat] : nations.length ? this.capitalLoc(nations[0]) : undefined };
    this.news.push(item);
    if (this.news.length > 1500) this.news.splice(0, this.news.length - 1200);
    if (imp >= 4) {
      this.timeline.push({ day: this.day, title, cat, nations, prov: item.prov, war });
    }
    this.onNews?.(item);
    return item;
  }

  capitalLoc(nid: number): [number, number] | undefined {
    const n = this.nations[nid]; if (!n || n.capital < 0) return undefined;
    const p = this.provinces[n.capital]; return [p.lon, p.lat];
  }

  // ------------------------------------------------------------------ misc helpers
  nationsAlive() { return this.nations.filter((n) => n.alive); }
  isMajor(n: Nation) { return n.eco.gdp > 900 || n.power > 2500; }
  borderNations(nid: number): Set<number> {
    const s = new Set<number>();
    for (const pid of this.ctrlList[nid] || []) for (const q of this.provinces[pid].neighbors) { const c = this.provinces[q].ctrl; if (c !== nid) s.add(c); }
    return s;
  }
  seaNeighbors(nid: number): Set<number> {
    const s = new Set<number>();
    for (const pid of this.ctrlList[nid] || []) for (const l of this.provinces[pid].sea) { const c = this.provinces[l.to].ctrl; if (c !== nid) s.add(c); }
    return s;
  }
  distNations(a: number, b: number) {
    const A = this.capitalLoc(a), B = this.capitalLoc(b);
    if (!A || !B) return 10000;
    return dist(A[0], A[1], B[0], B[1]);
  }
}

export function dist(lon1: number, lat1: number, lon2: number, lat2: number) {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function shortName(name: string) {
  const map: Record<string, string> = { 'United States': 'USA', 'United Kingdom': 'UK', 'United Arab Emirates': 'UAE', 'Central African Republic': 'CAR', 'Republic of the Congo': 'Congo', 'Bosnia and Herzegovina': 'Bosnia', 'Saint Vincent': 'St Vincent', 'Saint Kitts and Nevis': 'St Kitts', 'Antigua and Barbuda': 'Antigua', 'Sao Tome and Principe': 'São Tomé', 'Trinidad and Tobago': 'Trinidad', 'Papua New Guinea': 'PNG', 'Dominican Republic': 'Dominican Rep.', 'North Macedonia': 'N. Macedonia', 'Equatorial Guinea': 'Eq. Guinea', 'Marshall Islands': 'Marshall Is.', 'Solomon Islands': 'Solomon Is.' };
  return map[name] || name;
}
function similarGov(a: GovType, b: GovType) {
  const dem = (g: GovType) => g === 'fdem' || g === 'dem';
  const aut = (g: GovType) => ['auth', 'one', 'mon', 'jun', 'theo'].includes(g);
  return (dem(a) && dem(b)) || (aut(a) && aut(b));
}
export function leaderTitle(n: Nation) {
  const t = NATION_SEEDS.find((s) => s.code === n.code)?.title || 'P';
  if (n.faction) return n.faction.kind === 'separatist' ? 'Chairman' : 'Commander';
  if (n.gov === 'jun') return 'General';
  if (n.gov === 'theo' && t === 'SL') return 'Supreme Leader';
  if (n.gov === 'one' && t === 'SL') return 'Chairman';
  const map: Record<string, string> = { P: 'President', PM: 'Prime Minister', C: 'Chancellor', K: 'King', E: 'Emir', S: 'Sultan', SL: 'Supreme Leader', PO: 'Pontiff' };
  if (n.gov === 'auth' && t === 'PM' && n.code !== 'ET') return 'Prime Minister';
  return map[t] || 'President';
}
function defaultPopGrowth(region: string, perCapK: number) {
  const base: Record<string, number> = { SSA: 2.5, NAf: 1.5, MEa: 1.5, SAs: 1.2, SEA: 0.8, CAs: 1.3, CAm: 0.8, SAm: 0.7, OCE: 1.0, EAs: 0, EEu: -0.4, WEu: 0.2, NA: 0.6 };
  return (base[region] ?? 1) - (perCapK > 30 ? 0.3 : 0);
}
function potentialGrowth(perCap: number, region: string) {
  // convergence: poorer economies grow faster
  let g = 1.4 + 3.6 * Math.exp(-perCap / 14000);
  if (region === 'SSA') g += 0.6;
  if (region === 'SAs' || region === 'SEA') g += 0.8;
  if (region === 'EEu') g -= 0.3;
  return clamp(g, 0.6, 6.5);
}
function ambitionOf(code: string, gov: GovType) {
  const m: Record<string, number> = { RU: 0.85, CN: 0.65, IR: 0.6, KP: 0.55, TR: 0.5, US: 0.45, AZ: 0.5, VE: 0.5, IN: 0.4, PK: 0.45, SA: 0.4, IL: 0.55, ET: 0.5, RW: 0.5, ER: 0.35, AE: 0.35, EG: 0.3, DZ: 0.3, MA: 0.35, RS: 0.35, HU: 0.25, UA: 0.3 };
  return m[code] ?? (['auth', 'jun', 'one', 'theo'].includes(gov) ? 0.28 : 0.12);
}
function inflationOf(code: string, gov: GovType) {
  const m: Record<string, number> = { AR: 35, TR: 32, VE: 120, IR: 35, ZW: 40, SD: 90, NG: 22, EG: 18, RU: 8, UA: 12, PK: 7, ET: 15, LB: 15, SS: 50, MM: 25, HT: 25, SY: 40, YE: 25, CU: 30, MW: 25, AO: 20, GH: 15 };
  return m[code] ?? (gov === 'fdem' ? 2.5 : 4.5);
}
function debtOf(code: string, perCap: number) {
  const m: Record<string, number> = { JP: 235, GR: 155, IT: 137, US: 123, FR: 113, SG: 170, GB: 101, CA: 107, ES: 102, BE: 104, PT: 96, CN: 90, BR: 88, IN: 82, AR: 80, EG: 90, LB: 150, SD: 200, VE: 160, ZM: 110, LA: 110, PK: 75, UA: 95, DE: 63, RU: 20, SA: 30, KR: 52, AU: 50, TR: 30, IR: 35, NG: 50, KZ: 25, NO: 40, CH: 38, SE: 33, ID: 40, MX: 58, ZA: 76 };
  return m[code] ?? clamp(35 + perCap / 2000, 25, 90);
}
function taxOf(gov: GovType, perCap: number) {
  return clamp(0.14 + perCap / 200000 + (gov === 'fdem' ? 0.06 : 0), 0.1, 0.42);
}
function tradeOpenOf(code: string, gdp: number) {
  const m: Record<string, number> = { SG: 3, LU: 3, IE: 2, NL: 1.5, BE: 1.5, AE: 1.6, VN: 1.6, MY: 1.3, CH: 1.2, HU: 1.6, CZ: 1.4, SK: 1.8, TW: 1.2, KR: 0.9, DE: 0.85, US: 0.25, CN: 0.37, JP: 0.45, BR: 0.35, IN: 0.45, RU: 0.45, KP: 0.1 };
  return m[code] ?? clamp(1.0 - Math.log10(gdp + 1) * 0.18, 0.3, 1.2);
}
function stabilityOf(code: string, gov: GovType) {
  const m: Record<string, number> = {
    HT: 12, SD: 18, SS: 22, SO: 22, YE: 18, SY: 28, LY: 30, AF: 40, MM: 22, ML: 30, BF: 26, NE: 32, CD: 25, CF: 25, LB: 35, PS: 25, VE: 38, UA: 52, IQ: 42,
    ET: 38, NG: 40, PK: 40, MZ: 40, CM: 42, TD: 35, BD: 45, NP: 45, MG: 40, BI: 40, GN: 42, IR: 42, CU: 42, NI: 45, ZW: 42, KP: 60, RU: 60, CN: 72, BY: 58,
    IL: 55, TR: 52, EG: 52, AR: 52, PE: 45, EC: 45, CO: 50, BO: 45, KE: 50, TN: 52, DZ: 55, GE: 50, AM: 50, RS: 58, BA: 45, XK: 55, MD: 52,
  };
  if (m[code] !== undefined) return m[code];
  return gov === 'fdem' ? 76 : gov === 'dem' ? 64 : gov === 'mon' ? 70 : gov === 'one' ? 65 : gov === 'hyb' ? 55 : gov === 'tran' ? 35 : 52;
}
function nationalismOf(code: string) {
  const m: Record<string, number> = { RU: 0.8, CN: 0.75, KP: 0.95, IR: 0.7, TR: 0.75, IN: 0.65, PK: 0.65, IL: 0.75, UA: 0.85, PL: 0.65, HU: 0.65, RS: 0.7, AZ: 0.75, AM: 0.75, JP: 0.5, KR: 0.6, VN: 0.7, GR: 0.6, US: 0.6, ET: 0.6, ER: 0.75, VE: 0.5, AR: 0.55, SA: 0.55, EG: 0.55, DZ: 0.6, MA: 0.6 };
  return m[code] ?? 0.45;
}
function repressionOf(gov: GovType) { return ({ fdem: 0.05, dem: 0.12, hyb: 0.35, auth: 0.7, one: 0.85, mon: 0.65, jun: 0.7, theo: 0.75, tran: 0.25, reb: 0.4 } as Record<GovType, number>)[gov]; }
function trainingOf(code: string, gov: GovType, tech: number) {
  const elite = ['US', 'GB', 'IL', 'FR', 'KR', 'FI', 'PL', 'TW', 'SG', 'AU', 'TR', 'JP', 'DE', 'CA', 'SE', 'NO', 'UA', 'IN', 'PK', 'GR'];
  return clamp(0.35 + tech / 22 + (elite.includes(code) ? 0.12 : 0) - (gov === 'jun' ? 0.05 : 0), 0.25, 0.95);
}
function commandOf(code: string, gov: GovType, tech: number) {
  const good = ['US', 'GB', 'IL', 'FR', 'FI', 'UA', 'AU', 'DE', 'PL', 'KR', 'TR', 'SG'];
  let c = 0.4 + tech / 30 + (good.includes(code) ? 0.12 : 0);
  if (gov === 'one' || gov === 'auth' || gov === 'theo') c -= 0.05;
  if (code === 'RU') c = 0.55;
  return clamp(c, 0.25, 0.92);
}
function experienceOf(code: string) {
  const m: Record<string, number> = { US: 0.6, IL: 0.75, TR: 0.5, GB: 0.5, FR: 0.5, PK: 0.5, IN: 0.45, IR: 0.4, AZ: 0.55, ET: 0.55, ER: 0.5, SA: 0.35, AE: 0.4, SD: 0.6, RW: 0.6, CO: 0.5, IQ: 0.5, SY: 0.6, AF: 0.6, MM: 0.6, ML: 0.5, NG: 0.45, EG: 0.35 };
  return m[code] ?? 0.2;
}
