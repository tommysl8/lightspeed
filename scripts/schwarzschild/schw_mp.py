"""
Part of the independent reference for src/physics/schwarzschild.ts (run by make_fixtures.py).
Dependencies: mpmath. Run time: microseconds to milliseconds per call at 34-50 digits.
Shares no code with the TypeScript: it is the thing the TypeScript is checked against.

Method A: closed forms for null geodesics of the Schwarzschild metric, in high precision (mpmath).

Units: G = c = 1 and M = 1 (every length is in units of M = GM/c^2; times in GM/c^3).
    metric   ds^2 = -(1 - 2/r) dt^2 + dr^2/(1 - 2/r) + r^2 dOmega^2
    u = 1/r, impact parameter b = L/E, orbit equation (du/dphi)^2 = G(u) = 1/b^2 - u^2 + 2 u^3.
    b_c = 3 sqrt(3), photon sphere r = 3.

The azimuth swept between two radii is an elliptic integral of the first kind, written here in Carlson's
symmetric form R_F (DLMF 19.29.4), which needs no subtraction of nearly equal numbers:
  * b > b_c: three real roots u1 < 0 < u2 <= u3 of G, u2 = 1/r0 (periapsis);
  * b < b_c: one real root u1 < 0 and a complex pair m +- i n.
mpmath's elliprf evaluates R_F for real or complex arguments.
"""
from __future__ import annotations

import mpmath as mp

mp.mp.dps = 40

SQRT3 = mp.sqrt(3)
BC = 3 * SQRT3            # critical impact parameter
PI = mp.pi


def set_dps(d: int) -> None:
    mp.mp.dps = d
    global SQRT3, BC, PI
    SQRT3 = mp.sqrt(3)
    BC = 3 * SQRT3
    PI = mp.pi


# ─── Roots of G(u) ────────────────────────────────────────────────────────────────────────

def periapsis(b):
    """r0(b) for b > b_c: the largest root of r^3 - b^2 r + 2 b^2 = 0, written without cancellation:
    A' = arccos(b_c/b) = 2 asin(sqrt((b - b_c)/(2b))); r0 = (b/sqrt3) cos(A'/3) + b sin(A'/3)."""
    b = mp.mpf(b)
    d = b - BC
    if d <= 0:
        raise ValueError('periapsis needs b > b_c')
    Ap = 2 * mp.asin(mp.sqrt(d / (2 * b)))
    return (b / SQRT3) * mp.cos(Ap / 3) + b * mp.sin(Ap / 3)


def b_of_r0(r0):
    """Impact parameter of the ray with periapsis r0 (> 3): b^2 = r0^3 / (r0 - 2)."""
    r0 = mp.mpf(r0)
    return mp.sqrt(r0 ** 3 / (r0 - 2))


def roots_real(b):
    """b > b_c: (u1, u2, u3), u1 < 0 < u2 <= u3, via Darwin's P = r0 and Q = sqrt((P-2)(P+6))."""
    P = periapsis(b)
    Q = mp.sqrt((P - 2) * (P + 6))
    u2 = 1 / P
    u3 = (P - 2 + Q) / (4 * P)
    u1 = -2 * (P - 2) / (P * (P - 2 + Q))
    return u1, u2, u3


def roots_complex(b):
    """b < b_c: (u1, m, n) with G(u) = 2 (u - u1) ((u - m)^2 + n^2).
    s = sqrt((b_c - b)(b_c + b))/b, eta = -(2/3) sinh^2(asinh(s)/3), u1 = -1/6 + eta,
    S = 2/3 - eta, m = S/2, n^2 = -(3/4) eta S."""
    b = mp.mpf(b)
    if b >= BC:
        raise ValueError('roots_complex needs b < b_c')
    if b == 0:
        raise ValueError('b = 0 (radial ray) has no finite roots; the sweep is 0')
    s = mp.sqrt((BC - b) * (BC + b)) / b
    eta = -mp.mpf(2) / 3 * mp.sinh(mp.asinh(s) / 3) ** 2
    u1 = -mp.mpf(1) / 6 + eta
    S = mp.mpf(2) / 3 - eta
    m = S / 2
    n = mp.sqrt(-mp.mpf(3) / 4 * eta * S)
    return u1, m, n


