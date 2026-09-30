"""
Part of the independent reference for src/physics/schwarzschild.ts (run by make_fixtures.py).
Dependencies: mpmath. Run time: 0.1-5 s per ray at 30-50 digits.
Shares no code with the TypeScript or with the elliptic forms of schw_mp.py.

Method B: direct numerical integration of the geodesic equations, in high precision (mpmath),
independent of the elliptic-integral forms of schw_mp.py.

B1  The orbit (Binet) equation u'' + u = 3 u^2 (u = 1/r, ' = d/dphi, M = 1), which follows from the
    geodesic equations, integrated by a Taylor-series method of high order in arbitrary precision.
    Initial data come from the observer's local frame, not from b:
        static observer, look angle theta from the hole:  u(0) = uo,  u'(0) = uo sqrt(1 - 2 uo) cot(theta)
    Alongside it integrates
        the Jacobi field w = du/dtheta:   w'' + w = 6 u w,  w(0) = 0,  w'(0) = -uo sqrt(1 - 2 uo)/sin^2(theta)
        the coordinate time:              dt/dphi = 1/(b u^2 (1 - 2u))
    so the derivative of the swept angle at a crossing u = us is dphi*/dtheta = -w/u'.

B2  The full second-order geodesic equations with the Christoffel symbols of the metric, in the affine
    parameter lambda (r, phi, t and their derivatives), Taylor-series integrated: a check of B1 on a subset.
"""
from __future__ import annotations

import mpmath as mp

mp.mp.dps = 40


# ─── B1: Binet equation, Taylor series ────────────────────────────────────────────────────

