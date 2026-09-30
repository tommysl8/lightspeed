"""
A semi-analytic RIAF (radiatively inefficient accretion flow) model of Sgr A*, ray traced exactly in the
Schwarzschild metric, to estimate what the flow looks like at 1.3 mm and in visible light.

Model (Broderick & Loeb 2006, MNRAS 367, 905; Broderick et al. 2009, ApJ 697, 45; after Yuan, Quataert & Narayan
2003, ApJ 598, 301), lengths in r_g = GM/c^2:
  thermal electrons      n_th = n0  (rho)^-1.1  exp(-z^2 / 2 rho^2)
  electron temperature   T_e  = T0  (r)^-0.84
  non-thermal electrons  n_nt = n0nt (rho)^-2.9 exp(-z^2 / 2 rho^2), power law N(gamma) ~ gamma^-p, gamma >= 100
  magnetic field         B^2 / 8 pi = n_th m_p c^2 / (6 beta r),  beta = 10  (Broderick et al. 2009 eq. 4 with r_S = 2 r_g)
  velocity               Keplerian at cylindrical radius rho >= 6 (ISCO), ballistic plunge (ISCO E, L) inside.
rho = cylindrical radius from the flow axis, z = height above the flow's mid-plane, r = spherical radius.
Emissivities: thermal synchrotron, Leung et al. 2011 (ApJ 737, 21) fit; power-law synchrotron, Pandya et al. 2016
(ApJ 822, 34) / Jones & O'Dell 1977 closed forms; absorption for the thermal part by Kirchhoff's law.
Pitch angle fixed at 60 deg (as the EHT one-zone model, Sgr A* Paper V sect. 2.2). Black hole spin 0 (ray tracing
in Schwarzschild), photons followed exactly (the 'Binet' form d2x/dl2 = -3 h^2 x / r^5 is exact for null geodesics
in Schwarzschild coordinates with E = 1), intensity transported as I_nu/nu^3.
The observer is at rest at infinity (the image and SED as seen from Earth without scattering or dust); for an
observer at rest near the hole, surface brightness is the same up to the factor g^(3-alpha) of their own
gravitational blueshift (negligible beyond ~100 r_g).

This is the model Skyfold draws (model A of fit_riaf.py: n0 = 2.613e6 cm^-3, T0 = 1.876e12 K, n0nt = 4.081e5 cm^-3,
p = 2). The app's float32 twin of one ray is src/render/flow/flowRay.ts (and the GPU's, flowMap.frag.glsl); cameras
at a finite distance, in the static or the raindrop frame, are flow_camera.py; the numbers the app reads are written
by flow_tables.py into src/sim/blackholes/sgraFlow.json. Unchanged since it was used for the fit
(docs/data/blackholes.md section 7). Needs numpy and scipy. trace() at 200 x 200 rays takes about a minute.
Shares no code with the TypeScript or the GLSL.
"""
import sys, json, numpy as np
from scipy.special import kve, gamma as Gam
from scipy.optimize import least_squares

# ---- constants (cgs) ----
e_ = 4.80320471e-10; me = 9.1093837e-28; c = 2.99792458e10; kB = 1.380649e-16; mp = 1.67262192e-24; h = 6.62607015e-27
GMsun = 1.32712440018e26
M = 4.297e6; D = 8277 * 3.0856775814913673e18
rg = M * GMsun / c**2
MUAS = np.pi / 180 / 3600e6
theta_g = rg / D / MUAS  # micro-arcsec per r_g
SIN_B = np.sin(np.radians(60.0))
BETA = 10.0

