// WORLDSTATE geo pipeline
// Splits every Natural Earth (world-atlas 50m) country into provinces seeded by
// real cities (GeoNames via all-the-cities), with organic Voronoi borders, then
// emits a shared-arc TopoJSON so the client can merge/mesh territories by owner.
//
//   node scripts/build-world.mjs
//
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import * as topojsonClient from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile, sphericalTriangleArea } from 'topojson-simplify';
import { geoArea, geoContains, geoCentroid, geoBounds } from 'd3-geo';
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

const require = createRequire(import.meta.url);
const atlas = require('world-atlas/countries-50m.json');
const cities = require('all-the-cities');
const iso = require('i18n-iso-countries');

const OUT = path.resolve('public/data');
const R = 6371;

// ---------------------------------------------------------------------------
// Feature -> nation mapping. Dependencies fold into their sovereign; a few
// unrecognised entities become separatist provinces of the state that claims them.
const PARENT = {
  VI: 'US', GU: 'US', AS: 'US', PR: 'US', MP: 'US',
  GS: 'GB', IO: 'GB', SH: 'GB', PN: 'GB', AI: 'GB', FK: 'GB', KY: 'GB', BM: 'GB', VG: 'GB', TC: 'GB', MS: 'GB', JE: 'GB', GG: 'GB', IM: 'GB',
  AW: 'NL', CW: 'NL', SX: 'NL',
  PM: 'FR', WF: 'FR', MF: 'FR', BL: 'FR', PF: 'FR', NC: 'FR', TF: 'FR',
  AX: 'FI', GL: 'DK', FO: 'DK', MO: 'CN', HK: 'CN',
  HM: 'AU', NF: 'AU', NU: 'NZ', CK: 'NZ', EH: 'MA',
};
const UNNAMED = { 'Somaliland': 'SO', 'Kosovo': 'XK', 'N. Cyprus': 'CY', 'Indian Ocean Ter.': 'AU', 'Siachen Glacier': 'IN' };
// separatism seeds for whole features folded into a parent
const FEATURE_SEPARATISM = { 'Somaliland': 70, 'N. Cyprus': 80, 'W. Sahara': 55, 'Greenland': 35, 'Faeroe Is.': 20, 'Hong Kong': 30, 'Puerto Rico': 15, 'New Caledonia': 35 };

