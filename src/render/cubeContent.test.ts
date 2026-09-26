import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Mesh, Points, Scene } from 'three';
import { anyVisibleOn, GUIDES_LAYER, POINTS_LAYER } from './LightspeedScenePass';

describe('what the relativistic cube map would draw', () => {
  it('is only visible meshes on layer 0: an empty cube is not redrawn', () => {
    const scene = new Scene();
    const points = new Points(new BufferGeometry());
    points.layers.set(POINTS_LAYER);
    const orbit = new Mesh();
    orbit.layers.set(GUIDES_LAYER);
    const planet = new Group();
    const surface = new Mesh();
    planet.add(surface);
    planet.visible = false; // under a pixel
    scene.add(points, orbit, planet);
    expect(anyVisibleOn(scene, 1)).toBe(false);
    planet.visible = true;
    expect(anyVisibleOn(scene, 1)).toBe(true);
    surface.visible = false;
    expect(anyVisibleOn(scene, 1)).toBe(false);
  });
});