def Gfun(u, b):
    return 1 / mp.mpf(b) ** 2 - u * u + 2 * u ** 3


# ─── Sweeps (azimuth swept by the ray between two radii) ───────────────────────────────────

RF = mp.elliprf
SQ2 = None


def _sq2():
    return mp.sqrt(2)


def sweep_to_periapsis(b, u):
    """b > b_c, 0 <= u <= u2: Phi_p(u) = int_u^{u2} du'/sqrt(G) =
    sqrt2 sqrt(u2-u) R_F((u-u1)(u3-u2), (u2-u1)(u3-u2), (u2-u1)(u3-u))."""
    u1, u2, u3 = roots_real(b)
    u = mp.mpf(u)
    if u > u2:
        if u - u2 < mp.mpf(10) ** (-mp.mp.dps + 5):
            u = u2
        else:
            raise ValueError('u beyond the periapsis')
    return _sq2() * mp.sqrt(u2 - u) * RF((u - u1) * (u3 - u2), (u2 - u1) * (u3 - u2), (u2 - u1) * (u3 - u))


def sweep_between(b, ua, ub):
    """Azimuth swept between u = ua and u = ub (ua < ub, no turning point between them), any b > 0.
    DLMF 19.29.4 with the fourth factor 1: 2 R_F(U12^2, U13^2, U14^2) / sqrt(2).
    ub may be mp.inf (r = 0)."""
    b = mp.mpf(b)
    ua = mp.mpf(ua)
    if ub is not mp.inf:
        ub = mp.mpf(ub)
        if not ub > ua:
            raise ValueError('need ua < ub')
    if b > BC:
        u1, u2, u3 = roots_real(b)
        if ub is not mp.inf and ub <= u2 * (1 + mp.mpf(10) ** (-mp.mp.dps + 8)):
            ub = min(ub, u2)
            # outer region: factors (t - u1), (u2 - t), (u3 - t)
            X1, Y1 = mp.sqrt(ub - u1), mp.sqrt(ua - u1)
            X2, Y2 = mp.sqrt(u2 - ub), mp.sqrt(u2 - ua)
            X3, Y3 = mp.sqrt(u3 - ub), mp.sqrt(u3 - ua)
        elif ua >= u3 * (1 - mp.mpf(10) ** (-mp.mp.dps + 8)):
            ua = max(ua, u3)
            if ub is mp.inf:
                return _sq2() * RF(ua - u1, ua - u2, ua - u3)
            X1, Y1 = mp.sqrt(ub - u1), mp.sqrt(ua - u1)
            X2, Y2 = mp.sqrt(ub - u2), mp.sqrt(ua - u2)
            X3, Y3 = mp.sqrt(ub - u3), mp.sqrt(ua - u3)
        else:
            raise ValueError('interval crosses the forbidden band (u2, u3)')
        d = ub - ua
        U12 = (X1 * X2 * Y3 + Y1 * Y2 * X3) / d
        U13 = (X1 * X3 * Y2 + Y1 * Y3 * X2) / d
        U14 = (X1 * Y2 * Y3 + Y1 * X2 * X3) / d
        return _sq2() * RF(U12 ** 2, U13 ** 2, U14 ** 2)
    if b == BC:
        raise ValueError('b = b_c: use the limit')
    u1, m, n = roots_complex(b)
    w = mp.mpc(m, n)
    if ub is mp.inf:
        return _sq2() * mp.re(RF(ua - u1, ua - w, ua - mp.conj(w)))
    X1, Y1 = mp.sqrt(ub - u1), mp.sqrt(ua - u1)
    Zx, Zy = mp.sqrt(ub - w), mp.sqrt(ua - w)
    d = ub - ua
    U14 = (X1 * abs(Zy) ** 2 + Y1 * abs(Zx) ** 2) / d
    U12 = (X1 * Zx * mp.conj(Zy) + Y1 * Zy * mp.conj(Zx)) / d
    return _sq2() * mp.re(RF(U14 ** 2, U12 ** 2, mp.conj(U12) ** 2))