// ---------------------------------------------------------------------------
// Terrain zones (rough polygons, lon/lat). First match wins.
const Z = (type, ring) => ({ type, ring });
const ZONES = [
  Z('mountains', [[72,36],[75,37],[80,35.5],[85,29.5],[89,28.2],[95,29.5],[97,28],[92,26.8],[88,26.5],[84,27.3],[80,28.6],[77,30.5],[74,33],[71,34.5]]),
  Z('mountains', [[78,36],[90,37],[98,36],[103,33],[102,29],[98,27.5],[92,28.5],[86,28.5],[81,30.5],[78,33]]),
  Z('mountains', [[66,34],[70,38],[74,40],[80,42.5],[86,44],[90,43],[86,41.5],[78,40],[75,37.5],[71,35],[67,33]]),
  Z('mountains', [[61,33],[64,35.5],[68,36],[71,34],[69,32],[66,31],[63,31]]),
  Z('mountains', [[44,38],[47,37],[50,36.5],[54,37],[57,37.5],[58,36],[55,35],[52,34],[56,29],[54,27.5],[50,30],[47,33],[45,35]]),
  Z('mountains', [[37.5,44.5],[40,43.6],[44,43],[47.5,42],[49.5,41],[46,40.5],[43,41.3],[40,42.2]]),
  Z('hills', [[36,39],[38,40.8],[42,41],[44.5,39.5],[44,37.5],[40,37.2],[37,37.5]]),
  Z('mountains', [[5.5,44],[6.5,46.5],[9,47.3],[13,47.6],[16,47.5],[14,46.3],[11,46],[8,45.6],[7,44]]),
  Z('mountains', [[-1.8,43.3],[3.2,42.6],[2.5,42.2],[-1.5,42.8]]),
  Z('hills', [[18.8,49.5],[22.5,49.3],[25,48],[26.6,46],[26,45.2],[22.5,45.3],[23.5,46.8],[22.5,48.2],[19.5,48.8]]),
  Z('hills', [[14.8,45.5],[17,44.5],[19.2,43],[20.5,42],[23,41.5],[24.8,42.5],[22.5,43.5],[20,44],[17.5,45.3]]),
  Z('mountains', [[5.5,59],[7,62],[12,64.5],[16,68],[20,69.5],[18,68.6],[14.5,65],[12.5,62],[9,59.5]]),
  Z('mountains', [[-9.8,30.5],[-5.5,33],[-1,34.5],[4,36],[9,36.5],[9,35],[3,34],[-3,32.5],[-7,30.5]]),
  Z('mountains', [[35.5,14],[39.5,14.5],[40.5,12],[40.5,8.5],[38,5.5],[35.5,7],[35,10]]),
  Z('mountains', [[-80,9],[-73,11],[-71.5,7],[-76,1],[-78.5,-2],[-75,-10],[-70,-17.5],[-66,-22],[-66.8,-30],[-69.5,-38],[-71,-45],[-72.5,-52],[-75,-50],[-73.5,-40],[-71.7,-30],[-70.5,-22],[-72,-17],[-77,-10],[-80,-3],[-78.7,2],[-77.5,7]]),
  Z('mountains', [[-125,60],[-115,60],[-112,49],[-104,42],[-105,35],[-108,31.5],[-114,35],[-118,43],[-123,49],[-128,55]]),
  Z('hills', [[-109,31],[-104,28],[-99,22],[-97,17.5],[-94,16],[-98,16],[-103,19],[-106,23.5]]),
  Z('hills', [[-85.5,34],[-80,38.5],[-76.5,41.5],[-72,44.5],[-70,46],[-73.5,42],[-78.5,37.5],[-83,34.5]]),
  Z('hills', [[57,51.5],[60,55],[60,61],[66,68],[64,68.2],[57.5,61],[57,55]]),
  Z('mountains', [[83,52],[88,51.5],[95,53],[100,52.5],[98,49.5],[90,48.5],[85,49]]),
  Z('mountains', [[43.2,17],[45,16.5],[45,13.5],[43.5,12.8],[43,14.5]]),
  Z('mountains', [[138,-3.5],[142,-5],[146,-6],[147.5,-7],[145,-7.5],[141,-6],[137,-4.5]]),
  Z('hills', [[97,28],[101,26.5],[104,26],[104,22.5],[100,21],[98,20],[98.5,24],[97.5,25.5]]),
  Z('hills', [[126.5,38.6],[128.5,38.6],[129.5,36],[128,35],[127,36.5]]),
  Z('hills', [[124.5,40],[127,42],[129.5,42.5],[129,40.5],[127,39]]),
  Z('mountains', [[120.8,24.6],[121.8,24.8],[121,22.2],[120.6,23]]),
  Z('hills', [[135,34],[138,37],[140.5,38.8],[141,37],[138.5,35.2],[136,34.2]]),
  Z('hills', [[19.5,42.5],[21,42.2],[23,40.5],[21,39.5],[20,40]]),
  Z('hills', [[21,39.8],[23,40],[23.5,38],[22,37],[21.5,38]]),
  Z('hills', [[8.5,44.4],[12,44],[14,42],[16,40],[16.5,38.5],[15.5,39],[13.5,41.2],[11,43]]),
  Z('hills', [[-8.5,42],[-3,43],[-1,41],[-2,38],[-5,37],[-7,39]]),
  Z('hills', [[30,-1],[30.5,-3.5],[29,-2.5],[29,0]]),
  Z('hills', [[35,1],[37.5,1],[37.5,-1.8],[35.5,-1.5]]),
  Z('hills', [[66,25],[67.5,30],[69.5,31.5],[70.5,30],[68.5,27],[67.5,25]]),
  Z('hills', [[69,31.5],[71,34.5],[72.5,34],[70.5,31.5]]),
  Z('desert', [[-17,21],[-13,27.5],[-8,29.5],[-2,31],[5,31.5],[10,31],[12,30],[20,30.5],[25,30],[32,29],[34,26],[37,22],[37,18.5],[33,17],[25,16],[16,16.5],[10,17],[3,18],[-5,17],[-12,17.5],[-16.5,19]]),
  Z('desert', [[36,30],[40,32],[44,31],[47.5,29.5],[50,26],[52,23.5],[56,23],[57,20],[54,17],[50,17],[46,17.5],[43.5,18],[42,21],[39,25],[37,28]]),
  Z('desert', [[37,35],[39.5,36.5],[42,35.5],[42,33],[38.5,32]]),
  Z('desert', [[53,35.5],[58.5,35],[61,33],[61,28],[58,28.5],[55,31],[52,33]]),
  Z('desert', [[69,24],[70,28],[73,30],[75,28.5],[73,25],[71,24]]),
  Z('desert', [[53,40],[56,42.5],[60,45],[65,44.5],[66.5,41],[63,38],[60,37],[56,38]]),
  Z('desert', [[76,38],[79,40.5],[84,41.5],[89,40.5],[89,38],[84,37],[79,36.8]]),
  Z('desert', [[95,42],[100,44.5],[105,45],[111,44.5],[112,42],[106,41.5],[100,40.5],[97,40.8]]),
  Z('desert', [[13,-17],[15,-17.5],[20,-19],[24,-21],[23,-26],[20,-28.5],[17,-29],[15,-27],[14,-22]]),
  Z('desert', [[115,-22],[120,-19],[128,-18.5],[135,-20],[140,-22],[141,-28],[138,-31],[132,-31.5],[125,-30.5],[118,-28],[114,-26]]),
  Z('desert', [[-71,-18],[-69,-18.5],[-68.5,-26],[-70.5,-27.5],[-71,-24]]),
  Z('desert', [[-117.5,36.5],[-114,37.5],[-110,35.5],[-106,33],[-104,31],[-111,30],[-115,31.5],[-117,33]]),
  Z('desert', [[41,11.5],[48,11.5],[51,11.8],[50,7],[45,3],[41,3],[39.5,6.5],[43,9]]),
  Z('jungle', [[-78,-2],[-75,3],[-68,4],[-60,5.5],[-52,4.5],[-50,0],[-46,-2.5],[-48,-6],[-55,-9.5],[-62,-12],[-68,-12],[-73,-10],[-76.5,-6]]),
  Z('jungle', [[8.5,4],[13,4.5],[18,5],[25,5],[30,3],[30,-3],[28,-6],[22,-7.5],[17,-5],[12,-3],[9,-1]]),
  Z('jungle', [[-13,8.5],[-8,8],[-3,7.5],[1,7],[5,6.5],[9,5.5],[9,4],[5,4.2],[0,5],[-5,4.5],[-8,4.5],[-11,6.5]]),
  Z('jungle', [[93,20],[97,24],[103,22.5],[106,22],[109,14],[105,8.5],[100,6],[98,8],[97.5,15],[94,16]]),
  Z('jungle', [[95,5.5],[101,1],[106,-6],[115,-4],[119,1.5],[118,7],[115,5.5],[109,2],[104,1.5],[99,4.5]]),
  Z('jungle', [[131,-1],[141,-2.5],[150,-5],[150,-10.5],[143,-9],[137,-8],[132,-4]]),
  Z('jungle', [[-92,17.5],[-88,18.5],[-83.5,15],[-83,10],[-77.5,8.5],[-79.5,8.5],[-84,9.5],[-87,13],[-90.5,15]]),
];
function inRing(pt, ring) {
  let c = false; const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function terrainAt([lon, lat]) {
  for (const z of ZONES) if (inRing([lon, lat], z.ring)) return z.type;
  const a = Math.abs(lat);
  if (a > 66) return 'arctic';
  if (lat > 55 && (lon > 25 || lon < -50)) return 'forest';
  if (lat > 58 && lon > 4 && lon < 32) return 'forest';
  return 'plains';
}

// ---------------------------------------------------------------------------
// deterministic hash noise
function hash(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    const s = Math.round(n * 1e6);
    h ^= s & 0xffff; h = Math.imul(h, 16777619);
    h ^= (s >>> 16) & 0xffff; h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
let seedState = 1234567;
function rand() { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; }

// Organic edge: midpoint displacement keyed on canonical endpoint order so both
// cells sharing an edge get the identical polyline.
function noisyEdge(a, b, depth = 3) {
  const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const p = flip ? b : a, q = flip ? a : b;
  let pts = [p, q];
  let amp = 0.16;
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const u = pts[i], v = pts[i + 1];
      const dx = v[0] - u[0], dy = v[1] - u[1];
      const r = hash(u[0], u[1], v[0], v[1], d) * 2 - 1;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(amp, 0.45 / len);
      const m = [(u[0] + v[0]) / 2 - dy * r * k, (u[1] + v[1]) / 2 + dx * r * k];
      out.push(m, v);
    }
    pts = out; amp *= 0.55;
  }
  if (flip) pts.reverse();
  return pts;
}