def thermal_j(nu, n, T, B):
    """Leung et al. 2011 angle-dependent thermal synchrotron emissivity, erg s^-1 cm^-3 Hz^-1 sr^-1."""
    Th = kB * T / (me * c**2)
    nuc = e_ * B / (2 * np.pi * me * c)
    nus = (2.0 / 9.0) * nuc * Th**2 * SIN_B
    X = nu / np.maximum(nus, 1e-30)
    # K2(1/Th) = kve(2, 1/Th) * exp(-1/Th); combine exponentials to avoid underflow
    expo = -X**(1.0 / 3.0) + 1.0 / np.maximum(Th, 1e-3)
    with np.errstate(over='ignore', under='ignore', invalid='ignore'):
        j = n * np.sqrt(2) * np.pi * e_**2 * nus / (3 * kve(2, 1.0 / np.maximum(Th, 1e-3)) * c) \
            * (np.sqrt(X) + 2**(11.0 / 12.0) * X**(1.0 / 6.0))**2 * np.exp(np.minimum(expo, 700))
    j = np.where((Th > 0.15) & (n > 0), j, 0.0)
    return np.nan_to_num(j)

def planck(nu, T):
    x = h * nu / (kB * T)
    with np.errstate(over='ignore'):
        return 2 * h * nu**3 / c**2 / np.expm1(np.minimum(x, 700))

def powerlaw_ja(nu, n, B, p, gmin=100.0, gmax=1e8):
    """Power-law synchrotron emissivity and absorption (Pandya et al. 2016 eqs. for the power law), fixed pitch angle."""
    nuc = e_ * B / (2 * np.pi * me * c)
    norm = (gmin**(1 - p) - gmax**(1 - p))
    x = nu / np.maximum(nuc * SIN_B, 1e-30)
    j = n * e_**2 * nuc / c * 3**(p / 2) * (p - 1) * SIN_B / (2 * (p + 1) * norm) \
        * Gam((3 * p - 1) / 12) * Gam((3 * p + 19) / 12) * x**(-(p - 1) / 2)
    a = n * e_**2 / (nu * me * c) * 3**((p + 1) / 2) * (p - 1) / (4 * norm) \
        * Gam((3 * p + 2) / 12) * Gam((3 * p + 22) / 12) * x**(-(p + 2) / 2)
    return j, a

