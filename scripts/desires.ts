import fs from 'node:fs';
import { Sim } from '../src/sim/engine';
import { evaluateTargets } from '../src/sim/ai';
const data = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
const sim = new Sim(data, 5);
for (let d = 0; d < 365 * 2; d++) sim.step();
const w = sim.w;
const all: [string, number, number, string][] = [];
for (const n of w.nations) { if (!n.alive || n.faction) continue; for (const p of evaluateTargets(w, n, w.borderNations(n.id), w.seaNeighbors(n.id)).slice(0, 2)) all.push([n.code + '>' + w.nations[p.target].code, Math.round(p.desire), +p.ratio.toFixed(2), p.type]); }
all.sort((a, b) => b[1] - a[1]);
console.log(all.slice(0, 25).map((x) => x.join(' ')).join('\n'));
