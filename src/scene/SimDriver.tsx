import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { MakeTime } from 'astronomy-engine';
import { controller } from '../controls/cameraController';
import { updateDerived } from '../sim/derived';
import { updateEphemeris } from '../sim/ephemeris';
import { earthLight, updateApparentPositions, updateEarthLight } from '../sim/lightDelay';
import { sim } from '../sim/sim';
import { travel, updateTrip } from '../sim/travel';
import { useUI } from '../state/ui';
import { psfUniforms } from '../render/materials';
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

    // Clock
    const dtSim = sim.paused ? 0 : dtReal * sim.warp;
    sim.timeMs += dtSim * 1000;
    sim.astroTime = MakeTime(new Date(sim.timeMs));

    // World
    updateEphemeris();
    if (!initialised.current) {
      initialised.current = true;
      controller.placeAt('earth', 26_000);
    }
    const trip = travel.trip;
    if (trip && updateTrip()) onArrival(trip.dest);

    // Camera (floating origin: the three.js camera never leaves the origin)
    controller.update(dtReal, dtSim, travel.shipPos);
    camera.position.set(0, 0, 0);
    camera.quaternion.copy(sim.camera.quat);
    camera.updateMatrixWorld();

    // What the camera sees
    updateApparentPositions(ui.retarded);
    updateDerived(cam);
    if (sim.frame - earthLight.frame >= 12) updateEarthLight();
    psfUniforms.uPixelRatio.value = gl.getPixelRatio();
    sim.frame++;
  }, -10);

  return null;
}
