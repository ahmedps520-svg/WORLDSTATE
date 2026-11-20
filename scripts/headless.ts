import fs from 'node:fs';
import { Sim } from '../src/sim/engine';
import { fmtDate } from '../src/sim/calendar';

const data = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
const years = +(process.argv[2] || 5);
const seed = +(process.argv[3] || 1);
const t0 = Date.now();
const sim = new Sim(data, seed);
const w = sim.w;
console.log('init ms', Date.now() - t0);
const t1 = Date.now();
let lastLog = 0;
for (let d = 0; d < years * 365; d++) {
  sim.step();
}
console.log('ms/day', ((Date.now() - t1) / (years * 365)).toFixed(3));
const imp = w.news.filter((n) => n.imp >= 4);
for (const n of imp.slice(-120)) console.log(fmtDate(n.day), `[${n.cat}]`, n.title);
console.log('--- wars');
for (const war of w.wars) console.log(war.name, war.status, fmtDate(war.start), war.end ? fmtDate(war.end) : '', 'score', war.score.toFixed(0), 'cas', Math.round(war.a.casualties), Math.round(war.d.casualties), 'flips', war.flips.length, war.outcome || '', 'exh', war.a.exhaustion.toFixed(0), war.d.exhaustion.toFixed(0));
console.log('--- top power');
const top = w.nations.filter((n) => n.alive).sort((a, b) => b.power - a.power).slice(0, 15);
for (const n of top) console.log(n.code, Math.round(n.power), 'gdp', Math.round(n.eco.gdp), 'g', n.eco.growth.toFixed(1), 'inf', n.eco.inflation.toFixed(1), 'stab', n.pol.stability.toFixed(0), 'mil', n.eco.milPct.toFixed(1), 'act', Math.round(n.mil.active), 'mob', Math.round(n.mil.mobilized), 'armor', Math.round(n.mil.armor), 'tech', n.tech.toFixed(2));
console.log('oil', w.market.oil.toFixed(1), 'food', w.market.food.toFixed(0), 'tension', w.market.tension.toFixed(0), 'worldGrowth', w.market.worldGrowth.toFixed(2));
console.log('alive', w.nations.filter((n) => n.alive).length, 'total nations', w.nations.length, 'news', w.newsSeq);
void lastLog;
