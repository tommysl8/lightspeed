// Prints the example-trip table and headline numbers used in staging/cosmology/cosmology.md.
//   node staging/cosmology/tools/trip-table.ts        (Node >= 23.6 strips the types itself)

import { Cosmology, PLANCK18 } from '../src/cosmology.ts';
import { GLY_PER_MPC, MPC_LY } from '../src/constants.ts';
import { lastVisibleEmissionTimeGyr, buildEmissionTable } from '../src/appearance.ts';
import { maxReach, planCruise, planRoundTrip, staticShipTimeYr, type TripPlan, type Unreachable } from '../src/ship.ts';
import { LOCAL_GROUP, planTrip } from '../src/policy.ts';
import { homeReport } from '../src/future.ts';

const t0 = performance.now();
const c = new Cosmology(PLANCK18);
const buildMs = performance.now() - t0;

const f = (x: number, d = 4) => (Math.abs(x) >= 1e6 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(d - 1) : x.toPrecision(d));
const yr = (y: number) => (y >= 1e9 ? `${f(y / 1e9)} Gyr` : y >= 1e6 ? `${f(y / 1e6)} Myr` : y >= 1e3 ? `${f(y / 1e3)} kyr` : `${f(y)} yr`);

console.log('## Background');
console.log(`table build: ${buildMs.toFixed(1)} ms`);
console.log(`Omega_gamma = ${c.omegaGamma.toExponential(6)}, Omega_nu (2 massless) = ${c.omegaNuMassless.toExponential(6)}, Omega_nu (0.06 eV) = ${c.omegaNuMassive.toExponential(6)}`);
console.log(`Omega_cb = ${c.omegaCB.toFixed(8)}, Omega_Lambda = ${c.omegaLambda.toFixed(8)}, z_eq = ${c.equalityRedshift().toFixed(1)}`);
console.log(`age = ${c.ageGyr().toFixed(5)} Gyr, t(z=1100) = ${(c.timeGyr(1 / 1101) * 1e3).toFixed(4)} Myr, t(a=1e-6) = ${(c.timeGyr(1e-6) * 1e9 * 365.25 * 86400).toExponential(6)} s`);
for (const a of [0.5, 1, 2, 10]) {
  const ph = c.particleHorizonMpc(a);
  const eh = c.eventHorizonMpc(a);
  const hs = c.hubbleSphereMpc(a);
  console.log(`a = ${a}: t = ${c.timeGyr(a).toFixed(4)} Gyr, particle horizon ${ph.toFixed(2)} Mpc (${(ph * GLY_PER_MPC).toFixed(3)} Gly), event horizon ${eh.toFixed(2)} Mpc (${(eh * GLY_PER_MPC).toFixed(3)} Gly), Hubble sphere ${hs.comoving.toFixed(2)} Mpc comoving`);
}
console.log(`eta_inf = ${(c.etaInf * c.dH).toFixed(2)} Mpc (${(c.etaInf * c.dH * GLY_PER_MPC).toFixed(3)} Gly)`);
console.log(`z of a galaxy at today's event horizon: ${c.redshiftAtComovingMpc(c.eventHorizonMpc(1) * (1 - 1e-12)).toFixed(4)}`);
for (const z of [0.5, 1, 1100]) console.log(`chi(z=${z}) = ${c.comovingDistanceMpc(z).toFixed(4)} Mpc, D_L = ${c.luminosityDistanceMpc(z).toFixed(3)}, D_A = ${c.angularDiameterDistanceMpc(z).toFixed(3)}, lookback ${c.lookbackTimeGyr(z).toFixed(4)} Gyr`);
for (const z of [1, 2, 3, 5, 10]) console.log(`last light ever received from a galaxy now at z = ${z}: emitted at t = ${lastVisibleEmissionTimeGyr(c, c.comovingDistanceMpc(z))!.toFixed(3)} Gyr`);
const virgoCross = c.timeLn(c.lnAtEventHorizon(16.5 / c.dH));
console.log(`Virgo (16.5 Mpc) leaves our event horizon at t = ${(virgoCross * c.tH).toFixed(2)} Gyr (a = ${Math.exp(c.lnAtEventHorizon(16.5 / c.dH)).toFixed(1)})`);
const tab = buildEmissionTable(c);
console.log(`emission table: ${tab.n} floats, max |d ln a| = ${tab.maxErrorLnA.toExponential(2)}`);

