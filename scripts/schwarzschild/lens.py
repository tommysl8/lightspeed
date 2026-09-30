"""
Part of the independent reference for src/physics/lensPoint.ts and the exact lens of
src/physics/schwarzschild.ts (run by make_fixtures.py). Dependencies: mpmath. Run time: a few
seconds per image at 34 digits. Shares no code with the TypeScript.

The exact lens equation for a static observer at ro and a static point source at rs, the angle Phi
between them seen from the hole (M = 1). Method A (closed forms, schw_mp) solves; method B
(geodesic_mp) checks.

Images: the backward ray from the observer, leaving at angle theta from the hole direction in the plane of
hole, observer and source, sweeps azimuth dphi before it meets the sphere r = rs. The source is met when
    dphi = Phi + 2 pi k           (same side as the source, k = 0, 1, 2, ...)
    dphi = 2 pi - Phi + 2 pi k    (opposite side)
Along the family of backward rays ordered as below, dphi rises monotonically from 0 to infinity, so every
(k, side) has exactly one image (checked numerically in check_monotone):
    rs > ro > 3:          theta from pi down to theta_sh           (outward rays, then rays through periapsis)
    3 < rs < ro:          theta from 0 up to theta_sh (captured rays, met on the way in), then on up to theta_t
                          (rays through periapsis, met on the way in), then back down to theta_sh (met on the
                          way out after periapsis). theta_t: the ray whose periapsis is rs.
    2 < rs <= 3 < ro:     theta from 0 up to theta_sh (captured rays met on the way in)
Magnification, observer's solid angle over the source's cross-section (static frames):
    dOmega_o/dA_s = sin(theta) / (rs^2 |sin(dphi)| |d dphi/d theta| |cos psi_s|)
    mu = d_E^2 dOmega_o/dA_s, signed with parity -sign(sin(dphi) d(dphi)/d(theta) cs)
with d_E^2 = ro^2 + rs^2 - 2 ro rs cos(Phi) (flat-space distance with the same coordinates), and
cs = cos psi_s the outward direction cosine of the backward ray at the source: cos^2 psi_s = b^2 G(us).
Observed bolometric flux of an image: F = L/(4 pi) g^4 dOmega_o/dA_s, g = sqrt((1 - 2/rs)/(1 - 2/ro)).
"""
from __future__ import annotations

import mpmath as mp

import schw_mp as A

PI = mp.pi


def theta_sh(ro):
    return A.shadow_angle(ro)


def theta_t(ro, rs):
    """Observer angle of the ray whose periapsis is rs (3 < rs < ro)."""
    ro, rs = mp.mpf(ro), mp.mpf(rs)
    return mp.asin(rs / ro * mp.sqrt((1 - 2 / ro) / (1 - 2 / rs)))


def cos_psi(b, u):
    """|cos psi| of a ray with impact parameter b at u (static frame): cos^2 psi = b^2 G(u)."""
    g = A.Gfun(u, b)
    return mp.sqrt(max(g, 0)) * b


# ─── dphi along each branch ───────────────────────────────────────────────────────────────

def dphi_branch(ro, rs, branch, theta):
    """Swept azimuth to the crossing of r = rs on a named branch:
       'out'  : backward ray outward from the start (theta > pi/2), rs > ro
       'peri' : through periapsis, met on the way out (theta_sh < theta < pi/2 or theta_t)
       'in_c' : captured ray (theta < theta_sh), met on the way in, rs < ro
       'in_p' : ray through periapsis, met on the way in before periapsis (theta_sh < theta < theta_t), rs < ro
    Returns (dphi, cs) with cs the signed outward direction cosine of the backward ray at the source."""
    ro, rs, theta = mp.mpf(ro), mp.mpf(rs), mp.mpf(theta)
    uo, us = 1 / ro, 1 / rs
    b = A.static_b(ro, theta)
    if branch == 'out':
        return A.sweep_between(b, us, uo), cos_psi(b, us)
    if branch == 'peri':
        return A.sweep_to_periapsis(b, uo) + A.sweep_to_periapsis(b, us), cos_psi(b, us)
    if branch in ('in_c', 'in_p'):
        if b == 0:
            return mp.mpf(0), -mp.mpf(1)
        return A.sweep_between(b, uo, us), -cos_psi(b, us)
    raise ValueError(branch)


