import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  PlaneGeometry,
  RGFormat,
  RGBAFormat,
  Sphere,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import { createClusterRingMaterial, createGalaxyGlowMaterial, createGalaxyMaterial, galaxyUniforms } from '../render/materials';
import { useUI } from '../state/ui';
import { BACKGROUND_LAYER, POINTS_LAYER } from '../render/LightspeedScenePass';
import { GALAXY_GLOW_LAYER, GALAXY_LAYER, galaxyLayer } from '../render/galaxyLayer';
import { useLensVariant } from '../render/lensVariants';
import { PARSEC_KM } from '../physics/constants';
import { modelShare } from '../sim/galaxy/background';
import { GAL_TO_G_ROT, GAL_TO_WORLD, galToG, SUN_G, WORLD_TO_GAL, type Mat3 } from '../sim/galaxy/frames';
import { CLUSTER_SIZE_OCTAVES, isFamousCluster } from '../sim/galaxy/clusters';
import { DUST_EXTENT_KPC, DUST_RES, GALAXY_MODEL_JSON, type GalaxyData } from '../sim/galaxy/galaxyData';
import { galaxyState, galaxyVersion, subscribeGalaxy } from '../sim/galaxy/load';
import { GLOW_DISC_RANGE_KPC, populationColour, templateSplats, type M87TemplateNear } from '../sim/galaxy/glow';
import { nscGlowUniforms, updateNuclear } from '../sim/galaxy/nuclearCluster';
import { SGR_A_ID } from '../sim/galaxy/records';
import { cosmosState } from '../sim/cosmos/load';
import { gravity } from '../sim/gravity';
import { sim } from '../sim/sim';
import { quality } from '../render/quality';
import { relView } from '../render/relativisticView';

const KPC_KM = 1000 * PARSEC_KM;
/** Opacity of the open clusters' rings. */
const RING_OPACITY = 0.5;

/**
 * Share of the model's particles drawn on an integrated GPU. The particles are shuffled, so the
 * first half is an unbiased half, each drawn twice as bright: the picture is the same but a
 * little grainier (every pixel still sums tens of splats), and it costs half. The split view draws
 * the Galaxy twice a frame (once for each half), so there it draws half as many again. The 3,500
 * H II regions come first and are always all drawn: each is a single object, not a sample.
 */
export const INTEGRATED_DRAW_SHARE = 0.5;

/** A three.js Matrix3 from a row-major 3 × 3. */
const matrix3 = (m: Mat3, out = new Matrix3()): Matrix3 => out.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);
const WORLD_TO_GAL_M = matrix3(WORLD_TO_GAL);

