import type { World } from '../sim/world';
import type { Nation } from '../sim/types';

export interface Insight { tone: 'good' | 'bad' | 'warn' | 'info'; text: string }

/** Plain-language explanation of why a nation is thriving or failing. */
export function assess(w: World, n: Nation): Insight[] {
  const out: Insight[] = [];
  const e = n.eco, p = n.pol, m = n.mil;
  if (!n.alive) return [{ tone: 'bad', text: `No longer exists — ${n.deathCause || 'dissolved'}.` }];
  if (n.faction) out.push({ tone: 'warn', text: `${n.faction.kind === 'separatist' ? 'Breakaway movement' : 'Armed insurgency'} fighting ${w.nations[n.faction.parent].short}${n.faction.backers.length ? `, backed by ${n.faction.backers.map((b) => w.nations[b].short).join(', ')}` : ''}.` });
  // war
  for (const id of n.atWar) {
    const war = w.wars.find((x) => x.id === id); if (!war) continue;
    const mine = war.a.members.includes(n.id) ? 'a' : 'd';
    const score = mine === 'a' ? war.score : -war.score;
    const S = war[mine];
    const tone = score > 15 ? 'good' : score < -15 ? 'bad' : 'warn';
    out.push({ tone, text: `${war.name}: ${score > 30 ? 'winning decisively' : score > 10 ? 'gaining ground' : score < -30 ? 'losing badly' : score < -10 ? 'on the back foot' : 'deadlocked'} (war score ${score >= 0 ? '+' : ''}${score.toFixed(0)}, exhaustion ${S.exhaustion.toFixed(0)}%).` });
  }
  if (n.coreLostFrac > 0.05) out.push({ tone: 'bad', text: `${Math.round(n.coreLostFrac * 100)}% of its core population lives under foreign control, dragging down stability and output.` });
  if (n.capital >= 0 && w.provinces[n.capital].ctrl !== n.id) out.push({ tone: 'bad', text: 'Its capital is occupied.' });
  // economy
  if (e.growth < -1) {
    const why: string[] = [];
    if (e.sanctions > 0.15) why.push('sanctions');
    if (e.blockade > 0.1) why.push('naval blockade');
    if (n.atWar.length) why.push('war damage');
    if (e.inflation > 15) why.push(`${e.inflation.toFixed(0)}% inflation`);
    if (w.market.oil < 55 && e.oilProd > 1) why.push('low oil prices');
    if (w.market.oil > 110 && e.oilProd < 0.5) why.push('an energy-price shock');
    if (e.debt > 120) why.push('a heavy debt load');
    out.push({ tone: 'bad', text: `Economy contracting at ${(-e.growth).toFixed(1)}%/yr${why.length ? ` — driven by ${why.join(', ')}` : ''}.` });
  } else if (e.growth > 4.5) out.push({ tone: 'good', text: `Booming economy: ${e.growth.toFixed(1)}% annual growth${w.market.oil > 100 && e.oilProd > 1 ? ', lifted by high oil prices' : ''}.` });
  if (e.sanctions > 0.25) out.push({ tone: 'warn', text: `Under sanctions from economies worth ${Math.round(e.sanctions / 1.1 * 100)}% of world GDP.` });
  if (e.food < 0.7 && w.market.food > 125) out.push({ tone: 'bad', text: `Food importer exposed to a ${Math.round(w.market.food - 100)}% spike in grain prices.` });
  // politics
  if (p.stability < 25) out.push({ tone: 'bad', text: `State on the brink: stability ${p.stability.toFixed(0)}, unrest ${p.unrest.toFixed(0)}. Coup or revolution risk is high.` });
  else if (p.stability < 42) out.push({ tone: 'warn', text: `Fragile domestic situation (stability ${p.stability.toFixed(0)}).` });
  if (p.coupRisk > 0.4) out.push({ tone: 'bad', text: `The military is restless — elevated coup risk.` });
  if (p.weariness > 45) out.push({ tone: 'warn', text: `War-weary public (${p.weariness.toFixed(0)}%) is pressuring the government to end the fighting.` });
  if (p.refugees > n.pop * 0.02) out.push({ tone: 'warn', text: `Hosting ${p.refugees.toFixed(1)}M refugees.` });
  // military
  if (m.mobLevel >= 2) out.push({ tone: 'info', text: `${m.mobLevel === 3 ? 'General' : 'Partial'} mobilisation in force: ${Math.round(m.mobilized).toLocaleString()}K reservists under arms.` });
  if (m.ammo < 6 && n.atWar.length) out.push({ tone: 'bad', text: `Ammunition stocks critically low (${m.ammo.toFixed(0)} days).` });
  if (m.fuel < 0.6) out.push({ tone: 'bad', text: `Fuel shortages are hobbling the armed forces.` });
  if (n.ai.buildup > 0 && n.ai.buildupTarget >= 0) out.push({ tone: 'warn', text: `Massing forces against ${w.nations[n.ai.buildupTarget].short}.` });
  const threat = [...n.ai.threat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (threat && threat[1] > 0.6) out.push({ tone: 'warn', text: `Views ${w.nations[threat[0]].short} as its primary security threat.` });
  if (n.nukes > 0) out.push({ tone: 'info', text: `Nuclear-armed (~${n.nukes.toLocaleString()} warheads) — invaders avoid its heartland.` });
  if (!out.length) out.push({ tone: 'good', text: 'Stable, at peace and growing steadily.' });
  return out.slice(0, 7);
}