def sweep_quad(b, ua, ub):
    """Plain quadrature of du/sqrt(G) (tanh-sinh copes with square-root endpoints): a check only."""
    b = mp.mpf(b)
    return mp.quad(lambda t: 1 / mp.sqrt(Gfun(t, b)), [ua, ub])


def deflection(b):
    """Total deflection alpha(b) = 2 Phi_p(0) - pi for b > b_c."""
    return 2 * sweep_to_periapsis(b, 0) - PI


# Legendre forms, for the record and as a second check of the Carlson forms

def sweep_to_periapsis_legendre(b, u):
    """(2/sqrt(2 (u3-u1))) F(phi, k), k^2 = (u2-u1)/(u3-u1), sin^2 phi = (u3-u1)(u2-u)/((u2-u1)(u3-u))."""
    u1, u2, u3 = roots_real(b)
    k2 = (u2 - u1) / (u3 - u1)
    s2 = (u3 - u1) * (u2 - u) / ((u2 - u1) * (u3 - u))
    ph = mp.asin(mp.sqrt(s2))
    return 2 / mp.sqrt(2 * (u3 - u1)) * mp.ellipf(ph, k2)


def darwin_deflection(b):
    """Darwin (1959): alpha = -pi + 4 sqrt(P/Q) [K(k) - F(zeta_inf, k)],
    k^2 = (Q - P + 6)/(2Q), sin^2 zeta_inf = (Q - P + 2)/(Q - P + 6)."""
    P = periapsis(b)
    Q = mp.sqrt((P - 2) * (P + 6))
    k2 = (Q - P + 6) / (2 * Q)
    z = mp.asin(mp.sqrt((Q - P + 2) / (Q - P + 6)))
    return -PI + 4 * mp.sqrt(P / Q) * (mp.ellipk(k2) - mp.ellipf(z, k2))


def sweep_capture_legendre(b, u):
    """b < b_c: int_{u1}^{u} du/sqrt(G) = F(theta, k)/sqrt(2A), Byrd & Friedman 239.00 with
    A = sqrt((m-u1)^2 + n^2), k^2 = (A + m - u1)/(2A), cos theta = (A - (u - u1))/(A + (u - u1))."""
    u1, m, n = roots_complex(b)
    A = mp.sqrt((m - u1) ** 2 + n ** 2)
    k2 = (A + m - u1) / (2 * A)
    x = u - u1
    th = mp.acos((A - x) / (A + x))
    return mp.ellipf(th, k2) / mp.sqrt(2 * A)


# ─── Static observer: the escape map ──────────────────────────────────────────────────────

def static_b(ro, theta):
    """Impact parameter of the ray seen by a static observer at ro at angle theta from the hole."""
    ro = mp.mpf(ro)
    return ro * mp.sin(theta) / mp.sqrt(1 - 2 / ro)


def shadow_angle(ro):
    """Angular radius of the shadow for a static observer (Synge 1966):
    sin = (b_c/ro) sqrt(1 - 2/ro); > 90 degrees inside the photon sphere."""
    ro = mp.mpf(ro)
    s = BC / ro * mp.sqrt(1 - 2 / ro)
    a = mp.asin(min(s, mp.mpf(1)))
    return a if ro >= 3 else PI - a


def escape_sweep_static(ro, theta):
    """For a static observer at ro > 2 looking at angle theta from the hole (static frame):
    returns (captured: bool, sweep to infinity dphi, b). The backward ray leaves in the plane of
    (hole direction, look direction) and reaches infinity at azimuth dphi from the observer's radius,
    swept towards the look direction."""
    ro = mp.mpf(ro)
    theta = mp.mpf(theta)
    uo = 1 / ro
    b = static_b(ro, theta)
    th_sh = shadow_angle(ro)
    if theta <= th_sh:
        return True, None, b
    if b == 0:
        return False, mp.mpf(0), b
    c = mp.cos(theta)
    if ro > 3 and c > 0:
        # inward to periapsis, then out
        return False, sweep_to_periapsis(b, 0) + sweep_to_periapsis(b, uo), b
    # outward all the way
    if b > BC:
        return False, sweep_between(b, 0, uo), b
    return False, sweep_between(b, 0, uo), b


