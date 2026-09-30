/**
 * The geometry of the lens's screen passes: the frame (the screen minus the lens box: four rectangles, drawn by the
 * Galaxy layer's plain composite, render/galaxyLayer.ts), the box itself (one rectangle, drawn by the lensed
 * composite, lensComposite.ts), and the photon ring's band (an annulus about the shadow's edge, lensBand.ts).
 *
 * How: the frame's and the box's corners are placed by their vertex shader (shaders/lensBox.vert.glsl) from the
 * half's box uniform and a code per corner, so that each half of the split view draws its own box without new
 * geometry. With no lens the frame's first rectangle is the full-screen quad (the vertices and triangles of
 * PlaneGeometry(2, 2)), so the plain composite is drawn exactly as before. The band is a strip of quads in
 * (azimuth, radial side) placed by its own vertex shader (shaders/lensBand.vert.glsl) round the edge circle in view
 * directions.
 *
 * Why geometry rather than a scissor: the box moves every frame and differs between the halves, and a scissor is
 * already used for the split view itself.
 *
 * Cost: 16 and 4 vertices; the band 2 × 257 at most. Made once.
 *
 * Twins: shaders/lensBox.vert.glsl (the codes), shaders/lensBand.vert.glsl (the band's attributes).
 */
import { BufferAttribute, BufferGeometry } from 'three';

/** Codes of a corner's x or y (shaders/lensBox.vert.glsl): the screen's edges and the box's. */
const SCREEN_LO = 0;
const SCREEN_HI = 1;
const BOX_LO = 2;
const BOX_HI = 3;

/** Quads of four corners (top-left, top-right, bottom-left, bottom-right), as PlaneGeometry(2, 2) orders them. */
function quads(codes: number[][], plain: number[][]): BufferGeometry {
  const n = codes.length;
  const pos = new Float32Array(3 * 4 * n);
  const code = new Float32Array(2 * 4 * n);
  const index: number[] = [];
  for (let q = 0; q < n; q++) {
    for (let k = 0; k < 4; k++) {
      const v = 4 * q + k;
      pos[3 * v] = plain[q][2 * k];
      pos[3 * v + 1] = plain[q][2 * k + 1];
      code[2 * v] = codes[q][2 * k];
      code[2 * v + 1] = codes[q][2 * k + 1];
    }
    const b = 4 * q;
    // PlaneGeometry's triangles: (0, 2, 1) and (2, 3, 1)
    index.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aCode', new BufferAttribute(code, 2));
  return g;
}

/** The full-screen quad's corners, as PlaneGeometry(2, 2) has them. */
const FULL = [-1, 1, 1, 1, -1, -1, 1, -1];
const NONE = [0, 0, 0, 0, 0, 0, 0, 0];

/**
 * The frame: four rectangles round the box (left, right, below, above), the first of them the full-screen quad when
 * there is no box.
 */
export function createFrameGeometry(): BufferGeometry {
  return quads(
    [
      // left: x from the screen's left to the box's x0, all heights
      [SCREEN_LO, SCREEN_HI, BOX_LO, SCREEN_HI, SCREEN_LO, SCREEN_LO, BOX_LO, SCREEN_LO],
      // right: from x1 to the screen's right
      [BOX_HI, SCREEN_HI, SCREEN_HI, SCREEN_HI, BOX_HI, SCREEN_LO, SCREEN_HI, SCREEN_LO],
      // below the box: between x0 and x1, from the bottom to y0
      [BOX_LO, BOX_LO, BOX_HI, BOX_LO, BOX_LO, SCREEN_LO, BOX_HI, SCREEN_LO],
      // above it: from y1 to the top
      [BOX_LO, SCREEN_HI, BOX_HI, SCREEN_HI, BOX_LO, BOX_HI, BOX_HI, BOX_HI],
    ],
    [FULL, NONE, NONE, NONE],
  );
}

/** The lens box: one rectangle from (x0, y0) to (x1, y1); nothing when there is no box. */
export function createBoxGeometry(): BufferGeometry {
  return quads([[BOX_LO, BOX_HI, BOX_HI, BOX_HI, BOX_LO, BOX_LO, BOX_HI, BOX_LO]], [NONE]);
}

/** Segments of the band's annulus. */
export const BAND_SEGMENTS = 256;

/**
 * The band: a strip of BAND_SEGMENTS quads round the edge circle. Each vertex has aBand = (azimuth share 0 … 1,
 * side −1 inside the edge or +1 outside); shaders/lensBand.vert.glsl places it (and draws only the first
 * uBandSegments segments' worth of resolution: all 256 are always drawn, which is cheap).
 */
export function createBandGeometry(): BufferGeometry {
  const n = BAND_SEGMENTS;
  const pos = new Float32Array(3 * 2 * (n + 1));
  const band = new Float32Array(2 * 2 * (n + 1));
  for (let k = 0; k <= n; k++) {
    for (let s = 0; s < 2; s++) {
      const v = 2 * k + s;
      band[2 * v] = k / n;
      band[2 * v + 1] = s === 0 ? -1 : 1;
    }
  }
  const index: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = 2 * k;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aBand', new BufferAttribute(band, 2));
  return g;
}
