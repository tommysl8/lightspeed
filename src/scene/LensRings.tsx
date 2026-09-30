/**
 * Rings and arcs of light where a body lines up almost exactly behind a black hole: the Sun
 * seen from beyond Sgr A* or Gaia BH1 on the line through both, an S-star passing behind the hole, a companion
 * behind its own hole while its disc is under a pixel (from a pixel up the lens draws the companion as a sphere,
 * its ring included, and none is drawn here). sim/lensBodies.ts finds them (BodyState.lens.ring: the ring's circle in the view
 * observer's frame, its arcs, all its light, its colour) and fades the two images' glints out as the ring fades
 * in over z = β/ρ from 3.5 to 2.5; this draws up to eight of them, one instanced quad each over the ring's box
 * (layer 1 with the glints, render order 21, additive).
 *
 * Brightness: a ring spreads its light along its arcs, L device px long, so each stretch a PSF wide holds
 * f_σ = F σ√(2π)/L of the total F, shown as a star of that flux is (peak uStarGain √f_σ, capped as the PSF caps
 * it, fading at the eye's limit for stars), across a Gaussian of the PSF's σ for the total flux; the exposure
 * applies as to every point. The crossfade scales that peak by the ring's share w, as the glints' fade scales
 * theirs by 1 − w, and nothing jumps. (The display is not additive: a point shows as √flux and eases towards
 * white, so midway the summed brightness on screen swells smoothly, by about 40 % for the Sun behind Sgr A* at
 * V −1.6, where both looks are near white; the ring alone shows 12 % more than the two glints: measured in a
 * float target, before tone mapping.) Colour: the blackbody at T·D.
 *
 * Cost: nothing while no ring shows (the mesh is hidden); per ring 32 projected points on the CPU and a quad
 * of its box on the GPU (well under 0.02 ms). Twins: render/shaders/lensRing.*.glsl; render/lensRingMaterial.ts.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, Quaternion, Vector3, Vector4, type PerspectiveCamera } from 'three';
import { sampleBlackbody, type BlackbodySample } from '../physics/blackbody';
import { createLensRingMaterial } from '../render/lensRingMaterial';
import { lens } from '../render/lens/lensState';
import { psfUniforms } from '../render/materials';
import { relView } from '../render/relativisticView';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { getBody } from '../sim/bodies';
import { pixelsPerRadian } from '../sim/derived';
import { lensRings, MAG_PER_LN, MAX_RINGS } from '../sim/lensBodies';
import { sim } from '../sim/sim';
import { STAR_MAG_LIMIT } from '../sim/stars/visibility';

/** The PSF's peak cap (render/shaders/psf.glsl PSF_PEAK_MAX, its twin). */
const PSF_PEAK_MAX = 24;
/** Points round a ring projected for its box. */
const BOX_POINTS = 32;

