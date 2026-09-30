"""
Used by render_views.py for the reference pictures (scripts/lens-check). Dependencies: numpy.
Run time: well under a second for a 360 x 240 view. Shares no code with the TypeScript.

The same closed forms in plain IEEE arithmetic, written the way the TypeScript (float64) and GLSL (float32)
code should be: Carlson's R_F by duplication with a fixed tolerance, the roots of G from the stable
formulas, and no subtraction of nearly equal numbers. Vectorised with numpy; `F` selects the float type
(np.float64 for TypeScript, np.float32 to emulate a shader: every operation rounds to float32).

M = 1. The near-critical variable is d = b/b_c - 1 (b = b_c (1 + d)).
"""
from __future__ import annotations

import numpy as np

F = np.float64


def use(dtype):
    global F
    F = dtype


def c(x):
    return F(x)



def csqrt(re, im):
    """Principal square root of re + i im without cancellation: (a, b) with a >= 0."""
    re, im = np.asarray(re, F), np.asarray(im, F)
    mod = np.hypot(re, im)
    t = np.sqrt((mod + np.abs(re)) / F(2))
    t = np.where(t == 0, F(1e-300) if F == np.float64 else F(1e-38), t)
    a = np.where(re >= 0, t, np.abs(im) / (F(2) * t))
    bb = np.where(re >= 0, im / (F(2) * t), np.copysign(t, im))
    return a, bb


def rf(x, y, z, tol=None, maxit=40):
    """Carlson R_F(x, y, z) for x, y, z >= 0 (at most one zero): duplication until the relative spread is
    below tol, then the fifth-order series of DLMF 19.36.1 (error ~ tol^6 / 4)."""
    x, y, z = np.asarray(x, F), np.asarray(y, F), np.asarray(z, F)
    tol = F(0.0025 if F == np.float64 else 0.05) if tol is None else F(tol)
    q = F(0.25)
    for _ in range(maxit):
        sx, sy, sz = np.sqrt(x), np.sqrt(y), np.sqrt(z)
        lam = sx * (sy + sz) + sy * sz
        x, y, z = q * (x + lam), q * (y + lam), q * (z + lam)
        A = (x + y + z) / F(3)
        X, Y, Z = F(1) - x / A, F(1) - y / A, F(1) - z / A
        if np.all(np.maximum(np.maximum(np.abs(X), np.abs(Y)), np.abs(Z)) < tol):
            break
    E2 = X * Y - Z * Z
    E3 = X * Y * Z
    return (F(1) - E2 / F(10) + E3 / F(14) + E2 * E2 / F(24) - F(3) * E2 * E3 / F(44)) / np.sqrt(A)


def rf_conj(x, zr, zi, tol=None, maxit=40):
    """R_F(x, z, conj z) with x >= 0 and z = zr + i zi, in real arithmetic: the duplication keeps the
    conjugate pair, lambda = 2 sqrt(x) Re sqrt(z) + |z| is real."""
    x, zr, zi = np.asarray(x, F), np.asarray(zr, F), np.asarray(zi, F)
    tol = F(0.0025 if F == np.float64 else 0.05) if tol is None else F(tol)
    q = F(0.25)
    for _ in range(maxit):
        mod = np.hypot(zr, zi)
        a, _ = csqrt(zr, zi)                     # Re sqrt(z), stable
        lam = F(2) * np.sqrt(x) * a + mod
        # zr + |z| without cancellation when zr < 0: zi^2 / (|z| - zr)
        with np.errstate(divide='ignore', invalid='ignore'):
            zpm = np.where(zr >= 0, zr + mod, zi * zi / (mod - zr))
        x, zr, zi = q * (x + lam), q * (zpm + F(2) * np.sqrt(x) * a), q * zi
        A = (x + F(2) * zr) / F(3)
        X, Yr, Yi = F(1) - x / A, F(1) - zr / A, -zi / A
        if np.all(np.maximum(np.abs(X), np.hypot(Yr, Yi)) < tol):
            break
    Y2 = Yr * Yr + Yi * Yi
    E2 = F(2) * X * Yr + Y2
    E3 = X * Y2
    return (F(1) - E2 / F(10) + E3 / F(14) + E2 * E2 / F(24) - F(3) * E2 * E3 / F(44)) / np.sqrt(A)


