// The Galaxy model's light near the camera (galaxyGlow.frag.glsl): a quad over the whole view, drawn
// into the Galaxy layer's coarse target only (render/galaxyLayer.ts: in the pass of the large splats,
// or on its own in a half of the split view), where the glow is smooth over many pixels.
uniform float uBigPass;

varying vec3 vRay;

void main() {
  if (uBigPass == 0.0) {
    // The pass of the small splats: nothing to draw.
    vRay = vec3(0.0, 0.0, -1.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The ship-frame direction of this corner of the view, world axes (the view matrix is a rotation:
  // the camera is at the origin, as for the particles).
  vec4 q = inverse(projectionMatrix) * vec4(position.xy, -1.0, 1.0);
  vRay = transpose(mat3(viewMatrix)) * (q.xyz / q.w);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
