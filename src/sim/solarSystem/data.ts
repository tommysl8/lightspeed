/**
 * The shapes of the Solar System data files: public/data/bodies.json (physical data, rotation,
 * colours, discovery, facts and assets of 48 bodies; docs/data/assets.md) and
 * public/data/rings.json (ring systems). The orbit data are read by sim/moonModels.ts
 * (moons.json; docs/data/moons.md) and sim/tracks.ts (tracks.json and tracks.bin;
 * docs/data/tracks.md). Only the fields the app reads are typed.
 */

/** Kinds as the data give them. `tno` is not a registry kind: see records.ts. */
export type DataKind = 'moon' | 'dwarf-planet' | 'asteroid' | 'tno' | 'comet' | 'interstellar' | 'spacecraft';

export interface DataRotation {
  /** iau-2015 | fitted | snapshot | period-only | chaotic | complex | unknown | attitude-controlled */
  model: string;
  poleRaDeg?: number[];
  poleDecDeg?: number[];
  pmDeg?: number[];
  phaseSystem?: string;
  raTerms?: number[];
  decTerms?: number[];
  pmTerms?: number[];
  periodH?: number;
  synchronous?: boolean;
  sense?: string;
  validity?: { fromTdbDays: number; toTdbDays: number; note?: string };
  note?: string;
  source?: string;
}

export interface DataBody {
  id: string;
  name: string;
  kind: DataKind;
  kindNote?: string;
  dwarfPlanetCandidate?: boolean;
  parent?: string;
  naifId?: number;
  radiusKm: number;
  /** 1σ, km, where the source gives one. */
  radiusSigmaKm?: number | null;
  /** mean | volume-equivalent | area-equivalent | placeholder (order of magnitude only) | size-scale (spacecraft) */
  radiusType: string;
  radiusSource?: string;
  triaxialRadiiKm?: [number, number, number];
  dimensionsKm?: [number, number, number];
  gmKm3S2?: number;
  massKg?: number;
  densityGCm3?: number;
  geometricAlbedo?: number | null;
  orbit?: { aKm: number; e: number; iDeg: number; periodD: number; source?: string };
  rotation: DataRotation;
  colour: string;
  colourHue: string;
  colourSource: string;
  sizeNote?: string;
  shapeNote?: string;
  albedoNote?: string;
  discovery?: { by: string; date: string; place?: string; note?: string; source?: string };
  facts: string[];
  factSources: string[];
  spacecraft?: {
    launch: string;
    launchVehicle?: string;
    launchSite?: string;
    mission?: string;
    status?: string;
    statusAsOf?: string;
    statusSource?: string;
    statusCaveat?: string;
  };
  interstellar?: { eccentricity: number; perihelionAu: number; hyperbolicExcessKmS: number; known?: string; unknown?: string };
  assets: {
    texture: string | null;
    textureInfo: {
      width: number;
      height: number;
      channels: number;
      imagedFraction?: number;
      product?: string;
      credit?: string;
      colourNote?: string;
    } | null;
    textureNote?: string;
    model: string | null;
    rings: string | null;
  };
}

export interface BodiesFile {
  format: string;
  version: number;
  phaseAngles: Record<string, { angles: number[][] }>;
  bodies: DataBody[];
}

export interface DataRing {
  name: string;
  radiusKm?: number;
  innerKm?: number;
  outerKm?: number;
  widthKm?: number;
  opticalDepth?: number;
  opticalDepthApparent?: number;
  colour: string;
  arcs?: {
    meanMotionDegPerDay: number;
    opticalDepth?: number;
    list: { name: string; fromDeg: number; toDeg: number }[];
  };
}

export interface RingSystem {
  parent: string;
  /** 'parent-equator', or a pole (null RA/Dec: none adopted). */
  plane: 'parent-equator' | { poleRaDeg: number | null; poleDecDeg: number | null };
  summary?: string;
  sources?: string[];
  rings: DataRing[];
}

export interface RingsFile {
  format: string;
  systems: RingSystem[];
}
