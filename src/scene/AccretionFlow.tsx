/**
 * Sagittarius A*'s accretion flow: renders the flow map (render/flow/flowMap.ts) in a priority-0 frame, after the lens
 * state (SimDriver) and before the render, when the camera's r, the lens frame, the flow's angle to the camera–hole
 * line, the band, the blur or the quality rung has changed, and lets further jittered samples average into it while
 * nothing does. No mesh in the scene: the lens passes read the map (render/shaders/flowLookup.glsl).
 *
 * The flow is drawn resolved only while the lens is drawn at Sagittarius A* (View › Gravitational lensing on and its
 * programs compiled), View › Accretion flow is on, and its ring is over 1.5 device px across (sim/blackholes/accretion.ts
 * flowPointShare, from the lens's own r: also under dev/lensTest.ts's forced cameras); until 3 px its point (the
 * hole's glint) fades out as the map fades in.
 *
 * Mounted after Glints and LensRings and before BlackHoleLens (App.tsx), so the map is current when the lens passes
 * draw.
 *
 * Cost: the map's (the visible map 0.31–0.37 ms of GPU when rebuilt at rung 0, nothing while the camera is still:
 * docs/data/blackholes.md §7); here a few comparisons a frame, nothing allocated.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { lens } from '../render/lens/lensState';
import { quality } from '../render/quality';
import { relView } from '../render/relativisticView';
import { updateFlowMap, type FlowFrame } from '../render/flow/flowMap';
import { FLOW_HOLE, flowPixelScale, flowPointShare } from '../sim/blackholes/accretion';
import { getBody } from '../sim/bodies';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';

const frame: FlowFrame = {
  on: false,
  obs: { frame: 'static', r: Infinity },
  axis: lens.axis,
  pointShare: 1,
  band: 'visible',
  blur: false,
  rung: 0,
  pxPerRad: 1000,
  lnExposure: 0,
  pointMag: 99,
  viewFwd: new Vector3(0, 0, -1),
  viewHalfDiag: 0.8,
};

export function AccretionFlow() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    flowPixelScale.devicePxPerRad = lens.pxPerRad;
    const ui = useUI.getState();
    const here = lens.active && lens.hole === FLOW_HOLE && ui.accretionFlow && getBody(FLOW_HOLE)?.blackHole?.flow !== undefined;
    frame.pointShare = here ? flowPointShare(lens.obs.frame === 'rain' ? 0 : lens.obs.r, lens.pxPerRad) : 1;
    frame.on = here && frame.pointShare < 1;
    frame.obs.frame = lens.obs.frame;
    frame.obs.r = lens.obs.r;
    frame.axis = lens.axis;
    frame.band = ui.accretionBand;
    frame.blur = ui.ehtBlur;
    frame.rung = quality.lensRung;
    frame.pxPerRad = lens.pxPerRad;
    frame.lnExposure = relView.lnExposure;
    // The point's magnitude as the hole's glint draws it (the handover from the point to the picture: flowMap.ts).
    frame.pointMag = sim.bodies[FLOW_HOLE]?.magnitude ?? 99;
    frame.viewFwd.set(0, 0, -1).applyQuaternion(sim.camera.quat);
    const tanHalf = Math.tan((sim.camera.fovDeg * Math.PI) / 360);
    const aspect = sim.viewport.width / Math.max(1, sim.viewport.height);
    frame.viewHalfDiag = Math.atan(tanHalf * Math.sqrt(1 + aspect * aspect));
    updateFlowMap(gl, frame);
  });
  return null;
}