// d3-geo winding: exterior rings clockwise (negative planar shoelace), holes counter-clockwise
function ringArea(r) { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; }
function rewind(poly) {
  return poly.map((ring, i) => {
    const a = ringArea(ring);
    const wantNeg = i === 0;
    return (wantNeg ? a > 0 : a < 0) ? ring.slice().reverse() : ring;
  });
}

// ---------------------------------------------------------------------------
const countries = topojsonClient.feature(atlas, atlas.objects.countries).features;

const byCountry = new Map();
for (const c of cities) {
  if (!byCountry.has(c.country)) byCountry.set(c.country, []);
  byCountry.get(c.country).push(c);
}
for (const list of byCountry.values()) list.sort((a, b) => b.population - a.population);
const allCities = cities.slice().sort((a, b) => b.population - a.population);

function featureCodes(f) {
  const name = f.properties.name;
  if (!f.id) return { own: null, nation: UNNAMED[name] || null };
  const a2 = iso.numericToAlpha2(f.id);
  if (a2 === 'AQ') return { own: 'AQ', nation: null };
  if (name === 'Ashmore and Cartier Is.') return { own: 'AU', nation: 'AU' };
  return { own: a2, nation: PARENT[a2] || a2 };
}

function polysOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
const sqkm = (g) => geoArea(g) * R * R;

