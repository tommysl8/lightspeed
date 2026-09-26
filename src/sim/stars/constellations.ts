/**
 * The 88 IAU constellations of public/data/constellations.json (docs/data/stars.md §3.5): stick
 * figures as polylines of catalogue star indices, drawn between the stars' 3D positions, so the
 * figures come apart as you fly away. Figures and names: d3-celestial by Olaf Frohn (BSD 3-Clause).
 */

export interface ConstellationJson {
  abbr: string;
  name: string;
  genitive: string;
  english: string;
  rank: number;
  /** d3-celestial's label position, J2000 RA and Dec in degrees. */
  label: [number, number];
  /** Polylines of stars3d indices. */
  lines: number[][];
  stars: { i: number; hip: number | null; name: string | null; v: number }[];
}

export interface ConstellationsFile {
  format: 'lightspeed.constellations';
  version: number;
  constellations: ConstellationJson[];
}

/** Every figure segment as a pair of star indices, [a0, b0, a1, b1, …], with the constellation of each. */
export function constellationSegments(file: ConstellationsFile): { pairs: Uint32Array; owner: Uint8Array } {
  const pairs: number[] = [];
  const owner: number[] = [];
  file.constellations.forEach((c, k) => {
    for (const line of c.lines) {
      for (let s = 0; s + 1 < line.length; s++) {
        pairs.push(line[s], line[s + 1]);
        owner.push(k);
      }
    }
  });
  return { pairs: Uint32Array.from(pairs), owner: Uint8Array.from(owner) };
}

/** The distinct stars of each constellation's figure (for placing its name). */
export function figureStars(c: ConstellationJson): number[] {
  return [...new Set(c.lines.flat())];
}
