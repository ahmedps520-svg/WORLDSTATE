import type { Nation } from '../sim/types';

// Rasterised flag cache. SVG flags are drawn once into bitmaps so the map can
// stretch them across territory every frame without re-rasterising vectors.
const LO = { w: 480, h: 360 };
const HI = { w: 1600, h: 1200 };

interface Entry { lo: HTMLCanvasElement | null; hi: HTMLCanvasElement | null; img: HTMLImageElement | null; loading: boolean; hiPending: boolean }
const cache = new Map<string, Entry>();
let onLoad: () => void = () => {};
export function onFlagsLoaded(cb: () => void) { onLoad = cb; }

function raster(img: HTMLImageElement | null, w: number, h: number, n?: Nation) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (img) g.drawImage(img, 0, 0, w, h);
  else if (n) drawGenerated(g, w, h, n.flagColors || ['#555', '#999', '#333'], n.flagDesign ?? 0);
  return c;
}

export function flagKey(n: Nation) { return n.flag || `gen:${n.id}`; }

export function getFlag(n: Nation, hi = false): HTMLCanvasElement | null {
  const key = flagKey(n);
  let e = cache.get(key);
  if (!e) {
    e = { lo: null, hi: null, img: null, loading: false, hiPending: false };
    cache.set(key, e);
    if (!n.flag) { e.lo = raster(null, LO.w, LO.h, n); e.hi = raster(null, HI.w, HI.h, n); }
    else {
      e.loading = true;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { e!.img = img; e!.lo = raster(img, LO.w, LO.h); e!.loading = false; onLoad(); };
      img.onerror = () => { e!.loading = false; e!.lo = raster(null, LO.w, LO.h, { ...n, flagColors: ['#666', '#888', '#444'] }); };
      img.src = n.flag;
    }
  }
  if (hi) {
    if (e.hi) return e.hi;
    if (e.img && !e.hiPending) {
      e.hiPending = true;
      const ent = e;
      setTimeout(() => { ent.hi = raster(ent.img, HI.w, HI.h); onLoad(); }, 0);
    }
  }
  return e.lo;
}

export function flagDataUrl(n: Nation): string {
  if (n.flag) return n.flag;
  const c = getFlag(n);
  return c ? c.toDataURL() : '';
}

/** procedural flags for breakaway states and rebel movements */
export function drawGenerated(g: CanvasRenderingContext2D, w: number, h: number, col: string[], design: number) {
  const [a, b, c] = col;
  g.save();
  switch (design % 12) {
    case 0: // horizontal tricolour
      g.fillStyle = a; g.fillRect(0, 0, w, h / 3); g.fillStyle = b; g.fillRect(0, h / 3, w, h / 3); g.fillStyle = c; g.fillRect(0, 2 * h / 3, w, h / 3); break;
    case 1: // vertical tricolour
      g.fillStyle = a; g.fillRect(0, 0, w / 3, h); g.fillStyle = b; g.fillRect(w / 3, 0, w / 3, h); g.fillStyle = c; g.fillRect(2 * w / 3, 0, w / 3, h); break;
    case 2: // bicolour with star
      g.fillStyle = a; g.fillRect(0, 0, w, h / 2); g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2); star(g, w * 0.25, h * 0.5, h * 0.2, c); break;
    case 3: // hoist triangle
      g.fillStyle = a; g.fillRect(0, 0, w, h / 2); g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
      g.fillStyle = c; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.42, h / 2); g.lineTo(0, h); g.fill(); star(g, w * 0.13, h / 2, h * 0.12, '#fff'); break;
    case 4: // nordic cross
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(w * 0.28, 0, w * 0.14, h); g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = c; g.fillRect(w * 0.31, 0, w * 0.08, h); g.fillRect(0, h * 0.46, w, h * 0.08); break;
    case 5: // disc
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2); g.fill(); star(g, w / 2, h / 2, h * 0.16, c); break;
    case 6: // diagonal
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = c; g.beginPath(); g.moveTo(w, 0); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.strokeStyle = b; g.lineWidth = h * 0.14; g.beginPath(); g.moveTo(0, h); g.lineTo(w, 0); g.stroke(); break;
    case 7: // canton with stripes
      for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * h / 7, w, h / 7); }
      g.fillStyle = c; g.fillRect(0, 0, w * 0.42, h * 4 / 7); star(g, w * 0.21, h * 2 / 7, h * 0.13, '#fff'); break;
    case 8: // chevron
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.5, h / 2); g.lineTo(0, h); g.fill();
      g.fillStyle = c; g.fillRect(w * 0.5, h * 0.4, w * 0.5, h * 0.2); break;
    case 9: // saltire
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.strokeStyle = b; g.lineWidth = h * 0.18;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); star(g, w / 2, h / 2, h * 0.14, c); break;
    case 10: // quartered
      g.fillStyle = a; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.fillStyle = b; g.fillRect(w / 2, 0, w / 2, h / 2); g.fillRect(0, h / 2, w / 2, h / 2);
      star(g, w / 2, h / 2, h * 0.16, c); break;
    default: // band with emblem
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, h * 0.3, w, h * 0.4); star(g, w / 2, h / 2, h * 0.15, c); break;
  }
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.42 : r; const a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
