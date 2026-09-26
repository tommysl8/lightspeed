// Blackbody colour and brightness at any temperature. A table over 10 K – 10^10 K (uniform in
// ln T), with the exact asymptotes of a blackbody seen through the CIE observer beyond it:
// Rayleigh–Jeans above (colour fixed, luminance proportional to T) and Wien below (luminance
// falling as exp(-K/T), floored far below display precision). Mirrors sampleBlackbody in
// src/physics/blackbody.ts.
//   rgb: linear-sRGB colour, luminance 1
//   a:   ln of the visible luminance relative to a 5,772 K blackbody (the Sun's surface)
// Brightness stays a logarithm all the way to the exposure, so nothing overflows float32.
uniform sampler2D uBlackbody;
uniform vec4 uBbRange; // ln T_min, ln T_max, table size, cold-asymptote constant K (kelvin)

const float LN_T_SUN = 8.660774; // ln 5772
const float LN_Y_FLOOR = -1.0e4;
const float MAG_PER_LN = 1.0857362; // 2.5 / ln 10: magnitudes per unit of ln flux

vec4 blackbodyLn(float lnT) {
  float lo = uBbRange.x;
  float hi = uBbRange.y;
  float n = uBbRange.z;
  float x = (clamp(lnT, lo, hi) - lo) / (hi - lo) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  vec4 r = mix(
    texture2D(uBlackbody, vec2((i0 + 0.5) / n, 0.5)),
    texture2D(uBlackbody, vec2((i0 + 1.5) / n, 0.5)),
    x - i0
  );
  if (lnT > hi) r.a += lnT - hi;
  else if (lnT < lo) r.a = max(r.a - uBbRange.w * (exp(min(-lnT, 60.0)) - exp(-lo)), LN_Y_FLOOR);
  return r;
}
