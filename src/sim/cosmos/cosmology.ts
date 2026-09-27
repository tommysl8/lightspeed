/**
 * The one cosmology of the app: flat Lambda-CDM with the Planck 2018 parameters, from the cosmology
 * module (src/physics/cosmology). This file only adapts it
 * for the galaxies: nothing here computes distances or times of its own.
 *
 * Building the model (its master table) takes about 45 ms, so it is built on first use: in the
 * cosmic web's worker, and on the main thread only when a card or a test asks for a number.
 */
import { planck18, type Cosmology } from '../../physics/cosmology/cosmology.ts';

export type { Cosmology };

/** The shared Planck 2018 model (built on first call). */
export const cosmology = (): Cosmology => planck18();

/** Luminosity distance in Mpc from a distance modulus (no cosmology: the definition of the modulus). */
export const dmToMpc = (dm: number): number => 10 ** ((dm - 25) / 5);
export const mpcToDm = (mpc: number): number => 5 * Math.log10(mpc) + 25;

/**
 * Comoving distance from a measured distance modulus and the observed CMB-frame redshift:
 * D_C = D_L / (1 + z). Using the observed redshift rather than the cosmological one errs by about
 * v_pec / c (about 0.1 %), far below the distance errors.
 */
export const dmToComovingMpc = (dm: number, zCmb: number): number => dmToMpc(dm) / (1 + Math.max(0, zCmb));

/**
 * Where "the local universe" ends in the location trail: redshift 0.1, about as far as distances
 * are measured galaxy by galaxy (Cosmicflows-4 reaches z = 0.11). The comoving distance at z = 0.1
 * in this cosmology is 432.6 Mpc (checked by the tests against the cosmology module).
 */
export const LOCAL_UNIVERSE_Z = 0.1;
export const LOCAL_UNIVERSE_MPC = 432.6;
