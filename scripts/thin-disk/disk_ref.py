"""
The independent reference for the thin accretion disc (src/physics/thinDisk.ts, render/shaders/diskLookup.glsl):
where a backward ray from a hovering camera crosses the disc's plane, how far from the hole, and the frequency
shift of the disc's light along it; the Novikov-Thorne flux against its closed form; the shift at known points.

    python scripts/thin-disk/disk_ref.py
        writes src/physics/__fixtures__/thinDisk.json (deterministic: a second run writes the same bytes).
        About two minutes.

Two methods for every ray, sharing no code with each other or with the TypeScript:

  A. In the ray's own plane, in 30-digit arithmetic (mpmath): the sweep from infinity to u = 1/r is the
     integral of du / sqrt(1/b^2 - u^2 + 2u^3), by tanh-sinh quadrature (which takes the square root at a
     turning point in its stride); the camera's place on the orbit and each crossing's radius come from
     solving sweep(u) = target with mpmath's findroot. The plane-crossing angles come from the vectors.
  B. In three dimensions, in float64 (scipy's DOP853, relative tolerance 1e-13): the photon's position x in
     Cartesian coordinates obeys x'' = -3 b^2 x / |x|^5 in the affine parameter of a photon of unit energy
     (exact for Schwarzschild, where r^2 dphi/dlambda = b), integrated from the camera with an event on
     x . n = 0. It never uses the orbit's plane or the sweep.

The two agree to about 1e-10 in r; the fixture keeps A and the largest difference from B. The shift g of light
leaving gas on a circular Keplerian orbit at r, for an observer far away, is sqrt(1 - 3/r) / (1 - Omega L_z),
Omega = r^-3/2, L_z the photon's angular momentum about the disc's axis per unit energy, taken from B's state
at the crossing ((x cross x') . n, reversed: the ray is traced backwards).

The Novikov-Thorne flux (Page & Thorne 1974) is integrated numerically from the circular orbits' E, L and Omega
(F = Mdot/(4 pi r) (-dOmega/dr)/(E - Omega L)^2 int_6^r (E - Omega L) dL/dr dr) and compared with the closed form
the app uses (Luminet 1979, eq. 15 with no spin).

Units: G = c = M = 1. Dependencies: mpmath, numpy, scipy.
"""
from __future__ import annotations

import json
import math
import os

import mpmath as mp
import numpy as np
from scipy.integrate import solve_ivp

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'src', 'physics', '__fixtures__', 'thinDisk.json')

mp.mp.dps = 30
BC = 3 * mp.sqrt(3)


# --- Method A: the orbit in its plane -------------------------------------------------------------

def G(u, b):
    return 1 / b ** 2 - u ** 2 + 2 * u ** 3


def u_turn(b):
    """The periapsis' u of an escaping orbit (b > b_c): the smallest positive root of G."""
    roots = mp.polyroots([2, -1, 0, 1 / b ** 2], maxsteps=200, extraprec=60)
    real = sorted(mp.re(z) for z in roots if abs(mp.im(z)) < mp.mpf(10) ** -20 and mp.re(z) > 0)
    return real[0]


def sweep(u, b, u_end):
    """
    The azimuth swept from infinity to u along the incoming leg (0 <= u <= u_end, the periapsis' u or 1/2), in
    t with u = u_end (1 - t^2): the square root at a turning point becomes a finite integrand.
    """
    if u <= 0:
        return mp.mpf(0)
    t_u = mp.sqrt(max(mp.mpf(0), 1 - u / u_end))

    def f(t):
        x = u_end * (1 - t * t)
        g = G(x, b)
        if g <= 0:
            # the turning point itself: G ~ G'(u_end)(x - u_end)
            gp = -2 * u_end + 6 * u_end ** 2
            return 2 * u_end / mp.sqrt(-gp * u_end)
        return 2 * u_end * t / mp.sqrt(g)

    return mp.quad(f, [t_u, 1])


def u_at(psi, b, u_end, psi_end):
    """u on the incoming leg where the sweep from infinity is psi (0 <= psi <= psi_end)."""
    if psi <= 0:
        return mp.mpf(0)
    if psi >= psi_end:
        return u_end
    return mp.findroot(lambda u: sweep(u, b, u_end) - psi, (mp.mpf(0), u_end), solver='anderson', tol=mp.mpf(10) ** -26)


