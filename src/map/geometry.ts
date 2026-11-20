import { geoPath, type GeoProjection } from 'd3-geo';
import { geoMiller } from 'd3-geo-projection';
import * as topojson from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import type { Topology, GeometryCollection } from 'topojson-specification';

export interface ProvGeo { path: [Path2D, Path2D]; bbox: [number, number, number, number]; sx: number; sy: number; cx: number; cy: number; area: number }
export interface ArcGeo { path: [Path2D, Path2D]; a: number; b: number; bbox: [number, number, number, number] }

export class Geo {
  proj: GeoProjection;
  width = 4000;
  height = 0;
  prov: ProvGeo[] = [];
  arcs: ArcGeo[] = [];
  provArcs: number[][] = [];

  constructor(topo: Topology<{ provinces: GeometryCollection }>, seeds: { lon: number; lat: number; cx: number; cy: number }[]) {
    this.proj = geoMiller().precision(0.3);
    // fit populated latitudes (Antarctica excluded)
    this.proj.fitWidth(this.width, { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[-179.9, 84], [179.9, -57]] } } as any);
    const [, y0] = this.proj([0, 84])!;
    const [, y1] = this.proj([0, -57])!;
    this.proj.translate([this.proj.translate()[0], this.proj.translate()[1] - y0]);
    this.height = y1 - y0;

    const pre = presimplify(topo as any);
    const simple = simplify(pre, quantile(pre, 0.55)) as unknown as Topology<{ provinces: GeometryCollection }>;
    const geomsFull = topo.objects.provinces.geometries;
    const geomsLow = simple.objects.provinces.geometries;
    const path = geoPath(this.proj);
    const boundsOf = (f: any) => path.bounds(f);
    for (let i = 0; i < geomsFull.length; i++) {
      const fFull = topojson.feature(topo, geomsFull[i] as any) as any;
      const fLow = topojson.feature(simple, geomsLow[i] as any) as any;
      const pHi = new Path2D();
      geoPath(this.proj, pHi as unknown as CanvasRenderingContext2D)(fFull);
      const pLo = new Path2D();
      geoPath(this.proj, pLo as unknown as CanvasRenderingContext2D)(fLow);
      const b = boundsOf(fFull);
      const s = this.proj([seeds[i].lon, seeds[i].lat]) || [0, 0];
      const c = this.proj([seeds[i].cx, seeds[i].cy]) || s;
      this.prov.push({ path: [pLo, pHi], bbox: [b[0][0], b[0][1], b[1][0], b[1][1]], sx: s[0], sy: s[1], cx: c[0], cy: c[1], area: path.area(fFull) });
      this.provArcs.push([]);
    }
    // arcs and the provinces on each side
    const users: number[][] = topo.arcs.map(() => []);
    geomsFull.forEach((g: any, gi) => {
      const walk = (a: any) => { if (Array.isArray(a)) a.forEach(walk); else { const k = a < 0 ? ~a : a; users[k].push(gi); } };
      walk(g.arcs);
    });
    for (let k = 0; k < topo.arcs.length; k++) {
      const u = users[k];
      if (!u.length) continue;
      const lineHi = topojson.feature(topo, { type: 'LineString', arcs: [k] } as any) as any;
      const lineLo = topojson.feature(simple, { type: 'LineString', arcs: [k] } as any) as any;
      const pHi = new Path2D(); geoPath(this.proj, pHi as unknown as CanvasRenderingContext2D)(lineHi);
      const pLo = new Path2D(); geoPath(this.proj, pLo as unknown as CanvasRenderingContext2D)(lineLo);
      const b = boundsOf(lineHi);
      const id = this.arcs.length;
      this.arcs.push({ path: [pLo, pHi], a: u[0], b: u.length > 1 && u[1] !== u[0] ? u[1] : -1, bbox: [b[0][0], b[0][1], b[1][0], b[1][1]] });
      for (const p of new Set(u)) this.provArcs[p].push(id);
    }
  }

  project(lon: number, lat: number): [number, number] { return (this.proj([lon, lat]) as [number, number]) || [0, 0]; }
  invert(x: number, y: number): [number, number] | null { return (this.proj.invert!([x, y]) as [number, number]) || null; }
}
