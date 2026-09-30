"""
Part of the independent reference for the lens observers of src/physics/schwarzschild.ts and the
camera maps of the fixtures (run by make_fixtures.py). Dependencies: mpmath. Run time: about 0.1 s per
pixel with both methods at 30 digits. Shares no code with the TypeScript.

Observers and what they see (M = 1), method A (closed forms) with method B (Taylor integration) checks.

Frames, all outside the horizon related by pure boosts of the static frame:
  static     at rest at r (r > 2)
  raindrop   falling from rest at infinity, v = sqrt(2/r) inward relative to the static frame; its frame is
             regular at and inside the horizon (Painleve-Gullstrand)
  circular   on a circular geodesic, v = 1/sqrt(r - 2) along phi relative to the static frame (r > 3)
  any ship   rapidity phi along vdir relative to the static frame (outside) or the raindrop frame (anywhere)

Directions are unit 3-vectors in an orthonormal frame whose axes coincide with the world axes at the
observer (the world frame is centred on the hole). A 'look direction' points from the observer towards
where the light comes from.
"""
from __future__ import annotations

import mpmath as mp

import schw_mp as A
import geodesic_mp as B

PI = mp.pi


# ─── small vector helpers (mp) ────────────────────────────────────────────────────────────

def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def scl(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def norm(a):
    return mp.sqrt(dot(a, a))


def unit(a):
    n = norm(a)
    return [a[0] / n, a[1] / n, a[2] / n]


def angle(a, b):
    """Angle between unit vectors from chords: 2 atan2(|a - b|, |a + b|)."""
    return 2 * mp.atan2(norm(sub(a, b)), norm(add(a, b)))


# ─── special-relativistic aberration and Doppler, rapidity form (mirrors src/physics/relativity.ts) ──

def scale_half_angle(d, axis, k):
    """Keep d's azimuth about axis, set tan(new/2) = k tan(old/2)."""
    th = angle(d, axis)
    new = 2 * mp.atan2(k * mp.sin(th / 2), mp.cos(th / 2))
    perp = sub(d, scl(axis, dot(d, axis)))
    pl = norm(perp)
    if pl == 0:
        return list(axis) if dot(d, axis) >= 0 else scl(axis, -1)
    return add(scl(axis, mp.cos(new)), scl(perp, mp.sin(new) / pl))


def to_rest(d_ship, vdir, phi):
    """Ship-frame look direction -> rest-frame look direction: tan(th/2) = e^phi tan(th'/2)."""
    return scale_half_angle(d_ship, vdir, mp.exp(phi))


def to_ship(d_rest, vdir, phi):
    return scale_half_angle(d_rest, vdir, mp.exp(-phi))


def ln_doppler_ship(d_ship, vdir, phi):
    """ln(nu_ship / nu_rest) for light seen in ship-frame direction d_ship:
    -ln(e^-phi cos^2(th'/2) + e^phi sin^2(th'/2))."""
    th = angle(d_ship, vdir)
    return -mp.log(mp.exp(-phi) * mp.cos(th / 2) ** 2 + mp.exp(phi) * mp.sin(th / 2) ** 2)


# ─── escape direction ─────────────────────────────────────────────────────────────────────

def escape_direction(pos, d, dphi):
    """The backward ray from the observer at pos (world) with look direction d sweeps dphi in the plane
    of (hole, d); it leaves along n_inf = cos(dphi) rhat + sin(dphi) e, e = the part of d
    perpendicular to rhat. Also returns the asymptote's offset x_perp = b (sin dphi rhat - cos dphi e)
    (closest point of the outgoing asymptote to the hole) once b is known by the caller."""
    rhat = unit(pos)
    e = sub(d, scl(rhat, dot(d, rhat)))
    el = norm(e)
    if el == 0:
        e = [mp.mpf(0)] * 3
    else:
        e = scl(e, 1 / el)
    n = add(scl(rhat, mp.cos(dphi)), scl(e, mp.sin(dphi)))
    return n, rhat, e


# ─── static observer ──────────────────────────────────────────────────────────────────────

def static_view(pos, d, method='A'):
    """Static observer at world position pos (|pos| > 2), static-frame look direction d.
    Returns dict(captured, theta, b, dphi, n_inf, ln_g) with ln_g = ln(nu_obs/nu_inf) = -1/2 ln(1 - 2/r)."""
    r = norm(pos)
    rhat = unit(pos)
    th = angle(d, scl(rhat, -1))
    ln_g = -mp.log(1 - 2 / r) / 2
    if method == 'A':
        cap, dphi, b = A.escape_sweep_static(r, th)
    else:
        b = A.static_b(r, th)
        if th <= A.shadow_angle(r):
            cap, dphi = True, None
        else:
            cap, dphi, _ = B.static_escape_B(r, th)
    out = dict(captured=bool(cap), theta=th, b=b, ln_g=ln_g, dphi=dphi, n_inf=None, order=None)
    if not cap:
        n, _, _ = escape_direction(pos, d, dphi)
        out['n_inf'] = n
        out['order'] = int(mp.floor(dphi / PI))
    return out


# ─── raindrop observer (any r > 0) ───────────────────────────────────────────────────────

def raindrop_view(pos, d, method='A'):
    """Raindrop observer at pos, raindrop-frame look direction d. ln_f = ln(nu_obs/nu_inf) = -ln(1 - v cos th)."""
    r = norm(pos)
    rhat = unit(pos)
    th = angle(d, scl(rhat, -1))
    if method == 'A':
        cap, dphi, b, lnf = A.escape_sweep_raindrop(r, th)
    else:
        cap, dphi, b, lnf = raindrop_escape_B(r, th)
    out = dict(captured=bool(cap), theta=th, b=b, ln_g=lnf, dphi=dphi, n_inf=None, order=None)
    if not cap:
        n, _, _ = escape_direction(pos, d, dphi)
        out['n_inf'] = n
        out['order'] = int(mp.floor(dphi / PI))
    return out


def raindrop_escape_B(r, th):
    """Method B for the raindrop: initial slope from the frame, u' = -u (v - cos th)/sin th."""
    r, th = mp.mpf(r), mp.mpf(th)
    v = mp.sqrt(2 / r)
    den = 1 - v * mp.cos(th)
    if den <= 0:
        return True, None, None, None
    lnf = -mp.log(den)
    b = r * mp.sin(th) / den
    u = 1 / r
    if mp.sin(th) == 0:
        return (False, mp.mpf(0), b, lnf) if mp.cos(th) < v else (True, None, b, lnf)
    p = -u * (v - mp.cos(th)) / mp.sin(th)
    ray = B.Ray(u, p, 0, 0, b=b)
    ray.with_time = False
    ev = ray.run([], stop_escape=True, stop_umax=max(u, mp.mpf('0.5')) * 3)
    last = ev[-1]
    if last['kind'] == 'escape':
        return False, last['phi'], b, lnf
    return True, None, b, lnf


def raindrop_dark_radius(r):
    """Angular radius of the dark region round the hole's direction for the raindrop at r (any r > 0).
    Its edge is the ray with b = b_c: r sin(th) = b_c (1 - v cos th), i.e. R sin(th + psi0) = b_c with
    R = sqrt(r^2 + b_c^2 v^2), psi0 = atan2(b_c v, r):
        r >= 3:  th = asin(b_c/R) - psi0          (edge on the rays that pass periapsis)
        r <  3:  th = pi - asin(b_c/R) - psi0     (edge on the rays that climb straight out)"""
    r = mp.mpf(r)
    v = mp.sqrt(2 / r)
    R = mp.sqrt(r * r + A.BC ** 2 * v * v)
    a = mp.asin(min(A.BC / R, mp.mpf(1)))
    p0 = mp.atan2(A.BC * v, r)
    return (a - p0) if r >= 3 else (PI - a - p0)


# ─── circular orbits ─────────────────────────────────────────────────────────────────────

def circular_speed(r):
    """Speed of the circular geodesic relative to the static observer: 1/sqrt(r - 2) (r > 3)."""
    return 1 / mp.sqrt(mp.mpf(r) - 2)


def circular_dtau_dt(r):
    return mp.sqrt(1 - 3 / mp.mpf(r))


# ─── a boosted observer: ship frame -> static (or raindrop) frame ────────────────────────────

def ship_view(pos, d_ship, vdir, phi, frame='static', method='A'):
    """Observer at pos moving with rapidity phi along unit vdir relative to the local static frame
    (frame='static', r > 2) or raindrop frame (frame='raindrop', any r). Returns the view with
    ln_g = ln(nu_ship / nu_inf) = ln D_kin + ln_g(frame)."""
    if phi == 0:
        d_rest = d_ship
        lnD = mp.mpf(0)
    else:
        d_rest = to_rest(d_ship, vdir, phi)
        lnD = ln_doppler_ship(d_ship, vdir, phi)
    v = static_view(pos, d_rest, method) if frame == 'static' else raindrop_view(pos, d_rest, method)
    v['d_rest'] = d_rest
    v['ln_D'] = lnD
    if v['ln_g'] is not None:
        v['ln_g'] = v['ln_g'] + lnD
    return v


# ─── cameras ─────────────────────────────────────────────────────────────────────────────

def camera_dirs(forward, up, fovy_deg, W, H):
    """Pinhole camera: pixel (i, j), i left to right, j top to bottom; returns list of (i, j, unit dir)."""
    f = unit(forward)
    rgt = unit([f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]])
    upv = [rgt[1] * f[2] - rgt[2] * f[1], rgt[2] * f[0] - rgt[0] * f[2], rgt[0] * f[1] - rgt[1] * f[0]]
    t = mp.tan(mp.radians(fovy_deg) / 2)
    asp = mp.mpf(W) / H
    out = []
    for j in range(H):
        for i in range(W):
            x = (2 * (mp.mpf(i) + mp.mpf('0.5')) / W - 1) * asp * t
            y = (1 - 2 * (mp.mpf(j) + mp.mpf('0.5')) / H) * t
            out.append((i, j, unit(add(f, add(scl(rgt, x), scl(upv, y))))))
    return out, rgt, upv
