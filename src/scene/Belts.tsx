import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry } from 'three';
import { AU_KM, J2000_JD } from '../physics/constants';
import { createBeltMaterial } from '../render/materials';
import { assetUrl } from '../render/textures';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { POINTS_LAYER } from '../render/LightspeedScenePass';

/**
 * Real minor bodies from JPL's Small-Body Database: ~20,000 main-belt asteroids (H < 14),
 * ~4,500 Jupiter Trojans and ~7,300 trans-Neptunian objects. One draw call; orbits are
 * solved in the vertex shader. (See scripts/build-belts.mjs.)
 */
export function Belts() {
  const material = useMemo(createBeltMaterial, []);
  const [data, setData] = useState<{ geometry: BufferGeometry; refEpochJd: number } | null>(null);
  const show = useUI((s) => s.showBelts);

  useEffect(() => {
    let cancelled = false;
    fetch(assetUrl('data/belts.bin'))
      .then((r) => {
        if (!r.ok) throw new Error(`belts.bin: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x31544c42) throw new Error('belts.bin: bad magic');
        const n = dv.getUint32(4, true);
        const refEpochJd = dv.getFloat64(16, true);
        let off = 32;
        const a = new Float32Array(buf, off, n);
        off += n * 4;
        const u16 = (k: number) => new Uint16Array(buf, off + k * n * 2, n);
        const [e, i, node, peri, M] = [0, 1, 2, 3, 4].map(u16);
        off += n * 2 * 5;
        const H = new Uint8Array(buf, off, n);
        const kind = new Uint8Array(buf, off + n, n);
        const g = new BufferGeometry();
        g.setAttribute('aA', new BufferAttribute(a, 1));
        g.setAttribute('aE', new BufferAttribute(e, 1, true));
        g.setAttribute('aI', new BufferAttribute(i, 1, true));
        g.setAttribute('aNode', new BufferAttribute(node, 1, true));
        g.setAttribute('aPeri', new BufferAttribute(peri, 1, true));
        g.setAttribute('aM', new BufferAttribute(M, 1, true));
        g.setAttribute('aH', new BufferAttribute(H, 1, true));
        g.setAttribute('aKind', new BufferAttribute(kind, 1, true));
        g.setDrawRange(0, n);
        setData({ geometry: g, refEpochJd });
      })
      .catch((err) => console.error('[lightspeed] belts failed to load', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useFrame(({ gl }) => {
    if (!data) return;
    const u = material.uniforms;
    u.uDays.value = sim.astroTime.tt + J2000_JD - data.refEpochJd;
    u.uCamAU.value.copy(sim.camera.pos).divideScalar(AU_KM);
    u.uPointSize.value = 1.6 * gl.getPixelRatio();
    u.uRetarded.value = useUI.getState().retarded ? 1 : 0;
  });

  if (!data) return null;
  return (
    <points
      geometry={data.geometry}
      material={material}
      frustumCulled={false}
      visible={show}
      renderOrder={2}
      ref={(o) => o?.layers.set(POINTS_LAYER)}
    />
  );
}
