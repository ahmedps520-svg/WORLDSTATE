import { useEffect, useRef, useState } from 'react';
import { app, store, useUI, select } from '../store';
import { Geo } from '../map/geometry';
import { MapRenderer } from '../map/renderer';
import { onFlagsLoaded } from '../map/flags';
import { attachRenderer } from '../loop';
import { Flag } from './common';
import { fmtPop } from './format';

let geoCache: Geo | null = null;

export function MapView() {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rRef = useRef<MapRenderer | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; p: number } | null>(null);
  const mode = useUI((s) => s.mapMode);
  const selection = useUI((s) => s.selection);
  const replay = useUI((s) => s.replay);
  const tool = useUI((s) => s.tool);
  const showArrows = useUI((s) => s.showArrows);
  const showLabels = useUI((s) => s.showLabels);
  useUI((s) => s.tick);

  useEffect(() => {
    const sim = app.sim!;
    const geo = geoCache || (geoCache = new Geo(sim.w.topology, sim.w.provinces));
    const r = new MapRenderer(baseRef.current!, overRef.current!, geo, sim);
    rRef.current = r;
    attachRenderer(r);
    onFlagsLoaded(() => { r.dirty = true; });
    const resize = () => { const el = wrapRef.current!; r.resize(el.clientWidth, el.clientHeight); };
    resize();
    window.addEventListener('resize', resize);
    app.flyTo = (lon, lat, z) => r.flyTo(lon, lat, z ? r.minK * z * 1.6 : undefined);
    app.flyToNation = (id) => r.flyToNation(id);
    app.requestRender = () => { r.dirty = true; };
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => { const r = rRef.current; if (r) { r.mode = mode; r.dirty = true; } }, [mode]);
  useEffect(() => { const r = rRef.current; if (r) { r.selected = selection ? { kind: selection.kind, id: selection.id } : null; r.dirty = true; } }, [selection]);
  useEffect(() => { const r = rRef.current; if (r) { r.showArrows = showArrows; r.showLabels = showLabels; r.dirty = true; } }, [showArrows, showLabels]);
  useEffect(() => {
    const r = rRef.current; if (!r) return;
    const snaps = app.sim!.w.snapshots;
    r.replay = replay !== null && snaps[replay] ? snaps[replay] : null;
    r.dirty = true;
  }, [replay]);

  // ---------------------------------------------------------------- input
  useEffect(() => {
    const el = overRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: number } | null = null;
    let pinch: { d: number } | null = null;
    const pos = (e: PointerEvent | WheelEvent | MouseEvent) => { const b = el.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = pos(e); pointers.set(e.pointerId, p);
      if (pointers.size === 1) drag = { ...p, moved: 0 };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    };
    const move = (e: PointerEvent) => {
      const r = rRef.current!; const p = pos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        r.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d; return;
      }
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) { r.panBy(dx, dy); el.style.cursor = 'grabbing'; }
        drag.x = p.x; drag.y = p.y;
        setTip(null);
        return;
      }
      const pid = r.pick(p.x, p.y);
      if (pid !== r.hover) { r.hover = pid; store.set({ hover: pid }); }
      setTip(pid >= 0 ? { x: p.x, y: p.y, p: pid } : null);
    };
    const up = (e: PointerEvent) => {
      const r = rRef.current!;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      el.style.cursor = '';
      if (drag && drag.moved <= 4 && e.button === 0) click(r.pick(pos(e).x, pos(e).y), e.shiftKey);
      if (pointers.size === 0) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = pos(e);
      rRef.current!.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
    };
    const dbl = (e: MouseEvent) => { const p = pos(e); rRef.current!.zoomAt(p.x, p.y, 2.2); };
    const leave = () => { setTip(null); const r = rRef.current; if (r) r.hover = -1; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('dblclick', dbl);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl); el.removeEventListener('pointerleave', leave);
    };
  }, []);

  const sim = app.sim!;
  const w = sim.w;
  const p = tip ? w.provinces[tip.p] : null;
  return (
    <div className={`map-wrap ${tool ? 'tool-active' : ''}`} ref={wrapRef}>
      <canvas ref={baseRef} className="map-base" />
      <canvas ref={overRef} className="map-over" />
      {p && tip && (
        <div className="map-tip" style={{ left: Math.min(tip.x + 16, (wrapRef.current?.clientWidth || 9999) - 250), top: tip.y + 14 }}>
          <div className="tip-head"><Flag n={w.nations[p.ctrl]} size={18} /><b>{p.name}</b></div>
          <div className="tip-row">{w.nations[p.ctrl].name}{p.ctrl !== p.owner && <span className="tag red">occupied</span>}</div>
          {p.ctrl !== p.owner && <div className="tip-row muted">De jure: {w.nations[p.owner].short}</div>}
          {p.core !== p.owner && p.core !== p.ctrl && <div className="tip-row muted">Claimed identity: {w.nations[p.core].short}</div>}
          <div className="tip-row muted">{cap(p.terrain)} · {fmtPop(p.pop)} people{p.fort > 0.5 ? ` · Fort ${p.fort.toFixed(1)}` : ''}</div>
          {p.siege > 2 && <div className="tip-row red">Under assault — {Math.round(p.siege)}% overrun</div>}
          {!p.supplied && <div className="tip-row amber">Encircled — supply cut</div>}
          {tool?.kind === 'transfer' && <div className="tip-row amber">Click to give to {w.nations[tool.to].short}</div>}
        </div>
      )}
      {replay !== null && <div className="replay-banner">Viewing history — {new Date(Date.UTC(2026, 10, 19 + (w.snapshots[replay]?.day || 0))).toUTCString().slice(5, 16)} <button onClick={() => store.set({ replay: null })}>Return to live</button></div>}
    </div>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

function click(pid: number, shift: boolean) {
  const sim = app.sim!; const w = sim.w;
  const st = store.get();
  const tool = st.tool;
  if (pid < 0) { if (!tool) store.set({ selection: null }); return; }
  const p = w.provinces[pid];
  if (tool?.kind === 'transfer') { sim.transferProvince(pid, tool.to, tool.annex); return; }
  if (tool?.kind === 'independence') {
    const picks = tool.picks.includes(pid) ? tool.picks.filter((x) => x !== pid) : [...tool.picks, pid];
    store.set({ tool: { kind: 'independence', picks } }); return;
  }
  if (tool?.kind === 'pickNation') { const cb = tool.cb; store.set({ tool: null }); cb(p.ctrl); return; }
  const sel = st.selection;
  if (shift || (sel?.kind === 'nation' && sel.id === p.ctrl) || (sel?.kind === 'province' && w.provinces[sel.id].ctrl === p.ctrl)) select({ kind: 'province', id: pid });
  else select({ kind: 'nation', id: p.ctrl });
}