/** A face-on map as a half-float texture, filtered (half floats are filterable wherever WebGL2 runs). */
function mapTexture(data: Uint16Array, format: typeof RGBAFormat | typeof RGFormat): DataTexture {
  const t = new DataTexture(data, DUST_RES, DUST_RES, format, HalfFloatType);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

interface GalaxyGeometries {
  model: BufferGeometry;
  clumps: BufferGeometry;
  /** The famous open clusters (those with a body and a label), one point each (position kpc, radius pc), for their rings. */
  rings: BufferGeometry;
  dust: DataTexture;
  /** The warp and the young arm stars' surface brightness (the glow's). */
  warp: DataTexture;
  data: GalaxyData;
}

function makeGeometries(data: GalaxyData): GalaxyGeometries {
  const p = data.particles;
  const model = new BufferGeometry();
  model.setAttribute('position', new BufferAttribute(p.position, 3, false));
  model.setAttribute('aColor', new BufferAttribute(p.color, 3, true));
  model.setAttribute('aAttr', new BufferAttribute(p.attrs, 4, false));
  // Never culled and never sorted: skip three.js's bounding sphere over every particle.
  model.boundingSphere = new Sphere(new Vector3(), Infinity);
  const c = data.clumps;
  const clumps = new BufferGeometry();
  clumps.setAttribute('position', new BufferAttribute(c.positionKpc, 3));
  clumps.setAttribute('aColor', new BufferAttribute(c.color, 3, true));
  clumps.setAttribute('aAttr', new BufferAttribute(c.attrs, 4, false));
  clumps.boundingSphere = new Sphere(new Vector3(), Infinity);
  // Only the famous ones: from inside the disc hundreds of clusters are a few pixels wide, and a
  // ring round each would hide the sky.
  const open = data.clusters.filter((c) => c.kind === 'open' && isFamousCluster(c));
  const ringPos = new Float32Array(3 * open.length);
  const ringRad = new Float32Array(open.length);
  open.forEach((c, i) => {
    ringPos.set([c.xPc / 1000, c.yPc / 1000, c.zPc / 1000], 3 * i);
    ringRad[i] = c.radiusPc;
  });
  const rings = new BufferGeometry();
  rings.setAttribute('position', new BufferAttribute(ringPos, 3));
  rings.setAttribute('aRadius', new BufferAttribute(ringRad, 1));
  rings.boundingSphere = new Sphere(new Vector3(), Infinity);
  return { model, clumps, rings, dust: mapTexture(data.dust, RGBAFormat), warp: mapTexture(data.warp, RGFormat), data };
}

/** The glow's laws (sim/galaxy/glow.ts) into its material. */
function setGlowLaws(mat: ShaderMaterial, glow: GalaxyData['glow']): void {
  const u = mat.uniforms;
  const { thin, thick } = glow;
  u.uGlowThin.value.set(thin.sigma0, thin.hR, thin.hz, thin.Rmax);
  u.uGlowThick.value.set(thick.sigma0, thick.hR, thick.hz, thick.Rmax);
  u.uGlowYoungHz.value = glow.youngHz;
  const json = GALAXY_MODEL_JSON;
  const cols = (['thinDisc', 'youngArmStars', 'thickDisc'] as const).map((name) => populationColour(json, name));
  u.uGlowThinRgb.value.set(...cols[0].rgb);
  u.uGlowYoungRgb.value.set(...cols[1].rgb);
  u.uGlowThickRgb.value.set(...cols[2].rgb);
  u.uGlowLnT.value.set(Math.log(cols[0].temperatureK), Math.log(cols[1].temperatureK), Math.log(cols[2].temperatureK));
}

/**
 * Whether any of the discs' light lies nearer than the glow reaches (GLOW_DISC_RANGE_KPC[1]) to a
 * camera at `g` (frame G, kpc): the discs end at their Rmax, and beyond 5 kpc from the plane (more
 * than five of the thick disc's scale heights, and the warp's height) they hold nothing to see.
 */
export function glowWanted(g: readonly number[], glow: GalaxyData['glow']): boolean {
  const R = Math.hypot(g[0], g[1]);
  const out = Math.hypot(Math.max(0, R - Math.max(glow.thin.Rmax, glow.thick.Rmax)), Math.max(0, Math.abs(g[2]) - 5));
  return out < GLOW_DISC_RANGE_KPC[1];
}

/** Frame uniforms (constants of the model). */
function setModelConstants(): void {
  const u = galaxyUniforms;
  matrix3(GAL_TO_WORLD, u.uGalToWorld.value);
  matrix3(GAL_TO_G_ROT, u.uGalToG.value);
  u.uSunG.value.set(SUN_G[0], SUN_G[1], SUN_G[2]);
  u.uDustExtent.value = DUST_EXTENT_KPC;
}

const cam = new Vector3();
const camSgrKm = new Vector3();
const camM87Km = new Vector3();

/** M87's id, and that of the black hole at its centre. */
const M87_ID = 'm87';
const M87_STAR_ID = 'm87-star';

/** What M87's model galaxy draws near the camera (sim/galaxy/glow.ts M87TemplateNear), made once its template and shape are in. */
let m87Near: M87TemplateNear | null = null;
let m87NearFor: unknown = null;

function m87TemplateNear(): M87TemplateNear | null {
  const templates = cosmosState.templates;
  if (m87NearFor === templates && m87Near) return m87Near;
  const t = templates?.find((x) => x.id === 'elliptical');
  const shape = cosmosState.shapes.find((s) => s.id === M87_ID);
  if (!t || !shape || shape.template !== 'elliptical') return null;
  const stretch = shape.axes.reduce((p, a) => p * Math.hypot(a[0], a[1], a[2]), 1);
  m87Near = { ...templateSplats(t.position, t.attrs, t.count), unitPc: shape.scaleKpc * 1000, splatPc: shape.scaleKpc * Math.cbrt(stretch) * 1000, pxPerRad: 1, sigmaMax: 1 };
  m87NearFor = templates;
  return m87Near;
}

/**
 * The nuclear star cluster's field near Sgr A* and M87's own starlight inside M87 (sim/galaxy/nuclearCluster.ts):
 * the camera relative to each, exact near the hole the lens is about (the gravity state's), and the field's
 * share u of the nuclear disc's and cluster's light into the model's particles of them (drawn × (1 − u)). Returns u.
 */
function updateNuclearFields(): number {
  const sgr = sim.bodies[SGR_A_ID];
  let camSgr: Vector3 | null = null;
  if (gravity.hole === SGR_A_ID) camSgr = camSgrKm.copy(gravity.camRelHoleKm);
  else if (sgr?.present) camSgr = camSgrKm.copy(sim.camera.pos).sub(sgr.pos);
  let m87: { camKm: Vector3; near: M87TemplateNear } | null = null;
  const m87Body = sim.bodies[M87_ID];
  const near = m87Body?.present ? m87TemplateNear() : null;
  if (near) {
    // M87* sits at M87's centre: near it, the lens's own exact camera.
    if (gravity.hole === M87_STAR_ID) camM87Km.copy(gravity.camRelHoleKm);
    else camM87Km.copy(sim.camera.pos).sub(m87Body.apparentPos);
    near.pxPerRad = galaxyUniforms.uPxPerRad.value;
    near.sigmaMax = galaxyUniforms.uSigmaMax.value;
    m87 = { camKm: camM87Km, near };
  }
  const u = updateNuclear(camSgr, quality.lensRung, m87);
  galaxyUniforms.uNuclearFade.value.x = u;
  return u;
}

/**
 * The model of the Milky Way built from published measurements (sim/galaxy): its particles, the
 * globular clusters' clumps and, near the camera, the smooth glow of its discs and young arm stars
 * (sim/galaxy/glow.ts), drawn into the Galaxy's own target (render/galaxyLayer.ts) and added to the
 * view. It takes over from the real sky as the camera leaves the Sun's neighbourhood.
 *
 * Near Sgr A* its nuclear cluster and disc give way to the nuclear star cluster's own field (sim/galaxy/
 * nuclearCluster.ts: its glow is drawn by this component's glow quad, its stars by scene/NuclearCluster.tsx),
 * and inside M87 the same quad draws M87's own starlight near the camera. The open clusters' rings follow the
 * black hole's lens (render/lensVariants.ts).
 */
export function GalaxyModel() {
  const version = useSyncExternalStore(subscribeGalaxy, galaxyVersion);
  const [geo, setGeo] = useState<GalaxyGeometries | null>(null);
  const modelMat = useMemo(() => createGalaxyMaterial(0.002, 0), []);
  const clumpMat = useMemo(() => createGalaxyMaterial(1, CLUSTER_SIZE_OCTAVES), []);
  const ringMat = useMemo(createClusterRingMaterial, []);
  const glowMat = useMemo(createGalaxyGlowMaterial, []);
  const glowQuad = useMemo(() => new PlaneGeometry(2, 2), []);
  const glowMesh = useRef<Object3D | null>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const rings = useRef<(Object3D & { material: Material | Material[] }) | null>(null);
  useLensVariant(rings);
  // The model's particles and clumps: left out of the Galaxy's target while the model has no share
  // of the sky (near the Sun), where other galaxies may still be drawn into it.
  const modelPoints = useRef<Object3D | null>(null);
  const clumpPoints = useRef<Object3D | null>(null);

  useEffect(() => {
    const data = galaxyState.data;
    if (!data || data === geo?.data) return;
    setModelConstants();
    modelMat.uniforms.uKpcPerUnit.value = data.particles.kpcPerUnit;
    setGlowLaws(glowMat, data.glow);
    setGeo(makeGeometries(data));
    // `version` stands for galaxyState.data.
  }, [version]);
  useEffect(
    () => () => {
      geo?.model.dispose();
      geo?.clumps.dispose();
      geo?.rings.dispose();
      geo?.dust.dispose();
      geo?.warp.dispose();
    },
    [geo],
  );
  useEffect(
    () => () => {
      modelMat.dispose();
      clumpMat.dispose();
      ringMat.dispose();
      glowMat.dispose();
      glowQuad.dispose();
    },
    [modelMat, clumpMat, ringMat, glowMat, glowQuad],
  );

  useFrame(({ gl }) => {
    const u = galaxyUniforms;
    // The model's share of the view (the rest is the sky map): its light is drawn in full, and the
    // Galaxy layer's composite blends the picture with it and the picture without it. Below a share of 1 %
    // (within about 124 pc of the Sun) it is left out: that changes no pixel by more than 1/255 at 0.66 %,
    // and saves its whole pass, 2.5–2.9 ms at the Pleiades (docs/data/blackholes.md §11).
    const share = modelShare(sim.camera.pos.length());
    galaxyLayer.wants.milkyWay = !!geo && share >= 0.01;
    galaxyLayer.modelShare = share;
    if (modelPoints.current) modelPoints.current.visible = galaxyLayer.wants.milkyWay;
    if (clumpPoints.current) clumpPoints.current.visible = galaxyLayer.wants.milkyWay;
    u.uLumGain.value = galaxyLayer.wants.milkyWay ? 1 : 0;
    const fieldShare = updateNuclearFields();
    if (!geo) {
      if (glowMesh.current) glowMesh.current.visible = false;
      u.uGlowOn.value = 0;
      return;
    }
    // The camera in kpc, heliocentric galactic axes, as hi + lo (the particles and the rings).
    cam.copy(sim.camera.pos).applyMatrix3(WORLD_TO_GAL_M).divideScalar(KPC_KM);
    const hi = u.uCamHi.value.set(Math.fround(cam.x), Math.fround(cam.y), Math.fround(cam.z));
    u.uCamLo.value.set(cam.x - hi.x, cam.y - hi.y, cam.z - hi.z);
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    // The open clusters' rings go with the labels.
    const ringsWanted = useUI.getState().showLabels ? RING_OPACITY : 0;
    const ro = ringMat.uniforms.uOpacity;
    ro.value += (ringsWanted - ro.value) * 0.15;
    if (Math.abs(ro.value - ringsWanted) < 0.002) ro.value = ringsWanted;
    ringMat.uniforms.uPxPerRad.value = sim.viewport.height / 2 / tanHalf;
    if (rings.current) rings.current.visible = ro.value > 0.001;
    const g = galToG([cam.x, cam.y, cam.z]);
    // The discs' and the young arm stars' light near the camera: a smooth glow (sim/galaxy/glow.ts); the same
    // quad draws the nuclear field's glow near Sgr A* and M87's starlight inside M87.
    const discs = galaxyLayer.wants.milkyWay && glowWanted(g, geo.data.glow);
    const glowOn = discs || (galaxyLayer.wants.milkyWay && fieldShare > 0) || nscGlowUniforms.uNscGlowOn.value.y > 0;
    if (glowMesh.current) glowMesh.current.visible = glowOn;
    u.uGlowOn.value = discs ? 1 : 0;
    nscGlowUniforms.uNscGlowOn.value.z = discs ? 1 : 0;
    if (!galaxyLayer.wants.milkyWay) nscGlowUniforms.uNscGlowOn.value.x = nscGlowUniforms.uNscGlowOn.value.w = 0;
    if (!galaxyLayer.wants.milkyWay) return;
    // The single objects (the H II regions, first) are all drawn; of the rest, a share.
    const share0 = quality.integrated ? INTEGRATED_DRAW_SHARE * (relView.split ? 0.5 : 1) : 1;
    const count = geo.model.attributes.position.count;
    const singles = geo.data.particles.singles;
    const drawn = singles + Math.round((count - singles) * share0);
    if (geo.model.drawRange.count !== drawn) geo.model.setDrawRange(0, drawn);
    modelMat.uniforms.uLumScale.value = (count - singles) / (drawn - singles);
    u.uDust.value = geo.dust;
    u.uWarpMap.value = geo.warp;
    u.uCamG.value.set(g[0], g[1], g[2]);
    galaxyLayer.display(tanHalf, sim.viewport.height, gl.getPixelRatio());
  });

  return (
    <>
      <primitive
        object={galaxyLayer.quad}
        renderOrder={-999}
        ref={(o: Mesh | null) => {
          if (!o) return;
          o.layers.set(BACKGROUND_LAYER);
          o.layers.enable(POINTS_LAYER);
        }}
      />
      {geo && (
        <>
          <points
            geometry={geo.model}
            material={modelMat}
            frustumCulled={false}
            ref={(o) => {
              modelPoints.current = o;
              o?.layers.set(GALAXY_LAYER);
            }}
          />
          <mesh
            geometry={glowQuad}
            material={glowMat}
            frustumCulled={false}
            visible={false}
            ref={(o) => {
              glowMesh.current = o;
              o?.layers.set(GALAXY_GLOW_LAYER);
            }}
          />
          <points
            geometry={geo.clumps}
            material={clumpMat}
            frustumCulled={false}
            ref={(o) => {
              clumpPoints.current = o;
              o?.layers.set(GALAXY_LAYER);
            }}
          />
          <points
            geometry={geo.rings}
            material={ringMat}
            frustumCulled={false}
            renderOrder={-90}
            visible={false}
            ref={(o) => {
              rings.current = o;
              o?.layers.set(POINTS_LAYER);
            }}
          />
        </>
      )}
    </>
  );
}