const provinces = [];
const provFeatures = [];
const nationsSeen = new Map();

function dir8(dx, dy) {
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const names = ['East', 'Northeast', 'North', 'Northwest', 'West', 'Southwest', 'South', 'Southeast'];
  return names[((Math.round(ang / 45) % 8) + 8) % 8];
}

for (const f of countries) {
  const { own, nation } = featureCodes(f);
  if (!nation) continue;
  const name = f.properties.name;
  const isDependency = (own && own !== nation) || !f.id;
  // unwrap rings that cross the antimeridian so they are planar-continuous
  let polys = polysOf(f.geometry).map((poly) => poly.map((ring) => {
    const out = [ring[0].slice()];
    for (let k = 1; k < ring.length; k++) {
      let x = ring[k][0];
      const px = out[k - 1][0];
      while (x - px > 180) x -= 360;
      while (x - px < -180) x += 360;
      out.push([x, ring[k][1]]);
    }
    return out;
  })).map((poly) => {
    const cx = poly[0].reduce((s, q) => s + q[0], 0) / poly[0].length;
    if (cx > 180) return poly.map((r) => r.map(([x, y]) => [x - 360, y]));
    if (cx < -180) return poly.map((r) => r.map(([x, y]) => [x + 360, y]));
    return poly;
  });

  // antimeridian handling: shift minority hemisphere parts so the country is contiguous
  const b = geoBounds(f);
  let shift = 0;
  const parts = polys.map((p) => ({ coords: p, area: sqkm({ type: 'Polygon', coordinates: p }), c: [p[0].reduce((s, q) => s + q[0], 0) / p[0].length, p[0].reduce((s, q) => s + q[1], 0) / p[0].length] }));
  const lons = parts.flatMap((p) => p.coords[0].map((q) => q[0]));
  if (Math.min(...lons) < -170 && Math.max(...lons) > 170) {
    const east = parts.filter((p) => p.c[0] > 0).reduce((s, p) => s + p.area, 0);
    const west = parts.filter((p) => p.c[0] <= 0).reduce((s, p) => s + p.area, 0);
    shift = east >= west ? 1 : -1;
    for (const p of parts) {
      if (shift === 1 && p.c[0] < 0) { p.coords = p.coords.map((r) => r.map(([x, y]) => [x + 360, y])); p.c = [p.c[0] + 360, p.c[1]]; }
      if (shift === -1 && p.c[0] > 0) { p.coords = p.coords.map((r) => r.map(([x, y]) => [x - 360, y])); p.c = [p.c[0] - 360, p.c[1]]; }
    }
  }
  const totalArea = parts.reduce((s, p) => s + p.area, 0);
  const effArea = parts.reduce((s, p) => s + p.area * (Math.abs(p.c[1]) > 62 ? 0.3 : Math.abs(p.c[1]) > 56 ? 0.65 : 1), 0);
  const midLat = parts.reduce((s, p) => s + p.c[1] * p.area, 0) / totalArea;
  const kx = Math.max(0.25, Math.cos(midLat * Math.PI / 180));

  // candidate cities that actually fall inside this feature
  const fb = geoBounds(f);
  const crosses = fb[0][0] > fb[1][0];
  const pool = allCities.filter((c) => {
    const [x, y] = c.loc.coordinates;
    if (y < fb[0][1] - 0.05 || y > fb[1][1] + 0.05) return false;
    if (crosses) return x >= fb[0][0] - 0.05 || x <= fb[1][0] + 0.05;
    return x >= fb[0][0] - 0.05 && x <= fb[1][0] + 0.05;
  });
  const cand = [];
  for (const c of pool) {
    if (cand.length >= 500) break;
    let [x, y] = c.loc.coordinates;
    if (!geoContains(f, [x, y])) continue;
    if (shift === 1 && x < 0) x += 360;
    if (shift === -1 && x > 0) x -= 360;
    cand.push({ name: c.name, pop: c.population, x, y, cap: c.featureCode === 'PPLC' });
  }
  const cityPopM = cand.reduce((s, c) => s + c.pop, 0) / 1e6;

  let N;
  if (isDependency) N = Math.max(1, Math.round(Math.sqrt(effArea) / 110 + Math.sqrt(cityPopM) * 0.6));
  else N = Math.max(1, Math.round(Math.sqrt(effArea) / 62 + Math.sqrt(cityPopM) * 1.25));
  if (totalArea < 2500) N = 1;
  N = Math.min(N, 95);

  // weighted farthest-point seed selection
  const seeds = [];
  const dist = (a, b) => Math.hypot((a.x - b.x) * kx, a.y - b.y);
  if (cand.length) {
    const first = cand.find((c) => c.cap) || cand[0];
    seeds.push(first);
    const md = cand.map((c) => dist(c, first));
    while (seeds.length < Math.min(N, cand.length)) {
      let best = -1, bs = -1;
      for (let i = 0; i < cand.length; i++) {
        if (md[i] <= 1e-9) continue;
        const s = md[i] * Math.pow(cand[i].pop, 0.24);
        if (s > bs) { bs = s; best = i; }
      }
      if (best < 0) break;
      const s = cand[best];
      seeds.push(s);
      for (let i = 0; i < cand.length; i++) md[i] = Math.min(md[i], dist(cand[i], s));
    }
  }
  // ensure every substantial landmass has a seed
  const center = geoCentroid(f);
  for (const p of parts) {
    if (p.area < Math.max(9000, totalArea * 0.025)) continue;
    const poly = { type: 'Polygon', coordinates: p.coords };
    if (seeds.some((s) => inRing([s.x, s.y], p.coords[0]))) continue;
    const inside = cand.find((c) => inRing([c.x, c.y], p.coords[0]));
    if (inside) { seeds.push(inside); continue; }
    let pt = p.c;
    if (!inRing(pt, p.coords[0])) pt = p.coords[0][Math.floor(p.coords[0].length / 2)];
    seeds.push({ name: `${dir8(pt[0] - center[0], pt[1] - center[1])} ${name}`, pop: 0, x: pt[0], y: pt[1], cap: false, synthetic: true });
    void poly;
  }
  // too few cities: scatter synthetic seeds across the biggest parts
  if (seeds.length < N && totalArea > 50000) {
    const big = parts.slice().sort((a, b) => b.area - a.area)[0];
    const bb = big.coords[0].reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [1e9, 1e9, -1e9, -1e9]);
    let tries = 0;
    while (seeds.length < N && tries++ < 4000) {
      const pt = { x: bb[0] + rand() * (bb[2] - bb[0]), y: bb[1] + rand() * (bb[3] - bb[1]) };
      if (!inRing([pt.x, pt.y], big.coords[0])) continue;
      const md = Math.min(...seeds.map((s) => dist(s, pt)), 1e9);
      const need = Math.sqrt(effArea / N) / 111 * 0.8;
      if (md < need) continue;
      seeds.push({ name: `${dir8(pt.x - center[0], pt.y - center[1])} ${name}`, pop: 0, x: pt.x, y: pt.y, cap: false, synthetic: true });
    }
  }
  if (!seeds.length) {
    const c = parts.slice().sort((a, b) => b.area - a.area)[0];
    seeds.push({ name, pop: 0, x: c.c[0], y: c.c[1], cap: false, synthetic: true });
  }
  // de-duplicate synthetic names
  const used = new Map();
  for (const s of seeds) {
    const k = s.name; used.set(k, (used.get(k) || 0) + 1);
    if (used.get(k) > 1) s.name = `${k} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][used.get(k) - 2] || used.get(k)}`;
  }

  // --- Voronoi cells (in x-scaled space), organic edges, clip to feature parts
  const pieces = seeds.map(() => []);
  if (seeds.length === 1) {
    pieces[0] = parts.map((p) => p.coords);
  } else {
    const allX = parts.flatMap((p) => p.coords[0].map((q) => q[0]));
    const allY = parts.flatMap((p) => p.coords[0].map((q) => q[1]));
    const bounds = [Math.min(...allX) * kx - 2, Math.min(...allY) - 2, Math.max(...allX) * kx + 2, Math.max(...allY) + 2];
    const del = Delaunay.from(seeds, (s) => s.x * kx, (s) => s.y);
    const vor = del.voronoi(bounds);
    for (let i = 0; i < seeds.length; i++) {
      const cell = vor.cellPolygon(i);
      if (!cell) continue;
      // build organic ring
      const ring = [];
      for (let k = 0; k < cell.length - 1; k++) {
        const a = cell[k], bb = cell[k + 1];
        const onBound = (a[0] === bb[0] && (a[0] === bounds[0] || a[0] === bounds[2])) || (a[1] === bb[1] && (a[1] === bounds[1] || a[1] === bounds[3]));
        const seg = onBound ? [a, bb] : noisyEdge(a, bb, 3);
        for (let s = 0; s < seg.length - 1; s++) ring.push([seg[s][0] / kx, seg[s][1]]);
      }
      ring.push(ring[0]);
      const cbb = ring.reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [1e9, 1e9, -1e9, -1e9]);
      for (const p of parts) {
        const pb = p.bb || (p.bb = p.coords[0].reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [1e9, 1e9, -1e9, -1e9]));
        if (pb[2] < cbb[0] || pb[0] > cbb[2] || pb[3] < cbb[1] || pb[1] > cbb[3]) continue;
        let res;
        try { res = polygonClipping.intersection(p.coords, [ring]); } catch (e) { console.warn('clip fail', name, i, e.message); continue; }
        for (const poly of res) pieces[i].push(poly);
      }
    }
  }

  const sep = FEATURE_SEPARATISM[name] || 0;
  for (let i = 0; i < seeds.length; i++) {
    let polysOut = pieces[i].filter((p) => p.length && p[0].length >= 4);
    if (!polysOut.length) continue;
    // un-shift pieces across the antimeridian
    polysOut = polysOut.map((poly) => {
      const xs = poly[0].map((q) => q[0]);
      const mn = Math.min(...xs), mx = Math.max(...xs);
      if (mn >= 180) return poly.map((r) => r.map(([x, y]) => [x - 360, y]));
      if (mx <= -180) return poly.map((r) => r.map(([x, y]) => [x + 360, y]));
      return poly; // straddling pieces keep lon beyond ±180 (valid on the sphere)
    });
    polysOut = polysOut.map(rewind);
    polysOut = polysOut.filter((poly) => { const a = sqkm({ type: 'Polygon', coordinates: poly }); if (a > 1e8) { console.warn('dropping bad piece', name, seeds[i].name); return false; } return true; });
    const geom = { type: 'MultiPolygon', coordinates: polysOut };
    const area = sqkm(geom);
    if (area < 0.3 && seeds.length > 1) continue;
    const s = seeds[i];
    let sx = s.x; if (sx > 180) sx -= 360; if (sx < -180) sx += 360;
    const id = provinces.length;
    provinces.push({
      id, name: s.name, nation, feature: name, sx, sy: s.y, area, cityPop: s.pop, cap: !!s.cap, synthetic: !!s.synthetic,
      sep, dep: isDependency ? (own || name) : null,
    });
    provFeatures.push({ type: 'Feature', id, properties: {}, geometry: geom });
  }
  nationsSeen.set(nation, (nationsSeen.get(nation) || 0) + seeds.length);
}
console.log('provinces', provinces.length, 'nations', nationsSeen.size);

