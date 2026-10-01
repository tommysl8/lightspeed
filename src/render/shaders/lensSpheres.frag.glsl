// Luminous spheres seen through a black hole's lens, exactly: a stellar-mass hole's companion star near the axis,
// whose disc is at least a pixel (render/lens/lensSpheres.ts lists at most two; their meshes are hidden and their
// glints left out while they are drawn here).
//
// What, per pixel of the lens box: the pixel's ray in the lens frame from the camera C (relative to
// the hole, units of M); (1) direct: the straight ray C + t d meets a sphere (centre K, radius R) before its closest
// approach to the hole (the lens has not yet bent it: error ≤ 4/r_min rad, ≤ 1e-6 rad for a companion 1e7 M away);
// else (2) lensed: through lensRay, the outgoing asymptote x⊥ + s n∞ with x⊥ = b(sin Δφ r̂ − cos Δφ ê) (r̂ from the
// hole to the camera, ê the look direction's part across it; with no lens it is the straight ray) meets the sphere
// at s > 0 (error O(b/|K|), about 1e-7 rad here); captured rays meet nothing. The radiance at the hit is the
// limb-darkened blackbody as sun.frag.glsl draws the Sun (the same calibration, so the change between mesh and sphere
// is seamless), at the temperature seen through every shift (the pixel's, the hole frame's boost back to the Sun's
// frame, the observer's gravitational blueshift, the star's own ½ ln(1 − 2/|K|), and its orbital Doppler shift along
// the emitted direction), times the exposure;
// its coverage from the ray's miss distance in pixels. Written premultiplied, drawn "over" at render order 1 (after
// the stars, so the star hides what is behind it).
//
// A thin accretion disc (lightspeed_disklookup) hides the star where the pixel's ray meets the disc first: the star
// lies far beyond the disc's outer edge (Cygnus X-1's companion is 37 times farther from the hole), so a ray that meets
// the disc meets it before the star, unless the straight ray meets the star before it is anywhere near the disc.
//
// Cost: one lens ray and two sphere tests a pixel of the box, only while a sphere is listed (≤ 0.05 ms).
//
// Twins: render/lens/lensSpheres.ts (the uniforms), physics/lensPoint.ts pointImageExact (a point on the limb).
#include <lightspeed_relativity>
#include <lightspeed_dopplercolour>
#include <lightspeed_galaxycomposite>
#include <lightspeed_lens>
#include <lightspeed_flowlookup>
#include <lightspeed_disklookup>
#include <lightspeed_lenspixel>

uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec4 uSphereKR[2];   // centre relative to the hole (units of M, hole frame, world axes) and radius (M)
uniform vec4 uSphereT[2];    // x: ln T (K); y: 1 while drawn; z: ½ ln(1 − 2/|K|) (its own redshift); w: 0
uniform vec3 uSphereVel[2];  // its velocity relative to the hole frame, units of c
uniform vec3 uLimbU;         // limb darkening per channel (materials.ts LIMB_DARKENING_U)
uniform float uCentreRadiance; // a 5,772 K disc's radiance at its centre (materials.ts SUN_CENTRE_RADIANCE)

varying vec2 vUv;

// The nearest crossing s > 0 of the line p + s u (u unit) with sphere (k, r); the miss distance (M) when none.
float lensSphereHit(vec3 p, vec3 u, vec3 k, float r, out float miss) {
  vec3 m = p - k;
  float bq = dot(m, u);
  vec3 closest = m - bq * u;
  float h2 = dot(closest, closest);
  miss = sqrt(h2) - r;
  if (h2 > r * r) return -1.0;
  float root = sqrt(max(r * r - h2, 0.0));
  float s0 = -bq - root;
  float s1 = -bq + root;
  return s0 > 0.0 ? s0 : s1;
}