SQRT3 = np.sqrt(3.0)
BC = 3 * SQRT3


# ─── roots ──────────────────────────────────────────────────────────────────────────────

def roots_real(d):
    """d = b/b_c - 1 > 0. Returns dict(P, eps=P-3, u1, u2, u3, du32=u3-u2, du21=u2-u1, du31=u3-u1, mu1=-u1)."""
    d = np.asarray(d, F)
    b = c(BC) * (F(1) + d)
    Ap = F(2) * np.arcsin(np.sqrt(d / (F(2) * (F(1) + d))))
    s3, s6 = np.sin(Ap / F(3)), np.sin(Ap / F(6))
    eps = F(3) * d - F(2) * b / c(SQRT3) * s6 * s6 + b * s3
    P = F(3) + eps
    Q = np.sqrt((P - F(2)) * (P + F(6)))
    u2 = F(1) / P
    QmP6 = (F(4) * P - F(12)) / (Q + P) + F(6)    # Q - P + 6 without cancellation at large P
    du32 = F(4) * eps / (P * QmP6)
    du21 = (F(3) * P - F(6) + Q) / (P * (P - F(2) + Q))
    du31 = Q / (F(2) * P)
    mu1 = F(2) * (P - F(2)) / (P * (P - F(2) + Q))
    return dict(P=P, eps=eps, b=b, u2=u2, u1=-mu1, u3=u2 + du32, du32=du32, du21=du21, du31=du31, mu1=mu1)


def roots_complex(d):
    """-1 < d < 0 (0 < b < b_c). Returns dict(u1, m, n) with G = 2 (u - u1)((u - m)^2 + n^2)."""
    d = np.asarray(d, F)
    s = np.sqrt(-d * (F(2) + d)) / (F(1) + d)
    sh = np.sinh(np.arcsinh(s) / F(3))
    eta = -F(2) / F(3) * sh * sh
    u1 = -F(1) / F(6) + eta
    S = F(2) / F(3) - eta
    return dict(u1=u1, m=S / F(2), n=np.sqrt(-F(0.75) * eta * S), b=c(BC) * (F(1) + d))


# ─── sweeps ─────────────────────────────────────────────────────────────────────────────

SQ2 = np.sqrt(2.0)


def phi_p(R, u, y=None):
    """b > b_c: sweep from u (<= u2) to the periapsis. y = u2 - u if known accurately."""
    u = np.asarray(u, F)
    y = R['u2'] - u if y is None else np.asarray(y, F)
    y = np.maximum(y, F(0))
    return c(SQ2) * np.sqrt(y) * rf((u + R['mu1']) * R['du32'], R['du21'] * R['du32'], R['du21'] * (R['du32'] + y))


def phi_between_real(R, ua, ub, ya=None, yb=None):
    """b > b_c, 0 <= ua < ub <= u2: sweep between them (single R_F, DLMF 19.29.4)."""
    ua, ub = np.asarray(ua, F), np.asarray(ub, F)
    ya = R['u2'] - ua if ya is None else np.asarray(ya, F)
    yb = R['u2'] - ub if yb is None else np.asarray(yb, F)
    yb = np.maximum(yb, F(0))
    X1, Y1 = np.sqrt(ub + R['mu1']), np.sqrt(ua + R['mu1'])
    X2, Y2 = np.sqrt(yb), np.sqrt(ya)
    X3, Y3 = np.sqrt(R['du32'] + yb), np.sqrt(R['du32'] + ya)
    dd = ub - ua
    U12 = (X1 * X2 * Y3 + Y1 * Y2 * X3) / dd
    U13 = (X1 * X3 * Y2 + Y1 * Y3 * X2) / dd
    U14 = (X1 * Y2 * Y3 + Y1 * X2 * X3) / dd
    return c(SQ2) * rf(U12 * U12, U13 * U13, U14 * U14)