// ---------------------------------------------------------------------------
// Population weights: share of cities inside each province + rural area term
{
  const cellIndex = new Map();
  for (const p of provinces) {
    if (!cellIndex.has(p.nation)) cellIndex.set(p.nation, []);
    cellIndex.get(p.nation).push(p);
  }
  // assign every city of the nation to the province whose geometry contains it (bbox prefilter)
  const bboxes = provFeatures.map((f) => geoBounds(f));
  const cityPop = new Float64Array(provinces.length);
  const bigCity = new Float64Array(provinces.length);
  for (const [nation, plist] of cellIndex) {
    const codes = new Set([nation, ...Object.entries(PARENT).filter(([, v]) => v === nation).map(([k]) => k)]);
    for (const code of codes) {
      for (const c of (byCountry.get(code) || []).slice(0, 1500)) {
        const [x, y] = c.loc.coordinates;
        for (const p of plist) {
          const bb = bboxes[p.id];
          if (x < bb[0][0] - 0.01 || x > bb[1][0] + 0.01 || y < bb[0][1] - 0.01 || y > bb[1][1] + 0.01) continue;
          if (geoContains(provFeatures[p.id], [x, y])) { cityPop[p.id] += c.population; bigCity[p.id] = Math.max(bigCity[p.id], c.population); break; }
        }
      }
    }
  }
  for (const [, plist] of cellIndex) {
    const cs = plist.reduce((s, p) => s + cityPop[p.id], 0) || 1;
    const as = plist.reduce((s, p) => s + p.area * (Math.abs(p.sy) > 62 ? 0.15 : 1), 0) || 1;
    for (const p of plist) {
      p.popShare = 0.82 * (cityPop[p.id] / cs) + 0.18 * (p.area * (Math.abs(p.sy) > 62 ? 0.15 : 1) / as);
      p.urban = bigCity[p.id];
    }
  }
}

