"""
The accretion flow model of riaf_model.py seen from a camera at a finite distance from Sgr A*: an observer hovering
at rest at r (the static frame, r > 2) or a raindrop falling from rest far away (any r, inside the horizon included).
This is the reference the app's own ray march (src/render/flow/flowRay.ts, flowMap.frag.glsl) is checked against.

Camera and axes (units of M = GM/c^2): the hole at the origin, the camera at (0, 0, ro), the flow's axis
zf = (0, sin i, cos i), so i is the angle between the flow's axis and the direction from the hole to the camera (the
far camera of riaf_model.trace sits on +Z as well). A look direction is given by its angle alpha from the hole and its
azimuth omega about the camera-hole axis, measured from the flow's axis projected across that axis (+Y here) towards
axis x ref (+X): d = cos(alpha) (-Z) + sin(alpha) (cos(omega) Y + sin(omega) X). The app's map uses the same angles.

Each look direction is traced backwards as a null geodesic with photon energy E = 1 at infinity (the affine parameter
lambda then has the unit M, and the Cartesian form x'' = -3 b^2 x / |x|^5 of the orbit equation is exact, as in
riaf_model.trace), from the camera itself: impact parameter b = ro sin(alpha) / sqrt(1 - 2/ro) and radial velocity
dr/dlambda = -cos(alpha) for the static observer; b = r sin(alpha) / (1 - v cos(alpha)) and dr/dlambda = (v -
cos(alpha)) / (1 - v cos(alpha)), v = sqrt(2/r), for the raindrop (where 1 - v cos(alpha) <= 0, inside the horizon,
the photon's energy at infinity would not be positive: no light from outside arrives there and the ray is dark).
RK4 in steps of 0.01 r min(1, r/b) (ten times finer than the float32 march it checks), emission and absorption at
each step's midpoint exactly as riaf_model.trace evaluates them (its fluid velocities, emissivities and transfer of
I_nu/nu^3), but only outside the horizon: the model is fitted to light that leaves and says nothing about the inside.
A ray ends when it heads into the horizon, when it is beyond `rmax` heading out, or when its optical depth passes 50.

The visible light the app draws is the power-law electrons' alone (a model choice: the thermal electrons add
0.003 % seen from far away); `thermal` leaves the thermal part out at chosen frequencies, so the references can give
both (near the horizon the thermal part is 10-25 % of the visible light: docs/data/blackholes.md section 7).

What it returns is I_inf: the intensity at infinity that the ray carries in (Jy/sr at the given frequencies), i.e.
what an observer at rest far away would measure along that ray; the camera's own frequency factor k = nu_cam/nu_inf
(exp(-1/2 ln(1 - 2/r)) static, 1 / (1 - v cos(alpha)) raindrop) turns it into I_cam(nu) = k^3 I_inf(nu / k), which
the app applies per pixel (flowLookup.glsl). Needs numpy, scipy. Shares no code with the TypeScript or the GLSL.
"""
import numpy as np
from riaf_model import thermal_j, planck, powerlaw_ja, rg

E_ISCO = np.sqrt(8.0 / 9.0)
L_ISCO = np.sqrt(12.0)


def camera_rays(ro, frame, alpha, omega, incl_deg):
    """Initial states of the backward rays: position x (N, 3), velocity v (N, 3), b (N), dark (N, bool), ln k (N)."""
    alpha = np.asarray(alpha, float).ravel()
    omega = np.asarray(omega, float).ravel()
    n = alpha.size
    ca, sa = np.cos(alpha), np.sin(alpha)
    rhat = np.array([0.0, 0.0, 1.0])
    e = np.stack([np.sin(omega), np.cos(omega), np.zeros(n)], axis=1)  # cos(w) Y + sin(w) X
    if frame == 'static':
        f = 1.0 - 2.0 / ro
        b = ro * sa / np.sqrt(f)
        rdot = -ca
        dark = np.zeros(n, bool)
        lnk = np.full(n, -0.5 * np.log(f))
    elif frame == 'rain':
        vv = np.sqrt(2.0 / ro)
        den = 1.0 - vv * ca
        dark = den <= 0.0
        den = np.where(dark, 1.0, den)
        b = ro * sa / den
        rdot = (vv - ca) / den
        lnk = -np.log(den)
    else:
        raise ValueError(frame)
    x = np.tile(rhat * ro, (n, 1))
    v = rdot[:, None] * rhat[None, :] + (b / ro)[:, None] * e
    return x, v, b, dark, lnk


