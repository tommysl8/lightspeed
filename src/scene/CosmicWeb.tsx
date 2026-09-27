/**
 * The cosmic web: the 55,877 galaxies of Cosmicflows-4 with measured distances as points at their
 * comoving places (sim/cosmos/cosmicWeb.ts), one draw call, the camera as hi + lo megaparsecs
 * (shaders/cosmicWeb.vert.glsl). It is a map: from out here no galaxy is bright enough to see, so
 * the points show where the galaxies are, coloured by kind and sized by infrared luminosity. Shown
 * from beyond the Local Group ('auto') or when the View menu says so (ui/cosmicLayers.ts); its data
 * load the first time it is wanted. A cluster of galaxies (Virgo, Coma) is its member galaxies: with
 * the web turned off, those of the cluster in focus or selected are still drawn.
 *
 * At the clock's time the space between groups has grown by a(t) while groups keep their size, and
 * each point's light is redshifted and dimmed by the expansion and shifted by the ship's motion
 * (sim/cosmos/expansion.ts); before the earliest galaxies seen there is no web to show.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { createCosmicWebMaterial, updateSkyUniforms, withEmission } from '../render/materials';
import cosmicWebVert from '../render/shaders/cosmicWeb.vert.glsl?raw';
import { cosmicSky } from '../sim/cosmos/expansion';
import { POINTS_LAYER } from '../render/LightspeedScenePass';
import { MPC_KM } from '../physics/constants';
import { cosmosState, cosmosVersion, loadCosmicWeb, subscribeCosmos, webLoadDue } from '../sim/cosmos/load';
import { useUI } from '../state/ui';
import { sim } from '../sim/sim';
import { cosmicWebShare, WEB_LOAD_KM, webMembersShown } from '../ui/cosmicLayers';
import { memberRange, type WebBuffers } from '../sim/cosmos/cosmicWeb';

const cam = new Vector3();

/** Past this a − 1 the web is not drawn: its shader's positions (a − 1 times the anchor, Mpc) would overflow float32. */
export const WEB_MAX_AM1 = 1e30;

/** The cluster in focus or selected, if it has members in the web: its range of points. */
function clusterMembers(web: WebBuffers): [number, number] | null {
  const { focus, selected } = useUI.getState();
  for (const id of [selected, focus]) {
    const m = id ? cosmosState.named?.objects.find((o) => o.id === id)?.cosmicWeb?.members : undefined;
    if (m) return memberRange(web, m.first, m.count);
  }
  return null;
}

export function CosmicWeb() {
  const version = useSyncExternalStore(subscribeCosmos, cosmosVersion);
  const material = useMemo(createCosmicWebMaterial, []);
  const points = useRef<Object3D | null>(null);
  const web = cosmosState.web;
  const geometry = useMemo(() => {
    if (!web) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(web.position, 3));
    g.setAttribute('aAnchor', new BufferAttribute(web.anchor, 3));
    g.setAttribute('aAttr', new BufferAttribute(web.attrs, 2));
    g.boundingSphere = new Sphere(new Vector3(), Infinity);
    return g;
    // `version` stands for cosmosState.web.
  }, [web, version]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ gl, camera }, dt) => {
    const mode = useUI.getState().cosmicWeb;
    const dist = sim.camera.pos.length();
    const focus = useUI.getState().focus;
    const clusterWanted = !!cosmosState.named?.objects.some((o) => o.id === focus && o.cosmicWeb?.members);
    if (webLoadDue() && (mode === 'on' || (mode === 'auto' && dist > WEB_LOAD_KM) || clusterWanted)) void loadCosmicWeb();
    const share = cosmicWebShare(mode, dist);
    // With the web off, the members of a cluster in focus or selected still show.
    const members = share === 0 && geometry && cosmosState.web ? clusterMembers(cosmosState.web) : null;
    webMembersShown.now = !!members && cosmicSky.galaxiesShown;
    // Not before the first galaxies, nor once the universe has grown past float32's range (a − 1 > 10³⁰, some
    // 1,500 billion years on, when every galaxy of the web is far beyond the event horizon and its light long gone).
    const want = cosmicSky.galaxiesShown && cosmicSky.am1 < WEB_MAX_AM1 ? (members ? 1 : share) : 0;
    if (geometry) {
      const [start, count] = members ?? [0, cosmosState.web?.count ?? 0];
      if (geometry.drawRange.start !== start || geometry.drawRange.count !== count) geometry.setDrawRange(start, count);
    }
    const u = material.uniforms;
    // Eased in and out over a third of a second.
    u.uOpacity.value += (want - u.uOpacity.value) * Math.min(1, dt * 3);
    if (Math.abs(want - u.uOpacity.value) < 0.002) u.uOpacity.value = want;
    const shown = !!geometry && u.uOpacity.value > 0.002;
    if (points.current) points.current.visible = shown;
    if (!shown) return;
    // The cosmology module's emission lookup replaces the stub once its table is built (one recompile;
    // the sky uniforms first, so the web's first frame already has it, and the stub is never compiled
    // once the table is in: render/precompile.ts compiles the web with it in the background).
    updateSkyUniforms();
    const src = withEmission(cosmicWebVert);
    if (material.vertexShader !== src) {
      material.vertexShader = src;
      material.needsUpdate = true;
    }
    // Mean points per device pixel of sky (for drawing by lot where a fast ship crowds them ahead),
    // and the smallest share drawn: a few dozen points, so their light is never left to one.
    const n = geometry!.drawRange.count;
    const pxPerRad = (sim.viewport.height * gl.getPixelRatio()) / 2 / Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    u.uPointsPerPx.value = n / (4 * Math.PI * pxPerRad * pxPerRad);
    u.uLotMin.value = Math.min(1, 48 / Math.max(1, n));
    cam.copy(sim.camera.pos).divideScalar(MPC_KM);
    const hi = u.uCamHi.value.set(Math.fround(cam.x), Math.fround(cam.y), Math.fround(cam.z));
    u.uCamLo.value.set(cam.x - hi.x, cam.y - hi.y, cam.z - hi.z);
  });

  if (!geometry) return null;
  return (
    <points
      ref={(o) => {
        points.current = o;
        o?.layers.set(POINTS_LAYER);
      }}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-95}
      visible={false}
    />
  );
}
