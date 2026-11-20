import { geoGraticule10, geoPath } from 'd3-geo';
import type { Geo } from './geometry';
import type { Sim } from '../sim/engine';
import type { MapMode } from '../store';
import { getFlag } from './flags';
import { frontCache } from '../sim/war';

interface Comp { nation: number; provs: number[]; path: [Path2D, Path2D]; bbox: [number, number, number, number]; area: number; lx: number; ly: number }
interface Transition { p: number; from: number; t0: number }
interface Ping { x: number; y: number; t0: number; color: string; big: boolean }

const TERRAIN_COLOR: Record<string, string> = { plains: '#6f8f5a', forest: '#3f6b45', hills: '#8a8a5c', mountains: '#8b7b6b', desert: '#c9a96a', jungle: '#2f6e4a', arctic: '#c9d4dc', urban: '#9a8f9e' };

export class MapRenderer {
  base: HTMLCanvasElement;
  over: HTMLCanvasElement;
  bctx: CanvasRenderingContext2D;
  octx: CanvasRenderingContext2D;
  geo: Geo;
  sim: Sim;
  view = { x: 0, y: 0, k: 1 };
  W = 1; H = 1; dpr = 1;
  minK = 0.2; maxK = 80;
  comps: Comp[] = [];
  compsByNation = new Map<number, Comp[]>();
  private flipIdx = 0;
  private compKey = '';
  borders: { nation: [Path2D, Path2D]; prov: [Path2D, Path2D]; dejure: [Path2D, Path2D]; coast: [Path2D, Path2D]; front: [Path2D, Path2D]; occupied: [Path2D, Path2D] } | null = null;
  selOutline: { key: string; path: [Path2D, Path2D] } | null = null;
  dirty = true;
  fly: null | { from: { x: number; y: number; k: number }; to: { x: number; y: number; k: number }; t0: number; dur: number } = null;
  transitions: Transition[] = [];
  pings: Ping[] = [];
  hatch: CanvasPattern | null = null;
  graticule: Path2D;
  sphere: Path2D;
  hit: CanvasRenderingContext2D;
  mode: MapMode = 'flags';
  selected: { kind: string; id: number } | null = null;
  hover = -1;
  replay: { ctrl: Uint16Array; owner: Uint16Array } | null = null;
  showArrows = true;
  showLabels = true;
  lastRenderMs = 0;
  private lastFull = 0;

  constructor(base: HTMLCanvasElement, over: HTMLCanvasElement, geo: Geo, sim: Sim) {
    this.base = base; this.over = over; this.geo = geo; this.sim = sim;
    this.bctx = base.getContext('2d', { alpha: false })!;
    this.octx = over.getContext('2d')!;
    const hc = document.createElement('canvas'); hc.width = 2; hc.height = 2;
    this.hit = hc.getContext('2d')!;
    this.graticule = new Path2D();
    geoPath(geo.proj, this.graticule as unknown as CanvasRenderingContext2D)(geoGraticule10());
    this.sphere = new Path2D();
    geoPath(geo.proj, this.sphere as unknown as CanvasRenderingContext2D)({ type: 'Sphere' });
    const pc = document.createElement('canvas'); pc.width = 10; pc.height = 10;
    const pg = pc.getContext('2d')!;
    pg.strokeStyle = 'rgba(10,12,18,0.55)'; pg.lineWidth = 2.2;
    pg.beginPath(); pg.moveTo(-2, 12); pg.lineTo(12, -2); pg.moveTo(-2, 2); pg.lineTo(2, -2); pg.moveTo(8, 12); pg.lineTo(12, 8); pg.stroke();
    this.hatch = this.bctx.createPattern(pc, 'repeat');
  }

