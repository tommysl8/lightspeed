import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { controller } from '../controls/cameraController';
import { updateDerived } from '../sim/derived';
import { updateEphemeris } from '../sim/ephemeris';
import { earthLight, updateApparentPositions, updateEarthLight } from '../sim/lightDelay';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { tickClock, tickTrip } from '../sim/tick';
import { updateShipKinematics } from '../sim/shipKinematics';
import { updatePulses } from '../sim/pulses';
import { labArrival, labFrame } from '../lab/logger';
import { useUI } from '../state/ui';
import { psfUniforms } from '../render/materials';
import { updateRelativisticView } from '../render/relativisticView';
import { onArrival } from '../ui/tripActions';
import { pickBody } from './picking';

/**
 * Runs first every frame: advance the clock, update the ephemeris and any trip, move the
 * camera, then sync the three.js camera. It stays at the origin and only takes the
 * orientation: the floating origin.
 */
export function SimDriver() {
  const { camera, gl, size } = useThree();
  const initialised = useRef(false);

  useEffect(() => {
    controller.attach(gl.domElement);
    controller.onClick = (x, y) => useUI.getState().select(pickBody(x, y));
    controller.onDoubleClick = (x, y) => {
      const id = pickBody(x, y);
      if (id) {
        useUI.getState().select(id);
        controller.goTo(id);
      }
    };
    return () => controller.detach();
  }, [gl]);

  useFrame((_, delta) => {
    const dtReal = sim.debugDt > 0 ? sim.debugDt : Math.min(delta, 0.1);
    const ui = useUI.getState();
    sim.sizeMode = ui.sizeMode;
    sim.viewport.width = size.width;
    sim.viewport.height = size.height;
    const cam = camera as PerspectiveCamera;
    sim.camera.fovDeg = cam.fov;

    // Clock: a real trip plays by ship time and sets the Earth clock from it; a clock showing
    // the present follows the computer's clock (frames are clamped, and stop in a hidden tab or
    // under a reading page); otherwise the clock runs at the time warp. Scripted stepping
    // (debugDt) keeps to its own steps.
    const dtSim = tickClock(dtReal, sim.debugDt > 0 ? undefined : Date.now());

    // World
    updateEphemeris();
    if (!initialised.current) {
      initialised.current = true;
      controller.placeAt('earth', 26_000);
    }
    // Trip and chronometers (both exact at any frame length)
    const arrived = tickTrip(dtSim);
    if (arrived) {
      labArrival(arrived);
      onArrival(arrived.dest);
    }

    // Bodies that do not exist at this date (Voyager 1 before 1980) cannot stay targeted.
    if (!sim.bodies[ui.focus]?.present && controller.mode !== 'travel') controller.goTo('earth');
    if (ui.selected && !sim.bodies[ui.selected]?.present) ui.select(null);
    labFrame();
    updatePulses();

    // Camera (floating origin: the three.js camera never leaves the origin)
    controller.update(dtReal, dtSim, travel.shipPos);
    camera.position.set(0, 0, 0);
    camera.quaternion.copy(sim.camera.quat);
    camera.updateMatrixWorld();
    // The observer's rapidity, exact at any γ (from the trip model while flying)
    updateShipKinematics();

    // What the camera sees
    updateApparentPositions(ui.retarded);
    updateRelativisticView(ui.relMode, ui.splitX, ui.relDoppler, !!travel.trip?.warp);
    updateDerived(cam, ui.focus, ui.selected);
    if (sim.frame - earthLight.frame >= 12) updateEarthLight();
    psfUniforms.uPixelRatio.value = gl.getPixelRatio();
    sim.frame++;
  }, -10);

  return null;
}