console.log('\n## Trips at 1 g, departing today');
console.log('| Destination | Distance | Model | Ship time | Time at home | Peak gamma | a at arrival | Home seen at z | Static-space SR ship time |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const rows: [string, number, string][] = [
  ['Proxima Centauri', 1e-6 / 0.7680665, '1.302 pc (Gaia DR3)'],
  ['Galactic Centre (Sgr A*)', 8.277e-3, '8.277 kpc (GRAVITY 2022)'],
  ['Andromeda (M31)', 0.761, '0.761 Mpc (Li et al. 2021)'],
  ['Virgo cluster', 16.5, '16.5 Mpc (Mei et al. 2007)'],
  ['galaxy at z = 0.5', c.comovingDistanceMpc(0.5), ''],
  ['galaxy at z = 1', c.comovingDistanceMpc(1), ''],
  ['galaxy at z = 3', c.comovingDistanceMpc(3), ''],
];
const plans: Record<string, TripPlan | Unreachable> = {};
for (const [name, d, src] of rows) {
  const t1 = performance.now();
  const p = name.startsWith('Andromeda') ? planTrip(c, { positionMpc: LOCAL_GROUP.m31EclMpc }) : planTrip(c, { distanceMpc: d });
  const ms = performance.now() - t1;
  plans[name] = p;
  const dist = src || `${f(d, 6)} Mpc comoving`;
  if (!p.ok) {
    console.log(`| ${name} | ${dist} | refused | ${p.reason}: event horizon ${f(p.eventHorizonMpc, 6)} Mpc | | | | | ${f(staticShipTimeYr(d), 5)} yr |`);
    continue;
  }
  console.log(
    `| ${name} | ${dist} | ${p.model} | ${f(p.shipTimeYr, 6)} yr | ${yr(p.cosmicTimeYr)} | ${f(p.peakGamma, 4)} | ${f(p.arrival.scale, 7)} | ${p.model === 'static' ? '0 (bound)' : f(p.home.redshift, 5)} | ${f(staticShipTimeYr(d), 6)} yr |  <!-- ${ms.toFixed(1)} ms -->`,
  );
}
console.log('\n## Home seen on arrival (light lag), and the absolute limit of reach');
for (const [name, p] of Object.entries(plans)) if (p.ok) console.log(`${name}: home light left ${f(p.home.emissionAfterDepartureYr, 7)} yr after departure, seen at z = ${f(p.home.redshift, 6)}`);
const lim = maxReach(c, 1000);
console.log(`limit of reach at 1 g: ${lim.limitInsideEventHorizonMpc.toExponential(7)} Mpc = ${(lim.limitInsideEventHorizonMpc * MPC_LY).toFixed(6)} ly inside the event horizon (${(c.dH * c.eventHorizonPreciseLn(0)).toFixed(9)} Mpc)`);
for (const d of [1, 0.01, 1e-6]) {
  const p = planTrip(c, { distanceMpc: c.dH * c.eventHorizonPreciseLn(0) - d });
  console.log(`  ${d} Mpc inside the horizon: ${p.ok ? f(p.shipTimeYr, 7) + ' yr aboard' : p.reason}`);
}
console.log('\n## Maximum reach at 1 g (flip-and-burn, departing today)');
console.log('| Ship time | Comoving distance | Seen from home today at z | Flip at | Arrival: cosmic time | a | Peak gamma |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const T of [30, 50, 100]) {
  const r = maxReach(c, T);
  console.log(`| ${T} yr | ${f(r.chiMpc, 10)} Mpc (${f(r.chiMpc * MPC_LY / 1e9, 5)} Gly) | ${f(r.redshiftSeenAtDeparture, 5)} | ${f(r.flipShipTimeYr, 5)} yr | ${f(r.arrivalTimeGyr, 5)} Gyr | ${f(r.arrivalScale, 4)} | ${f(r.peakGamma, 4)} | inside horizon ${r.insideEventHorizonMpc.toExponential(4)} Mpc${r.saturated ? ' (limit)' : ''} |`);
}
console.log('\n## Round trips at 1 g');
for (const [name, d] of [['Virgo', 16.5], ['z = 0.5', c.comovingDistanceMpc(0.5)], ['z = 1', c.comovingDistanceMpc(1)]] as [string, number][]) {
  const r = planRoundTrip(c, d);
  if (r.inbound && !r.inbound.ok) console.log(`${name}: outbound ${f((r.outbound as TripPlan).shipTimeYr, 6)} yr; return refused (${r.inbound.reason}: ${r.inbound.message})`);
  else if (r.inbound && r.outbound.ok) console.log(`${name}: out ${f(r.outbound.shipTimeYr, 6)} yr + back ${f(r.inbound.shipTimeYr, 6)} yr = ${f(r.shipTimeYr, 6)} yr aboard; ${yr(r.cosmicTimeYr)} at home`);
}
console.log('\n## Cruise example');
const cr = planCruise(c, 16.5, { cruiseGamma: 1000 });
if (cr.ok) console.log(`Virgo at gamma = 1000: ${f(cr.shipTimeYr, 6)} yr aboard, ${yr(cr.cosmicTimeYr)} at home; hold thrust ${f(cr.cruise!.holdThrustAtStartG, 4)} g -> ${f(cr.cruise!.holdThrustAtEndG, 4)} g`);
console.log('\n## Home report after the z = 1 trip');
const z1 = plans['galaxy at z = 1'] as TripPlan;
const rep = homeReport(c, z1.arrival.timeGyr, z1.home.emissionTimeGyr);
console.log(`arrival ${z1.arrival.timeGyr.toFixed(3)} Gyr (+${rep.now.fromNowGyr.toFixed(3)} from now); home seen as it was ${z1.home.emissionAfterDepartureYr.toFixed(4)} yr after departure (+${rep.seen.fromNowGyr.toFixed(9)} Gyr)`);
for (const s of rep.now.statements) console.log(' now: ' + s);
for (const s of rep.seen.statements) console.log(' seen: ' + s);