# ─── Raindrop observer (free fall from rest at infinity), any r > 0 ─────────────────────────

def raindrop_b(r, theta):
    """b = r sin(theta)/(1 - v cos(theta)), v = sqrt(2/r); theta from the hole direction in the raindrop's frame.
    Returns (b, E_sign) with E_sign = sign(1 - v cos theta) (the Killing energy's sign)."""
    r = mp.mpf(r)
    v = mp.sqrt(2 / r)
    den = 1 - v * mp.cos(theta)
    return r * mp.sin(theta) / den, mp.sign(den)


def escape_sweep_raindrop(r, theta):
    """(captured, dphi, b, ln(nu_obs/nu_inf)) for the raindrop observer at r (any r > 0)."""
    r = mp.mpf(r)
    theta = mp.mpf(theta)
    v = mp.sqrt(2 / r)
    den = 1 - v * mp.cos(theta)
    if den <= 0:
        return True, None, None, None     # photons with E <= 0: from the white hole / collapsed star
    b = r * mp.sin(theta) / den
    lnf = -mp.log(den)
    uo = 1 / r
    outward_back = mp.cos(theta) < v          # the backward-traced ray moves to larger r
    if b == 0:
        return (False, mp.mpf(0), b, lnf) if outward_back else (True, None, b, lnf)
    if outward_back:
        if r > 3:
            return False, sweep_between(b, 0, uo), b, lnf
        if b < BC:
            return False, sweep_between(b, 0, uo), b, lnf
        return True, None, b, lnf                 # trapped under r3: turns back into the hole
    # backward ray inward (only possible outside the horizon)
    if b > BC and r > 3:
        return False, sweep_to_periapsis(b, 0) + sweep_to_periapsis(b, uo), b, lnf
    return True, None, b, lnf


# ─── The exact lens equation (static observer, static source) ──────────────────────────────

def crossings(ro, rs, theta):
    """Every point where the backward ray from a static observer at ro (angle theta) crosses the
    sphere r = rs. Returns a list of (dphi, cs) with cs = +1 if the backward ray moves outward there,
    -1 if inward (the sign of cos psi_s)."""
    ro, rs, theta = mp.mpf(ro), mp.mpf(rs), mp.mpf(theta)
    uo, us = 1 / ro, 1 / rs
    b = static_b(ro, theta)
    c = mp.cos(theta)
    out = []
    if b == 0:
        if c > 0 and rs < ro:
            out.append((mp.mpf(0), -1))
        if c < 0 and rs > ro:
            out.append((mp.mpf(0), +1))
        return out
    if c > 0:          # backward ray starts inward
        if b > BC and ro > 3:
            u1, u2, u3 = roots_real(b)
            if us < uo:                   # source further out than the observer: one crossing after periapsis
                out.append((sweep_to_periapsis(b, uo) + sweep_to_periapsis(b, us), +1))
            elif us <= u2:
                out.append((sweep_between(b, uo, us), -1))
                out.append((sweep_to_periapsis(b, uo) + sweep_to_periapsis(b, us), +1))
        elif b < BC:
            if us > uo:
                out.append((sweep_between(b, uo, us), -1))
        # b > b_c with ro < 3 (inner region): trapped; sources inside ro reached once
        elif ro < 3 and b > BC:
            if us > uo:
                out.append((sweep_between(b, uo, us), -1))
    else:              # backward ray starts outward
        if ro > 3 or b < BC:
            if us < uo:
                out.append((sweep_between(b, us, uo), +1))
        else:
            # ro < 3 and b > b_c: up to r3 and back down
            u1, u2, u3 = roots_real(b)
            if uo >= u3 and us < uo and us >= u3:
                out.append((sweep_between(b, us, uo), +1))
            if us >= u3:
                s = sweep_between(b, u3, uo) if uo > u3 else mp.mpf(0)
                if us > u3:
                    out.append((s + sweep_between(b, u3, us), -1))
    return out