// terrain: majority vote over seed + feature centroid + a few interior samples
for (const p of provinces) {
  const f = provFeatures[p.id];
  const c = geoCentroid(f);
  const votes = {};
  const pts = [[p.sx, p.sy], c, [(p.sx + c[0]) / 2, (p.sy + c[1]) / 2]];
  for (const pt of pts) { const t = terrainAt(pt); votes[t] = (votes[t] || 0) + 1; }
  let t = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  if (p.urban > 2.5e6) t = 'urban';
  p.terrain = t;
  p.cx = c[0]; p.cy = c[1];
}

// ---------------------------------------------------------------------------
// T-junction repair + quantise, so neighbouring provinces share identical arcs
function q(v) { return Math.round(v * 1e6) / 1e6; }
const rings = [];
for (const f of provFeatures) for (const poly of f.geometry.coordinates) for (let r = 0; r < poly.length; r++) {
  poly[r] = poly[r].map(([x, y]) => [q(x), q(y)]);
  // drop consecutive duplicates
  poly[r] = poly[r].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  rings.push({ owner: f.id, ring: poly, idx: r });
}
const CELL = 0.05;
const grid = new Map();
const key = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
for (const r of rings) for (const [x, y] of r.ring[r.idx]) {
  const k = key(x, y);
  let a = grid.get(k); if (!a) grid.set(k, (a = []));
  a.push(x, y, r.owner);
}
let inserted = 0;
for (const r of rings) {
  const ring = r.ring[r.idx];
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    out.push(a);
    const minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0]), miny = Math.min(a[1], b[1]), maxy = Math.max(a[1], b[1]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) continue;
    const hits = [];
    for (let gx = Math.floor(minx / CELL); gx <= Math.floor(maxx / CELL); gx++) for (let gy = Math.floor(miny / CELL); gy <= Math.floor(maxy / CELL); gy++) {
      const arr = grid.get(`${gx},${gy}`); if (!arr) continue;
      for (let k = 0; k < arr.length; k += 3) {
        if (arr[k + 2] === r.owner) continue;
        const vx = arr[k], vy = arr[k + 1];
        if (vx < minx - 2e-6 || vx > maxx + 2e-6 || vy < miny - 2e-6 || vy > maxy + 2e-6) continue;
        const t = ((vx - a[0]) * dx + (vy - a[1]) * dy) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const px = a[0] + t * dx, py = a[1] + t * dy;
        if (Math.hypot(px - vx, py - vy) > 2.5e-6) continue;
        if ((vx === a[0] && vy === a[1]) || (vx === b[0] && vy === b[1])) continue;
        hits.push([t, vx, vy]);
      }
    }
    if (hits.length) {
      hits.sort((u, v) => u[0] - v[0]);
      let last = a;
      for (const [, vx, vy] of hits) { if (vx === last[0] && vy === last[1]) continue; out.push([vx, vy]); last = [vx, vy]; inserted++; }
    }
  }
  out.push(ring[ring.length - 1]);
  r.ring[r.idx] = out;
}
console.log('t-junction vertices inserted', inserted);

