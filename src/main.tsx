import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { loadSolarSystem } from './sim/solarSystem';
import { loadStars } from './sim/stars';
import { loadFeaturedExoplanets } from './sim/exoplanets';
import { loadGalaxy } from './sim/galaxy';
import { loadCosmos } from './sim/cosmos';

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
    import('./render/materials'),
    import('./sim/galaxy'),
    import('./render/galaxyLayer'),
    import('./sim/cosmos'),
  ]).then(([s, c, u, fiber, trip, rel, travel, chrono, pulses, notebook, logger, solarSystem, registry, navigation, stars, scenes, exoplanets, materials, galaxy, galaxyLayer, cosmos]) =>
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
        materials,
        galaxy,
        galaxyLayer: galaxyLayer.galaxyLayer,
        cosmos,
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

// The Milky Way: Sagittarius A* and its stars at once, the nebulae soon after, and the model of the
// Galaxy and the star clusters once the stars are in (sim/galaxy).
void loadGalaxy({ idle: true });

// The galaxies beyond: the Local Group and the named galaxies, clusters and young galaxies once the
// browser is idle, their shapes built in a worker; the cosmic web loads when it is first wanted
// (sim/cosmos).
void loadCosmos({ idle: true });