def phi_between_complex(C, ua, ub):
    """b < b_c, 0 <= ua < ub (ub may be np.inf): sweep between them."""
    ua = np.asarray(ua, F)
    u1, m, n = C['u1'], C['m'], C['n']
    if np.isscalar(ub) and np.isinf(ub):
        # R_F(ua - u1, ua - w, ua - conj w)
        return c(SQ2) * rf_conj(ua - u1, ua - m, -n)
    ub = np.asarray(ub, F)
    X1, Y1 = np.sqrt(ub - u1), np.sqrt(ua - u1)
    # Zx = sqrt(ub - w), Zy = sqrt(ua - w), w = m + i n
    zxr, zxi = csqrt(ub - m, -n)
    zyr, zyi = csqrt(ua - m, -n)
    dd = ub - ua
    Zx2 = zxr * zxr + zxi * zxi
    Zy2 = zyr * zyr + zyi * zyi
    U14 = (X1 * Zy2 + Y1 * Zx2) / dd
    # U12 = (X1 Zx conj(Zy) + Y1 Zy conj(Zx)) / dd
    p_r = zxr * zyr + zxi * zyi          # Re(Zx conj Zy) = Re(Zy conj Zx)
    p_i = zxi * zyr - zxr * zyi          # Im(Zx conj Zy) = -Im(Zy conj Zx)
    Ur = (X1 + Y1) * p_r / dd
    Ui = (X1 - Y1) * p_i / dd
    # U12^2
    Wr, Wi = Ur * Ur - Ui * Ui, F(2) * Ur * Ui
    return c(SQ2) * rf_conj(U14 * U14, Wr, Wi)


# ─── static observer escape map ─────────────────────────────────────────────────────────

def static_escape(ro, theta):
    """Vectorised over theta for one ro (> 2). Returns (captured mask, dphi) (dphi NaN where captured)."""
    ro = F(ro)
    theta = np.asarray(theta, F)
    uo = F(1) / ro
    f = np.sqrt(F(1) - F(2) * uo)
    s_sh = c(BC) * uo * f                     # sin(theta_sh)
    th_sh = np.arcsin(np.minimum(s_sh, F(1)))
    if ro < 3:
        th_sh = c(np.pi) - th_sh
    sn, cs = np.sin(theta), np.cos(theta)
    # d = b/b_c - 1 = (sin theta - sin theta_sh)/sin theta_sh, the difference from half-angles
    d = F(2) * np.cos((theta + th_sh) / F(2)) * np.sin((theta - th_sh) / F(2)) / s_sh
    b = c(BC) * (F(1) + d)
    captured = theta <= th_sh
    out = np.full(theta.shape, np.nan, dtype=F)
    esc = ~captured
    real = esc & (d > 0)
    cplx = esc & (d <= 0)
    if np.any(real):
        R = roots_real(d[real])
        # u2 - uo from the look angle: y (y + du32) = cos^2 / (2 b^2 (uo - u1)) = K
        K = cs[real] ** 2 / (F(2) * b[real] ** 2 * (uo + R['mu1']))
        y = F(2) * K / (R['du32'] + np.sqrt(R['du32'] ** 2 + F(4) * K))
        inward = cs[real] > 0
        p0 = phi_p(R, F(0))
        po = phi_p(R, uo, y)
        # outward rays: the sweep between 0 and uo (single R_F), no cancellation
        pb = phi_between_real(R, np.zeros_like(y), np.full_like(y, uo), ya=R['u2'], yb=y)
        out[real] = np.where(inward, p0 + po, pb)
    if np.any(cplx):
        # nearly radial rays (b -> 0): sweep = b uo (1 + O(b^2 uo^2)); below 1e-4 relative that is exact
        # to float precision only for tiny b, so keep the closed form down to b = 1e-6 uo^-1
        small = cplx & (b * uo < F(1e-6))
        big = cplx & ~small
        if np.any(big):
            dd = np.minimum(d[big], F(-1e-30))
            C = roots_complex(dd)
            out[big] = phi_between_complex(C, np.zeros(dd.shape, F), np.full(dd.shape, uo, F))
        out[small] = b[small] * uo
    return captured, out, th_sh
