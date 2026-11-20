import { useSyncExternalStore, useRef } from 'react';
import type { Sim } from './sim/engine';

export type MapMode = 'flags' | 'political' | 'alliances' | 'relations' | 'stability' | 'economy' | 'military' | 'terrain' | 'devastation' | 'population';
export type Panel = null | 'overview' | 'wars' | 'diplomacy' | 'rankings' | 'history' | 'sandbox' | 'settings';
export type Selection = { kind: 'nation'; id: number } | { kind: 'province'; id: number } | { kind: 'war'; id: number } | null;
export type Tool = null | { kind: 'transfer'; to: number; annex: boolean } | { kind: 'independence'; picks: number[] } | { kind: 'pickNation'; purpose: string; cb: (id: number) => void };

export interface UIState {
  speed: number;          // index into SPEEDS
  paused: boolean;
  mapMode: MapMode;
  panel: Panel;
  selection: Selection;
  hover: number;          // province id
  tool: Tool;
  warDialog: null | { attackers: number[]; defenders: number[] };
  search: boolean;
  replay: number | null;  // snapshot index when viewing history
  newsFilter: string;
  feedOpen: boolean;
  skipping: null | { target: number; start: number };
  tick: number;           // increments on throttled sim updates
  toasts: { id: number; title: string; body?: string; cat: string; at: number; nid?: number; prov?: number; war?: number }[];
  follow: boolean;
  showArrows: boolean;
  showLabels: boolean;
}

export const SPEEDS = [
  { label: '½ day/s', dps: 0.5 },
  { label: '1 day/s', dps: 1 },
  { label: '3 days/s', dps: 3 },
  { label: '1 week/s', dps: 7 },
  { label: '1 month/s', dps: 30 },
  { label: '3 months/s', dps: 91 },
  { label: '1 year/s', dps: 365 },
  { label: 'Max', dps: 5000 },
];

type Listener = () => void;

class Store {
  s: UIState = {
    speed: 2, paused: true, mapMode: 'flags', panel: null, selection: null, hover: -1, tool: null, warDialog: null, search: false,
    replay: null, newsFilter: 'all', feedOpen: typeof window === 'undefined' || window.innerWidth > 760, skipping: null, tick: 0, toasts: [], follow: false, showArrows: true, showLabels: true,
  };
  private ls = new Set<Listener>();
  get = () => this.s;
  set = (patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) => {
    const p = typeof patch === 'function' ? patch(this.s) : patch;
    this.s = { ...this.s, ...p };
    this.ls.forEach((l) => l());
  };
  subscribe = (l: Listener) => { this.ls.add(l); return () => { this.ls.delete(l); }; };
}

export const store = new Store();

export function useUI<T>(sel: (s: UIState) => T): T {
  const ref = useRef<{ v: T; s: UIState | null }>({ v: undefined as T, s: null });
  return useSyncExternalStore(store.subscribe, () => {
    const st = store.get();
    if (ref.current.s === st) return ref.current.v;
    const v = sel(st);
    if (ref.current.s && Object.is(v, ref.current.v)) { ref.current.s = st; return ref.current.v; }
    ref.current = { v, s: st };
    return v;
  });
}

// the simulation instance is a singleton outside React
export const app: { sim: Sim | null; flyTo: (lon: number, lat: number, zoom?: number) => void; flyToNation: (id: number) => void; requestRender: () => void } = {
  sim: null,
  flyTo: () => {},
  flyToNation: () => {},
  requestRender: () => {},
};

export function select(sel: Selection, fly = false) {
  store.set({ selection: sel });
  const sim = app.sim; if (!sim || !sel || !fly) return;
  const w = sim.w;
  if (sel.kind === 'nation') app.flyToNation(sel.id);
  else if (sel.kind === 'province') { const p = w.provinces[sel.id]; app.flyTo(p.lon, p.lat, 5); }
  else if (sel.kind === 'war') {
    const war = w.wars.find((x) => x.id === sel.id);
    if (war) {
      const flips = war.flips.slice(-5);
      const p = flips.length ? w.provinces[flips[flips.length - 1].p] : w.provinces[w.nations[war.d.leader].capital];
      if (p) app.flyTo(p.lon, p.lat, 3.5);
    }
  }
}
