import fs from 'node:fs';
import { Sim } from '../src/sim/engine';
import { fmtDate } from '../src/sim/calendar';
const data = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
function run(label: string, a: string, d: string, type: any, goal: any, opts: any, days: number, callAllies = false) {
  const sim = new Sim(data, 42, 'clean');
  sim.w.settings.aiWars = false;
  const w = sim.w;
  const war = sim.startWar([w.byCode.get(a)!], [w.byCode.get(d)!], type, goal, callAllies, opts)!;
  let firstFlip = -1;
  for (let i = 0; i < days; i++) { sim.step(); if (firstFlip < 0 && war.flips.length) firstFlip = i; if (war.status === 'ended') break; }
  const landings = w.news.filter((n) => n.war === war.id && /storm ashore|airborne forces seize|repels|beaten back/.test(n.title)).length;
  console.log(`\n== ${label}: ${war.name} status=${war.status} ${war.outcome ?? ''}`);
  console.log(`   flips=${war.flips.length} firstFlip=day ${firstFlip} landingNews=${landings} nukes=${war.nukeCount} score=${war.score.toFixed(0)} cas=${Math.round(war.a.casualties)}/${Math.round(war.d.casualties)} days=${(war.end ?? w.day) - war.start}`);
  for (const n of w.news.filter((n) => n.war === war.id && n.imp >= 4).slice(0, 8)) console.log('   ', fmtDate(n.day), n.title);
  return { sim, war };
}
run('Non-adjacent: USA invades Iran', 'US', 'IR', 'invasion', 'annex', {}, 365);
run('Landlocked target: Japan vs Mongolia', 'JP', 'MN', 'invasion', 'annex', {}, 365);
run('Balanced neighbours: Poland vs Germany', 'PL', 'DE', 'invasion', 'annex', {}, 365);
run('Nukes authorised: India vs Pakistan', 'IN', 'PK', 'invasion', 'annex', { nukes: true }, 365);
run('Fight to the finish: Germany vs Austria', 'DE', 'AT', 'invasion', 'annex', { allowTreaty: false, allowCeasefire: false }, 1200);
const { sim, war } = run('Forced ceasefire holds: Russia vs Finland', 'RU', 'FI', 'invasion', 'annex', {}, 90);
sim.forcePeace(war.id, 'ceasefire', 'a');
for (let i = 0; i < 365 * 3; i++) sim.step();
console.log('   after 3 years of imposed ceasefire:', war.status);
