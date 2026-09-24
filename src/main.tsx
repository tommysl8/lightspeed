import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

if (import.meta.env.DEV) {
  // Debug handle for development only (tree-shaken from production builds).
  Promise.all([
    import('./sim/sim'),
    import('./controls/cameraController'),
    import('./state/ui'),
    import('@react-three/fiber'),
  ]).then(([s, c, u, fiber]) =>
    Object.assign(window, {
      __ls: {
        sim: s.sim,
        controller: c.controller,
        ui: u.useUI,
        /** Render n frames with a fixed timestep (works while the tab is hidden). */
        step(n = 60, dt = 1 / 60) {
          s.sim.debugDt = dt;
          for (let i = 0; i < n; i++) fiber.advance(performance.now());
          s.sim.debugDt = 0;
        },
      },
    }),
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
