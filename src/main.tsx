import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { loadSolarSystem } from './sim/solarSystem';
import { loadStars } from './sim/stars';
import { loadFeaturedExoplanets } from './sim/exoplanets';

if (import.meta.env.DEV) {
  // Debug handle for development only (tree-shaken from production builds).
  Promise.all([
    import('./sim/sim'),
    import('./controls/cameraController'),
    import('./state/ui'),
    import('@react-three/fiber'),
    import('./ui/tripActions'),
    import('./render/relativisticView'),
    import('./sim/travel'),
    import('./sim/chronometer'),
    import('./sim/pulses'),
    import('./lab/notebook'),
    import('./lab/logger'),
    import('./sim/solarSystem'),
    import('./sim/bodies/registry'),
    import('./ui/navigation'),
    import('./sim/stars'),
    import('./content/scenes'),
    import('./sim/exoplanets'),
  ]).then(([s, c, u, fiber, trip, rel, travel, chrono, pulses, notebook, logger, solarSystem, registry, navigation, stars, scenes, exoplanets]) =>
    Object.assign(window, {
      __ls: {
        sim: s.sim,
        controller: c.controller,
        ui: u.useUI,
        trip,
        travel: travel.travel,
        relView: rel.relView,
        chrono: chrono.chrono,
        pulses: pulses.pulses,
        notebook: notebook.useNotebook,
        lab: logger,
        solarSystem,
        registry,
        navigation,
        stars,
        scenes,
        exoplanets,
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

// The moons, dwarf planets, comets and spacecraft: their data load in the background once the
// first frames are up, and they join the scene, the lists and search when they arrive
// (sim/solarSystem).
void loadSolarSystem({ idle: true });

// The 3D stars: the naked-eye ones within a second, then the whole catalogue and the star
// systems, decoded in a worker (sim/stars).
void loadStars({ idle: true });

// The planets of other stars: the eleven featured systems once the stars are in (sim/exoplanets);
// the archive's 6,372 planets load when they are first wanted.
void loadFeaturedExoplanets();