def solve_image(ro, rs, T):
    """theta of the image whose backward ray sweeps T before meeting r = rs. Returns (theta, branch)."""
    ro, rs, T = mp.mpf(ro), mp.mpf(rs), mp.mpf(T)
    sh = theta_sh(ro)
    tiny = mp.mpf(10) ** (-mp.mp.dps + 6)

    def solve_on(branch, lo, hi, var):
        # var: 'x_lo' -> theta = lo + e^x (stretch at lo); 'x_hi' -> theta = hi - e^x; 'lin'
        if var == 'lin':
            f = lambda th: dphi_branch(ro, rs, branch, th)[0] - T
            return mp.findroot(f, (lo, hi), solver='anderson'), branch
        if var in ('x_lo', 'x_hi'):
            base = lo if var == 'x_lo' else hi
            sgn = 1 if var == 'x_lo' else -1
            f = lambda x: dphi_branch(ro, rs, branch, base + sgn * mp.exp(x))[0] - T
            xhi = mp.log(hi - lo)
            # walk the lower bracket down until dphi exceeds T (dphi ~ -x + const near the edge); start below
            # the upper end (far observers have a narrow periapsis branch: tt - sh ~ 1e-3 at 1,000 M)
            xlo = min(-T - 4, xhi - 1)
            while f(xlo) <= 0:
                xlo -= 6
                if base + sgn * mp.exp(xlo) == base:
                    raise ValueError('precision too low for this image order')
            x = mp.findroot(f, (xlo, xhi), solver='anderson')
            return base + sgn * mp.exp(x), branch
        raise ValueError(var)

    if ro <= 3:
        raise ValueError('solver written for ro > 3')
    if rs == ro:
        # source on the observer's sphere: only rays through periapsis, theta in (theta_sh, pi/2]
        return solve_on('peri', sh, PI / 2, 'x_lo')
    if rs > ro:
        # outward branch: theta in [pi/2, pi], dphi in [0, D90]; then periapsis branch theta in (sh, pi/2]
        D90 = dphi_branch(ro, rs, 'out', PI / 2)[0]
        if T <= D90:
            if T == 0:
                return PI, 'out'
            return solve_on('out', PI / 2, PI, 'lin')
        return solve_on('peri', sh, PI / 2, 'x_lo')
    if rs <= 3:
        # captured rays met on the way in: theta in [0, sh), dphi 0 -> infinity at sh
        if T == 0:
            return mp.mpf(0), 'in_c'
        return solve_on('in_c', mp.mpf(0), sh, 'x_hi')
    # 3 < rs < ro
    tt = theta_t(ro, rs)
    b_sh = A.BC
    Dsh = A.sweep_between(b_sh * (1 - mp.mpf(10) ** (-mp.mp.dps + 4)), 1 / ro, 1 / rs)   # limit at the shadow edge
    Dt = dphi_branch(ro, rs, 'in_p', tt)[0]
    if T <= Dsh:
        if T == 0:
            return mp.mpf(0), 'in_c'
        return solve_on('in_c', mp.mpf(0), sh * (1 - tiny), 'lin')
    if T <= Dt:
        return solve_on('in_p', sh * (1 + tiny), tt, 'lin')
    return solve_on('peri', sh, tt, 'x_lo')


def dphi_dtheta(ro, rs, branch, theta):
    return mp.diff(lambda th: dphi_branch(ro, rs, branch, th)[0], theta)


def images(ro, rs, Phi, kmax=2):
    """All images with k = 0..kmax on both sides. Each: dict(k, side, theta, b, dphi, branch, cs,
    ddphi, dOmega_dA, mu (signed), parity)."""
    ro, rs, Phi = mp.mpf(ro), mp.mpf(rs), mp.mpf(Phi)
    dE2 = ro ** 2 + rs ** 2 - 2 * ro * rs * mp.cos(Phi)
    out = []
    for k in range(kmax + 1):
        for side in (+1, -1):
            T = (Phi if side > 0 else 2 * PI - Phi) + 2 * PI * k
            th, br = solve_image(ro, rs, T)
            b = A.static_b(ro, th)
            dphi, cs = dphi_branch(ro, rs, br, th)
            dd = dphi_dtheta(ro, rs, br, th)
            dOdA = mp.sin(th) / (rs ** 2 * abs(mp.sin(dphi)) * abs(dd) * abs(cs))
            parity = -mp.sign(mp.sin(dphi) * dd * cs)
            out.append(dict(k=k, side=side, T=T, theta=th, b=b, dphi=dphi, branch=br, cs=cs, ddphi=dd,
                            dOmega_dA=dOdA, mu=parity * dE2 * dOdA, parity=int(parity)))
    return out