def crossings_A(r_cam, alpha, omega, inc, k_max=2):
    """Method A's crossings of the disc's plane for the pixel (alpha, omega) of a static camera at r_cam."""
    r_cam = mp.mpf(r_cam)
    alpha = mp.mpf(alpha)
    omega = mp.mpf(omega)
    inc = mp.mpf(inc)
    e1 = mp.matrix([0, 0, 1])
    d = mp.matrix([mp.sin(alpha) * mp.cos(omega), mp.sin(alpha) * mp.sin(omega), -mp.cos(alpha)])
    n = mp.matrix([mp.sin(inc), 0, mp.cos(inc)])
    s = d + mp.cos(alpha) * e1
    s = s / mp.norm(s)
    b = r_cam * mp.sin(alpha) / mp.sqrt(1 - 2 / r_cam)
    inward = mp.cos(alpha) > 0
    escapes = b > BC
    u_end = u_turn(b) if escapes else mp.mpf(1) / 2
    psi_end = sweep(u_end, b, u_end)
    uc = 1 / r_cam
    psi_c = sweep(uc, b, u_end)
    a = (e1.T * n)[0]
    c = (s.T * n)[0]
    d0 = mp.atan2(-a, c)
    if d0 < 0:
        d0 += mp.pi
    cross = e1[1] * s[2] - e1[2] * s[1], e1[2] * s[0] - e1[0] * s[2], e1[0] * s[1] - e1[1] * s[0]
    lz = -b * (n[0] * cross[0] + n[1] * cross[1] + n[2] * cross[2])
    out = []
    end = None
    for k in range(k_max + 1):
        delta = d0 + k * mp.pi
        psi = psi_c + delta if inward else psi_c - delta
        if psi < 0:
            end = 'escape'
            break
        if escapes:
            if psi > 2 * psi_end:
                end = 'escape'
                break
            if psi > psi_end:
                psi = 2 * psi_end - psi
        elif psi > psi_end:
            end = 'capture'
            break
        u = u_at(psi, b, u_end, psi_end)
        r = 1 / u
        g = mp.sqrt(1 - 3 / r) / (1 - lz / r ** mp.mpf(1.5)) if r > 3 else mp.nan
        p = [mp.cos(delta) * e1[i] + mp.sin(delta) * s[i] for i in range(3)]
        out.append({'k': k, 'delta': delta, 'r': r, 'lz': lz, 'g': g, 'p': p})
    return {'b': b, 'escapes': bool(escapes), 'inward': bool(inward), 'crossings': out, 'end': end or 'more'}


# --- Method B: the geodesic in three dimensions ---------------------------------------------------

def crossings_B(r_cam, alpha, omega, inc, k_max=2):
    """Method B's crossings: x'' = -3 b^2 x/|x|^5 from the camera, events on x . n = 0."""
    ca, sa = math.cos(alpha), math.sin(alpha)
    d = np.array([sa * math.cos(omega), sa * math.sin(omega), -ca])
    n = np.array([math.sin(inc), 0.0, math.cos(inc)])
    x0 = np.array([0.0, 0.0, r_cam])
    b = r_cam * sa / math.sqrt(1 - 2 / r_cam)
    s = d + ca * np.array([0.0, 0.0, 1.0])
    s /= np.linalg.norm(s)
    rdot = math.sqrt(max(0.0, 1 - b * b * (1 - 2 / r_cam) / r_cam ** 2))
    if ca > 0:
        rdot = -rdot
    v0 = rdot * np.array([0.0, 0.0, 1.0]) + (b / r_cam) * s
    b2 = b * b
    r_far = max(4 * r_cam, 4e4)

    def f(_t, y):
        x = y[:3]
        r = math.sqrt(x @ x)
        return np.concatenate([y[3:], -3 * b2 * x / r ** 5])

    def plane(_t, y):
        return y[:3] @ n

    def horizon(_t, y):
        return math.sqrt(y[:3] @ y[:3]) - 2.0000001

    def far(_t, y):
        x = y[:3]
        return math.sqrt(x @ x) - r_far

    horizon.terminal = True
    far.terminal = True
    sol = solve_ivp(f, (0, 1e7), np.concatenate([x0, v0]), method='DOP853', rtol=1e-13, atol=1e-13, events=(plane, horizon, far), dense_output=False)
    out = []
    for y in sol.y_events[0][: k_max + 1]:
        x, v = y[:3], y[3:]
        r = math.sqrt(x @ x)
        lz = -float(np.cross(x, v) @ n)
        g = math.sqrt(1 - 3 / r) / (1 - lz / r ** 1.5) if r > 3 else float('nan')
        out.append({'r': r, 'lz': lz, 'g': g})
    return out


# --- The Novikov-Thorne flux -----------------------------------------------------------------------

def nt_closed(r):
    """The closed form's shape f(r): F = (3 Mdot / 8 pi) f(r) (Luminet 1979, eq. 15, no spin)."""
    x = mp.sqrt(r)
    s3, s6 = mp.sqrt(3), mp.sqrt(6)
    num = x - s6 + (s3 / 2) * mp.log((x + s3) * (s6 - s3) / ((x - s3) * (s6 + s3)))
    return num / ((r - 3) * r ** mp.mpf(2.5))