def trace(params, freqs, incl_deg, npix=220, half=28.0, z0=1500.0, maxsteps=6000, want_images=False):
    """Ray trace the model; returns flux densities (Jy) per frequency and optionally images (I_nu, cgs)."""
    n0, T0, n0nt, p = params
    inc = np.radians(incl_deg)
    zf = np.array([0.0, np.sin(inc), np.cos(inc)])  # flow axis, tilted towards screen +y; observer along +Z
    a = np.linspace(-half, half, npix); A, Bv = np.meshgrid(a, a)
    Npx = A.size
    x = np.stack([A.ravel(), Bv.ravel(), np.full(Npx, z0)], axis=1)
    v = np.tile(np.array([0.0, 0.0, -1.0]), (Npx, 1))
    hh = np.linalg.norm(np.cross(x, v), axis=1)
    h2 = hh**2
    nf = len(freqs)
    Iinv = np.zeros((Npx, nf)); tau = np.zeros((Npx, nf))
    alive = np.ones(Npx, bool)
    E_isco = np.sqrt(8.0 / 9.0); L_isco = np.sqrt(12.0)

    def acc(xx, hh2):
        r = np.linalg.norm(xx, axis=1)
        return -3.0 * hh2[:, None] * xx / r[:, None]**5

    def local(xx, vv):
        r = np.linalg.norm(xx, axis=1)
        z = xx @ zf
        rho = np.sqrt(np.maximum(r**2 - z**2, 1e-12))
        n_th = n0 * rho**-1.1 * np.exp(-z**2 / (2 * rho**2))
        n_nt = n0nt * rho**-2.9 * np.exp(-z**2 / (2 * rho**2))
        Te = T0 * r**-0.84
        Bf = np.sqrt(8 * np.pi * n_th * mp * c**2 / (6 * BETA * r))
        # photon covariant components (physical photon moves along -v); E = 1
        f = 1 - 2 / r
        kr_con = -(np.sum(vv * xx, axis=1)) / r
        k_r = kr_con / f
        k_phi = np.cross(xx, -vv) @ zf
        # fluid velocity, normalised and time-like everywhere: shellular Keplerian rotation Omega = r^-1.5 about the
        # flow axis for r >= 6 (the ISCO); inside, a plunge with the ISCO's energy and angular velocity L/r^2 (which
        # reduces to the equatorial ballistic plunge in the mid-plane and keeps u^r real off the plane).
        out = r >= 6.0
        Om = r**-1.5
        den = f - rho**2 * Om**2
        ut_c = 1 / np.sqrt(np.maximum(den, 1e-6))
        ut_p = E_isco / f
        uphi_p = L_isco / r**2
        ur_p = -np.sqrt(np.maximum(E_isco**2 - f * (1 + rho**2 * uphi_p**2), 0))
        mku = np.where(out, ut_c * (1 - Om * k_phi), ut_p - k_r * ur_p - k_phi * uphi_p)
        g = 1.0 / mku
        return r, n_th, n_nt, Te, Bf, g

    steps = 0
    while alive.any() and steps < maxsteps:
        steps += 1
        idx = np.where(alive)[0]
        xx = x[idx]; vv = v[idx]; H2 = h2[idx]
        r = np.linalg.norm(xx, axis=1)
        dl = np.clip(0.02 * r, 0.004, 40.0)
        dl = np.where(r < 4.0, np.minimum(dl, 0.02), dl)
        # RK4 for x'' = acc(x)
        k1x = vv; k1v = acc(xx, H2)
        k2x = vv + 0.5 * dl[:, None] * k1v; k2v = acc(xx + 0.5 * dl[:, None] * k1x, H2)
        k3x = vv + 0.5 * dl[:, None] * k2v; k3v = acc(xx + 0.5 * dl[:, None] * k2x, H2)
        k4x = vv + dl[:, None] * k3v; k4v = acc(xx + dl[:, None] * k3x, H2)
        xn = xx + dl[:, None] / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        vn = vv + dl[:, None] / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        xm = 0.5 * (xx + xn); vm = 0.5 * (vv + vn)
        rm, n_th, n_nt, Te, Bf, g = local(xm, vm)
        emit = rm < 400
        g = np.clip(g, 1e-4, 1e4)
        for k, nu in enumerate(freqs):
            nue = nu / g
            jt = thermal_j(nue, n_th, Te, Bf)
            at = jt / np.maximum(planck(nue, np.maximum(Te, 1.0)), 1e-300)
            jn, an = powerlaw_ja(nue, n_nt, Bf, p) if n0nt > 0 else (0.0, 0.0)
            j = (jt + jn) * emit; al = (at + an) * emit
            ds = dl * rg / g  # fluid-frame path length, cm
            dtau = al * ds
            src = j / nue**3 * ds
            # emission within the step, attenuated by the optical depth already between it and the observer
            Iinv[idx, k] += np.where(dtau > 1e-6, src / np.maximum(dtau, 1e-30) * (1 - np.exp(-dtau)), src) * np.exp(-tau[idx, k])
            tau[idx, k] += dtau
        x[idx] = xn; v[idx] = vn
        rn = np.linalg.norm(xn, axis=1)
        outgoing = np.sum(xn * vn, axis=1) > 0
        dead = (rn < 2.0 * (1 + 1e-3)) | ((rn > z0 * 1.05) & outgoing) | (tau[idx].min(axis=1) > 50)
        alive[idx[dead]] = False
    pix_area = (2 * half / (npix - 1))**2  # r_g^2
    I = Iinv * np.array(freqs)**3  # erg s^-1 cm^-2 Hz^-1 sr^-1
    flux = I.sum(axis=0) * pix_area * (rg / D)**2 / 1e-23  # Jy
    res = {'flux': flux, 'steps': steps}
    if want_images:
        res['images'] = I.reshape(npix, npix, nf); res['axis_rg'] = a
    return res

if __name__ == '__main__':
    print(f"r_g = {rg:.4e} cm, theta_g = {theta_g:.4f} uas at D = 8277 pc")
