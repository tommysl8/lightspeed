"""Reference values for the cosmology tests (staging/cosmology/src/fixtures/reference.json).

Two independent sources:

1. An independent Python implementation of the same model (flat LCDM, photons at T_cmb, two massless
   neutrinos and one 0.06 eV neutrino with the exact Fermi-Dirac integral, N_eff/3 per species),
   integrated with scipy.integrate.quad at epsrel ~ 1e-13. It shares no code with the TypeScript.
2. astropy.cosmology.FlatLambdaCDM:
   a) with massless neutrinos (m_nu = 0), where astropy's model is analytic and matches ours exactly;
   b) with m_nu = [0, 0, 0.06] eV, where astropy approximates the neutrino density with the fitting
      function of Komatsu et al. (2011, ApJS 192, 18, eq. 26), so agreement is only ~1e-5;
   c) the built-in astropy Planck18 (T_cmb = 2.7255 K, Om0 = 0.30966), for information.

Run with numpy, scipy and astropy installed (tested with astropy 8.0.1, scipy 1.18.1):
    python staging/cosmology/fixtures/make_fixtures.py
"""
import json
import math
import os
import sys

import numpy as np
from scipy import integrate

import astropy
import astropy.units as u
from astropy.cosmology import FlatLambdaCDM, Planck18

C = 299792458.0
H_PL = 6.62607015e-34
K_B = 1.380649e-23
EV = 1.602176634e-19
G = 6.67430e-11
AU = 149597870700.0
PC = 648000.0 / math.pi * AU
MPC = 1e6 * PC
YEAR = 365.25 * 86400.0
GYR = 1e9 * YEAR
SIGMA = 2 * math.pi**5 * K_B**4 / (15 * H_PL**3 * C**2)

H0 = 67.66
OM = 0.3111
TCMB = 2.72548
NEFF = 3.046
MNU = [0.06]

F0 = 7 * math.pi**4 / 120


def fd_F(y):
    f = lambda q: q * q * math.sqrt(q * q + y * y) / (math.exp(q) + 1.0)
    pts = [y] if 0 < y < 60 else None
    v, _ = integrate.quad(f, 0, 80, epsabs=0, epsrel=2e-14, limit=400, points=pts)
    return v


hs = H0 * 1000 / MPC
rho_crit = 3 * hs * hs / (8 * math.pi * G)
og = 4 * SIGMA * TCMB**4 / C**3 / rho_crit
fnu = 7 / 8 * (4 / 11) ** (4 / 3) * NEFF / 3
tnu = (4 / 11) ** (1 / 3) * TCMB
ynu = [m * EV / (K_B * tnu) for m in MNU]
n_massless = 3 - len(MNU)
onu_massive = og * fnu * sum(fd_F(y) / F0 for y in ynu)
ocb = OM - onu_massive
oL = 1 - OM - og * (1 + fnu * n_massless)
tH_gyr = MPC / 1000 / H0 / GYR
dH_mpc = C / 1000 / H0


def E2(a):
    nu = n_massless + sum(fd_F(y * a) / F0 for y in ynu)
    return ocb / a**3 + og / a**4 * (1 + fnu * nu) + oL


def E(a):
    return math.sqrt(E2(a))


# Integrate in l = ln a; for t and eta start from a closed-form radiation+matter piece at a_s = 1e-12.
A_S = 1e-12
oR_early = og * (1 + 3 * fnu)


def t_early(a):
    # int_0^a a' da' / sqrt(oR + ocb a'), exact closed form evaluated with a series (b a << 1)
    b = ocb / oR_early
    x = b * a
    s, term = 0.0, 1.0
    for k in range(20):
        s += term / (k + 2)
        term *= -(0.5 + k) / (k + 1) * x
    return a * a * s / math.sqrt(oR_early)


def eta_early(a):
    return 2 * a / (math.sqrt(oR_early + ocb * a) + math.sqrt(oR_early))


def quad_l(f, l1, l2):
    # split into unit panels in l for robustness
    n = max(1, int(math.ceil(abs(l2 - l1) / 0.5)))
    edges = np.linspace(l1, l2, n + 1)
    tot = 0.0
    for i in range(n):
        v, _ = integrate.quad(f, edges[i], edges[i + 1], epsabs=0, epsrel=1e-13, limit=200)
        tot += v
    return tot


def t_of_a(a):
    return t_early(A_S) + quad_l(lambda l: 1 / E(math.exp(l)), math.log(A_S), math.log(a))


def eta_of_a(a):
    return eta_early(A_S) + quad_l(lambda l: math.exp(-l) / E(math.exp(l)), math.log(A_S), math.log(a))


def chi_between(a1, a2):
    return quad_l(lambda l: math.exp(-l) / E(math.exp(l)), math.log(a1), math.log(a2))


def chi_eh(a):
    # c int_a^inf da/(a^2 E): substitute x = 1/a -> int_0^{1/a} dx / E(1/x)
    f = lambda x: 1.0 / E(1.0 / x) if x > 0 else 1.0 / math.sqrt(oL)
    v, _ = integrate.quad(f, 0, 1.0 / a, epsabs=0, epsrel=1e-13, limit=400)
    return v