def travel_time(ro, rs, branch, theta):
    """Coordinate time along the ray from the source to the observer, by quadrature of
    dt/du = 1/((1 - 2u) b u^2 sqrt(G)) over each leg; at a periapsis u = u2 - s^2 removes the
    square-root singularity: G = 2 (u - u1)(u2 - u)(u3 - u)."""
    ro, rs, theta = mp.mpf(ro), mp.mpf(rs), mp.mpf(theta)
    uo, us = 1 / ro, 1 / rs
    b = A.static_b(ro, theta)
    f = lambda u: 1 / ((1 - 2 * u) * b * u * u * mp.sqrt(A.Gfun(u, b)))
    if branch in ('out', 'in_c', 'in_p'):
        lo, hi = (us, uo) if us < uo else (uo, us)
        if b > A.BC:
            u1, u2, u3 = A.roots_real(b)
            if hi >= u2 * (1 - mp.mpf(10) ** -20):
                hi = u2
                g = lambda s: 2 / ((1 - 2 * (u2 - s * s)) * b * (u2 - s * s) ** 2
                                   * mp.sqrt(2 * (u2 - s * s - u1) * (u3 - u2 + s * s)))
                return mp.quad(g, [0, mp.sqrt(u2 - lo)])
        pts = [lo] + ([mp.mpf(1) / 3] if lo < mp.mpf(1) / 3 < hi else []) + [hi]
        return mp.quad(f, pts)
    if branch == 'peri':
        u1, u2, u3 = A.roots_real(b)
        g = lambda s: 2 / ((1 - 2 * (u2 - s * s)) * b * (u2 - s * s) ** 2
                           * mp.sqrt(2 * (u2 - s * s - u1) * (u3 - u2 + s * s)))
        return mp.quad(g, [0, mp.sqrt(u2 - uo)]) + mp.quad(g, [0, mp.sqrt(u2 - us)])
    raise ValueError(branch)


def check_monotone(ro, rs, n=400):
    """Scan the path through the branches and confirm that dphi increases monotonically."""
    ro, rs = mp.mpf(ro), mp.mpf(rs)
    sh = theta_sh(ro)
    vals = []
    if rs > ro:
        for i in range(n + 1):
            th = PI - (PI - sh) * (1 - mp.mpf(10) ** (-8 * mp.mpf(i) / n)) if False else None
        ths = [PI - (PI / 2) * mp.mpf(i) / n for i in range(n + 1)]
        vals += [dphi_branch(ro, rs, 'out', t)[0] for t in ths]
        xs = [mp.log(PI / 2 - sh) - 20 * mp.mpf(i) / n for i in range(1, n + 1)]
        vals += [dphi_branch(ro, rs, 'peri', sh + mp.exp(x))[0] for x in xs]
    elif rs <= 3:
        xs = [mp.log(sh / n) - 20 * mp.mpf(i) / n for i in range(1, n + 1)]
        vals += [dphi_branch(ro, rs, 'in_c', sh * mp.mpf(i) / n)[0] for i in range(n)]
        vals += [dphi_branch(ro, rs, 'in_c', sh - mp.exp(x))[0] for x in xs]
    else:
        tt = theta_t(ro, rs)
        vals += [dphi_branch(ro, rs, 'in_c', sh * mp.mpf(i) / n)[0] for i in range(n)]
        vals += [dphi_branch(ro, rs, 'in_p', sh + (tt - sh) * mp.mpf(i) / n)[0] for i in range(1, n + 1)]
        xs = [mp.log(tt - sh) - 20 * mp.mpf(i) / n for i in range(1, n + 1)]
        vals += [dphi_branch(ro, rs, 'peri', sh + mp.exp(x))[0] for x in xs]
    bad = sum(1 for a, b in zip(vals, vals[1:]) if not b > a)
    return bad, vals[0], vals[-1]