const invQ = new Quaternion();
const u = new Vector3();
const w = new Vector3();
const p = new Vector3();
const clip = new Vector4();
const bb: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function LensRings() {
  const material = useMemo(createLensRingMaterial, []);
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(2, 2);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('aBox', new InstancedBufferAttribute(new Float32Array(4 * MAX_RINGS), 4));
    g.setAttribute('aCentre', new InstancedBufferAttribute(new Float32Array(3 * MAX_RINGS), 3));
    g.setAttribute('aTowards', new InstancedBufferAttribute(new Float32Array(3 * MAX_RINGS), 3));
    g.setAttribute('aRingA', new InstancedBufferAttribute(new Float32Array(4 * MAX_RINGS), 4));
    g.setAttribute('aRingB', new InstancedBufferAttribute(new Float32Array(4 * MAX_RINGS), 4));
    g.instanceCount = 0;
    return g;
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<Mesh | null>(null);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    const count = lensRings.count;
    if (count === 0) {
      if (m.visible) m.visible = false;
      geometry.instanceCount = 0;
      return;
    }
    const cam = camera as PerspectiveCamera;
    const P = cam.projectionMatrix;
    invQ.copy(sim.camera.quat).invert();
    const dpr = psfUniforms.uPixelRatio.value;
    const m0 = psfUniforms.uMagZero.value;
    const gain = psfUniforms.uStarGain.value;
    const widthDev = Math.max(1, sim.viewport.width * dpr);
    const heightDev = Math.max(1, sim.viewport.height * dpr);
    const pxPerRadDev = pixelsPerRadian() * dpr;
    const splitNdc = relView.split ? 2 * relView.splitX - 1 : NaN;
    const box = (geometry.getAttribute('aBox') as InstancedBufferAttribute).array as Float32Array;
    const cen = (geometry.getAttribute('aCentre') as InstancedBufferAttribute).array as Float32Array;
    const tow = (geometry.getAttribute('aTowards') as InstancedBufferAttribute).array as Float32Array;
    const ra = (geometry.getAttribute('aRingA') as InstancedBufferAttribute).array as Float32Array;
    const rb = (geometry.getAttribute('aRingB') as InstancedBufferAttribute).array as Float32Array;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const ring = lensRings.owners[i]?.lens?.ring;
      if (!ring || !(ring.share > 0)) continue;
      // A companion the lens draws as a sphere of its own (render/lens/lensState.ts lens.spheres) has every image,
      // its ring included, drawn pixel by pixel there; a ring here too would count its light twice (as Glints.tsx
      // leaves out its glint).
      if (lens.spheres.includes(lensRings.owners[i]!.id)) continue;
      const lum = !!getBody(lensRings.owners[i]!.id)?.physical.luminous;
      // Brightness (device px): the total, then the light of one PSF-wide stretch of the arcs.
      const mag = ring.magnitude - MAG_PER_LN * relView.lnExposure;
      const flux = Math.pow(10, -0.4 * (mag - m0));
      const sigma = dpr * Math.min(2.6, Math.max(0.5, 0.62 * Math.pow(flux, 0.1)));
      const arcs = ring.arcHalf >= Math.PI / 2 ? 2 * Math.PI : 4 * ring.arcHalf;
      const lengthPx = arcs * ring.radius * pxPerRadDev;
      const fSigma = flux * Math.min(1, (sigma * Math.sqrt(2 * Math.PI)) / Math.max(lengthPx, 1e-9));
      const magSigma = m0 - 2.5 * Math.log10(fSigma);
      const fade = lum ? 1 - smooth(STAR_MAG_LIMIT - 0.5, STAR_MAG_LIMIT + 0.5, magSigma) : 1;
      // The crossfade scales what is drawn, as the glints' own fade does (Glints.tsx aFade), not the flux, whose
      // square root the display shows: the two halves then add up to a straight blend of the two looks, with no
      // bump in the middle (√w + √(1 − w) would give 41 % more at w = ½).
      const peak = Math.min(gain * Math.sqrt(fSigma), PSF_PEAK_MAX) * fade * ring.share;
      if (!(peak > 0.0015)) continue;
      // Camera-space centre and primary arc, and the ring's box from points round it.
      const c = ring.centre;
      u.copy(ring.towards);
      w.crossVectors(c, u);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let behind = false;
      const cr = Math.cos(ring.radius);
      const sr = Math.sin(ring.radius);
      for (let k = 0; k < BOX_POINTS; k++) {
        const a = (2 * Math.PI * k) / BOX_POINTS;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        p.set(cr * c.x + sr * (ca * u.x + sa * w.x), cr * c.y + sr * (ca * u.y + sa * w.y), cr * c.z + sr * (ca * u.z + sa * w.z)).applyQuaternion(invQ);
        if (p.z >= 0) {
          behind = true;
          break;
        }
        clip.set(p.x, p.y, p.z, 1).applyMatrix4(P);
        const nx = clip.x / clip.w;
        const ny = clip.y / clip.w;
        if (nx < x0) x0 = nx;
        if (nx > x1) x1 = nx;
        if (ny < y0) y0 = ny;
        if (ny > y1) y1 = ny;
      }
      const marginX = (2 * (3 * sigma + 2)) / widthDev;
      const marginY = (2 * (3 * sigma + 2)) / heightDev;
      if (behind) {
        x0 = -1;
        y0 = -1;
        x1 = 1;
        y1 = 1;
      } else {
        x0 = Math.max(-1, x0 - marginX);
        y0 = Math.max(-1, y0 - marginY);
        x1 = Math.min(1, x1 + marginX);
        y1 = Math.min(1, y1 + marginY);
      }
      // In a split view, only over its own half's columns.
      if (relView.split) {
        if (ring.half === 0) x1 = Math.min(x1, splitNdc);
        else x0 = Math.max(x0, splitNdc);
      }
      if (!(x1 > x0) || !(y1 > y0)) continue;
      box[4 * n] = x0;
      box[4 * n + 1] = y0;
      box[4 * n + 2] = x1;
      box[4 * n + 3] = y1;
      p.copy(c).applyQuaternion(invQ);
      cen[3 * n] = p.x;
      cen[3 * n + 1] = p.y;
      cen[3 * n + 2] = p.z;
      p.copy(u).applyQuaternion(invQ);
      tow[3 * n] = p.x;
      tow[3 * n + 1] = p.y;
      tow[3 * n + 2] = p.z;
      ra[4 * n] = 2 * Math.sin(ring.radius / 2);
      ra[4 * n + 1] = Math.cos(ring.radius / 2);
      ra[4 * n + 2] = ring.arcHalf >= Math.PI / 2 ? -1 : Math.cos(ring.arcHalf);
      ra[4 * n + 3] = peak;
      const col = sampleBlackbody(ring.lnT + ring.lnD, bb);
      rb[4 * n] = col.r;
      rb[4 * n + 1] = col.g;
      rb[4 * n + 2] = col.b;
      rb[4 * n + 3] = sigma;
      n++;
    }
    geometry.instanceCount = n;
    m.visible = n > 0;
    geometry.getAttribute('aBox').needsUpdate = true;
    geometry.getAttribute('aCentre').needsUpdate = true;
    geometry.getAttribute('aTowards').needsUpdate = true;
    geometry.getAttribute('aRingA').needsUpdate = true;
    geometry.getAttribute('aRingB').needsUpdate = true;
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={21}
      visible={false}
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
    />
  );
}
