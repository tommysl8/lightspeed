/**
 * Ecliptic coordinate grid on the sky: meridians of ecliptic longitude and parallels of
 * latitude every 15°, with the ecliptic itself drawn brighter. Like the stars it is drawn
 * "at infinity" (directions only, no depth test), so it stays fixed on the sky wherever the
 * observer is. It is a guide in the Sun's frame, so the relativistic view leaves it out.
 */
import { useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from 'three';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { useUI } from '../state/ui';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 dir = normalize(position);
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColor * uOpacity, 1.0);
}
`;

const RAD = Math.PI / 180;

/** Ecliptic (λ, b) in degrees → world direction (world = x_ecl, z_ecl, −y_ecl). */
function dir(l: number, b: number, out: number[]) {
  const cb = Math.cos(b * RAD);
  out.push(cb * Math.cos(l * RAD), Math.sin(b * RAD), -cb * Math.sin(l * RAD));
}

function gridGeometry(): { grid: BufferGeometry; ecliptic: BufferGeometry } {
  const g: number[] = [];
  // Meridians every 15°, from −75° to +75° latitude
  for (let l = 0; l < 360; l += 15) {
    for (let b = -75; b < 75; b += 2.5) {
      dir(l, b, g);
      dir(l, b + 2.5, g);
    }
  }
  // Parallels every 15° (the ecliptic separately)
  for (let b = -75; b <= 75; b += 15) {
    if (b === 0) continue;
    for (let l = 0; l < 360; l += 2) {
      dir(l, b, g);
      dir(l + 2, b, g);
    }
  }
  const e: number[] = [];
  for (let l = 0; l < 360; l += 1) {
    dir(l, 0, e);
    dir(l + 1, 0, e);
  }
  // Tick marks across the ecliptic every 10°
  for (let l = 0; l < 360; l += 10) {
    const h = l % 30 === 0 ? 1.2 : 0.6;
    dir(l, -h, e);
    dir(l, h, e);
  }
  const grid = new BufferGeometry();
  grid.setAttribute('position', new Float32BufferAttribute(g, 3));
  const ecliptic = new BufferGeometry();
  ecliptic.setAttribute('position', new Float32BufferAttribute(e, 3));
  return { grid, ecliptic };
}

function material(color: string, opacity: number) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false, // opaque pass, drawn early: bodies cover it, as they do the stars
  });
}

export function EclipticGrid() {
  const show = useUI((s) => s.showGrid);
  const { grid, ecliptic } = useMemo(gridGeometry, []);
  const mGrid = useMemo(() => material('#7f93a8', 0.16), []);
  const mEcl = useMemo(() => material('#f0a73a', 0.42), []);
  return (
    <group visible={show}>
      <lineSegments geometry={grid} material={mGrid} frustumCulled={false} renderOrder={-90} ref={(o) => o?.layers.set(GUIDES_LAYER)} />
      <lineSegments geometry={ecliptic} material={mEcl} frustumCulled={false} renderOrder={-89} ref={(o) => o?.layers.set(GUIDES_LAYER)} />
    </group>
  );
}
