import type { BodyId } from '../physics/constants';

export interface BodyVisual {
  /** Surface map (equirectangular, longitude 0 at the centre unless lonOffset says otherwise). */
  map?: string;
  night?: string;
  clouds?: string;
  atmo?: string;
  atmoStrength?: number;
  /** Procedural fallback style. */
  banded?: boolean;
  /** Texture longitude offset, fraction of a turn. */
  lonOffset?: number;
  /** Fill unimaged (black) regions of the map procedurally. */
  fillBlack?: boolean;
}

/**
 * Textures: Solar System Scope (CC BY 4.0), except Pluto: NASA/JHUAPL/SwRI New Horizons global
 * colour mosaic (public domain). Its left edge is longitude 0, so it is offset by half a turn;
 * the southern latitudes New Horizons never saw are filled procedurally.
 */
export const VISUALS: Record<BodyId, BodyVisual> = {
  sun: { map: '2k_sun.jpg' },
  mercury: { map: '2k_mercury.jpg' },
  venus: { map: '2k_venus_atmosphere.jpg', atmo: '#ffe7b8', atmoStrength: 0.3 },
  earth: {
    map: '2k_earth_daymap.jpg',
    night: '2k_earth_nightmap.jpg',
    clouds: '2k_earth_clouds.jpg',
    atmo: '#5f9dff',
    atmoStrength: 0.75,
  },
  moon: { map: '2k_moon.jpg' },
  mars: { map: '2k_mars.jpg', atmo: '#e9a07c', atmoStrength: 0.18 },
  jupiter: { map: '2k_jupiter.jpg', banded: true, atmo: '#f3e2c7', atmoStrength: 0.18 },
  saturn: { map: '2k_saturn.jpg', banded: true, atmo: '#f1e3bf', atmoStrength: 0.16 },
  uranus: { map: '2k_uranus.jpg', banded: true, atmo: '#c4f4f7', atmoStrength: 0.28 },
  neptune: { map: '2k_neptune.jpg', banded: true, atmo: '#8fa8ff', atmoStrength: 0.3 },
  pluto: { map: 'pluto_nh_color.jpg', lonOffset: 0.5, fillBlack: true },
  voyager1: {},
  proxima: {},
};