  // ------------------------------------------------------------------ view
  resize(w: number, h: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = w; this.H = h;
    for (const c of [this.base, this.over]) { c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
    this.minK = Math.min(w / this.geo.width, h / this.geo.height) * 0.92;
    if (this.view.k < this.minK || this.view.k === 1) this.fit();
    this.clamp();
    this.dirty = true;
  }
  fit() {
    const k = Math.max(this.minK, Math.min(this.W / this.geo.width, this.H / this.geo.height) * 1.02);
    this.view = { k, x: (this.W - this.geo.width * k) / 2, y: (this.H - this.geo.height * k) / 2 + 10 };
  }
  clamp() {
    const v = this.view;
    v.k = Math.max(this.minK, Math.min(this.maxK, v.k));
    const mw = this.geo.width * v.k, mh = this.geo.height * v.k;
    const padX = this.W * 0.45, padY = this.H * 0.45;
    if (mw + padX * 2 < this.W) v.x = (this.W - mw) / 2; else v.x = Math.min(padX, Math.max(this.W - mw - padX, v.x));
    if (mh + padY * 2 < this.H) v.y = (this.H - mh) / 2; else v.y = Math.min(padY, Math.max(this.H - mh - padY, v.y));
  }
  zoomAt(sx: number, sy: number, f: number) {
    const v = this.view;
    const nk = Math.max(this.minK, Math.min(this.maxK, v.k * f));
    const bx = (sx - v.x) / v.k, by = (sy - v.y) / v.k;
    v.k = nk; v.x = sx - bx * nk; v.y = sy - by * nk;
    this.fly = null; this.clamp(); this.dirty = true;
  }
  panBy(dx: number, dy: number) { this.view.x += dx; this.view.y += dy; this.fly = null; this.clamp(); this.dirty = true; }
  flyTo(lon: number, lat: number, k?: number) {
    const [bx, by] = this.geo.project(lon, lat);
    this.flyToBase(bx, by, k ?? Math.max(this.view.k, 3));
  }
  flyToBase(bx: number, by: number, k: number) {
    k = Math.max(this.minK, Math.min(this.maxK, k));
    const to = { k, x: this.W / 2 - bx * k + (this.W > 900 ? -60 : 0), y: this.H / 2 - by * k };
    this.fly = { from: { ...this.view }, to, t0: performance.now(), dur: 950 };
  }
  flyToNation(id: number) {
    const cs = this.compsByNation.get(id);
    if (!cs || !cs.length) return;
    const c = cs.slice().sort((a, b) => b.area - a.area)[0];
    const [x0, y0, x1, y1] = c.bbox;
    const k = Math.min(this.W * 0.55 / Math.max(1, x1 - x0), this.H * 0.6 / Math.max(1, y1 - y0));
    this.flyToBase((x0 + x1) / 2, (y0 + y1) / 2, Math.min(k, 30));
  }
  private stepFly(now: number) {
    if (!this.fly) return;
    const f = this.fly;
    let t = (now - f.t0) / f.dur;
    if (t >= 1) { this.view = { ...f.to }; this.fly = null; this.clamp(); this.dirty = true; return; }
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // interpolate the screen centre in base space and the scale logarithmically
    const cxF = (this.W / 2 - f.from.x) / f.from.k, cyF = (this.H / 2 - f.from.y) / f.from.k;
    const cxT = (this.W / 2 - f.to.x) / f.to.k, cyT = (this.H / 2 - f.to.y) / f.to.k;
    const k = Math.exp(Math.log(f.from.k) + (Math.log(f.to.k) - Math.log(f.from.k)) * t);
    const cx = cxF + (cxT - cxF) * t, cy = cyF + (cyT - cyF) * t;
    this.view = { k, x: this.W / 2 - cx * k, y: this.H / 2 - cy * k };
    this.dirty = true;
  }
  toBase(sx: number, sy: number): [number, number] { return [(sx - this.view.x) / this.view.k, (sy - this.view.y) / this.view.k]; }
  toScreen(bx: number, by: number): [number, number] { return [bx * this.view.k + this.view.x, by * this.view.k + this.view.y]; }

  pick(sx: number, sy: number): number {
    const [bx, by] = this.toBase(sx, sy);
    const lod = this.lod();
    let best = -1, bestArea = Infinity;
    for (let i = 0; i < this.geo.prov.length; i++) {
      const b = this.geo.prov[i].bbox;
      if (bx < b[0] || bx > b[2] || by < b[1] || by > b[3]) continue;
      if (this.hit.isPointInPath(this.geo.prov[i].path[lod], bx, by)) {
        const a = this.geo.prov[i].area;
        if (a < bestArea) { bestArea = a; best = i; }
      }
    }
    return best;
  }
  lod(): 0 | 1 { return this.view.k < 2.4 ? 0 : 1; }

  // ------------------------------------------------------------------ data
  ctrlOf(i: number) { return this.replay ? this.replay.ctrl[i] : this.sim.w.provinces[i].ctrl; }
  ownerOf(i: number) { return this.replay ? this.replay.owner[i] : this.sim.w.provinces[i].owner; }

  /** rebuild territory components and border layers if control changed */
  syncTerritory(now: number) {
    const w = this.sim.w;
    if (!this.replay && w.flipped.length > this.flipIdx) {
      for (let i = this.flipIdx; i < w.flipped.length; i++) {
        const f = w.flipped[i];
        if (f.from !== f.to && this.transitions.length < 300) this.transitions.push({ p: f.p, from: f.from, t0: now });
        if (f.from !== f.to && this.transitions.length < 300) {
          const g = this.geo.prov[f.p];
          if (this.pings.length < 60) this.pings.push({ x: g.cx, y: g.cy, t0: now, color: '#ffb547', big: w.provinces[f.p].capital || w.provinces[f.p].urban > 1.5e6 });
        }
      }
      this.flipIdx = w.flipped.length;
      if (w.flipped.length > 5000) { w.flipped.splice(0, 4000); this.flipIdx = w.flipped.length; }
    }
    const key = this.replay ? `r${this.replay.ctrl.length}:${hashArr(this.replay.ctrl)}:${hashArr(this.replay.owner)}` : `l${hashLive(w)}:${w.wars.filter((x) => x.status === 'active').length}:${w.nations.length}`;
    if (key === this.compKey) return;
    this.compKey = key;
    this.buildComps();
    this.buildBorders();
    this.selOutline = null;
    this.dirty = true;
  }

  private buildComps() {
    const w = this.sim.w;
    const P = w.provinces;
    const N = P.length;
    const seen = new Uint8Array(N);
    this.comps = [];
    this.compsByNation.clear();
    for (let i = 0; i < N; i++) {
      if (seen[i]) continue;
      const c = this.ctrlOf(i);
      const provs: number[] = [];
      const q = [i]; seen[i] = 1;
      while (q.length) {
        const j = q.pop()!;
        provs.push(j);
        for (const n of P[j].neighbors) if (!seen[n] && this.ctrlOf(n) === c) { seen[n] = 1; q.push(n); }
      }
      const lo = new Path2D(), hi = new Path2D();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0, wx = 0, wy = 0;
      for (const j of provs) {
        const g = this.geo.prov[j];
        lo.addPath(g.path[0]); hi.addPath(g.path[1]);
        // ignore far-flung slivers when fitting flags (bbox of provinces with real area)
        x0 = Math.min(x0, g.bbox[0]); y0 = Math.min(y0, g.bbox[1]); x1 = Math.max(x1, g.bbox[2]); y1 = Math.max(y1, g.bbox[3]);
        area += g.area; wx += g.cx * g.area; wy += g.cy * g.area;
      }
      wx /= area || 1; wy /= area || 1;
      // label anchor: province centroid nearest to the area-weighted centre
      let lx = wx, ly = wy, bd = Infinity;
      for (const j of provs) { const g = this.geo.prov[j]; const d = (g.cx - wx) ** 2 + (g.cy - wy) ** 2 - g.area * 0.02; if (d < bd) { bd = d; lx = g.cx; ly = g.cy; } }
      if (provs.length > 2) { lx = (lx + wx) / 2; ly = (ly + wy) / 2; }
      const comp: Comp = { nation: c, provs, path: [lo, hi], bbox: [x0, y0, x1, y1], area, lx, ly };
      this.comps.push(comp);
      if (!this.compsByNation.has(c)) this.compsByNation.set(c, []);
      this.compsByNation.get(c)!.push(comp);
    }
  }

  private buildBorders() {
    const w = this.sim.w;
    const mk = (): [Path2D, Path2D] => [new Path2D(), new Path2D()];
    const b = { nation: mk(), prov: mk(), dejure: mk(), coast: mk(), front: mk(), occupied: mk() };
    for (const a of this.geo.arcs) {
      const add = (t: [Path2D, Path2D]) => { t[0].addPath(a.path[0]); t[1].addPath(a.path[1]); };
      if (a.b < 0) { add(b.coast); continue; }
      const ca = this.ctrlOf(a.a), cb = this.ctrlOf(a.b);
      if (ca !== cb) {
        add(b.nation);
        if (w.isEnemy(ca, cb)) add(b.front);
        else if (this.ownerOf(a.a) !== this.ownerOf(a.b) && false) add(b.dejure);
      } else if (this.ownerOf(a.a) !== this.ownerOf(a.b)) add(b.dejure);
      else add(b.prov);
    }
    for (let i = 0; i < this.geo.prov.length; i++) if (this.ctrlOf(i) !== this.ownerOf(i)) { b.occupied[0].addPath(this.geo.prov[i].path[0]); b.occupied[1].addPath(this.geo.prov[i].path[1]); }
    this.borders = b;
  }

  private selectionOutline(nid: number): [Path2D, Path2D] {
    const key = `${nid}:${this.compKey}`;
    if (this.selOutline?.key === key) return this.selOutline.path;
    const p: [Path2D, Path2D] = [new Path2D(), new Path2D()];
    for (const a of this.geo.arcs) {
      const ca = this.ctrlOf(a.a), cb = a.b >= 0 ? this.ctrlOf(a.b) : -1;
      if ((ca === nid) !== (cb === nid)) { p[0].addPath(a.path[0]); p[1].addPath(a.path[1]); }
    }
    this.selOutline = { key, path: p };
    return p;
  }

  // ------------------------------------------------------------------ colours
  private nationFill(nid: number): string {
    const w = this.sim.w;
    const n = w.nations[nid];
    switch (this.mode) {
      case 'political': return n.color;
      case 'stability': return ramp(n.pol.stability / 100, ['#7a1f24', '#c0532f', '#d9a43c', '#7fae54', '#2f8a5f']);
      case 'economy': return diverge(n.eco.growth, -6, 7);
      case 'military': { const t = Math.min(1, Math.log10(1 + n.power) / Math.log10(25000)); return ramp(t, ['#1b2433', '#24405e', '#2f6a9a', '#4fa0d8', '#bfe3ff']); }
      case 'alliances': {
        const org = w.orgs.find((o) => o.kind === 'defense' && o.dissolved === undefined && o.members.includes(nid) && o.members.length > 2);
        if (org) return org.color;
        const pact = w.treaties.find((t) => t.type === 'defense' && t.until === undefined && (t.a === nid || t.b === nid));
        if (pact) return '#7a6fb0';
        return n.faction ? '#a04848' : '#4a5260';
      }
      case 'relations': {
        const sel = this.selected?.kind === 'nation' ? this.selected.id : -1;
        if (sel < 0) return '#4a5260';
        if (nid === sel) return '#e9c46a';
        if (w.isEnemy(sel, nid)) return '#e0352b';
        if (w.areAllied(sel, nid)) return '#3d7fe0';
        const r = w.getRel(sel, nid);
        return diverge(r, -100, 100, true);
      }
      default: return n.color;
    }
  }

  private provFill(i: number): string {
    const p = this.sim.w.provinces[i];
    switch (this.mode) {
      case 'terrain': return TERRAIN_COLOR[p.terrain];
      case 'devastation': { const t = Math.min(1, p.devast * 1.3 + p.battle * 0.6); return ramp(t, ['#26303a', '#4a3a33', '#7a3b2c', '#b8452a', '#ff6a3d']); }
      case 'population': { const d = p.pop * 1e6 / Math.max(1, p.area); const t = Math.min(1, Math.log10(1 + d) / 3.2); return ramp(t, ['#1d2633', '#2c4157', '#4b6f8a', '#8fb7c9', '#f4f0d8']); }
      default: return '#333';
    }
  }

  // ------------------------------------------------------------------ frame
  frame(now: number) {
    this.stepFly(now);
    this.syncTerritory(now);
    if (this.dirty) {
      // keep interaction smooth: full render at most every ~40ms when slow
      if (this.lastRenderMs < 18 || now - this.lastFull > 60 || !this.fly) { this.renderBase(); this.lastFull = now; this.dirty = false; }
    }
    this.renderOverlay(now);
  }

  renderBase() {
    const t0 = performance.now();
    const g = this.bctx, v = this.view, d = this.dpr, k = v.k;
    const lod = this.lod();
    const w = this.sim.w;
    g.setTransform(d, 0, 0, d, 0, 0);
    // ocean
    const grd = g.createRadialGradient(this.W * 0.5, this.H * 0.45, 50, this.W * 0.5, this.H * 0.5, Math.max(this.W, this.H) * 0.8);
    grd.addColorStop(0, '#0f2133'); grd.addColorStop(1, '#060d16');
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
    g.setTransform(d * k, 0, 0, d * k, d * v.x, d * v.y);
    const vx0 = -v.x / k, vy0 = -v.y / k, vx1 = (this.W - v.x) / k, vy1 = (this.H - v.y) / k;
    const inView = (b: number[]) => !(b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // graticule & sphere
    g.strokeStyle = 'rgba(120,170,220,0.06)'; g.lineWidth = 1 / k; g.stroke(this.graticule);
    g.strokeStyle = 'rgba(120,170,220,0.12)'; g.lineWidth = 1.2 / k; g.stroke(this.sphere);
    const B = this.borders!;
    // coastal glow
    g.strokeStyle = 'rgba(90,160,230,0.10)'; g.lineWidth = 7 / k; g.stroke(B.coast[lod]);
    g.strokeStyle = 'rgba(110,180,240,0.16)'; g.lineWidth = 3 / k; g.stroke(B.coast[lod]);

    const perProvince = this.mode === 'terrain' || this.mode === 'devastation' || this.mode === 'population';
    if (perProvince) {
      for (let i = 0; i < this.geo.prov.length; i++) {
        const gp = this.geo.prov[i]; if (!inView(gp.bbox)) continue;
        g.fillStyle = this.provFill(i); g.fill(gp.path[lod]);
      }
    } else {
      for (const c of this.comps) {
        if (!inView(c.bbox)) continue;
        const n = w.nations[c.nation];
        if (this.mode === 'flags') {
          const sw = (c.bbox[2] - c.bbox[0]) * k;
          const flag = getFlag(n, sw > 700);
          g.save();
          g.clip(c.path[lod]);
          if (flag) {
            const bw = c.bbox[2] - c.bbox[0], bh = c.bbox[3] - c.bbox[1];
            const s = Math.max(bw / 4, bh / 3);
            const fw = s * 4, fh = s * 3;
            g.drawImage(flag, (c.bbox[0] + c.bbox[2]) / 2 - fw / 2, (c.bbox[1] + c.bbox[3]) / 2 - fh / 2, fw, fh);
            // cloth shading: soft vignette towards the territory edge
            const cx = (c.bbox[0] + c.bbox[2]) / 2, cy = (c.bbox[1] + c.bbox[3]) / 2;
            const r = Math.max(bw, bh) * 0.75;
            const sh = g.createRadialGradient(cx - bw * 0.15, cy - bh * 0.2, r * 0.05, cx, cy, r);
            sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.6, 'rgba(0,0,0,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.32)');
            g.fillStyle = sh; g.fillRect(c.bbox[0], c.bbox[1], bw, bh);
          } else { g.fillStyle = n.color; g.fillRect(c.bbox[0], c.bbox[1], c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1]); }
          g.restore();
        } else {
          g.fillStyle = this.nationFill(c.nation); g.fill(c.path[lod]);
        }
      }
      if (this.mode === 'flags') { g.fillStyle = 'rgba(6,10,18,0.14)'; for (const c of this.comps) if (inView(c.bbox)) g.fill(c.path[lod]); }
    }
    // occupation hatch
    if (this.hatch) {
      this.hatch.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
      g.fillStyle = this.hatch; g.fill(B.occupied[lod]);
      g.fillStyle = 'rgba(30,8,8,0.16)'; g.fill(B.occupied[lod]);
    }
    // internal province borders
    const provAlpha = Math.min(0.5, Math.max(0, (k - 0.9) * 0.22));
    if (provAlpha > 0.02) { g.strokeStyle = `rgba(8,10,16,${provAlpha})`; g.lineWidth = 0.7 / k; g.stroke(B.prov[lod]); }
    // de jure borders inside occupied zones
    g.setLineDash([4 / k, 3 / k]); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1 / k; g.stroke(B.dejure[lod]); g.setLineDash([]);
    // national borders: dark casing + light core
    const bw = Math.max(1.2, Math.min(2.6, 1 + k * 0.25));
    g.strokeStyle = 'rgba(5,8,14,0.85)'; g.lineWidth = (bw + 1.6) / k; g.stroke(B.nation[lod]);
    g.strokeStyle = 'rgba(235,240,248,0.55)'; g.lineWidth = Math.max(0.6, bw * 0.4) / k; g.stroke(B.nation[lod]);
    g.strokeStyle = 'rgba(5,8,14,0.6)'; g.lineWidth = 0.9 / k; g.stroke(B.coast[lod]);
    // front lines (static base; animated glow on overlay)
    g.strokeStyle = 'rgba(255,70,50,0.95)'; g.lineWidth = 2.4 / k; g.stroke(B.front[lod]);

    // capitals and cities
    g.setTransform(d, 0, 0, d, 0, 0);
    this.drawMarkers(g, inView);
    if (this.showLabels) this.drawLabels(g);
    this.lastRenderMs = performance.now() - t0;
  }