void main() {
  // The pixel's own position, not the quad's interpolated one: next to the Einstein ring the lens magnifies the
  // rounding of an interpolated coordinate into the coverage, and the quad is only the images' box.
  vec2 uv = gl_FragCoord.xy / uTargetPx;
  vec4 q = uProjInv * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec3 dView = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  float lnDpix;
  vec3 dS = relUnaberrateLens(dView, uVelDir, uEPhi, uEmPhi, lnDpix);
  float lnDfPix;
  vec3 d = frameAberrate(dS, lnDfPix);
  vec3 cam = -uLensHole; // the camera relative to the hole, units of M
  float ro = length(cam);
  vec3 rhat = cam / ro;
  vec3 e = d - dot(d, rhat) * rhat;
  float el = length(e);
  e = el > 1e-12 ? e / el : vec3(0.0);
  // The lensed ray, once: where the light came from, and the outgoing asymptote's offset x⊥.
  vec3 nInf;
  vec2 jac;
  float lnG;
  bool esc = lensRay(d, nInf, jac, lnG);
  float c;
  float g = lensGapC(d, c);
  float sa;
  float ca;
  lensSinCosOfGap(max(g, 0.0), sa, ca);
  float bp;
  float den;
  float b = lensImpact(sa, ca, lensSin(0.5 * (uLensEdge + g)), bp, den);
  float ddl;
  float delta = g > 0.0 ? lensDelta(g, ddl) : 0.0;
  float sweep = delta + uLensSpan - g;
  vec3 xPerp = b * (lensSin(sweep) * rhat - cos(sweep) * e);
  vec3 diskLight;
  bool disk = diskAt(d, g, 0.0, diskLight);
  vec4 best = vec4(0.0);
  for (int i = 0; i < 2; i++) {
    if (uSphereT[i].y < 0.5) continue;
    vec3 k = uSphereKR[i].xyz;
    float r = uSphereKR[i].w;
    float miss;
    // (1) the straight ray, if it meets the sphere before its closest approach to the hole
    float t = lensSphereHit(cam, d, k, r, miss);
    vec3 hit;
    vec3 u;
    float missPx;
    bool ok = false;
    if (t > 0.0 && t < -dot(cam, d)) {
      hit = cam + t * d;
      u = d;
      ok = true;
      missPx = miss / (t * uPixelAngle);
    } else if (esc) {
      // (2) the outgoing asymptote
      float s = lensSphereHit(xPerp, nInf, k, r, miss);
      float dist = max(length(k - xPerp), 1e-30);
      missPx = miss / dist / (uPixelAngle * max(max(jac.x, jac.y), 1e-6));
      if (s > 0.0) {
        hit = xPerp + s * nInf;
        u = nInf;
        ok = true;
      }
    }
    if (!ok) {
      // the edge's soft pixel just outside the limb
      continue;
    }
    // behind the disc, unless the straight ray meets the star well before it reaches the disc's distance from the camera
    if (disk && !(u == d && t < ro - uDiskGeom.z)) continue;
    vec3 nrm = normalize(hit - k);
    float mu = clamp(-dot(nrm, u), 0.0, 1.0);
    // the light leaves the star along −u; its own orbital shift along it
    vec3 v = uSphereVel[i];
    float beta2 = dot(v, v);
    float lnDorb = -log(max(1.0 - dot(v, -u), 1e-6)) + 0.5 * log(max(1.0 - beta2, 1e-12));
    // emitted → the hole frame (its orbital shift, its own redshift) → the static observer here (lnG) → S at this pixel
    // (less the frame boost's lnDfPix, ln ν_hole/ν_S) → the view observer (lnDpix): as lensPixel.glsl lensSkyFlux
    float lnDtot = lnDpix - lnDfPix + lnG + uSphereT[i].z + lnDorb;
    float lnT = uSphereT[i].x + lnDtot;
    vec3 col = blackbodyLn(lnT).rgb;
    float lnY = lensLnY(lnT);
    vec3 limb = 1.0 - uLimbU * (1.0 - mu);
    // (beside a disc drawn with all its light, on its own scale, at the disc's own exposure: render/disk/diskMap.ts)
    float lnE = uDiskOn > 0.5 ? uDiskStarLnE : uLnExposure;
    vec3 rgb = col * limb * (uCentreRadiance * exp(min(lnY + lnE, 40.0)));
    float cov = clamp(0.5 - missPx, 0.0, 1.0);
    if (cov > best.a) best = vec4(rgb * cov, cov);
  }
  if (best.a <= 0.0) discard;
  gl_FragColor = vec4(min(best.rgb, vec3(3.0e4)), best.a);
}
