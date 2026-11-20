import { createRoot } from 'react-dom/client';
import { Sim } from './sim/engine';
import type { WorldData } from './sim/world';
import { app } from './store';
import { startLoop } from './loop';
import { App } from './App';
import './styles.css';

async function boot() {
  const status = document.getElementById('boot-status');
  const set = (t: string) => { if (status) status.textContent = t; };
  set('Loading world geography…');
  const res = await fetch('data/world.json');
  const data = (await res.json()) as WorldData;
  set('Seeding 196 governments…');
  await new Promise((r) => setTimeout(r, 30));
  const scenario = location.hash === '#clean' ? 'clean' : 'present';
  const seed = Math.floor(Math.random() * 1e9);
  app.sim = new Sim(data, seed, scenario);
  set('Projecting the map…');
  await new Promise((r) => setTimeout(r, 30));
  createRoot(document.getElementById('root')!).render(<App />);
  startLoop();
  setTimeout(() => document.getElementById('boot')?.classList.add('done'), 300);
  (window as unknown as { worldstate: typeof app }).worldstate = app;
}
boot().catch((e) => { const s = document.getElementById('boot-status'); if (s) s.textContent = 'Failed to start: ' + e.message; console.error(e); });
