// The Milky Way model seen from outside (galaxyFace.frag.glsl): a quad over the whole view, drawn into the Galaxy
// layer's fine target only (render/galaxyLayer.ts: the pass of the small splats, or the single pass of a half of the
// split view), where the disc's structure is as sharp as the target.
uniform float uBigPass;

varying vec3 vRay;

void main() {
  if (uBigPass > 0.5) {
    // The pass of the large splats: nothing to draw.
    vRay = vec3(0.0, 0.0, -1.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // This corner of the view's direction, world axes (the camera is at the origin; the view matrix is a rotation).
  vec4 q = inverse(projectionMatrix) * vec4(position.xy, -1.0, 1.0);
  vRay = transpose(mat3(viewMatrix)) * (q.xyz / q.w);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
