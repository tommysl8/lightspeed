// Physical constants and unit conversions for the cosmology module.
//
// Sources:
//   [SI]     BIPM, The International System of Units, 9th edition (2019): c, h, k_B and e are exact.
//   [CODATA] Tiesinga et al. 2021, Rev. Mod. Phys. 93, 025010 (CODATA 2018): G = 6.67430e-11.
//            CODATA 2022 (Mohr et al. 2025) keeps the same value.
//   [IAU]    IAU 2012 B2 (astronomical unit, exact), IAU 2015 B2 (parsec = 648000/pi au),
//            Julian year = 365.25 d of 86400 s (used by the light-year and by "Gyr" throughout).
//   [CGPM]   3rd CGPM (1901): standard gravity g0 = 9.80665 m/s^2, exact.

/** Speed of light, m/s. Exact [SI]. */
export const C_M_S = 299_792_458;
/** Speed of light, km/s. */
export const C_KM_S = C_M_S / 1000;
/** Planck constant, J s. Exact [SI]. */
export const PLANCK_H = 6.626_070_15e-34;
/** Boltzmann constant, J/K. Exact [SI]. */
export const K_B = 1.380_649e-23;
/** Elementary charge (1 eV in joules). Exact [SI]. */
export const EV_J = 1.602_176_634e-19;
/** Boltzmann constant in eV/K. */
export const K_B_EV = K_B / EV_J;
/** Newtonian constant of gravitation, m^3 kg^-1 s^-2 [CODATA]. */
export const G_SI = 6.674_3e-11;
/** Stefan-Boltzmann constant from the exact SI constants: 2 pi^5 k^4 / (15 h^3 c^2). */
export const SIGMA_SB = (2 * Math.PI ** 5 * K_B ** 4) / (15 * PLANCK_H ** 3 * C_M_S ** 2);

/** Astronomical unit, m. Exact [IAU]. */
export const AU_M = 149_597_870_700;
/** Parsec, m (648000/pi au) [IAU]. */
export const PC_M = (648_000 / Math.PI) * AU_M;
/** Megaparsec, m and km. */
export const MPC_M = 1e6 * PC_M;
export const MPC_KM = MPC_M / 1000;
/** Julian year, s [IAU]. */
export const YEAR_S = 365.25 * 86_400;
/** Gigayear (10^9 Julian years), s. */
export const GYR_S = 1e9 * YEAR_S;
/** Light-year, m (c x Julian year) [IAU]. */
export const LY_M = C_M_S * YEAR_S;
/** Megaparsec in light-years (3.2615637771674333e6). */
export const MPC_LY = MPC_M / LY_M;
/** Gigalight-years per megaparsec, for display. */
export const GLY_PER_MPC = MPC_LY / 1e9;
/** Standard gravity, m/s^2. Exact [CGPM]. */
export const G0_M_S2 = 9.806_65;

/** (4/11)^(1/3): neutrino-to-photon temperature ratio after e+e- annihilation (instantaneous decoupling). */
export const TNU_OVER_TGAMMA = Math.cbrt(4 / 11);
/** 7/8 (4/11)^(4/3): energy density of one massless neutrino species relative to photons (N_eff = 3 per species). */
export const NU_PER_PHOTON = (7 / 8) * (4 / 11) ** (4 / 3);

/** Hubble time 1/H0 in seconds for H0 in km/s/Mpc. */
export const hubbleTimeS = (H0: number): number => MPC_KM / H0;
/** Hubble time 1/H0 in Gyr. */
export const hubbleTimeGyr = (H0: number): number => MPC_KM / H0 / GYR_S;
/** Hubble distance c/H0 in Mpc. */
export const hubbleDistanceMpc = (H0: number): number => C_KM_S / H0;
