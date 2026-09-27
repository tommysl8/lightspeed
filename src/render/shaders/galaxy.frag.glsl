// One particle of the Galaxy model: a Gaussian splat of linear light, eased to zero at the
// sprite's edge, added into the Galaxy's target (render/galaxyLayer.ts). The Milky Way model's
// materials also add their light's luminance into the alpha channel (uModelAlpha 1), so the
// composite can hand over between the sky from the Sun and the model picture by picture; the
// galaxies beyond add none (their materials leave uModelAlpha at 0). Premultiplied: added as is.
uniform float uModelAlpha;
varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  vec2 p = (gl_PointCoord - 0.5) * vSize;
  float r = length(p);
  float g = vPeak * exp(-r * r / (2.0 * vSigma * vSigma)) * (1.0 - smoothstep(0.78, 1.0, r / (0.5 * vSize)));
  if (g <= 0.0) discard;
  gl_FragColor = vec4(vColor * g, uModelAlpha * g);
}
