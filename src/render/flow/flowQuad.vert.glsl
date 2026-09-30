// The flow map's passes (flowMap.frag.glsl, flowBlur.frag.glsl): a quad over the whole target, whatever the camera.
// Twin: render/flow/flowMap.ts (the target and the draw).
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
