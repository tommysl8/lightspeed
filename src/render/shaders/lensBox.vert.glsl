// The Galaxy layer's composite quads when a black hole's lens is drawn: the lens box (render/lens/lensComposite.ts,
// its light resampled through the lens) and the frame round it (render/galaxyLayer.ts, the plain composite), placed
// in the vertex shader from the half's box, so that each half of the split view, which has its own box
// (render/lens/lensState.ts setLensView), draws its own without new geometry.
//
// How: each corner carries codes for its x and its y (aCode: 0 the screen's left or bottom edge, 1 its right or top,
// 2 the box's x0 or y0, 3 its x1 or y1). With no box (uLensBox empty: no lens) the corners take their plain
// positions instead: the frame's first rectangle is then the full-screen quad of today, triangle for triangle (so
// the picture is bit for bit today's), and everything else is degenerate. The ray of the pixel is passed as
// remap.vert.glsl passes it.
//
// Cost: nothing.
//
// Twin: render/lens/lensGeometry.ts builds the codes.
uniform vec4 uLensBox; // NDC (x0, y0, x1, y1); empty (x1 <= x0) with no lens

attribute vec2 aCode;

varying vec2 vUv;

void main() {
  vec2 p = position.xy;
  if (uLensBox.z > uLensBox.x) {
    vec4 xs = vec4(-1.0, 1.0, uLensBox.x, uLensBox.z);
    vec4 ys = vec4(-1.0, 1.0, uLensBox.y, uLensBox.w);
    p = vec2(xs[int(aCode.x)], ys[int(aCode.y)]);
  }
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