// ---------------------------------------------------------------------------
let topo = topology({ provinces: { type: 'FeatureCollection', features: provFeatures } });
topo = presimplify(topo, sphericalTriangleArea);
const minW = quantile(topo, 0.42);
topo = simplify(topo, minW);
// keep tiny islands/microstates from vanishing: simplify keeps rings' first/last points
topo = topojsonClient.quantize(topo, 2e5);

// ---------------------------------------------------------------------------
// sea links for amphibious ops and maritime supply
const geoms = topo.objects.provinces.geometries;
const arcUse = new Map();
geoms.forEach((g, gi) => {
  const walk = (arr) => arr.forEach((x) => (Array.isArray(x) ? walk(x) : arcUse.set(x < 0 ? ~x : x, (arcUse.get(x < 0 ? ~x : x) || []).concat(gi))));
  walk(g.arcs);
});
const decoded = topojsonClient.feature(topo, topo.objects.provinces).features;
const neighbors = topojsonClient.neighbors(geoms);
const coastPts = [];
const tf = topo.transform;
function decodeArc(i) {
  const arc = topo.arcs[i]; let x = 0, y = 0; const out = [];
  for (const [dx, dy] of arc) { x += dx; y += dy; out.push([x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]); }
  return out;
}
for (const [ai, users] of arcUse) {
  if (users.length !== 1) continue;
  const pts = decodeArc(ai);
  for (let k = 0; k < pts.length; k += 2) coastPts.push([pts[k][0], pts[k][1], users[0]]);
  provinces[users[0]].coast = true;
}
const SG = 1.5;
const sgrid = new Map();
for (const p of coastPts) { const k = `${Math.floor(p[0] / SG)},${Math.floor(p[1] / SG)}`; if (!sgrid.has(k)) sgrid.set(k, []); sgrid.get(k).push(p); }
const linkBest = new Map();
const hav = (a, b) => {
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
for (const p of coastPts) {
  const gx = Math.floor(p[0] / SG), gy = Math.floor(p[1] / SG);
  for (let ix = -2; ix <= 2; ix++) for (let iy = -2; iy <= 2; iy++) {
    const arr = sgrid.get(`${gx + ix},${gy + iy}`); if (!arr) continue;
    for (const o of arr) {
      if (o[2] <= p[2]) continue;
      if (neighbors[p[2]].includes(o[2])) continue;
      const d = hav(p, o);
      if (d > 280) continue;
      const k = p[2] * 100000 + o[2];
      if (!linkBest.has(k) || linkBest.get(k) > d) linkBest.set(k, d);
    }
  }
}
// keep each province's 6 nearest links
const perProv = new Map();
for (const [k, d] of linkBest) {
  const a = Math.floor(k / 100000), b = k % 100000;
  for (const [x, y] of [[a, b], [b, a]]) { if (!perProv.has(x)) perProv.set(x, []); perProv.get(x).push([y, d]); }
}
const seaLinks = new Set();
for (const [a, list] of perProv) {
  list.sort((u, v) => u[1] - v[1]);
  for (const [b, d] of list.slice(0, 6)) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    seaLinks.add(`${lo},${hi},${Math.round(d)}`);
  }
}
console.log('sea links', seaLinks.size);
void decoded;