def nt_page_thorne(r):
    """The same from the circular orbits by quadrature (Page & Thorne 1974): (8 pi / 3 Mdot) F."""
    E = lambda q: (1 - 2 / q) / mp.sqrt(1 - 3 / q)
    L = lambda q: mp.sqrt(q) / mp.sqrt(1 - 3 / q)
    Om = lambda q: q ** mp.mpf(-1.5)
    integral = mp.quad(lambda q: (E(q) - Om(q) * L(q)) * mp.diff(L, q), [6, r])
    F = (1 / (4 * mp.pi * r)) * (-mp.diff(Om, r)) / (E(r) - Om(r) * L(r)) ** 2 * integral
    return F * 8 * mp.pi / 3


# --- The fixture -------------------------------------------------------------------------------------

def shadow(r):
    """Synge's shadow radius for a static observer at r > 3 (radians)."""
    return math.asin(float(BC) / r * math.sqrt(1 - 2 / r))


def num(x, digits=17):
    return float(mp.nstr(x, digits)) if x == x else None


def main():
    cams = [30.0, 100.0, 1000.0]
    incs = [math.radians(27.1), math.radians(60.0), math.radians(80.0)]
    gaps = [-0.6, -0.02, 2e-4, 0.01, 0.15, 0.6, 2.0, 8.0]
    omegas = [0.0, 1.1, 2.6, 4.0, 5.5]
    rays = []
    worst_r = 0.0
    worst_g = 0.0
    for rc in cams:
        edge = shadow(rc)
        for inc in incs:
            for gi, gap in enumerate(gaps):
                # gaps scale with the shadow's size; a few omegas each, rotated per gap so all quadrants show
                alpha = edge * (1 + gap)
                if alpha >= math.pi / 2:
                    continue
                for om in omegas[gi % 2::2] if gap > 0.1 else omegas[:3]:
                    a = crossings_A(rc, alpha, om, inc)
                    bb = crossings_B(rc, alpha, om, inc)
                    rec = {
                        'rCam': rc,
                        'incDeg': round(math.degrees(inc), 6),
                        'alpha': alpha,
                        'omega': om,
                        'b': num(a['b']),
                        'escapes': a['escapes'],
                        'inward': a['inward'],
                        'end': a['end'],
                        'crossings': [],
                    }
                    for i, c in enumerate(a['crossings']):
                        entry = {'k': c['k'], 'delta': num(c['delta']), 'r': num(c['r']), 'lz': num(c['lz']), 'g': num(c['g']), 'p': [num(t) for t in c['p']]}
                        if i < len(bb):
                            dr = abs(bb[i]['r'] - float(c['r'])) / float(c['r'])
                            worst_r = max(worst_r, dr)
                            if c['g'] == c['g']:
                                worst_g = max(worst_g, abs(bb[i]['g'] - float(c['g'])))
                            entry['dB_r'] = dr
                        rec['crossings'].append(entry)
                    rays.append(rec)
    flux = [{'r': r, 'f': num(nt_closed(mp.mpf(r))), 'fPageThorne': num(nt_page_thorne(mp.mpf(r)))} for r in [6.1, 7.0, 9.5, 20.0, 100.0, 1e4]]
    rp = mp.findroot(lambda r: mp.diff(nt_closed, r), 9.5)
    # The shift at known points: gas seen face-on (L_z = 0) and light leaving the innermost stable orbit along the
    # gas's motion, b = r/sqrt(1 - 2/r), which a hovering observer there sees moving at c/2: sqrt(2).
    known = [
        {'what': 'face-on, r = 6', 'r': 6, 'lz': 0, 'g': num(mp.sqrt(mp.mpf(1) / 2))},
        {'what': 'face-on, r = 20', 'r': 20, 'lz': 0, 'g': num(mp.sqrt(1 - mp.mpf(3) / 20))},
        {'what': 'along the gas at r = 6, tangential', 'r': 6, 'lz': num(6 / mp.sqrt(mp.mpf(2) / 3)), 'g': num(mp.sqrt(2))},
        {'what': 'against the gas at r = 6, tangential', 'r': 6, 'lz': num(-6 / mp.sqrt(mp.mpf(2) / 3)), 'g': num(mp.sqrt(2) / 3)},
    ]
    doc = {
        'generatedBy': 'scripts/thin-disk/disk_ref.py',
        'units': 'G = c = M = 1; angles in radians; camera at +z, looking at alpha from -z and omega about it (static frame); disc axis (sin i, 0, cos i)',
        'agreement_B_minus_A': {'r_relative': worst_r, 'g': worst_g},
        'flux': flux,
        'peak': {'r': num(rp), 'f': num(nt_closed(rp))},
        'known': known,
        'rays': rays,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, indent=1)
        fh.write('\n')
    print(f'{len(rays)} rays, {sum(len(r["crossings"]) for r in rays)} crossings; B - A: r {worst_r:.2e} relative, g {worst_g:.2e}')
    print(f'flux: closed form against Page-Thorne, largest relative difference {max(abs(f["f"] / f["fPageThorne"] - 1) for f in flux):.2e}; peak at r = {float(rp):.6f}')
    print(f'wrote {os.path.relpath(OUT, REPO)}')


if __name__ == '__main__':
    main()
