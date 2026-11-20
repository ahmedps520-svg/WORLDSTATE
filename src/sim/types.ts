export type GovType = 'fdem' | 'dem' | 'hyb' | 'auth' | 'one' | 'mon' | 'jun' | 'theo' | 'tran' | 'reb';
export type Terrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'desert' | 'jungle' | 'arctic' | 'urban';

export interface Province {
  id: number;
  name: string;
  feature: string;
  owner: number;        // de jure
  ctrl: number;         // de facto controller
  core: number;         // national identity
  core2: number;        // secondary core (irredentist identity), -1 none
  lon: number; lat: number; // seed (city)
  cx: number; cy: number;   // centroid
  area: number;          // km²
  pop: number;           // millions
  gdp: number;           // $B (annual output)
  urban: number;         // largest city population
  terrain: Terrain;
  coast: boolean;
  capital: boolean;
  dependency: string | 0;
  neighbors: number[];
  sea: { to: number; km: number }[];
  fort: number;          // 0..5 fortification level
  devast: number;        // 0..1 war damage
  unrest: number;        // 0..100 local unrest / resistance
  separatism: number;    // 0..100
  oil: number;           // share of national oil production
  siege: number;         // 0..100 capture progress by the current attacker
  siegeBy: number;       // nation applying pressure (-1 none)
  supplied: boolean;     // connected to controller's supply network
  encircledDays: number;
  occupiedSince: number; // day occupied by ctrl (if ctrl != owner)
  ownedSince: number;
  battle: number;        // battle intensity recent (0..1), decays
  lastFlip: number;      // day of last control change
  strategic: number;     // strategic value multiplier
  value: number;         // derived economic/strategic value
}

export interface Leader {
  name: string;
  title: string;
  age: number;
  since: number;         // day took office
  hawk: number;          // 0 dove .. 1 hawk
  pragmatism: number;    // 0 ideologue .. 1 pragmatist
  charisma: number;
  approval: number;      // 0..100
  trait: string;
}

export interface MilitaryState {
  active: number;        // thousand personnel (regular)
  reserves: number;      // thousand trained reserves
  mobilized: number;     // thousand called up (in addition to active)
  mobLevel: number;      // 0 peace, 1 alert, 2 partial, 3 full
  armor: number;         // tanks/AFV (tank-equivalents)
  artillery: number;
  aircraft: number;
  airDefense: number;    // index
  navy: number;          // index (~10kt)
  missiles: number;      // precision strike stock (index)
  ammo: number;          // days of high-intensity combat stocks
  fuel: number;          // 0..1 fuel security
  quality: number;       // tech-derived multiplier
  training: number;      // 0..1
  readiness: number;     // 0..1
  morale: number;        // 0..1
  command: number;       // 0..1
  experience: number;    // 0..1
  losses: number;        // cumulative casualties (thousand)
  lossesEquip: number;   // cumulative armour lost
  aidReceived: number;   // $B lifetime
}

export interface Economy {
  gdp: number;           // $B nominal, recomputed from provinces
  potential: number;     // trend growth % / yr
  growth: number;        // current annualised growth %
  inflation: number;     // %
  unemployment: number;  // %
  debt: number;          // % of GDP
  reserves: number;      // $B treasury / FX reserves
  taxRate: number;       // revenue share of GDP
  milPct: number;        // % GDP to defence (current)
  milTarget: number;     // % GDP desired
  oilProd: number;       // Mb/d nominal capacity
  gas: number;
  food: number;          // grain self sufficiency
  industry: number;      // 0..2 industrial capacity index
  infrastructure: number;// 0..1
  tradeOpen: number;     // trade / gdp
  sanctions: number;     // 0..1 pressure from sanctions
  blockade: number;      // 0..1 maritime blockade
  cycle: number;         // business cycle state
  recession: boolean;
  recessionMonths: number;
}

export interface Politics {
  stability: number;     // 0..100
  legitimacy: number;    // 0..100
  unrest: number;        // 0..100
  warSupport: number;    // 0..100
  nationalism: number;   // 0..1
  repression: number;    // 0..1
  rally: number;         // rally-round-flag temporary bonus
  weariness: number;     // 0..100 war weariness
  nextElection: number;  // day (democracies)
  coupRisk: number;      // derived 0..1
  refugees: number;      // millions hosted
  crisis: number;        // days in acute crisis
  lastRegimeChange: number;
}

export interface NationStats {
  casualties: number;    // thousand total (military + civilian)
  civilian: number;
  warsStarted: number;
  warsWon: number;
  warsLost: number;
  provincesGained: number;
  provincesLost: number;
  peakArea: number;
  startArea: number;
  startGdp: number;
  startPop: number;
}

export interface History {
  t: number[];           // day index of sample
  gdp: number[];
  pop: number[];
  power: number[];
  area: number[];
  stability: number[];
  mil: number[];
}