  private drawMarkers(g: CanvasRenderingContext2D, inView: (b: number[]) => boolean) {
    const w = this.sim.w; const k = this.view.k;
    for (const n of w.nations) {
      if (!n.alive || n.capital < 0) continue;
      const gp = this.geo.prov[n.capital];
      if (!inView([gp.sx, gp.sy, gp.sx, gp.sy])) continue;
      const c = this.compsByNation.get(n.id);
      const big = c ? c.reduce((s, x) => s + x.area, 0) * k * k : 0;
      if (big < 900 && k < 3) continue;
      const [x, y] = this.toScreen(gp.sx, gp.sy);
      const r = Math.min(6.5, 3 + k * 0.4);
      starPath(g, x, y, r);
      g.fillStyle = '#ffe9a8'; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1.5; g.stroke(); g.fill();
    }
    if (k > 3.2) {
      g.font = '500 10.5px Inter, system-ui, sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const placed: number[][] = [];
      for (let i = 0; i < this.geo.prov.length; i++) {
        const gp = this.geo.prov[i]; const p = w.provinces[i];
        if (p.capital) continue;
        const sw = (gp.bbox[2] - gp.bbox[0]) * k;
        if (sw < 70 || !inView([gp.sx, gp.sy, gp.sx, gp.sy])) continue;
        const [x, y] = this.toScreen(gp.sx, gp.sy);
        const tw = p.name.length * 6 + 10;
        if (placed.some((r) => x < r[2] && x + tw > r[0] && y - 7 < r[3] && y + 7 > r[1])) continue;
        placed.push([x - 4, y - 7, x + tw, y + 7]);
        g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1; g.stroke();
        g.lineWidth = 3; g.strokeStyle = 'rgba(5,8,14,0.8)'; g.strokeText(p.name, x + 5, y);
        g.fillStyle = 'rgba(240,244,250,0.92)'; g.fillText(p.name, x + 5, y);
      }
    }
  }