def fluid_g(xx, vv, zf):
    """Frequency factor g = nu_inf / nu_emit of the fluid at xx for the backward ray's velocity vv (as riaf_model.local),
    with r, rho, z; valid outside the horizon."""
    r = np.linalg.norm(xx, axis=1)
    z = xx @ zf
    rho = np.sqrt(np.maximum(r**2 - z**2, 1e-12))
    f = 1 - 2 / r
    kr_con = -(np.sum(vv * xx, axis=1)) / r
    k_r = kr_con / f
    k_phi = np.cross(xx, -vv) @ zf
    out = r >= 6.0
    Om = r**-1.5
    den = f - rho**2 * Om**2
    ut_c = 1 / np.sqrt(np.maximum(den, 1e-6))
    ut_p = E_ISCO / f
    uphi_p = L_ISCO / r**2
    ur_p = -np.sqrt(np.maximum(E_ISCO**2 - f * (1 + rho**2 * uphi_p**2), 0))
    mku = np.where(out, ut_c * (1 - Om * k_phi), ut_p - k_r * ur_p - k_phi * uphi_p)
    return 1.0 / mku, r, rho, z


def trace_camera(params, freqs, ro, frame, incl_deg, alpha, omega, rmax=400.0, emit_max=400.0, k=0.01,
                 maxsteps=40000, beta=10.0, thermal=None):
    """I_inf (Jy/sr) per ray and frequency, the camera's ln k per ray, and the steps taken. params = (n0, T0, n0nt,
    p); thermal[k] False leaves the thermal electrons out at frequency k (the app's visible map is the power law
    only)."""
    if thermal is None:
        thermal = [True] * len(freqs)
    from riaf_model import mp as MP, c as C
    n0, T0, n0nt, p = params
    inc = np.radians(incl_deg)
    zf = np.array([0.0, np.sin(inc), np.cos(inc)])
    x, v, b, dark, lnk = camera_rays(ro, frame, alpha, omega, incl_deg)
    npx = x.shape[0]
    h2 = b**2
    nf = len(freqs)
    Iinv = np.zeros((npx, nf))
    tau = np.zeros((npx, nf))
    alive = ~dark

    def acc(xx, hh2):
        r = np.linalg.norm(xx, axis=1)
        return -3.0 * hh2[:, None] * xx / r[:, None]**5

    steps = 0
    while alive.any() and steps < maxsteps:
        steps += 1
        idx = np.where(alive)[0]
        xx = x[idx]; vv = v[idx]; H2 = h2[idx]; bb = b[idx]
        r = np.linalg.norm(xx, axis=1)
        dl = k * r * np.minimum(1.0, r / np.maximum(bb, 1e-300))
        k1x = vv; k1v = acc(xx, H2)
        k2x = vv + 0.5 * dl[:, None] * k1v; k2v = acc(xx + 0.5 * dl[:, None] * k1x, H2)
        k3x = vv + 0.5 * dl[:, None] * k2v; k3v = acc(xx + 0.5 * dl[:, None] * k2x, H2)
        k4x = vv + dl[:, None] * k3v; k4v = acc(xx + dl[:, None] * k3x, H2)
        xn = xx + dl[:, None] / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        vn = vv + dl[:, None] / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        xm = 0.5 * (xx + xn); vm = 0.5 * (vv + vn)
        rm = np.linalg.norm(xm, axis=1)
        emit = (rm > 2.0) & (rm < emit_max)
        if emit.any():
            ei = np.where(emit)[0]
            g, rr, rho, z = fluid_g(xm[ei], vm[ei], zf)
            g = np.clip(g, 1e-4, 1e4)
            n_th = n0 * rho**-1.1 * np.exp(-z**2 / (2 * rho**2))
            n_nt = n0nt * rho**-2.9 * np.exp(-z**2 / (2 * rho**2))
            Te = T0 * rr**-0.84
            Bf = np.sqrt(8 * np.pi * n_th * MP * C**2 / (6 * beta * rr))
            dle = dl[ei]
            row = idx[ei]
            for kk, nu in enumerate(freqs):
                nue = nu / g
                if thermal[kk]:
                    jt = thermal_j(nue, n_th, Te, Bf)
                    at = jt / np.maximum(planck(nue, np.maximum(Te, 1.0)), 1e-300)
                else:
                    jt = at = 0.0
                jn, an = powerlaw_ja(nue, n_nt, Bf, p) if n0nt > 0 else (0.0, 0.0)
                j = jt + jn
                al = at + an
                ds = dle * rg / g
                dtau = al * ds
                src = j / nue**3 * ds
                Iinv[row, kk] += np.where(dtau > 1e-6, src / np.maximum(dtau, 1e-30) * (1 - np.exp(-dtau)), src) * np.exp(-tau[row, kk])
                tau[row, kk] += dtau
        x[idx] = xn; v[idx] = vn
        rn = np.linalg.norm(xn, axis=1)
        outgoing = np.sum(xn * vn, axis=1) > 0
        dead = ((rn <= 2.0) & ~outgoing) | ((rn > rmax) & outgoing) | (tau[idx].min(axis=1) > 50)
        alive[idx[dead]] = False
    I = Iinv * np.array(freqs)**3 / 1e-23  # Jy/sr at infinity
    return I, lnk, steps
