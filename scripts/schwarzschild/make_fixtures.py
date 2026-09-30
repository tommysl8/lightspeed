"""
The fixtures of the Schwarzschild core: every value by method A (closed forms, schw_mp and lens) in 34-50 digit
arithmetic, each checked by method B (numerical integration of the geodesic equations, geodesic_mp) where B
applies; the difference B - A is stored with each record as "dB" so the agreement can be read off the file.

    python scripts/schwarzschild/make_fixtures.py --subset
        writes src/physics/__fixtures__/schwarzschild.json (about 400 kB), the file the unit tests read
        (src/physics/*.test.ts). Deterministic: a second run writes the same bytes. About 5-15 minutes with
        4 worker processes (npm run data:blackhole-fixtures).

    python scripts/schwarzschild/make_fixtures.py [--out FILE]
        the full set (306 lens configurations, 8 camera maps of 48 x 32 pixels, travel times),
        about 3.4 MB, written to FILE (default fixtures.json in the current folder). 20-40 minutes; results
        are cached per job in cache_<section>.jsonl beside FILE so an interrupted run resumes.

Sections (both modes unless noted): constants, series, conventions, units; carlson_rf; deflection; sweeps;
shadow; static_map; raindrop_map; circular; lens (subset: 40 configurations); foot (tier 1's band beyond the
flat foot of the perpendicular); forward_caustic (orders >= 1 near the axis in front of the camera); camera_maps
(subset: a fixed 8 x 8 lattice of each map); drip and time (radial falls: closed forms against quadrature).

Dependencies: mpmath (numpy is not needed here). Units: G = c = M = 1. Shares no code with the TypeScript.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from multiprocessing import Pool

import mpmath as mp

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import schw_mp as A  # noqa: E402
import geodesic_mp as B  # noqa: E402
import lens as L  # noqa: E402
import observers as O  # noqa: E402

DPS = 34
PI = mp.pi
REPO = os.path.dirname(os.path.dirname(HERE))
SUBSET_PATH = os.path.join(REPO, 'src', 'physics', '__fixtures__', 'schwarzschild.json')
WORKERS = 4


def setdps(d):
    mp.mp.dps = d
    A.set_dps(d)


def f(x):
    """mp -> float (round to nearest double)."""
    if x is None:
        return None
    return float(x)


def s25(x):
    return mp.nstr(x, 25) if x is not None else None


# ─── deflection ───────────────────────────────────────────────────────────────────────────

def job_deflection(spec):
    kind, val = spec
    setdps(50 if kind == 'd' and abs(val) < 1e-6 else DPS)
    if kind == 'd':
        d = mp.mpf(val)
        b = A.BC * (1 + d)
    else:
        b = mp.mpf(val)
        d = b / A.BC - 1
    alpha = A.deflection(b)
    r0 = A.periapsis(b)
    darwin = A.darwin_deflection(b)
    # method B: the Binet equation from u = 0 with u' = 1/b, until u returns to 0
    ray = B.Ray(0, 1 / b, 0, 0, b=b)
    ray.with_time = False
    ev = ray.run([], stop_escape=True, stop_umax=mp.mpf(1))
    alphaB = ev[-1]['phi'] - PI if ev[-1]['kind'] == 'escape' else None
    return dict(input=kind, b=f(b) if kind == 'b' else None, d=f(d) if kind == 'd' else None,
                b_exact=s25(b), r0=f(r0), alpha=f(alpha), alpha_25=s25(alpha),
                dDarwin=f(darwin - alpha), dB=f(alphaB - alpha) if alphaB is not None else None)


# ─── sweeps ──────────────────────────────────────────────────────────────────────────────

def job_sweep(spec):
    setdps(DPS)
    kind, b, ra, rb = spec
    b = mp.mpf(b)
    if kind == 'to_periapsis':
        # from r = ra to the periapsis
        u = 1 / mp.mpf(ra)
        v = A.sweep_to_periapsis(b, u)
        # B: start at u moving inward, the crossing of the same u on the way out sweeps 2 v
        p = mp.sqrt(A.Gfun(u, b))
        ray = B.Ray(u, p, 0, 0, b=b)
        ray.with_time = False
        ev = ray.run([u], stop_escape=True, stop_umax=mp.mpf(1))
        cr = [e for e in ev if e['kind'] == 'cross']
        vB = cr[0]['phi'] / 2 if cr else None
        return dict(kind=kind, b=f(b), r_a=f(mp.mpf(ra)), r_b=None, r0=f(A.periapsis(b)), value=f(v),
                    value_25=s25(v), dB=f(vB - v) if vB is not None else None)
    # between two radii, no turning point between (ra > rb: from ra inward to rb; rb may be 0)
    ua = 1 / mp.mpf(ra) if ra != math.inf else mp.mpf(0)
    ub = 1 / mp.mpf(rb) if rb != 0 else mp.inf
    v = A.sweep_between(b, ua, ub)
    vB = None
    if ub is not mp.inf:
        p = mp.sqrt(A.Gfun(ua, b))
        ray = B.Ray(ua, p, 0, 0, b=b)
        ray.with_time = False
        ev = ray.run([ub], stop_escape=False, stop_umax=ub * 2 + 1, max_phi=100)
        cr = [e for e in ev if e['kind'] == 'cross']
        vB = cr[0]['phi'] if cr else None
    else:
        vB = mp.quad(lambda t: 1 / mp.sqrt(A.Gfun(t, b)), [ua, mp.mpf(1) / 3, 1, mp.inf])
    return dict(kind=kind, b=f(b), r_a=f(mp.mpf(ra)) if ra != math.inf else 'inf', r_b=f(mp.mpf(rb)) if rb != 0 else 0,
                value=f(v), value_25=s25(v), dB=f(vB - v) if vB is not None else None,
                checkedBy='quadrature' if ub is mp.inf else 'B1')


# ─── static and raindrop angle maps ─────────────────────────────────────────────────────

def static_thetas(ro):
    sh = A.shadow_angle(ro)
    out = [sh * mp.mpf(k) / 4 for k in range(4)]
    span = PI - sh
    for e in ('1e-12', '1e-9', '1e-6', '1e-4', '1e-3', '3e-3', '1e-2', '3e-2', '0.1', '0.2', '0.3', '0.45',
              '0.6', '0.75', '0.9', '0.97', '0.999'):
        out.append(sh + span * mp.mpf(e))
    out.append(PI)
    return [mp.mpf(float(t)) for t in out]


def job_static_map(ro):
    setdps(DPS)
    ro = mp.mpf(ro)
    rows = []
    for th in static_thetas(ro):
        cap, dphi, b = A.escape_sweep_static(ro, th)
        row = dict(theta=f(th), captured=bool(cap), b=f(b), ln_g=f(-mp.log(1 - 2 / ro) / 2))
        if not cap:
            if th < PI:
                dd = mp.diff(lambda t: A.escape_sweep_static(ro, t)[1], th)
                mu = -mp.sin(th) / (mp.sin(dphi) * dd) if mp.sin(dphi) != 0 else None
            else:
                dd, mu = None, None
            row.update(dphi=f(dphi), dphi_25=s25(dphi), ddphi_dtheta=f(dd), mu_inf=f(mu))
            if th < PI and th - A.shadow_angle(ro) > mp.mpf('1e-10'):
                capB, dB_, ddB = B.static_escape_B(ro, th)
                row.update(dB=f(dB_ - dphi), dB_deriv_rel=f((ddB - dd) / dd))
        rows.append(row)
    return dict(ro=f(ro), theta_sh=f(A.shadow_angle(ro)), rows=rows)


def raindrop_thetas(r):
    th_b = O.raindrop_dark_radius(r)
    out = [mp.mpf(k) * PI / 12 for k in range(13)]
    for e in ('-1e-3', '1e-9', '1e-6', '1e-3', '1e-2', '0.1'):
        out.append(th_b + mp.mpf(e) * (PI - th_b))
    out = sorted(set(float(t) for t in out if 0 <= t <= PI))
    return [mp.mpf(t) for t in out]


def job_raindrop_map(r):
    setdps(DPS)
    r = mp.mpf(r)
    rows = []
    for th in raindrop_thetas(r):
        cap, dphi, b, lnf = A.escape_sweep_raindrop(r, th)
        row = dict(theta=f(th), captured=bool(cap), b=f(b) if b is not None else None, ln_f=f(lnf) if lnf is not None else None)
        if cap:
            v = mp.sqrt(2 / r)
            if 1 - v * mp.cos(th) <= 0:
                row['reason'] = 'E<=0'            # negative Killing energy: never came from outside
            elif mp.cos(th) < v:
                row['reason'] = 'trapped'         # climbs to r3 < 3 and turns back: from the past horizon
            else:
                row['reason'] = 'from the hole'   # backward ray falls straight in
        if not cap:
            row.update(dphi=f(dphi), dphi_25=s25(dphi))
            if abs(th - O.raindrop_dark_radius(r)) > mp.mpf('1e-8') and mp.sin(th) != 0:
                capB, dphiB, _, _ = O.raindrop_escape_B(r, th)
                row.update(dB=f(dphiB - dphi) if dphiB is not None else 'B says captured')
        rows.append(row)
    out = dict(r=f(r), v=f(mp.sqrt(2 / r)), dark_radius=f(O.raindrop_dark_radius(r)), rows=rows)
    if r > 2:
        out['static_shadow'] = f(A.shadow_angle(r))
    return out


def job_circular(r):
    setdps(DPS)
    r = mp.mpf(r)
    v = O.circular_speed(r)
    phi = mp.atanh(v)
    pos = [r, mp.mpf(0), mp.mpf(0)]
    vdir = [mp.mpf(0), mp.mpf(1), mp.mpf(0)]      # orbit direction +y; hole direction -x
    sh = A.shadow_angle(r)
    # the two edge points of the static shadow in the orbital plane
    front = [-mp.cos(sh), mp.sin(sh), mp.mpf(0)]   # tilted towards the motion
    back = [-mp.cos(sh), -mp.sin(sh), mp.mpf(0)]
    fs = O.to_ship(front, vdir, phi)
    bs = O.to_ship(back, vdir, phi)
    ang_f = O.angle(fs, vdir)
    ang_b = O.angle(bs, vdir)
    rows = []
    for k in range(0, 25):
        a = PI * k / 24                      # ship-frame angle from the direction of motion, in the plane, towards the hole
        d_ship = [-mp.sin(a), mp.cos(a), mp.mpf(0)]
        vw = O.ship_view(pos, d_ship, vdir, phi, 'static')
        row = dict(angle_from_motion=f(a), captured=vw['captured'], ln_f=f(vw['ln_g']))
        if not vw['captured']:
            row.update(dphi=f(vw['dphi']), n_inf=[f(x) for x in vw['n_inf']])
            vB = O.ship_view(pos, d_ship, vdir, phi, 'static', method='B')
            row['dB'] = f(vB['dphi'] - vw['dphi']) if vB['dphi'] is not None else 'B says captured'
        rows.append(row)
    return dict(r=f(r), v=f(v), rapidity=f(phi), dtau_dt=f(O.circular_dtau_dt(r)),
                shadow_edge_front_from_motion=f(ang_f), shadow_edge_back_from_motion=f(ang_b),
                shadow_circle_centre_from_motion=f((ang_f + ang_b) / 2), shadow_circle_radius=f((ang_b - ang_f) / 2),
                static_shadow_radius=f(sh), rows=rows)


# ─── lens equation ───────────────────────────────────────────────────────────────────────

def check_image_B(ro, rs, im, with_time):
    """Method B for one image: Newton on theta with the Jacobi field from method A's answer; returns
    (dB_theta, dB_mu_rel, B's crossing record) or raises."""
    th = im['theta']
    c = None
    for _ in range(4):
        cr = B.static_crossings_B(ro, rs, th, with_time=False)
        c = min(cr, key=lambda c: abs(c['dphi'] - im['T']))
        th = th - (c['dphi'] - im['T']) / c['dd']
    cr = B.static_crossings_B(ro, rs, th, with_time=with_time)
    c = min(cr, key=lambda c: abs(c['dphi'] - im['T']))
    dE2 = ro ** 2 + rs ** 2 - 2 * ro * rs * mp.cos(im['Phi'])
    muB = -mp.sign(mp.sin(c['dphi']) * c['dd'] * c['cs']) * dE2 * mp.sin(th) / (rs ** 2 * abs(mp.sin(c['dphi']) * c['dd'] * c['cs']))
    return th - im['theta'], (muB - im['mu']) / im['mu'], c


def job_lens(spec):
    ro, rs, Phi, with_time, subset = spec
    setdps(DPS)
    ro, rs, Phi = mp.mpf(ro), mp.mpf(rs), mp.mpf(Phi)
    t0 = time.time()
    ims = L.images(ro, rs, Phi, kmax=2)
    dE = mp.sqrt(ro ** 2 + rs ** 2 - 2 * ro * rs * mp.cos(Phi))
    g = mp.sqrt((1 - 2 / rs) / (1 - 2 / ro))
    out = []
    for im in ims:
        im['Phi'] = Phi
        rec = dict(k=im['k'], side=im['side'], branch=im['branch'], theta=f(im['theta']), theta_25=s25(im['theta']),
                   b=f(im['b']), dphi=f(im['dphi']), cos_psi_s=f(im['cs']), ddphi_dtheta=f(im['ddphi']),
                   dOmega_dA=f(im['dOmega_dA']), mu=f(im['mu']), parity=im['parity'])
        tA = None
        if not subset:
            try:
                tA = L.travel_time(ro, rs, im['branch'], im['theta'])
                rec['t'] = f(mp.re(tA))
            except Exception:
                rec['t'] = None
        try:
            dth, dmu, c = check_image_B(ro, rs, im, with_time and not subset)
            rec['dB_theta'] = f(dth)
            rec['dB_mu_rel'] = f(dmu)
            if not subset:
                rec['dB_t'] = f(c['t'] - tA) if (tA is not None and with_time) else None
        except Exception as e:
            rec['dB_theta'] = 'failed: ' + str(e)[:80]
        out.append(rec)
    res = dict(ro=f(ro), rs=f(rs), Phi=f(Phi), d_E=f(dE), g=f(g), images=out)
    if not subset:
        res['seconds'] = round(time.time() - t0, 1)
    return res


# ─── tier 1's band beyond the flat foot (new) ───────────────────────────────────────────

FOOT_RO = (1e5, 4.86e5, 4.86e6)
FOOT_SHARE = (0.3, 0.7, 0.95)
FOOT_OFFSETS = ('-3e-3', '-1e-3', '-3e-4', '-1e-4', '1e-4', '3e-4', '1e-3', '3e-3', '1e-2', '3e-2', '6e-2', '1e-1')


def job_foot(spec):
    """The exact order-0 image (k = 0, side +1) of a static source at rs = share x ro seen by a static observer at
    ro, for angles gamma at the hole around the flat foot of the perpendicular, gamma_f = acos(rs/ro) (where the
    straight line of sight passes closest to the hole at the source itself). Inputs are the doubles written."""
    ro, share, off = spec
    setdps(DPS)
    ro = mp.mpf(ro)
    rs = mp.mpf(float(share * ro))
    gf = mp.acos(rs / ro)
    gamma = mp.mpf(float(gf + mp.mpf(off)))
    th, br = L.solve_image(ro, rs, gamma)
    b = A.static_b(ro, th)
    dphi, cs = L.dphi_branch(ro, rs, br, th)
    im = dict(k=0, side=1, T=gamma, theta=th, Phi=gamma)
    rec = dict(ro=f(ro), rs=f(rs), share=share, gamma=f(gamma), gamma_foot=f(gf), offset=float(off), branch=br,
               theta=f(th), theta_25=s25(th), b=f(b), dphi=f(dphi), cos_psi_s=f(cs))
    dE2 = ro ** 2 + rs ** 2 - 2 * ro * rs * mp.cos(gamma)
    # d dphi/d theta: numerically on the branch (A), and from the Jacobi field (B); near the ray whose periapsis is
    # rs the slope diverges while dd * cos psi_s stays finite, so mu is formed from that product.
    try:
        dd = L.dphi_dtheta(ro, rs, br, th)
        mu = -mp.sign(mp.sin(dphi) * dd * cs) * dE2 * mp.sin(th) / (rs ** 2 * abs(mp.sin(dphi) * dd * cs))
        im['mu'] = mu
        rec.update(ddphi_dtheta=f(dd), mu=f(mu), mu_25=s25(mu))
        dth, dmu, _ = check_image_B(ro, rs, im, False)
        rec.update(dB_theta=f(dth), dB_mu_rel=f(dmu))
    except Exception as e:
        rec['dB_theta'] = 'failed: ' + str(e)[:80]
    return rec


# ─── orders >= 1 near the forward caustic (new) ─────────────────────────────────────────

FC_RO = (6.0, 20.0, 100.0)
FC_GAMMA = ('1e-3', '1e-4', '1e-5', '1e-6', '1e-7')
FC_RS = ('inf', 1e4)


def job_forward_caustic(spec):
    """The order-1 image (k = 0, side -1: dphi = 2 pi - gamma) of a source gamma from the forward axis (directly
    behind the camera as seen from the hole) at rs (a static source, or the sky at infinity), static observer
    at ro. mu is the signed magnification (at infinity: -sin(theta)/(sin(dphi) d dphi/d theta))."""
    ro, g, rs = spec
    setdps(DPS)
    ro = mp.mpf(ro)
    gamma = mp.mpf(g)
    T = 2 * PI - gamma
    sh = A.shadow_angle(ro)
    rec = dict(ro=f(ro), rs=rs if rs == 'inf' else float(rs), gamma=f(gamma), D=f(T), D_25=s25(T))
    if rs == 'inf':
        fx = lambda x: A.escape_sweep_static(ro, sh + mp.exp(x))[1] - T
        xhi = mp.log(PI / 2 - sh)
        xlo = -T - 4
        while fx(xlo) <= 0:
            xlo -= 6
        x = mp.findroot(fx, (xlo, xhi), solver='anderson')
        th = sh + mp.exp(x)
        dphi = A.escape_sweep_static(ro, th)[1]
        dd = mp.diff(lambda t: A.escape_sweep_static(ro, t)[1], th)
        mu = -mp.sin(th) / (mp.sin(dphi) * dd)
        capB, dphiB, ddB = B.static_escape_B(ro, th)
        muB = -mp.sin(th) / (mp.sin(dphiB) * ddB)
        rec.update(theta=f(th), theta_25=s25(th), gap=f(th - sh), dphi=f(dphi), ddphi_dtheta=f(dd), mu=f(mu),
                   mu_25=s25(mu), dB=f(dphiB - dphi), dB_mu_rel=f((muB - mu) / mu))
        return rec
    rsm = mp.mpf(rs)
    ims = L.images(ro, rsm, gamma, kmax=0)
    im = [i for i in ims if i['side'] == -1][0]
    im['Phi'] = gamma
    rec.update(theta=f(im['theta']), theta_25=s25(im['theta']), gap=f(im['theta'] - sh), branch=im['branch'],
               dphi=f(im['dphi']), cos_psi_s=f(im['cs']), ddphi_dtheta=f(im['ddphi']), mu=f(im['mu']), mu_25=s25(im['mu']))
    try:
        dth, dmu, _ = check_image_B(ro, rsm, im, False)
        rec.update(dB_theta=f(dth), dB_mu_rel=f(dmu))
    except Exception as e:
        rec['dB_theta'] = 'failed: ' + str(e)[:80]
    return rec


# ─── radial falls (new) ──────────────────────────────────────────────────────────────────

DRIP_R0 = (20.0, 94308.0)           # 10 r_s, and 4,000 au from Sgr A* (6,345,058 km = 1 M)
DRIP_EXTRA_R0 = (2.000002,)         # let go at the hover floor, r_s (1 + 1e-6)
RAIN_R0 = (20.0, 94308.0, 4.0)


def drip_closed(r0):
    """Closed forms of the drip from rest at r0 (M = 1, rs = 2): r, tau, dT/dtau against eta; T by quadrature."""
    r0 = mp.mpf(r0)
    e = mp.sqrt(1 - 2 / r0)
    k = mp.sqrt(r0 / 8) * r0              # sqrt(r0^3 / 8)

    def r_of(eta):
        return r0 * mp.cos(eta / 2) ** 2

    def tau_of(eta):
        return k * (eta + mp.sin(eta))

    def gamma_rel(eta):
        x = 2 / r_of(eta)
        return (e * e + x) / (e + mp.sqrt(x) * mp.sqrt(2 / r0) * mp.tan(eta / 2))

    def T_of(eta):
        # dT/deta = (dT/dtau)(dtau/deta), dtau/deta = k (1 + cos eta); smooth on [0, pi]
        return mp.quad(lambda s: gamma_rel(s) * k * (1 + mp.cos(s)), [0, eta])

    def T_closed(eta):
        """Outside the horizon: T = t + P(r) - P(r0) from Schwarzschild time (MTW 31.10) and the
        Painleve-Gullstrand offset P(r) = 2 [2 sqrt(r/2) + ln|(sqrt(r/2) - 1)/(sqrt(r/2) + 1)|]."""
        a = mp.sqrt(r0 / 2 - 1)
        t = 2 * mp.log(abs((a + mp.tan(eta / 2)) / (a - mp.tan(eta / 2)))) + 2 * a * (eta + r0 / 4 * (eta + mp.sin(eta)))
        P = lambda r: 2 * (2 * mp.sqrt(r / 2) + mp.log(abs((mp.sqrt(r / 2) - 1) / (mp.sqrt(r / 2) + 1))))
        return t + P(r_of(eta)) - P(r0)

    eta_h = mp.acos(4 / r0 - 1)
    return dict(r0=r0, e=e, r_of=r_of, tau_of=tau_of, gamma_rel=gamma_rel, T_of=T_of, T_closed=T_closed, eta_h=eta_h)


def drip_etas(eta_h):
    out = [PI * mp.mpf(j) / 32 for j in range(33)]
    for d in ('-1e-3', '-1e-6', '1e-6', '1e-3'):
        out.append(eta_h + mp.mpf(d))
    for d in ('1e-3', '1e-6', '1e-9'):
        out.append(PI - mp.mpf(d))
    out.append(mp.mpf('1e-6'))
    return sorted(set(float(x) for x in out))


def job_drip(r0):
    setdps(40)
    D = drip_closed(r0)
    samples = []
    for eta in drip_etas(D['eta_h']):
        eta = mp.mpf(eta)
        r = D['r_of'](eta)
        T = D['T_of'](eta)
        rec = dict(eta=f(eta), r=f(r), tau=f(D['tau_of'](eta)), tau_25=s25(D['tau_of'](eta)), T=f(T), T_25=s25(T),
                   dTdtau=f(D['gamma_rel'](eta)), inside=bool(r < 2))
        if r > 2 * (1 + mp.mpf('1e-9')):
            rec['dB'] = f(D['T_closed'](eta) - T)      # closed form minus quadrature
        samples.append(rec)
    return dict(r0=f(D['r0']), e=f(D['e']), eta_horizon=f(D['eta_h']), samples=samples)


def job_time(_):
    """Proper and free-fallers' times of radial falls (units of M), to 25 digits."""
    setdps(40)
    rain = []
    for r0 in RAIN_R0:
        r0 = mp.mpf(r0)
        tau_h = mp.sqrt(2) / 3 * (r0 ** mp.mpf(1.5) - 2 ** mp.mpf(1.5))
        # check by quadrature of dtau/dr = -1/sqrt(2/r)
        q = mp.quad(lambda r: 1 / mp.sqrt(2 / r), [2, r0])
        rain.append(dict(r0=f(r0), tau_to_horizon=f(tau_h), tau_to_horizon_25=s25(tau_h),
                         tau_horizon_to_centre=f(mp.mpf(4) / 3), tau_horizon_to_centre_25=s25(mp.mpf(4) / 3),
                         tau_to_centre=f(mp.sqrt(2) / 3 * r0 ** mp.mpf(1.5)), dB=f(q - tau_h),
                         note='T = tau exactly (Painleve-Gullstrand time is the raindrop\'s proper time)'))
    drips = []
    for r0 in DRIP_R0 + DRIP_EXTRA_R0:
        D = drip_closed(r0)
        eh = D['eta_h']
        rec = dict(r0=f(D['r0']), e=f(D['e']), eta_horizon=f(eh),
                   tau_to_horizon=f(D['tau_of'](eh)), tau_to_horizon_25=s25(D['tau_of'](eh)),
                   tau_to_centre=f(D['tau_of'](PI)), tau_to_centre_25=s25(D['tau_of'](PI)),
                   tau_inside=f(D['tau_of'](PI) - D['tau_of'](eh)),
                   T_to_horizon=f(D['T_of'](eh)), T_to_horizon_25=s25(D['T_of'](eh)),
                   T_to_centre=f(D['T_of'](PI)), T_to_centre_25=s25(D['T_of'](PI)),
                   dTdtau_start=f(D['gamma_rel'](mp.mpf(0))), dTdtau_horizon=f(D['gamma_rel'](eh)),
                   dTdtau_horizon_formula=f((1 + D['e'] ** 2) / (2 * D['e'])))
        # check tau by quadrature in r: dtau/dr = -1/sqrt(2/r - 2/r0); with r = r0 - s^2 the integrand is
        # sqrt(2 r0 (r0 - s^2)), smooth up to the start
        r0m = D['r0']
        q = mp.quad(lambda s: mp.sqrt(2 * r0m * (r0m - s * s)), [0, mp.sqrt(r0m - 2)])
        rec['dB_tau_to_horizon'] = f(q - D['tau_of'](eh))
        drips.append(rec)
    longest = dict(note='the longest proper time between the horizon and r = 0: pi M (from rest at the horizon)',
                   value=f(PI), value_25=s25(PI))
    return dict(units='M = 1: times in GM/c^3 (Sgr A*: 21.165 s)', rain=rain, drip=drips, longest_inside=longest)


# ─── camera maps ─────────────────────────────────────────────────────────────────────────

CAMERAS = [
    dict(name='static-100M', frame='static', pos=[0, 0, 100], forward=[0, 0, -1], up=[0, 1, 0], fovy=30, phi=0, vdir=None),
    dict(name='moving-100M', frame='static', pos=[0, 0, 100], forward=[0, 0, -1], up=[0, 1, 0], fovy=30, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='static-10M', frame='static', pos=[0, 0, 10], forward=[0, 0, -1], up=[0, 1, 0], fovy=90, phi=0, vdir=None),
    dict(name='moving-10M', frame='static', pos=[0, 0, 10], forward=[0, 0, -1], up=[0, 1, 0], fovy=90, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='static-2.5M', frame='static', pos=[0, 0, 2.5], forward=[1, 0, 0], up=[0, 1, 0], fovy=90, phi=0, vdir=None),
    dict(name='moving-2.5M', frame='static', pos=[0, 0, 2.5], forward=[1, 0, 0], up=[0, 1, 0], fovy=90, phi=1.0, vdir=[0.7071067811865476, 0, -0.7071067811865476]),
    dict(name='raindrop-1M-sideways', frame='raindrop', pos=[0, 0, 1], forward=[1, 0, 0], up=[0, 0, 1], fovy=120, phi=0, vdir=None),
    dict(name='raindrop-1M-up', frame='raindrop', pos=[0, 0, 1], forward=[0, 0, 1], up=[0, 1, 0], fovy=120, phi=0, vdir=None),
]
W, H = 48, 32
# The subset's fixed 8 x 8 lattice of pixels in every map.
LATTICE_I = tuple(3 + 6 * k for k in range(8))
LATTICE_J = tuple(2 + 4 * k for k in range(8))


def job_pixel(args):
    ci, i, j, d = args
    setdps(30)
    cam = CAMERAS[ci]
    pos = [mp.mpf(x) for x in cam['pos']]
    d = [mp.mpf(x) for x in d]
    vdir = [mp.mpf(x) for x in cam['vdir']] if cam['vdir'] else None
    va = O.ship_view(pos, d, vdir, mp.mpf(cam['phi']), cam['frame'], method='A')
    vb = O.ship_view(pos, d, vdir, mp.mpf(cam['phi']), cam['frame'], method='B')
    rec = dict(i=i, j=j, captured=va['captured'], dphi=f(va['dphi']), ln_g=f(va['ln_g']),
               n_inf=[f(x) for x in va['n_inf']] if va['n_inf'] else None, theta=f(va['theta']))
    if va['captured'] != vb['captured']:
        rec['dB'] = 'capture mismatch'
    elif not va['captured']:
        rec['dB'] = f(vb['dphi'] - va['dphi'])
    return ci, rec


def camera_jobs(subset):
    jobs = []
    for ci, cam in enumerate(CAMERAS):
        setdps(30)
        dirs, _, _ = O.camera_dirs([mp.mpf(x) for x in cam['forward']], [mp.mpf(x) for x in cam['up']], cam['fovy'], W, H)
        for (i, j, d) in dirs:
            if subset and (i not in LATTICE_I or j not in LATTICE_J):
                continue
            jobs.append((ci, i, j, [float(x) for x in d]))
    return jobs


# ─── specs ───────────────────────────────────────────────────────────────────────────────

DEFL = [('d', x) for x in (1e-14, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-3, 1e-2, 3e-2, 0.1, 0.2, 0.5)] + \
       [('b', x) for x in (5.5, 6.0, 6.5, 7.0, 8.0, 10.0, 12.0, 15.0, 20.0, 30.0, 50.0, 100.0, 200.0, 500.0, 1e3, 1e4, 1e5, 1e6)]


def sweep_specs():
    out = []
    for b in (5.2, 5.5, 7.0, 10.0, 30.0, 100.0):
        setdps(DPS)
        r0 = float(A.periapsis(b))
        for ra in (r0 * 1.0001, r0 * 1.5, 10.0, 100.0, 1e4):
            if ra > r0:
                out.append(('to_periapsis', b, ra, None))
        for ra, rb in ((math.inf, r0 * 1.2), (1e4, 50.0), (100.0, r0 * 1.01)):
            if rb > r0 and (ra == math.inf or ra > rb):
                out.append(('between', b, ra, rb))
    for b in (0.5, 2.0, 4.0, 5.0, 5.19, 5.196):
        for ra, rb in ((math.inf, 2.0), (math.inf, 3.0), (100.0, 2.5), (10.0, 1.0), (1.5, 0.5), (math.inf, 0)):
            out.append(('between', b, ra, rb))
    return out


STATIC_RO = (2.2, 2.5, 3.0, 3.5, 4.5, 6.0, 10.0, 30.0, 100.0, 1e3, 1e4, 1e6)
RAIN_R = (100.0, 10.0, 6.0, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.1)
CIRC_R = (3.5, 4.0, 6.0, 10.0, 100.0)


def lens_specs_full():
    out = []
    i = 0
    for ro in (4.0, 6.0, 10.0, 30.0, 100.0, 1000.0, 1e5):
        for rs in (2.5, 3.5, 6.0, 10.0, 30.0, 100.0, 1e3, 1e6):
            if rs == ro:
                continue
            for Phi in (0.05, 0.5, math.pi / 2, 2.5, math.pi - 0.1, math.pi - 1e-3):
                out.append((ro, rs, Phi, i % 3 == 0, False))
                i += 1
    return out


def lens_specs_subset():
    """40 configurations from r_o in {4, 10, 100, 1e3, 1e4, 1e5}, r_s in {2.5, 5, 50, 1e4, 1e6},
    Phi in {0.05, 1, 2.5, pi - 1e-3}: every third of the 116 combinations (39), plus the first of a short list
    not already picked (a source at 50 M seen from 1,000 M at Phi = 1)."""
    combos = []
    for ro in (4.0, 10.0, 100.0, 1e3, 1e4, 1e5):
        for rs in (2.5, 5.0, 50.0, 1e4, 1e6):
            if rs == ro:
                continue
            for Phi in (0.05, 1.0, 2.5, math.pi - 1e-3):
                combos.append((ro, rs, Phi))
    picked = [c for i, c in enumerate(combos) if i % 3 == 0]
    for extra in ((1e4, 5.0, math.pi - 1e-3), (1e3, 50.0, 1.0), (10.0, 5.0, 1.0)):
        if len(picked) < 40 and extra not in picked:
            picked.append(extra)
    return [(ro, rs, Phi, False, True) for (ro, rs, Phi) in picked]


def foot_specs():
    return [(ro, share, off) for ro in FOOT_RO for share in FOOT_SHARE for off in FOOT_OFFSETS]


def fc_specs():
    return [(ro, g, rs) for ro in FC_RO for rs in FC_RS for g in FC_GAMMA]


# ─── assembly ────────────────────────────────────────────────────────────────────────────

def _indexed(args):
    name, i, s = args
    return i, globals()[name](s)


def run_map(pool, name, fn, specs, cache_dir=None, chunksize=1):
    """Every spec through the pool, results in spec order. With cache_dir, results are appended to
    cache_<name>.jsonl as they arrive, so a restart resumes (full mode only)."""
    done = {}
    fh = None
    if cache_dir is not None:
        path = os.path.join(cache_dir, f'cache_{name}.jsonl')
        if os.path.exists(path):
            for line in open(path):
                try:
                    k, v = json.loads(line)
                    done[k] = v
                except Exception:
                    pass
        fh = open(path, 'a')
    todo = [(fn.__name__, i, s) for i, s in enumerate(specs) if str(i) not in done]
    for i, res in pool.imap_unordered(_indexed, todo, chunksize=chunksize):
        done[str(i)] = res
        if fh is not None:
            fh.write(json.dumps([str(i), res]) + chr(10))
            fh.flush()
    if fh is not None:
        fh.close()
    return [done[str(i)] for i in range(len(specs))]


def maxabs(vals):
    v = [abs(x) for x in vals if isinstance(x, (int, float)) and not isinstance(x, bool)]
    return max(v) if v else None


def agreement(out):
    agree = {}
    agree['deflection (rad)'] = maxabs(r['dB'] for r in out['deflection'])
    agree['deflection vs Darwin (rad)'] = maxabs(r['dDarwin'] for r in out['deflection'])
    agree['sweeps (rad)'] = maxabs(r['dB'] for r in out['sweeps'])
    agree['static map dphi (rad)'] = maxabs(row.get('dB') for m in out['static_map'] for row in m['rows'])
    agree['static map d dphi/dtheta (relative)'] = maxabs(row.get('dB_deriv_rel') for m in out['static_map'] for row in m['rows'])
    agree['raindrop map dphi (rad)'] = maxabs(row.get('dB') for m in out['raindrop_map'] for row in m['rows'])
    agree['circular dphi (rad)'] = maxabs(row.get('dB') for m in out['circular'] for row in m['rows'])
    agree['lens theta (rad)'] = maxabs(im.get('dB_theta') for c in out['lens'] for im in c['images'])
    agree['lens mu (relative)'] = maxabs(im.get('dB_mu_rel') for c in out['lens'] for im in c['images'])
    if any('dB_t' in im for c in out['lens'] for im in c['images']):
        agree['lens travel time (M)'] = maxabs(im.get('dB_t') for c in out['lens'] for im in c['images'])
    agree['foot theta (rad)'] = maxabs(r.get('dB_theta') for r in out['foot'])
    agree['foot mu (relative)'] = maxabs(r.get('dB_mu_rel') for r in out['foot'])
    agree['forward caustic theta or dphi (rad)'] = maxabs((r.get('dB_theta') if 'dB_theta' in r else r.get('dB')) for r in out['forward_caustic'])
    agree['forward caustic mu (relative)'] = maxabs(r.get('dB_mu_rel') for r in out['forward_caustic'])
    agree['drip T, closed form vs quadrature (M)'] = maxabs(s.get('dB') for d in out['drip'] for s in d['samples'])
    agree['camera maps dphi (rad)'] = maxabs(p.get('dB') for c in out['camera_maps'] for p in c['pixels'])
    fails = []
    for c in out['lens']:
        for im in c['images']:
            if isinstance(im.get('dB_theta'), str):
                fails.append(('lens', c['ro'], c['rs'], c['Phi'], im['k'], im['side'], im['dB_theta']))
    for r in out['foot'] + out['forward_caustic']:
        if isinstance(r.get('dB_theta'), str):
            fails.append(('foot/forward', r['ro'], r['rs'], r.get('gamma'), r['dB_theta']))
    for c in out['camera_maps']:
        for p in c['pixels']:
            if isinstance(p.get('dB'), str):
                fails.append((c['name'], p['i'], p['j'], p['dB']))
    for m in out['raindrop_map']:
        for row in m['rows']:
            if isinstance(row.get('dB'), str):
                fails.append(('raindrop', m['r'], row['theta'], row['dB']))
    for m in out['circular']:
        for row in m['rows']:
            if isinstance(row.get('dB'), str):
                fails.append(('circular', m['r'], row['angle_from_motion'], row['dB']))
    return agree, fails


def static_sections():
    """constants, series, conventions, units, shadow radii and Carlson's R_F vectors (cheap: computed here)."""
    s3 = math.sqrt(3)
    bbar = math.log(216 * (7 - 4 * s3)) - math.pi
    P = math.pi
    out = {
        'units': 'G = c = M = 1: lengths in GM/c^2, times in GM/c^3, angles in radians, u = 1/r',
        'conventions': {
            'b': 'impact parameter L/E (>= 0); d = b/b_c - 1 is the near-critical variable (b = b_c (1 + d) exactly)',
            'theta': 'look angle in the named observer frame between the look direction (towards where the light comes from) and the direction of the hole (inward radial)',
            'dphi': 'azimuth swept by the backward-traced ray (from the observer) in its orbital plane, measured from the observer\'s radius vector towards the look direction',
            'escape direction': 'n_inf = cos(dphi) rhat + sin(dphi) e, rhat the observer\'s outward radial unit vector, e the unit part of the look direction perpendicular to rhat',
            'ln_g / ln_f': 'ln(nu_observed / nu_emitted_at_infinity) for light from the distant sky (static: -1/2 ln(1 - 2/r); raindrop: -ln(1 - v cos theta); plus ln D of the ship when moving)',
            'lens Phi': 'angle at the hole between the observer\'s and the source\'s position vectors, 0..pi',
            'lens side': '+1: the image on the source\'s side of the observer-hole axis, dphi = Phi + 2 pi k; -1: the opposite side, dphi = 2 pi - Phi + 2 pi k',
            'lens mu': 'signed magnification = d_E^2 dOmega_o/dA_s, d_E^2 = ro^2 + rs^2 - 2 ro rs cos Phi; sign = parity. Flux of an image: F = L/(4 pi) g^4 dOmega_dA with g = sqrt((1 - 2/rs)/(1 - 2/ro))',
            'lens t': 'coordinate time from emission at the source to reception (units of M); differences between images are the time delays (full set only)',
            'mu_inf (static map)': 'magnification of a point source at infinity: -sin(theta)/(sin(dphi) d dphi/d theta)',
            'foot': 'order-0 images (k = 0, side +1) of sources nearer the hole than the camera, gamma (= Phi) around the flat foot acos(rs/ro)',
            'forward_caustic': 'order-1 images (k = 0, side -1: dphi = 2 pi - gamma) of sources gamma from the axis behind the camera; rs "inf" is the sky',
            'drip': 'radial fall from rest at r0: r = r0 cos^2(eta/2), tau = sqrt(r0^3/8)(eta + sin eta); T the Painleve-Gullstrand time since the start by quadrature of dT/dtau = (e^2 + x)/(e + sqrt(x) sqrt(2/r0) tan(eta/2)), x = 2/r; dB: closed form (Schwarzschild t plus the PG offset, outside the horizon) minus quadrature',
            'inputs': 'every input is the IEEE double written here (except rows with input "d", where b = b_c (1 + d) exactly); outputs are the exact results for those inputs rounded to double; *_25 fields give 25 digits',
            'dB fields': 'method B (numerical integration of the geodesic equations, 30-50 digits) minus method A (closed forms)',
        },
        'constants': {'b_c': 3 * s3, 'photon_sphere_r': 3, 'isco_r': 6, 'bbar_strong': bbar},
        'series': {
            'weak': {'form': 'alpha(b) = sum_n a_n / b^n (M = 1)', 'a': [
                {'n': 1, 'exact': '4', 'value': 4.0},
                {'n': 2, 'exact': '15 pi/4', 'value': 15 * P / 4},
                {'n': 3, 'exact': '128/3', 'value': 128 / 3},
                {'n': 4, 'exact': '3465 pi/64', 'value': 3465 * P / 64},
                {'n': 5, 'exact': '3584/5', 'value': 3584 / 5},
                {'n': 6, 'exact': '255255 pi/256', 'value': 255255 * P / 256},
                {'n': 7, 'exact': '98304/7', 'value': 98304 / 7},
                {'n': 8, 'exact': '334639305 pi/16384', 'value': 334639305 * P / 16384},
                {'n': 9, 'exact': '18743296/63', 'value': 18743296 / 63},
                {'n': 10, 'exact': '29113619535 pi/65536', 'value': 29113619535 * P / 65536},
                {'n': 11, 'exact': '218103808/33', 'value': 218103808 / 33},
                {'n': 12, 'exact': '10529425731825 pi/1048576', 'value': 10529425731825 * P / 1048576}]},
            'strong': {'form': 'alpha = -ln d + bbar + sum_j d^j (c_j ln d + e_j), d = b/b_c - 1, L = bbar + pi = 3 ln 6 - 2 ln(2 + sqrt3)',
                       'bbar': {'exact': 'ln(216 (7 - 4 sqrt3)) - pi', 'value': bbar},
                       'c': [{'j': 1, 'exact': '-5/18', 'value': -5 / 18}, {'j': 2, 'exact': '155/1296', 'value': 155 / 1296},
                             {'j': 3, 'exact': '-14615/209952', 'value': -14615 / 209952}, {'j': 4, 'exact': '2812415/60466176', 'value': 2812415 / 60466176}],
                       'e': [{'j': 1, 'exact': '(1 + 4 sqrt3)/18 + (5/18) L', 'value': (1 + 4 * s3) / 18 + 5 / 18 * (bbar + P)},
                             {'j': 2, 'exact': '(57 - 52 sqrt3)/1296 - (155/1296) L', 'value': (57 - 52 * s3) / 1296 - 155 / 1296 * (bbar + P)},
                             {'j': 3, 'exact': '(-14924 + 1164 sqrt3)/629856 + (14615/209952) L', 'value': (-14924 + 1164 * s3) / 629856 + 14615 / 209952 * (bbar + P)},
                             {'j': 4, 'exact': None, 'value': -0.10243851464864901524}]},
        },
    }
    setdps(30)
    shadow = []
    for ro in (2.0001, 2.001, 2.01, 2.1, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 4.0, 5.0, 6.0, 8.0, 10.0, 15.0, 20.0, 30.0, 50.0,
               100.0, 200.0, 500.0, 1e3, 1e4, 1e5, 1e6, 1e8, 1e10):
        r = mp.mpf(ro)
        st = A.shadow_angle(r)
        row = dict(ro=ro, static=float(st), raindrop=float(O.raindrop_dark_radius(r)),
                   far_approx_bc_over_ro=float(A.BC / r), app_disc_asin_sqrt27_over_d=float(mp.asin(min(A.BC / r, 1))) if ro > A.BC else None)
        if ro > 3:
            v = O.circular_speed(r)
            phi = mp.atanh(v) if v < 1 else None
            if phi is not None:
                vdir = [mp.mpf(0), mp.mpf(1), mp.mpf(0)]
                fr = O.to_ship([-mp.cos(st), mp.sin(st), mp.mpf(0)], vdir, phi)
                bk = O.to_ship([-mp.cos(st), -mp.sin(st), mp.mpf(0)], vdir, phi)
                a1, a2 = O.angle(fr, vdir), O.angle(bk, vdir)
                row['circular_orbit_radius'] = float((a2 - a1) / 2)
                row['circular_orbit_centre_from_motion'] = float((a1 + a2) / 2)
        shadow.append(row)
    out['shadow'] = shadow
    # Carlson R_F test vectors (30 digits): real triples and conjugate pairs R_F(x, z, conj z)
    rnd = random.Random(7)
    rfv = []
    for i in range(24):
        x, y, z = (10 ** rnd.uniform(-12, 3) for _ in range(3))
        if i % 4 == 0:
            x = 0.0
        if i % 6 == 1:
            y = x
        rfv.append(dict(x=x, y=y, z=z, rf=float(mp.elliprf(x, y, z))))
    rfc = []
    for i in range(24):
        x = 10 ** rnd.uniform(-12, 3)
        zr = rnd.uniform(-1, 1) * 10 ** rnd.uniform(-6, 3)
        zi = 10 ** rnd.uniform(-9, 3)
        if i % 5 == 0:
            zr = -abs(zr)
            zi = abs(zr) * 1e-7   # next to the negative real axis
        rfc.append(dict(x=x, zr=zr, zi=zi, rf=float(mp.re(mp.elliprf(x, mp.mpc(zr, zi), mp.mpc(zr, -zi))))))
    out['carlson_rf'] = dict(real=rfv, conjugate_pair=rfc)
    return out


def main():
    ap = argparse.ArgumentParser(description='Schwarzschild fixtures (see the module header).')
    ap.add_argument('--subset', action='store_true', help='write the committed subset for the unit tests')
    ap.add_argument('--out', default=None, help='output file (default: the committed subset, or ./fixtures.json)')
    ap.add_argument('--workers', type=int, default=WORKERS)
    args = ap.parse_args()
    subset = args.subset
    path = args.out or (SUBSET_PATH if subset else os.path.abspath('fixtures.json'))
    cache_dir = None if subset else os.path.dirname(os.path.abspath(path))
    t0 = time.time()

    def say(what):
        print(what, round(time.time() - t0), 's', flush=True)

    out = dict(schema='lightspeed.schwarzschild-fixtures/1' + ('-subset' if subset else ''))
    out.update(static_sections())
    say('constants, shadow, carlson')
    with Pool(args.workers) as pool:
        out['deflection'] = run_map(pool, 'deflection', job_deflection, DEFL, cache_dir)
        say('deflection')
        out['sweeps'] = run_map(pool, 'sweeps', job_sweep, sweep_specs(), cache_dir)
        say('sweeps')
        out['static_map'] = run_map(pool, 'static', job_static_map, list(STATIC_RO), cache_dir)
        say('static')
        out['raindrop_map'] = run_map(pool, 'raindrop', job_raindrop_map, list(RAIN_R), cache_dir)
        say('raindrop')
        out['circular'] = run_map(pool, 'circular', job_circular, list(CIRC_R), cache_dir)
        say('circular')
        out['drip'] = run_map(pool, 'drip', job_drip, list(DRIP_R0), cache_dir)
        out['time'] = run_map(pool, 'time', job_time, [0], cache_dir)[0]
        say('drip, time')
        out['foot'] = run_map(pool, 'foot', job_foot, foot_specs(), cache_dir)
        say('foot')
        out['forward_caustic'] = run_map(pool, 'forward_caustic', job_forward_caustic, fc_specs(), cache_dir)
        say('forward caustic')
        out['lens'] = run_map(pool, 'lens', job_lens, lens_specs_subset() if subset else lens_specs_full(), cache_dir)
        say('lens')
        res = run_map(pool, 'pixels', job_pixel, camera_jobs(subset), cache_dir, chunksize=8)
        say('cameras')
    cams = []
    for ci, cam in enumerate(CAMERAS):
        px = [r for c, r in res if c == ci]
        px.sort(key=lambda r: (r['j'], r['i']))
        cams.append(dict(cam, W=W, H=H, pixels=px))
    out['camera_maps'] = cams
    if subset:
        out['camera_lattice'] = dict(i=list(LATTICE_I), j=list(LATTICE_J))
    agree, fails = agreement(out)
    out['agreement_B_minus_A'] = agree
    out['check_failures'] = [list(x) for x in fails]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='\n') as fh:
        json.dump(out, fh, separators=(',', ':'))
        fh.write('\n')
    say(f'written {path} ({os.path.getsize(path)} bytes)')
    print(json.dumps(agree, indent=1))
    print('failures', len(fails), fails[:10])


if __name__ == '__main__':
    main()