// ---------------------------------------------------------------------------
const out = {
  topology: topo,
  provinces: provinces.map((p) => ({
    n: p.name, c: p.nation, f: p.feature, x: +p.sx.toFixed(3), y: +p.sy.toFixed(3), cx: +p.cx.toFixed(3), cy: +p.cy.toFixed(3),
    a: Math.round(p.area), w: +(p.popShare || 0).toFixed(5), u: Math.round(p.urban || 0), t: p.terrain, cap: p.cap ? 1 : 0, co: p.coast ? 1 : 0,
    s: p.sep || 0, d: p.dep || 0, syn: p.synthetic ? 1 : 0,
  })),
  sea: [...seaLinks].map((s) => s.split(',').map(Number)),
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(out));
console.log('wrote', (fs.statSync(path.join(OUT, 'world.json')).size / 1e6).toFixed(2), 'MB');

// flags
const FLAGS = path.resolve('public/flags');
fs.mkdirSync(FLAGS, { recursive: true });
const src = path.resolve('node_modules/flag-icons/flags/4x3');
for (const n of nationsSeen.keys()) {
  const file = path.join(src, n.toLowerCase() + '.svg');
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(FLAGS, n.toLowerCase() + '.svg'));
  else console.warn('missing flag', n);
}
console.log('nations:', [...nationsSeen.keys()].sort().join(' '));
