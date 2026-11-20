# WORLDSTATE

A living geopolitical and war simulation of the entire planet. 196 countries,
2,337 provinces built around real cities, and a set of interlocking systems
(economy, politics, diplomacy, military logistics, war and world events) that
drive each other day by day. Leave it running and the world writes its own
history: wars start and stall, governments fall, alliances form and break,
borders move, and new states are born.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # static site in dist/ (open with any static file server)
```

## What you can do

- **Watch.** Press play (Space). There are eight speeds, from half a day per second to "Max" (≈300+ days per second). You can also skip ahead by a week, a month or up to 25 years, or jump to a specific date.
- **Inspect.** Click a country for a full profile: a plain-language situation report on *why* it is thriving or failing, plus economy, military, politics, diplomacy, territory and history charts. Shift-click (or click again) to drill into a province. Click a war for both sides, casualties, exhaustion, air superiority, posture and recent captures.
- **Intervene.** Declare wars with any coalition and any war type: invasion, border conflict, strike campaign, intervention or liberation. You can also force peace terms, found alliances, sign pacts, sanction, send arms, stage coups, spark revolutions, ignite civil wars, carve out breakaway states, repaint borders, change regimes or tilt a leader hawkish or dovish. The AI reacts to everything you do.
- **Look back.** The World Wire news feed (click any item to fly there), a timeline of major events, rankings, global indicators, and a border time-lapse you can scrub or play.
- **Tune the world.** AI aggression, event frequency, whether allies honour treaties, and whether nuclear escalation is possible. Save and load, or export the world to a file.

Map modes: Flags, Political, Alliances, Relations, Stability, Growth, Military, War damage, Population, Terrain.

## How the simulation works

Everything runs on a daily tick. Each system reads the others' state:

- **Territory.** Countries are split into provinces with Voronoi cells seeded by real cities (GeoNames) and clipped to Natural Earth borders. Each province has terrain, population, output, oil, fortifications, devastation, unrest, separatism, a de jure owner, a de facto controller and a national identity (its "core"). Lost cores become irredentist claims, which can drive future wars.
- **War.** Fronts are the province edges between belligerents. Each nation spreads its land power across its frontline: defending its core gets priority, attackers mass on offensive axes, and expeditionary allies deploy through friendly territory. Combat compares offence and defence, adjusted for terrain, fortification, urban fighting, supply distance, air superiority and morale. Provinces cut off from supply become encircled pockets that collapse. Amphibious assaults need naval control. Casualties drain manpower, equipment and ammunition, and exhaustion rises with losses relative to population and regime type. Wars end in negotiated cessions, ceasefires that freeze into frozen conflicts (which can reignite), puppet regimes, annexation, or independence.
- **Military.** Personnel, reserves, mobilisation levels, tanks, artillery, aircraft, air defence, navy, missiles, ammunition and fuel. Quality comes from technology, training, command and experience. Production scales with budget, industry, sanctions and war economy. Fuel security depends on oil, blockades and sanctions.
- **Economy.** GDP is the sum of what each province produces, so territory changes hands with its output. There are business cycles with global contagion, inflation, unemployment, debt crises and defaults, sanctions and naval blockades. Oil and food markets react to war, and nine strategic chokepoints (Hormuz, Malacca, Suez, the Turkish Straits, the Taiwan Strait and others) can be disrupted by nearby fighting.
- **Politics.** Stability, legitimacy, unrest, war weariness and rally-round-the-flag effects. Elections in democracies can replace leaders with hawks or doves depending on the public mood. Coups, revolutions, insurgencies, succession crises, separatist referendums and wars of independence all emerge from these values. Leaders are fictional.
- **Diplomacy and AI.** Relations drift toward structural baselines (alignment, regime similarity, shared enemies, claims, sanctions). Each government assesses threats through imperfect intelligence, so miscalculation is possible. Threatened states arm, fortify, seek protectors or apply to alliances, and members can veto them. Governments send aid to friends, honour or ignore treaties, sanction aggressors and weigh opportunistic wars. Before an AI war there is a visible crisis: troops mass on the border, the target and its allies respond, and the attacker may back down.
- **Events.** Earthquakes, storms, floods, droughts and famines, pandemics, border skirmishes that can escalate, terrorism, cyberattacks, technology breakthroughs, oil discoveries and weapons tests.

The *Present day* scenario starts on 19 November 2026 with four active conflicts: the Russia–Ukraine war along an approximate front, Sudan (RSF), Myanmar and eastern DR Congo. It also loads real alliances (NATO, CSTO, GCC, the Sahel alliance and bilateral pacts), sanctions and territorial claims. *Clean slate* starts from de jure borders with no wars.

## Project layout

```
scripts/build-world.mjs   geo pipeline → public/data/world.json (province topology)
scripts/headless.ts       run the simulation headless: npx tsx scripts/headless.ts <years> <seed>
src/data/                 nation statistics, alliances, claims, name pools
src/sim/                  simulation engine (world, military, war, economy, politics, ai, events)
src/map/                  canvas renderer: projection, flag rasterisation, borders, fronts, overlays
src/ui/                   React interface
```

To regenerate the province geometry (already committed), run `npm run build:world`.

## Data sources

Borders: Natural Earth via [world-atlas](https://github.com/topojson/world-atlas). Cities: GeoNames via [all-the-cities](https://github.com/zeke/all-the-cities). Flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT). Starting statistics are approximations of 2025–26 figures.
