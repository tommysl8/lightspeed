/**
 * A thin accretion disc (Cygnus X-1's): each frame, after the lens state (SimDriver) and before the render, the disc's
 * uniforms, exposure and turning (render/disk/diskMap.ts). No mesh in the scene: the lens passes trace it
 * (render/shaders/diskLookup.glsl), so every image the lens makes of it, and only those, is drawn.
 *
 * The disc is drawn while the lens is drawn at a hole whose record has one (View › Gravitational lensing on and its
 * programs compiled), View › Accretion discs is on, and the camera hovers (falls are offered only into the
 * supermassive holes, which have none).
 *
 * Mounted after AccretionFlow and before BlackHoleLens (App.tsx), so its uniforms are current when the lens passes draw.
 *
 * Cost: a few comparisons a frame; the camera's orbit rows when its r changes (render/disk/diskMap.ts).
 */
import { useFrame } from '@react-three/fiber';
import { lens } from '../render/lens/lensState';
import { relView } from '../render/relativisticView';
import { updateDisk, type DiskFrame } from '../render/disk/diskMap';
import { getBody } from '../sim/bodies';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

const frame: DiskFrame = { on: false, disk: null, mKm: 0, rCam: 10, lnG: 0, pxPerRad: 1000, dt: 0, lnExposure: 0, light: 'all', axis: lens.axis };

export function AccretionDisk() {
  useFrame((_, delta) => {
    const disk = lens.active && lens.hole ? (getBody(lens.hole)?.blackHole?.disk ?? null) : null;
    frame.disk = disk;
    frame.on = disk !== null && useUI.getState().accretionDisks && lens.obs.frame === 'static';
    frame.mKm = lens.mKm;
    frame.rCam = lens.obs.r;
    frame.lnG = lens.lnG;
    frame.pxPerRad = lens.pxPerRad;
    // real time, as SimDriver counts it (a stepped frame's own dt), standing still while the simulation is paused
    frame.dt = sim.paused ? 0 : sim.debugDt > 0 ? sim.debugDt : Math.min(delta, 0.1);
    frame.lnExposure = relView.lnExposure;
    frame.light = useUI.getState().diskLight;
    frame.axis = lens.axis;
    updateDisk(frame);
  });
  return null;
}