  private drawLabels(g: CanvasRenderingContext2D) {
    const w = this.sim.w; const k = this.view.k;
    const items: { c: Comp; size: number }[] = [];
    for (const [nid, cs] of this.compsByNation) {
      const n = w.nations[nid]; if (!n) continue;
      const c = cs.reduce((a, b) => (b.area > a.area ? b : a), cs[0]);
      const sa = Math.sqrt(c.area) * k;
      if (sa < 26) continue;
      items.push({ c, size: Math.max(9, Math.min(30, sa / 9)) });
    }
    items.sort((a, b) => b.size - a.size);
    const placed: number[][] = [];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const it of items) {
      const n = w.nations[it.c.nation];
      const name = (n.short.length > 14 && it.size < 14 ? n.code.length === 2 ? n.code : n.short : n.short).toUpperCase();
      const [x, y] = this.toScreen(it.c.lx, it.c.ly);
      if (x < -100 || x > this.W + 100 || y < -50 || y > this.H + 50) continue;
      g.font = `700 ${it.size.toFixed(1)}px Inter, system-ui, sans-serif`;
      (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(it.size * 0.12).toFixed(1)}px`;
      const tw = g.measureText(name).width;
      const r = [x - tw / 2 - 2, y - it.size / 2 - 1, x + tw / 2 + 2, y + it.size / 2 + 1];
      if (placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) continue;
      placed.push(r);
      g.lineWidth = Math.max(2.5, it.size * 0.22); g.strokeStyle = 'rgba(4,7,12,0.82)'; g.lineJoin = 'round';
      g.strokeText(name, x, y);
      g.fillStyle = n.faction ? '#ffd0c8' : 'rgba(250,250,252,0.96)';
      g.fillText(name, x, y);
    }
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
  }

  renderOverlay(now: number) {
    const g = this.octx, v = this.view, d = this.dpr, k = v.k;
    const lod = this.lod();
    const w = this.sim.w;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.setTransform(d * k, 0, 0, d * k, d * v.x, d * v.y);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // flip transitions: old owner fades out
    this.transitions = this.transitions.filter((t) => now - t.t0 < 1400);
    for (const t of this.transitions) {
      const a = 1 - (now - t.t0) / 1400;
      const gp = this.geo.prov[t.p];
      g.save(); g.globalAlpha = a * 0.85; g.clip(gp.path[lod]);
      const n = w.nations[t.from];
      const flag = this.mode === 'flags' ? getFlag(n) : null;
      if (flag) { const bw = gp.bbox[2] - gp.bbox[0], bh = gp.bbox[3] - gp.bbox[1]; const s = Math.max(bw / 4, bh / 3); g.drawImage(flag, (gp.bbox[0] + gp.bbox[2]) / 2 - s * 2, (gp.bbox[1] + gp.bbox[3]) / 2 - s * 1.5, s * 4, s * 3); }
      else { g.fillStyle = n.color; g.fill(gp.path[lod]); }
      g.globalAlpha = a; g.fillStyle = 'rgba(255,190,80,0.35)'; g.fill(gp.path[lod]);
      g.restore();
    }
    // contested provinces pulse
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    if (!this.replay) {
      for (const p of w.provinces) {
        if (p.siege < 3 && p.battle < 0.08) continue;
        const gp = this.geo.prov[p.id];
        const a = Math.min(0.42, p.siege / 160 + p.battle * 0.15) * (0.55 + 0.45 * pulse);
        g.fillStyle = `rgba(255,60,40,${a.toFixed(3)})`; g.fill(gp.path[lod]);
        if (!p.supplied) { g.setLineDash([3 / k, 3 / k]); g.lineDashOffset = -now / 80 / k; g.strokeStyle = 'rgba(255,200,60,0.9)'; g.lineWidth = 1.6 / k; g.stroke(gp.path[lod]); g.setLineDash([]); }
      }
    }
    // front glow
    if (this.borders) {
      g.strokeStyle = `rgba(255,80,40,${0.18 + 0.12 * pulse})`; g.lineWidth = 9 / k; g.stroke(this.borders.front[lod]);
      g.setLineDash([6 / k, 9 / k]); g.lineDashOffset = -now / 45 / k;
      g.strokeStyle = 'rgba(255,230,190,0.9)'; g.lineWidth = 1.1 / k; g.stroke(this.borders.front[lod]); g.setLineDash([]);
    }
    // selection outline
    if (this.selected?.kind === 'nation') {
      const p = this.selectionOutline(this.selected.id);
      g.strokeStyle = `rgba(255,214,102,${0.5 + 0.3 * pulse})`; g.lineWidth = 5 / k; g.stroke(p[lod]);
      g.strokeStyle = '#fff3c4'; g.lineWidth = 1.6 / k; g.stroke(p[lod]);
    } else if (this.selected?.kind === 'province') {
      const gp = this.geo.prov[this.selected.id];
      g.fillStyle = 'rgba(255,230,150,0.18)'; g.fill(gp.path[lod]);
      g.strokeStyle = '#ffe08a'; g.lineWidth = 2.2 / k; g.stroke(gp.path[lod]);
    }
    // hover
    if (this.hover >= 0 && this.hover < this.geo.prov.length) {
      const gp = this.geo.prov[this.hover];
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill(gp.path[lod]);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2 / k; g.stroke(gp.path[lod]);
    }
    // relations lines
    g.setTransform(d, 0, 0, d, 0, 0);
    if (this.mode === 'relations' && this.selected?.kind === 'nation') this.drawRelationLines(g, now);
    if (this.showArrows && !this.replay) this.drawArrows(g, now);
    this.drawBattles(g, now);
    // pings
    this.pings = this.pings.filter((p) => now - p.t0 < 1800);
    for (const p of this.pings) {
      const t = (now - p.t0) / 1800;
      const [x, y] = this.toScreen(p.x, p.y);
      g.beginPath(); g.arc(x, y, (p.big ? 10 : 5) + t * (p.big ? 60 : 26), 0, Math.PI * 2);
      g.strokeStyle = hexA(p.color, (1 - t) * 0.9); g.lineWidth = p.big ? 2.5 : 1.6; g.stroke();
    }
  }

  ping(lon: number, lat: number, color = '#7cc4ff', big = true) {
    const [x, y] = this.geo.project(lon, lat);
    this.pings.push({ x, y, t0: performance.now(), color, big });
  }

  private drawBattles(g: CanvasRenderingContext2D, now: number) {
    if (this.replay) return;
    const w = this.sim.w; const k = this.view.k;
    for (const p of w.provinces) {
      if (p.battle < 0.3) continue;
      const gp = this.geo.prov[p.id];
      const [x, y] = this.toScreen(gp.cx, gp.cy);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
      const s = Math.min(9, 3.5 + k * 0.5) * (0.85 + 0.15 * Math.sin(now / 150 + p.id));
      g.save(); g.translate(x, y);
      g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s); g.stroke();
      g.strokeStyle = '#ffd36b'; g.lineWidth = 1.6; g.stroke();
      g.restore();
    }
  }

  private drawArrows(g: CanvasRenderingContext2D, now: number) {
    const w = this.sim.w; const k = this.view.k;
    if (k < 0.5) return;
    for (const war of w.wars) {
      if (war.status !== 'active') continue;
      const fc = frontCache(war.id); if (!fc) continue;
      for (const qid of fc.axes) {
        const q = w.provinces[qid];
        if (q.siege < 4) continue;
        const atkSide = q.siegeBy;
        let src = -1, bf = 0;
        for (const pid of q.neighbors) if (fc.side[pid] === atkSide && fc.force[pid] > bf) { bf = fc.force[pid]; src = pid; }
        if (src < 0) for (const l of q.sea) if (fc.side[l.to] === atkSide && fc.force[l.to] > bf) { bf = fc.force[l.to]; src = l.to; }
        if (src < 0) continue;
        const a = this.geo.prov[src], b = this.geo.prov[qid];
        const [x0, y0] = this.toScreen(a.cx, a.cy), [x1, y1] = this.toScreen(b.cx, b.cy);
        if (Math.max(x0, x1) < 0 || Math.min(x0, x1) > this.W || Math.max(y0, y1) < 0 || Math.min(y0, y1) > this.H) continue;
        const len = Math.hypot(x1 - x0, y1 - y0); if (len < 12) continue;
        const prog = Math.min(1, q.siege / 100);
        const color = atkSide === 1 ? '255,96,64' : '90,170,255';
        arrow(g, x0, y0, x0 + (x1 - x0) * (0.35 + 0.6 * prog), y0 + (y1 - y0) * (0.35 + 0.6 * prog), Math.min(16, 4 + k * 1.2), color, now);
      }
    }
  }

  private drawRelationLines(g: CanvasRenderingContext2D, now: number) {
    const w = this.sim.w; const sel = this.selected!.id;
    const n = w.nations[sel]; if (n.capital < 0) return;
    const a = this.geo.prov[n.capital];
    const [x0, y0] = this.toScreen(a.sx, a.sy);
    const draw = (oid: number, color: string, dash: boolean) => {
      const o = w.nations[oid]; if (!o.alive || o.capital < 0) return;
      const b = this.geo.prov[o.capital];
      const [x1, y1] = this.toScreen(b.sx, b.sy);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.22;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1);
      g.strokeStyle = color; g.lineWidth = 1.6;
      if (dash) { g.setLineDash([5, 6]); g.lineDashOffset = -now / 40; }
      g.stroke(); g.setLineDash([]);
    };
    for (const p of w.defensePartners(sel)) draw(p.id, 'rgba(90,160,255,0.75)', false);
    for (const o of w.nations) if (o.alive && w.isEnemy(sel, o.id)) draw(o.id, 'rgba(255,70,60,0.9)', true);
  }
}

// ------------------------------------------------------------------ helpers
function hashLive(w: Sim['w']) {
  let h = 2166136261;
  for (const p of w.provinces) { h ^= p.ctrl * 131 + p.owner; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hashArr(a: Uint16Array) { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; }

function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

function arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wd: number, rgb: string, now: number) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.save(); g.translate(x0, y0); g.rotate(ang);
  const head = Math.min(len * 0.45, wd * 1.8);
  const body = len - head;
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, `rgba(${rgb},0)`); grad.addColorStop(0.35, `rgba(${rgb},0.55)`); grad.addColorStop(1, `rgba(${rgb},0.95)`);
  g.beginPath();
  g.moveTo(0, -wd * 0.25); g.lineTo(body, -wd * 0.38); g.lineTo(body, -wd * 0.75); g.lineTo(len, 0); g.lineTo(body, wd * 0.75); g.lineTo(body, wd * 0.38); g.lineTo(0, wd * 0.25); g.closePath();
  g.fillStyle = grad; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.stroke();
  // travelling shimmer
  const t = (now / 900) % 1;
  g.beginPath(); g.arc(len * t, 0, wd * 0.18, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  g.restore();
}

function hexToRgb(h: string): [number, number, number] {
  if (h.startsWith('hsl')) {
    const m = h.match(/hsl\((\d+\.?\d*)\s+(\d+)%\s+(\d+)%\)/);
    if (!m) return [128, 128, 128];
    const [hh, s, l] = [+m[1] / 360, +m[2] / 100, +m[3] / 100];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
  }
  const x = parseInt(h.slice(1), 16);
  return [(x >> 16) & 255, (x >> 8) & 255, x & 255];
}
function hexA(h: string, a: number) { const [r, g, b] = hexToRgb(h); return `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`; }
export function ramp(t: number, stops: string[]) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(s)); const f = s - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
export function diverge(v: number, lo: number, hi: number, rel = false) {
  const t = (v - lo) / (hi - lo);
  return ramp(t, rel ? ['#b3322c', '#a8634a', '#4f5662', '#4f8a6a', '#3fb27f'] : ['#b3322c', '#c9733e', '#565d68', '#5f9a5c', '#43c07a']);
}