export interface Nation {
  id: number;
  code: string;          // ISO alpha2 or generated
  name: string;
  short: string;
  alive: boolean;
  flag: string;          // url (svg) or generated key
  flagColors?: string[]; // for generated flags
  flagDesign?: number;
  color: string;
  region: string;
  align: string;         // starting alignment family
  culture: string;
  gov: GovType;
  leader: Leader;
  faction: null | { parent: number; kind: 'insurgent' | 'separatist' | 'government'; backers: number[] };
  pop: number;           // millions (derived)
  popGrowth: number;     // % per year
  area: number;
  capital: number;       // province id
  tech: number;
  techGrowth: number;
  intel: number;         // 0..1
  ambition: number;      // 0..1 revisionism
  nukes: number;
  eco: Economy;
  pol: Politics;
  mil: MilitaryState;
  stats: NationStats;
  hist: History;
  claims: Set<number>;   // province ids
  // derived each tick
  power: number;         // overall military power index
  landPower: number;
  airPower: number;
  navalPower: number;
  provinceCount: number;
  ownedCount: number;
  occupiedByEnemy: number; // owned provinces controlled by someone else
  coreLostFrac: number;
  atWar: number[];       // war ids
  // AI
  ai: {
    threat: Map<number, number>;
    target: number;      // nation planning against (-1)
    buildup: number;     // days of buildup
    buildupTarget: number;
    lastWarEnd: number;
    lastDecision: number;
    fear: number;        // max threat
    estimate: Map<number, number>; // intel misestimation factor per nation
    crisisWith: number;
  };
  created: number;
  died: number;
  deathCause?: string;
  successorOf?: number;
}

export interface Org {
  id: string;
  name: string;
  kind: 'defense' | 'economic' | 'political';
  leader: number;
  members: number[];
  commitment: number;
  color: string;
  founded: number;
  dissolved?: number;
}

export interface Treaty {
  id: number;
  a: number; b: number;
  type: 'defense' | 'nap' | 'partnership' | 'access' | 'guarantee' | 'ceasefire';
  commitment: number;
  since: number;
  until?: number;
  broken?: boolean;
}

export type WarType = 'invasion' | 'border' | 'intervention' | 'punitive' | 'civil' | 'independence' | 'liberation';
export type WarGoal = 'annex' | 'claims' | 'regime' | 'punish' | 'independence' | 'liberate' | 'overthrow' | 'defend';

export interface WarSide {
  leader: number;
  members: number[];
  goal: WarGoal;
  exhaustion: number;   // 0..100
  casualties: number;   // thousand
  lossesEquip: number;
  provincesTaken: number;
  joined: Map<number, number>; // nation -> day
}

export interface War {
  id: number;
  name: string;
  type: WarType;
  a: WarSide;           // attackers
  d: WarSide;           // defenders
  start: number;
  end?: number;
  status: 'active' | 'ceasefire' | 'ended';
  score: number;        // -100..100 attacker perspective
  targets: number[];    // province ids attackers want (claims / limited goals)
  maxDepth: number;     // for border wars: allowed advance depth
  outcome?: string;
  ceasefireDay?: number;
  stalemateDays: number;
  lastChange: number;
  peaceAttempts: number;
  civilian: number;
  flips: { day: number; p: number; from: number; to: number }[];
  airCampaign: number;  // strike intensity 0..1 (punitive)
  nuclear: boolean;
  initiatedByUser: boolean;
  casusBelli: string;
  allowTreaty?: boolean;     // may end in a negotiated peace (cession / white peace)
  allowCeasefire?: boolean;  // may end in a ceasefire
  nukesAllowed?: boolean;    // nuclear weapons authorised for this war
  nukeCount?: number;
  userCeasefire?: boolean;   // ceasefire imposed by the player: holds until the player resumes the war
}

export type NewsCat = 'war' | 'battle' | 'diplomacy' | 'politics' | 'economy' | 'disaster' | 'alliance' | 'world';
export interface NewsItem {
  id: number;
  day: number;
  cat: NewsCat;
  imp: number;          // 1..5
  title: string;
  body?: string;
  nations: number[];
  loc?: [number, number];
  prov?: number;
  war?: number;
}

export interface Snapshot { day: number; ctrl: Uint16Array; owner: Uint16Array }

export interface Settings {
  aggression: number;   // 0..2 global AI aggression multiplier
  nukes: boolean;       // allow nuclear escalation
  events: number;       // random event frequency multiplier
  autoJoin: boolean;    // allies honour treaties automatically
  aiWars: boolean;      // AI may start wars on its own
}

export interface Market {
  oil: number;          // $/bbl
  food: number;         // index 100 = baseline
  oilSupply: number;
  oilDemand: number;
  chokepoints: Record<string, { open: number; by: number }>;
  globalCycle: number;
  worldGrowth: number;
  tension: number;      // 0..100
}
