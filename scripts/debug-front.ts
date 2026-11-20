import fs from 'node:fs';
import { Sim } from '../src/sim/engine';
import { frontCache } from '../src/sim/war';
const data = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
const sim = new Sim(data, 1);
const w = sim.w;
const war = w.wars[0];
const us = w.nations[w.byCode.get('US')!];
for (let d = 0; d < 400; d++) {
  sim.step();
  if (d % 100 === 0) { if (!frontCache(war.id)) { console.log("war over", war.status, war.outcome); break; }
    const fc = frontCache(war.id)!;
    console.log('day', d, 'ratio', fc.ratio.toFixed(2), 'stance', JSON.stringify(fc.stance), 'axes', [...fc.axes].map(i=>w.provinces[i].name).join(','));
    for (const i of fc.frontline) { const p = w.provinces[i]; console.log('  ', p.name, w.nations[p.ctrl].code, 'F', fc.force[i].toFixed(0), 'siege', p.siege.toFixed(1), 'by', p.siegeBy, 'fort', p.fort.toFixed(1), p.terrain, 'area', p.area); }
    console.log(' US gdp', us.eco.gdp.toFixed(0), 'g', us.eco.growth.toFixed(2), 'RU lp', w.nations[war.a.leader].landPower.toFixed(0), 'UA lp', w.nations[war.d.leader].landPower.toFixed(0));
  }
}
