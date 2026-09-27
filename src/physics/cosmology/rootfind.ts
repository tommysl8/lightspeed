// Brent's method (Brent 1973, "Algorithms for Minimization without Derivatives", ch. 4; the "zeroin"
// algorithm): bracketed, superlinear, never leaves [a, b].

export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  opts: { fa?: number; fb?: number; xtol?: number; rtol?: number; maxIter?: number } = {},
): number {
  let fa = opts.fa ?? f(a);
  let fb = opts.fb ?? f(b);
  const xtol = opts.xtol ?? 0;
  const rtol = opts.rtol ?? 4e-16;
  const maxIter = opts.maxIter ?? 200;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error(`brent: root not bracketed (f(${a}) = ${fa}, f(${b}) = ${fb})`);
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let it = 0; it < maxIter; it++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol = 2 * rtol * Math.abs(b) + 0.5 * xtol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      let p: number;
      let q: number;
      const s = fb / fa;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b);
  }
  return b;
}
