import { useEffect, useMemo, useState } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { createCmbPointMaterial, createStarMaterial } from '../render/materials';
import { loadStarCatalog } from './starCatalog';
import { POINTS_LAYER } from '../render/LightspeedScenePass';

/**
 * ~8,900 naked-eye stars from the HYG catalogue, one draw call. Directions only: across the
 * Solar System, stellar parallax is far below a pixel. Also the cosmic microwave background's
 * hot spot, which joins the sky as a point source at extreme speed.
 */
export function Starfield() {
  const material = useMemo(createStarMaterial, []);
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStarCatalog()
      .then((cat) => {
        if (cancelled) return;
        const g = new BufferGeometry();
        const dirs = new Float32Array(cat.count * 3);
        for (let i = 0; i < cat.count; i++) {
          const x = cat.xyz[i * 3];
          const y = cat.xyz[i * 3 + 1];
          const z = cat.xyz[i * 3 + 2];
          const l = Math.hypot(x, y, z) || 1;
          dirs[i * 3] = x / l;
          dirs[i * 3 + 1] = y / l;
          dirs[i * 3 + 2] = z / l;
        }
        g.setAttribute('position', new BufferAttribute(dirs, 3));
        g.setAttribute('aMag', new BufferAttribute(cat.mag, 1));
        g.setAttribute('aTemp', new BufferAttribute(cat.temp, 1));
        setGeometry(g);
      })
      .catch((e) => console.error('[lightspeed] star catalogue failed to load', e));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {geometry && (
        <points
          geometry={geometry}
          material={material}
          frustumCulled={false}
          renderOrder={-100}
          ref={(o) => o?.layers.set(POINTS_LAYER)}
        />
      )}
      <CmbSpot />
    </>
  );
}

/**
 * The CMB's hot spot dead ahead once it is narrower than a pixel. One vertex; the shader places
 * it (its direction is a uniform) and hides it outside the relativistic view.
 */
function CmbSpot() {
  const material = useMemo(createCmbPointMaterial, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    return g;
  }, []);
  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-99}
      ref={(o) => o?.layers.set(POINTS_LAYER)}
    />
  );
}
