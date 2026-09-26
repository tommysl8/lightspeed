#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 aColor; // colour times brightness (additive)
attribute float aSide; // −1…1 across the ion tail, 0 elsewhere

varying vec3 vColor;
varying float vSide;

void main() {
  vColor = aColor;
  vSide = aSide;
  // Positions are camera-relative world km (the floating origin), written each frame.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
