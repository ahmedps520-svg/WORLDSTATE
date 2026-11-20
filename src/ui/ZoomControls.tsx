import { app } from '../store';
import { Icon } from './common';
import { getRenderer } from '../loop';

export function ZoomControls() {
  const z = (f: number) => { const r = getRenderer(); if (r) r.zoomAt(r.W / 2, r.H / 2, f); };
  return (
    <div className="zoom panel">
      <button title="Zoom in" onClick={() => z(1.6)}><Icon name="plus" /></button>
      <button title="Zoom out" onClick={() => z(1 / 1.6)}><Icon name="minus" /></button>
      <button title="Whole world" onClick={() => { const r = getRenderer(); if (r) { r.flyToBase(r.geo.width / 2, r.geo.height / 2, r.minK * 1.08); } void app; }}><Icon name="home" /></button>
    </div>
  );
}
