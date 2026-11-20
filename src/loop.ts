import { app, store, SPEEDS } from './store';
import type { MapRenderer } from './map/renderer';
import type { NewsItem } from './sim/types';

let renderer: MapRenderer | null = null;
let last = performance.now();
let acc = 0;
let lastUi = 0;
let toastSeq = 0;
const pendingNews: NewsItem[] = [];

export function attachRenderer(r: MapRenderer) { renderer = r; }

export function startLoop() {
  const sim = app.sim!;
  sim.w.onNews = (n) => pendingNews.push(n);
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = store.get();
    const t0 = performance.now();
    if (s.skipping) {
      // run flat-out until the target day, keeping the page responsive
      while (sim.w.day < s.skipping.target && performance.now() - t0 < 28) sim.step();
      if (sim.w.day >= s.skipping.target) store.set({ skipping: null });
    } else if (!s.paused && s.replay === null) {
      acc += dt * SPEEDS[s.speed].dps;
      const budget = SPEEDS[s.speed].dps > 300 ? 22 : 12;
      let steps = 0;
      while (acc >= 1 && performance.now() - t0 < budget) { sim.step(); acc -= 1; steps++; }
      if (acc > 3) acc = Math.min(acc, SPEEDS[s.speed].dps > 300 ? 1 : 3);
      void steps;
    }
    flushNews(now);
    if (renderer) {
      renderer.frame(now);
    }
    if (now - lastUi > 220 && sim.version !== (lastUi as unknown as number)) {
      lastUi = now;
      store.set((st) => ({ tick: st.tick + 1, toasts: st.toasts.filter((t) => now - t.at < 7000) }));
      if (renderer && renderer.mode !== 'flags' && renderer.mode !== 'political') renderer.dirty = true;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function flushNews(now: number) {
  if (!pendingNews.length) return;
  const st = store.get();
  const fast = st.skipping || SPEEDS[st.speed].dps > 60;
  const toasts = [...st.toasts];
  for (const n of pendingNews.splice(0)) {
    if (renderer && n.loc && n.imp >= (fast ? 5 : 3)) renderer.ping(n.loc[0], n.loc[1], n.cat === 'war' || n.cat === 'battle' ? '#ff6a4d' : n.cat === 'disaster' ? '#ffcf5a' : n.cat === 'politics' ? '#c58bff' : '#6fb8ff', n.imp >= 4);
    if (n.imp >= 5 && !st.skipping && SPEEDS[st.speed].dps <= 30) toasts.push({ id: toastSeq++, title: n.title, body: n.body, cat: n.cat, at: now, nid: n.nations[0], prov: n.prov, war: n.war });
  }
  store.set({ toasts: toasts.slice(-2) });
}

export function skipDays(days: number) {
  const sim = app.sim!;
  store.set({ skipping: { target: sim.w.day + days, start: sim.w.day } });
}

export function getRenderer() { return renderer; }