class Ray:
    """A ray u(phi) with its Jacobi field and time, integrated in steps of Taylor series."""

    def __init__(self, u0, p0, w0=0, q0=0, b=None, order=None, tol=None):
        self.order = order or max(30, int(mp.mp.dps * 1.1))
        self.tol = tol or mp.mpf(10) ** (-(mp.mp.dps - 4))
        self.phi = mp.mpf(0)
        self.u = mp.mpf(u0)
        self.p = mp.mpf(p0)
        self.w = mp.mpf(w0)
        self.q = mp.mpf(q0)
        self.t = mp.mpf(0)
        # constant of motion (only for the time equation): 1/b^2 = u'^2 + u^2 - 2u^3
        self.b = mp.mpf(b) if b is not None else 1 / mp.sqrt(self.p ** 2 + self.u ** 2 - 2 * self.u ** 3)
        self.with_time = True

    def series(self):
        N = self.order
        a = [mp.mpf(0)] * (N + 1)
        c = [mp.mpf(0)] * (N + 1)
        a[0], a[1] = self.u, self.p
        c[0], c[1] = self.w, self.q
        aa = [mp.mpf(0)] * (N + 1)   # (a*a)_k
        ac = [mp.mpf(0)] * (N + 1)   # (a*c)_k
        for k in range(0, N - 1):
            aa[k] = mp.fsum(a[j] * a[k - j] for j in range(k + 1))
            ac[k] = mp.fsum(a[j] * c[k - j] for j in range(k + 1))
            den = (k + 1) * (k + 2)
            a[k + 2] = (3 * aa[k] - a[k]) / den
            c[k + 2] = (6 * ac[k] - c[k]) / den
        tser = None
        if self.with_time:
            # q(phi) = u^2 (1 - 2u) = aa - 2 aaa; t' = 1/(b q)
            for k in range(N - 1, N + 1):
                aa[k] = mp.fsum(a[j] * a[k - j] for j in range(k + 1))
            aaa = [mp.fsum(aa[j] * a[k - j] for j in range(k + 1)) for k in range(N + 1)]
            qs = [aa[k] - 2 * aaa[k] for k in range(N + 1)]
            rs = [mp.mpf(0)] * (N + 1)
            rs[0] = 1 / qs[0]
            for k in range(1, N + 1):
                rs[k] = -rs[0] * mp.fsum(qs[j] * rs[k - j] for j in range(1, k + 1))
            tser = [mp.mpf(0)] + [rs[k] / (self.b * (k + 1)) for k in range(N)]
        return a, c, tser

    def step_size(self, a, ts=None):
        N = self.order
        h = None
        for cs in ([a] if ts is None else [a, ts[1:]]):
            n = len(cs) - 1
            scale = abs(cs[0]) + abs(cs[1])
            rho = None
            for k in range(n - 6, n + 1):
                if cs[k] != 0:
                    r = (scale / abs(cs[k])) ** (mp.mpf(1) / k)
                    rho = r if rho is None else min(rho, r)
            if rho is None:
                continue
            hh = rho * (self.tol) ** (mp.mpf(1) / n)
            h = hh if h is None else min(h, hh)
        return min(h, mp.mpf(2)) if h is not None else mp.mpf(1)

    @staticmethod
    def peval(cs, h):
        s = mp.mpf(0)
        for k in range(len(cs) - 1, -1, -1):
            s = s * h + cs[k]
        return s

    @staticmethod
    def pderiv(cs):
        return [k * cs[k] for k in range(1, len(cs))]

    def advance(self, h, a, c, ts):
        da, dc = self.pderiv(a), self.pderiv(c)
        self.u, self.p = self.peval(a, h), self.peval(da, h)
        self.w, self.q = self.peval(c, h), self.peval(dc, h)
        if ts is not None:
            self.t += self.peval(ts, h)
        self.phi += h

    def run(self, targets, stop_escape=True, stop_umax=None, max_phi=200, max_steps=20000):
        """Integrate, recording every crossing of u = target (for each target) and the escape
        (u = 0). Returns a list of events (kind, target, phi, u', w, t)."""
        events = []
        steps = 0
        while self.phi < max_phi and steps < max_steps:
            steps += 1
            a, c, ts = self.series()
            h = self.step_size(a, ts)
            # search [0, h] on a fine grid for sign changes of u - target and u; the grid also holds every turning
            # point of u inside the step (u' = 0), so a ray that only grazes a target (a periapsis just inside
            # r = rs, the flat foot of the lens fixtures) is not stepped over between two grid points
            fns = [(('cross', T), [a[0] - T] + a[1:]) for T in targets]
            if stop_escape:
                fns.append((('escape', 0), a))
            ngrid = 16
            grid = [h * i / ngrid for i in range(1, ngrid + 1)]
            if targets:
                dpoly = self.pderiv(a)
                prevd = self.peval(dpoly, 0)
                for i in range(1, ngrid + 1):
                    x = h * i / ngrid
                    curd = self.peval(dpoly, x)
                    if prevd != 0 and (prevd < 0) != (curd < 0):
                        lo, hi = h * (i - 1) / ngrid, x
                        xe = mp.findroot(lambda z: self.peval(dpoly, z), (lo, hi), solver='anderson')
                        if not (lo < xe < hi):
                            xe = mp.findroot(lambda z: self.peval(dpoly, z), (lo, hi), solver='bisect')
                        if lo < xe < hi:
                            grid.append(xe)
                    prevd = curd
                grid.sort()
            hit = []
            for tag, poly in fns:
                prev = self.peval(poly, 0)
                xprev = mp.mpf(0)
                for i, x in enumerate(grid, start=1):
                    cur = self.peval(poly, x)
                    if prev == 0 and i == 1:
                        prev = cur
                        xprev = x
                        continue
                    if (prev < 0) != (cur < 0) or cur == 0:
                        lo, hi = xprev, x
                        root = mp.findroot(lambda z: self.peval(poly, z), (lo, hi), solver='anderson')
                        if not (lo - h * 1e-10 <= root <= hi + h * 1e-10):
                            root = mp.findroot(lambda z: self.peval(poly, z), (lo, hi), solver='bisect')
                        hit.append((root, tag, poly))
                        break
                    prev = cur
                    xprev = x
            hit.sort(key=lambda z: z[0])
            if hit:
                root, tag, poly = hit[0]
                # advance to the event
                self.advance(root, a, c, ts)
                ev = dict(kind=tag[0], target=tag[1], phi=self.phi, u=self.u, p=self.p, w=self.w,
                          q=self.q, t=self.t)
                events.append(ev)
                if tag[0] == 'escape':
                    return events
                # step just past the event so it is not found again
                a, c, ts = self.series()
                hh = min(self.step_size(a, ts), mp.mpf(10) ** (-mp.mp.dps // 3))
                self.advance(hh, a, c, ts)
                continue
            self.advance(h, a, c, ts)
            if stop_umax is not None and self.u > stop_umax and self.p > 0:
                events.append(dict(kind='captured', phi=self.phi, u=self.u))
                return events
        events.append(dict(kind='timeout', phi=self.phi, u=self.u))
        return events


def static_ray(ro, theta):
    """Backward ray from a static observer at ro, look angle theta from the hole direction."""
    ro, theta = mp.mpf(ro), mp.mpf(theta)
    uo = 1 / ro
    f = uo * mp.sqrt(1 - 2 * uo)
    return Ray(uo, f * mp.cot(theta), 0, -f / mp.sin(theta) ** 2)


def cos_psi_out(u, p):
    """Radial (outward) direction cosine of the backward ray in the local static frame at u,
    from u' = u sqrt(1-2u) cot(angle from the inward radial)."""
    return -p / mp.sqrt(p * p + u * u * (1 - 2 * u))


def static_escape_B(ro, theta, umax=None):
    """(captured, dphi to infinity, d dphi/d theta) for a static observer, by B1."""
    ray = static_ray(ro, theta)
    ray.with_time = False
    umax = umax or max(mp.mpf(1) / ro, mp.mpf('0.5')) * 3
    ev = ray.run([], stop_escape=True, stop_umax=umax)
    last = ev[-1]
    if last['kind'] == 'escape':
        return False, last['phi'], -last['w'] / last['p']
    return True, None, None


def static_crossings_B(ro, rs, theta, with_time=True):
    """All crossings of r = rs by the backward ray (static observer at ro, angle theta), by B1.
    Returns list of dict(dphi, ddphi_dtheta, cs, t)."""
    ro, rs = mp.mpf(ro), mp.mpf(rs)
    ray = static_ray(ro, theta)
    ray.with_time = with_time
    us = 1 / rs
    umax = max(us, 1 / ro, mp.mpf('0.5')) * 2
    ev = ray.run([us], stop_escape=True, stop_umax=umax)
    out = []
    for e in ev:
        if e['kind'] == 'cross':
            out.append(dict(dphi=e['phi'], dd=-e['w'] / e['p'], cs=cos_psi_out(e['u'], e['p']), t=e['t']))
    return out


# ─── B2: full geodesic equations with Christoffel symbols, affine parameter ─────────────────

def _mul(x, y, k):
    return mp.fsum(x[j] * y[k - j] for j in range(k + 1))


class Geo4:
    """Equatorial null geodesic x^mu(lambda) = (t, r, phi) with velocities, from
        r''   = -(1/r^2)(1 - 2/r) t'^2 + (1/(r(r-2))) r'^2 + (r - 2) phi'^2
        phi'' = -(2/r) r' phi'
        t''   = -(2/(r(r-2))) r' t'
    (M = 1), Taylor-series integrated with automatic differentiation of the rational right-hand sides."""

    def __init__(self, r, pr, w, s, order=None, tol=None):
        self.N = order or max(30, int(mp.mp.dps * 1.1))
        self.tol = tol or mp.mpf(10) ** (-(mp.mp.dps - 4))
        self.lam = mp.mpf(0)
        self.x = dict(r=mp.mpf(r), pr=mp.mpf(pr), w=mp.mpf(w), s=mp.mpf(s), phi=mp.mpf(0), t=mp.mpf(0))

    def series(self):
        N = self.N
        X = self.x
        r = [X['r']] + [mp.mpf(0)] * N
        pr = [X['pr']] + [mp.mpf(0)] * N
        w = [X['w']] + [mp.mpf(0)] * N
        s = [X['s']] + [mp.mpf(0)] * N
        phi = [X['phi']] + [mp.mpf(0)] * N
        t = [X['t']] + [mp.mpf(0)] * N
        A = [mp.mpf(0)] * (N + 1)    # 1/r
        B = [mp.mpf(0)] * (N + 1)    # 1/(r-2)
        AA = [mp.mpf(0)] * (N + 1)   # A^2
        AB = [mp.mpf(0)] * (N + 1)   # A B
        ss = [mp.mpf(0)] * (N + 1)   # s^2
        prpr = [mp.mpf(0)] * (N + 1)
        ww = [mp.mpf(0)] * (N + 1)
        rm2ww = [mp.mpf(0)] * (N + 1)
        AAss = [mp.mpf(0)] * (N + 1)
        AAAss = [mp.mpf(0)] * (N + 1)
        ABprpr = [mp.mpf(0)] * (N + 1)
        Apr = [mp.mpf(0)] * (N + 1)
        Aprw = [mp.mpf(0)] * (N + 1)
        ABpr = [mp.mpf(0)] * (N + 1)
        ABprs = [mp.mpf(0)] * (N + 1)
        rm2 = [mp.mpf(0)] * (N + 1)
        for k in range(N):
            # reciprocals
            if k == 0:
                A[0] = 1 / r[0]
                B[0] = 1 / (r[0] - 2)
            else:
                A[k] = -A[0] * mp.fsum(r[j] * A[k - j] for j in range(1, k + 1))
                B[k] = -B[0] * mp.fsum(r[j] * B[k - j] for j in range(1, k + 1))
            rm2[k] = r[k] - (2 if k == 0 else 0)
            AA[k] = _mul(A, A, k)
            AB[k] = _mul(A, B, k)
            ss[k] = _mul(s, s, k)
            prpr[k] = _mul(pr, pr, k)
            ww[k] = _mul(w, w, k)
            rm2ww[k] = _mul(rm2, ww, k)
            AAss[k] = _mul(AA, ss, k)
            AAAss[k] = _mul(A, AAss, k)
            ABprpr[k] = _mul(AB, prpr, k)
            Apr[k] = _mul(A, pr, k)
            Aprw[k] = _mul(Apr, w, k)
            ABpr[k] = _mul(AB, pr, k)
            ABprs[k] = _mul(ABpr, s, k)
            acc_r = -AAss[k] + 2 * AAAss[k] + ABprpr[k] + rm2ww[k]
            acc_w = -2 * Aprw[k]
            acc_s = -2 * ABprs[k]
            r[k + 1] = pr[k] / (k + 1)
            phi[k + 1] = w[k] / (k + 1)
            t[k + 1] = s[k] / (k + 1)
            pr[k + 1] = acc_r / (k + 1)
            w[k + 1] = acc_w / (k + 1)
            s[k + 1] = acc_s / (k + 1)
        return dict(r=r, pr=pr, w=w, s=s, phi=phi, t=t)

    def step(self, ser):
        N = self.N
        r = ser['r']
        scale = abs(r[0])
        rho = None
        for k in range(N - 6, N + 1):
            if r[k] != 0:
                v = (scale / abs(r[k])) ** (mp.mpf(1) / k)
                rho = v if rho is None else min(rho, v)
        return rho * self.tol ** (mp.mpf(1) / N) if rho else scale

    def advance(self, h, ser):
        for key, cs in ser.items():
            self.x[key] = Ray.peval(cs, h)
        self.lam += h

    def run_to_r(self, r_target, direction_needed=None, max_steps=100000):
        """Integrate until r crosses r_target (first crossing whose r' sign matches, if given)."""
        steps = 0
        while steps < max_steps:
            steps += 1
            ser = self.series()
            h = self.step(ser)
            poly = [ser['r'][0] - r_target] + ser['r'][1:]
            prev = Ray.peval(poly, 0)
            found = None
            for i in range(1, 17):
                x = h * i / 16
                cur = Ray.peval(poly, x)
                if (prev < 0) != (cur < 0):
                    root = mp.findroot(lambda z: Ray.peval(poly, z), (h * (i - 1) / 16, x), solver='anderson')
                    found = root
                    break
                prev = cur
            if found is not None:
                dr = Ray.peval(Ray.pderiv(ser['r']), found)
                if direction_needed is None or (dr > 0) == (direction_needed > 0):
                    self.advance(found, ser)
                    return True
                self.advance(found, ser)
                ser = self.series()
                self.advance(min(self.step(ser), mp.mpf(10) ** (-mp.mp.dps // 3)), ser)
                continue
            self.advance(h, ser)
            if self.x['r'] < 2.0001:
                return False
        return False


def static_geo4(ro, theta):
    """Backward null geodesic from a static observer at ro, look angle theta (static frame), with the
    static tetrad: k = (1/sqrt(f)) d_t - sqrt(f) cos(theta) d_r ... (backward: the look direction)."""
    ro, theta = mp.mpf(ro), mp.mpf(theta)
    f = 1 - 2 / ro
    # backward ray: spatial direction = look direction: radial outward component -cos(theta), tangential sin(theta)
    s = 1 / mp.sqrt(f)                  # dt/dlambda (unit local energy); backward in time is irrelevant for the orbit
    pr = mp.sqrt(f) * (-mp.cos(theta))
    w = mp.sin(theta) / ro
    return Geo4(ro, pr, w, s)