print('independent model: og=%.10e ocb=%.12f oL=%.12f onu_massive=%.10e' % (og, ocb, oL, onu_massive), file=sys.stderr)

ref = {
    'description': 'Reference values for staging/cosmology tests. Units: Gyr, Mpc; E dimensionless.',
    'generator': 'staging/cosmology/fixtures/make_fixtures.py',
    'versions': {'python': sys.version.split()[0], 'numpy': np.__version__, 'astropy': astropy.__version__,
                 'scipy': __import__('scipy').__version__},
    'params': {'H0': H0, 'omegaM': OM, 'TcmbK': TCMB, 'nEff': NEFF, 'mNuEv': MNU},
    'independent': {'omegaGamma': og, 'omegaCB': ocb, 'omegaLambda': oL, 'omegaNuMassive': onu_massive},
}

A_LIST = [1e-6, 1e-5, 1e-4, 1e-3, 1 / 1090.8, 0.01, 0.1, 0.25, 0.5, 1.0, 2.0, 10.0, 100.0, 1000.0]
Z_LIST = [0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 3.0, 10.0, 1100.0]

ref['independent']['E'] = [{'a': a, 'E': E(a)} for a in A_LIST]
ref['independent']['time'] = [{'a': a, 'tGyr': t_of_a(a) * tH_gyr} for a in A_LIST]
ref['independent']['conformal'] = [{'a': a, 'etaMpc': eta_of_a(a) * dH_mpc} for a in A_LIST if a <= 100]
ref['independent']['comoving'] = [{'z': z, 'chiMpc': chi_between(1 / (1 + z), 1.0) * dH_mpc} for z in Z_LIST]
ref['independent']['eventHorizon'] = [{'a': a, 'chiMpc': chi_eh(a) * dH_mpc} for a in [0.001, 0.1, 0.5, 1.0, 2.0, 10.0, 100.0, 1000.0]]
ref['independent']['lookback'] = [{'z': z, 'tGyr': quad_l(lambda l: 1 / E(math.exp(l)), -math.log1p(z), 0.0) * tH_gyr} for z in Z_LIST]

# astropy (a): massless neutrinos, same Om (all matter is cb).
ca = FlatLambdaCDM(H0=H0, Om0=OM, Tcmb0=TCMB, Neff=NEFF, m_nu=0 * u.eV)
zs = np.array(Z_LIST)
ref['astropyMassless'] = {
    'model': 'FlatLambdaCDM(H0=67.66, Om0=0.3111, Tcmb0=2.72548, Neff=3.046, m_nu=0)',
    'Ogamma0': float(ca.Ogamma0), 'Onu0': float(ca.Onu0), 'Ode0': float(ca.Ode0),
    'age': float(ca.age(0).to_value(u.Gyr)),
    'rows': [
        {'z': float(z), 'chiMpc': float(ca.comoving_distance(z).to_value(u.Mpc)),
         'dlMpc': float(ca.luminosity_distance(z).to_value(u.Mpc)),
         'daMpc': float(ca.angular_diameter_distance(z).to_value(u.Mpc)),
         'lookbackGyr': float(ca.lookback_time(z).to_value(u.Gyr)),
         'ageGyr': float(ca.age(z).to_value(u.Gyr)), 'E': float(ca.efunc(z))}
        for z in zs
    ],
}

# astropy (b): same massive neutrino, astropy's fitting function for its density.
cb = FlatLambdaCDM(H0=H0, Om0=ocb, Tcmb0=TCMB, Neff=NEFF, m_nu=[0, 0, 0.06] * u.eV)
ref['astropyMassive'] = {
    'model': 'FlatLambdaCDM(H0=67.66, Om0=%.12f, Tcmb0=2.72548, Neff=3.046, m_nu=[0,0,0.06] eV)' % ocb,
    'age': float(cb.age(0).to_value(u.Gyr)),
    'rows': [
        {'z': float(z), 'chiMpc': float(cb.comoving_distance(z).to_value(u.Mpc)),
         'lookbackGyr': float(cb.lookback_time(z).to_value(u.Gyr)), 'ageGyr': float(cb.age(z).to_value(u.Gyr))}
        for z in zs
    ],
}

# astropy (c): built-in Planck18.
ref['astropyPlanck18'] = {
    'model': 'astropy.cosmology.Planck18 (Tcmb0=2.7255, Om0=0.30966, m_nu=[0,0,0.06])',
    'age': float(Planck18.age(0).to_value(u.Gyr)),
    'rows': [{'z': float(z), 'chiMpc': float(Planck18.comoving_distance(z).to_value(u.Mpc))} for z in zs],
}

out = os.path.join(os.path.dirname(__file__), '..', 'src', 'fixtures', 'reference.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w') as fh:
    json.dump(ref, fh, indent=1)
print('wrote', os.path.normpath(out), file=sys.stderr)
