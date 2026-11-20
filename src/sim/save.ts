import type { Sim } from './engine';
import { initMarket } from './economy';

// Tagged JSON so Maps, Sets and typed arrays survive a round trip.
function replacer(_k: string, v: unknown) {
  if (v instanceof Map) return { __t: 'M', v: [...v.entries()] };
  if (v instanceof Set) return { __t: 'S', v: [...v] };
  if (v instanceof Float32Array) return { __t: 'F', v: Array.from(v, (x) => Math.round(x * 100) / 100) };
  if (v instanceof Uint16Array) return { __t: 'U', v: Array.from(v) };
  if (v instanceof Uint8Array) return { __t: 'B', v: Array.from(v) };
  return v;
}
function reviver(_k: string, v: any) {
  if (v && typeof v === 'object' && v.__t) {
    switch (v.__t) {
      case 'M': return new Map(v.v);
      case 'S': return new Set(v.v);
      case 'F': return Float32Array.from(v.v);
      case 'U': return Uint16Array.from(v.v);
      case 'B': return Uint8Array.from(v.v);
    }
  }
  return v;
}

const FIELDS = ['day', 'seed', 'nations', 'provinces', 'wars', 'orgs', 'treaties', 'rel', 'relBase', 'west', 'sanctions', 'news', 'newsSeq', 'warSeq', 'treatySeq', 'market', 'settings', 'snapshots', 'timeline', 'warStats', 'globalHist'] as const;

export function serialize(sim: Sim): string {
  const w = sim.w as unknown as Record<string, unknown>;
  const o: Record<string, unknown> = { v: 1, rng: sim.w.rng.s };
  for (const f of FIELDS) o[f] = w[f];
  return JSON.stringify(o, replacer);
}

export function deserialize(sim: Sim, text: string) {
  const o = JSON.parse(text, reviver);
  if (o.v !== 1) throw new Error('Unsupported save version');
  const w = sim.w as unknown as Record<string, unknown>;
  for (const f of FIELDS) if (o[f] !== undefined) w[f] = o[f];
  sim.w.rng.s = o.rng;
  sim.w.byCode = new Map(sim.w.nations.map((n) => [n.code, n.id]));
  sim.w.flipped = [];
  initMarket(sim.w);
  sim.w.rebuildWarIndex();
  sim.w.rebuildLists();
  sim.version++;
}
