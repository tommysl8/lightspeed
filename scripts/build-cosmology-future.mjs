// Builds staging/cosmology/future.json: what happens at home while a traveller is away.
//
//   node scripts/build-cosmology-future.mjs
//
// Literature values are typed in below with their sources. The one digitised quantity, the probability
// that the Milky Way and Andromeda have merged by a given time, is read from the vector paths of Fig. 3
// (right panel, "survival rate") of Sawala et al. (arXiv:2408.00064v1; published as Nature Astronomy 9,
// 1206 (2025), CC BY 4.0). The figure comes from the arXiv source tarball, cached in
// data-raw/cosmology/arXiv-2408.00064v1.tar.gz and downloaded only if missing. Deterministic: a rerun
// from the cache reproduces the file byte for byte.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'data-raw', 'cosmology');
const tarPath = join(rawDir, 'arXiv-2408.00064v1.tar.gz');
const outPath = join(root, 'staging', 'cosmology', 'future.json');

async function ensureTarball() {
  if (existsSync(tarPath)) return;
  mkdirSync(rawDir, { recursive: true });
  const res = await fetch('https://arxiv.org/e-print/2408.00064v1', { headers: { 'User-Agent': 'lightspeed data build' } });
  if (!res.ok) throw new Error(`arXiv download failed: ${res.status}`);
  writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));
}

/** Minimal ustar reader: returns the bytes of one member. */
function tarMember(tar, name) {
  let off = 0;
  while (off + 512 <= tar.length) {
    const hdr = tar.subarray(off, off + 512);
    if (hdr.every((b) => b === 0)) break;
    const str = (a, b) => hdr.subarray(a, b).toString('latin1').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const full = (str(345, 500) ? str(345, 500) + '/' : '') + str(0, 100);
    const body = off + 512;
    if (full === name || full.endsWith('/' + name)) return tar.subarray(body, body + size);
    off = body + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} not found in tarball`);
}

/** Concatenated, inflated content streams of a PDF. */
function pdfContent(pdf) {
  const s = pdf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    try {
      out.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a Flate stream */
    }
  }
  return out.join('\n');
}

function digitiseSurvival(content) {
  // Walk the PDF content-stream operators with an operand stack.
  const tokens = content.split(/\s+/).filter(Boolean);
  const stack = [];
  const ticks = []; // { seg: [[x,y],[x,y]], label }
  const curves = [];
  let colour = null;
  let path = [];
  let strings = [];
  for (const tok of tokens) {
    if (/^-?[\d.]+$/.test(tok)) {
      stack.push(Number(tok));
      continue;
    }
    if (tok.startsWith('(')) {
      strings.push(tok.replace(/^\(|\)$/g, ''));
      continue;
    }
    switch (tok) {
      case 'RG':
        colour = stack.slice(-3).map((v) => Math.round(v * 255));
        break;
      case 'm':
        path = [stack.slice(-2)];
        break;
      case 'l':
        path.push(stack.slice(-2));
        break;
      case 'S':
      case 'B':
        if (path.length === 2) ticks.push({ seg: path, label: null });
        else if (path.length > 20 && colour) curves.push({ colour, pts: path });
        path = [];
        break;
      case 'TJ': {
        const label = strings.join(' ');
        const t = ticks[ticks.length - 1];
        if (t && t.label === null) t.label = label;
        break;
      }
      case '[':
        strings = [];
        break;
      default:
        break;
    }
    if (tok !== '[' && !tok.startsWith('(') && tok !== ']') stack.length = 0;
  }
  const xTicks = [];
  const yTicks = [];
  for (const { seg, label } of ticks) {
    if (label === null) continue;
    const [[x1, y1], [x2, y2]] = seg;
    if (x1 === x2 && Math.abs(y1 - y2) < 5 && /^\d+$/.test(label)) xTicks.push([x1, Number(label)]);
    if (y1 === y2 && Math.abs(x1 - x2) < 5 && /^\d+%$/.test(label)) yTicks.push([y1, parseFloat(label)]);
  }
  if (xTicks.length < 2 || yTicks.length < 2) throw new Error('axis ticks not found');
  const lin = (tk) => {
    const [p0, v0] = tk[0];
    const [p1, v1] = tk[tk.length - 1];
    return (q) => v0 + ((q - p0) / (p1 - p0)) * (v1 - v0);
  };
  const X = lin(xTicks);
  const Y = lin(yTicks);
  for (const c of curves) c.pts = c.pts.map(([x, y]) => [X(x), Y(y)]);
  // Fiducial model = cornflower blue (20 kpc merger threshold); salmon = 10 kpc (figure caption).
  const blue = curves.find((c) => c.colour[2] > 200 && c.colour[0] < 120);
  const red = curves.find((c) => c.colour[0] > 240 && c.colour[2] < 130);
  if (!blue || !red) throw new Error('survival curves not found');
  const at = (curve, t) => {
    const p = curve.pts;
    if (t <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (p[i][0] >= t) {
        const f = (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
        return p[i - 1][1] + f * (p[i][1] - p[i - 1][1]);
      }
    }
    return p[p.length - 1][1];
  };
  const grid = [];
  for (let t = 4; t <= 10.0001; t += 0.25) grid.push(Math.round(t * 100) / 100);
  const cdf = (curve) => grid.map((t) => [t, Math.round((100 - at(curve, t)) * 10) / 1000]);
  return { xTicks, yTicks, fiducial: cdf(blue), threshold10kpc: cdf(red), points: [blue.pts.length, red.pts.length] };
}

await ensureTarball();
const tar = gunzipSync(readFileSync(tarPath));
const survivalPdf = tarMember(tar, 'figures/figure_3/survival.pdf');
const survival = digitiseSurvival(pdfContent(survivalPdf));

// ------------------------------------------------------------------------------------------ data

const SS08_PRESENT = 4.58; // model age of the present Sun, Gyr from ZAMS (Schroeder & Smith 2008)
const fromNow = (age) => Math.round((age - SS08_PRESENT) * 1000) / 1000;
const track = [
  ['ZAMS', 0.0, 0.7, 5596, 0.89, 1.0],
  ['present', 4.58, 1.0, 5774, 1.0, 1.0],
  ['MS:hottest', 7.13, 1.26, 5820, 1.11, 1.0],
  ['MS:final', 10.0, 1.84, 5751, 1.37, 1.0],
  ['RGB:tip', 12.17, 2730, 2602, 256, 0.668],
  ['ZA-He', 12.17, 53.7, 4667, 11.2, 0.668],
  ['AGB:tip', 12.3, 2090, 3200, 149, 0.546],
  ['AGB:tip-TP', 12.3, 4170, 3467, 179, 0.544],
].map(([phase, age, L, T, R, M]) => ({ phase, modelAgeGyr: age, fromNowGyr: fromNow(age), luminosityLsun: L, teffK: T, radiusRsun: R, massMsun: M }));

const future = {
  format: 'lightspeed-future',
  version: 1,
  generator: 'scripts/build-cosmology-future.mjs',
  about:
    'What happens at home (the Sun, the Earth, the Local Group, the cosmic background) while a traveller is away. Times are Gyr from the present day. Evaluate with staging/cosmology/src/future.ts.',
  timeOrigin: {
    note: 'fromNowGyr = 0 is the present. The present is cosmic time 13.787 +- 0.020 Gyr after the big bang (Planck 2018); the app computes cosmic times from its cosmology module.',
    universeAgeGyr: 13.787,
    ref: 'planck2018',
  },
  sun: {
    ageGyr: { value: 4.5673, unc: 0.00016, note: 'Age of the oldest solids (CAIs), 4567.30 +- 0.16 Myr', ref: 'connelly2012' },
    model: {
      ref: 'schroder2008',
      note: 'Stellar evolution model of a 1 Msun star with detailed cool-wind mass loss (Schroeder & Cuntz relation). Model ages count from the zero-age main sequence (ZAMS); the model reproduces the present Sun at 4.58 +- 0.05 Gyr, so fromNowGyr = model age - 4.58. Values between the tabulated rows are not given by the paper; future.ts interpolates the main sequence only (log L, log R, T linear in age) and reports later phases by name.',
    },
    track,
    phases: [
      { id: 'main-sequence', fromNowGyr: [fromNow(0), fromNow(10.0)], name: 'main-sequence star', text: 'Burning hydrogen in its core and slowly brightening, by about 10% per billion years.' },
      {
        id: 'subgiant-red-giant',
        fromNowGyr: [fromNow(10.0), fromNow(12.17)],
        name: 'subgiant, then red giant',
        text: 'Core hydrogen is gone; the core contracts and the envelope swells, first slowly, then fast. In the last 5 million years the radius sweeps past Mercury, Venus and the Earth, peaking at 256 solar radii (1.2 au) and 2,730 times today\'s luminosity, having shed a third of its mass.',
      },
      {
        id: 'helium-burning',
        fromNowGyr: [fromNow(12.17), fromNow(12.3)],
        name: 'helium-burning giant',
        text: 'After the helium flash the Sun settles at about 54 times today\'s luminosity and 11 solar radii, burns helium for about 130 million years, then climbs the asymptotic giant branch to about 2,090 L_sun and 149 R_sun, never again as large as at the red-giant tip.',
      },
      {
        id: 'white-dwarf',
        fromNowGyr: [fromNow(12.3), null],
        name: 'white dwarf',
        text: 'The last thermal pulse throws off a thin shell, probably too little for a regular planetary nebula. What remains is a carbon-oxygen white dwarf of 0.54 solar masses, about the size of the Earth, cooling and fading for ever after.',
        whiteDwarfMassMsun: 0.5405,
      },
    ],
  },
  earth: {
    events: [
      {
        id: 'habitable-zone-moves-out',
        fromNowGyr: 1.0,
        approximate: true,
        text: 'With the Sun about 10% brighter, the inner edge of the habitable zone passes 1 au: the oceans begin to evaporate. The paper calls one billion years a rather rough estimate.',
        ref: 'schroder2008',
      },
      {
        id: 'engulfed',
        fromNowGyr: 7.59,
        unc: 0.05,
        text: 'The red-giant Sun engulfs the Earth about half a million years before reaching its largest size; tidal drag and drag in the Sun\'s chromosphere pull it in despite the orbit widening as the Sun loses mass.',
        ref: 'schroder2008',
      },
    ],
  },
  localGroup: {
    lmc: {
      text: 'The Large Magellanic Cloud falls into the Milky Way and merges with it.',
      estimates: [
        { fromNowGyr: 2.4, range68: [1.6, 3.6], ref: 'cautun2019' },
        { fromNowGyr: 1.3, note: 'median, 20 kpc merger threshold (1.9 Gyr with 10 kpc)', ref: 'sawala2025' },
      ],
    },
    m33: {
      text: 'The Triangulum galaxy (M33) merges with Andromeda before any Milky Way-Andromeda merger.',
      probability: 0.86,
      medianFromNowGyr: 3.3,
      ref: 'sawala2025',
    },
    milkyWayAndromeda: {
      text: 'The Milky Way and Andromeda: a merger within 10 Gyr in about half of the orbits allowed by current measurements. Orbits that merge do so with a median time of 7.6 Gyr; almost all of the others never come closer than 200 kpc in that time.',
      probabilityWithin10Gyr: survival.fiducial[survival.fiducial.length - 1][1],
      medianMergerTimeIfMergedGyr: 7.6,
      cdf: {
        note: 'Probability that the merger has happened by fromNowGyr, 1 - "survival rate" of Fig. 3 (right) of Sawala et al., fiducial model (MW-M31-M33-LMC, Gaia DR3 proper motions, 20 kpc merger threshold, 50,000 Monte Carlo orbits), digitised from the vector figure of arXiv:2408.00064v1. Before 4 Gyr the probability is below 0.1%. Beyond 10 Gyr: not modelled by the paper.',
        columns: ['fromNowGyr', 'probability'],
        fiducial: survival.fiducial,
        threshold10kpc: survival.threshold10kpc,
      },
      earlierEstimate: {
        text: 'Before Gaia DR3 and before the LMC was included, a merger was thought certain: first pericentre 3.87 (+0.42 -0.32) Gyr from now, merger 5.86 (+1.61 -0.72) Gyr from now, with a 41% chance of a direct hit.',
        firstPericentreGyr: 3.87,
        mergerGyr: 5.86,
        directHitProbability: 0.41,
        ref: 'vandermarel2012',
      },
      ref: 'sawala2025',
    },
  },
  cosmos: {
    cmb: { T0K: 2.72548, unc: 0.00057, law: 'T(a) = T0 / a (a black body stays a black body as it redshifts)', ref: 'fixsen2009' },
    events: [
      {
        id: 'galaxies-leave-the-horizon',
        approxFromNowGyr: 100,
        text: 'Everything beyond the Local Group is carried outside the cosmic event horizon on a timescale of order 100 billion years. Nothing is seen to cross it: the old light keeps arriving, redshifted exponentially and fading, and only within a time comparable to the lives of the longest-lived stars (of order 10^12 years and more) does everything outside the merged Local Group become truly invisible.',
        ref: 'krauss2007',
      },
      {
        id: 'cmb-screened',
        text: 'Once the universe has grown by about 1e8 more (less than 50 times its present age), the CMB peak wavelength exceeds the interstellar plasma wavelength and the background can no longer be seen from inside a galaxy.',
        ref: 'krauss2007',
      },
      { id: 'star-formation-ends', approxFromNowGyr: 1e5, text: 'Galaxies run out of gas: normal star formation ends around 10^12 to 10^14 years.', ref: 'adams1997' },
    ],
    // Extragalactic landmarks for the home clock: distances today (comoving, a = 1). homeAt() computes when
    // each crosses the cosmic event horizon and at what redshift home still sees it. Treated as comoving
    // points: the M81 and Centaurus A groups actually recede a little slower than the Hubble flow, held
    // back by the Local Group's gravity (Karachentsev et al. 2009), so their crossing times are approximate.
    landmarks: [
      { id: 'm81-group', name: 'the M81 group', distanceMpc: 3.626, ref: 'tully2023', note: 'Cosmicflows-4 group distance, distance modulus 27.797 +- 0.116 (group 1PGC 28630)' },
      { id: 'cen-a-group', name: 'the Centaurus A group', distanceMpc: 3.637, ref: 'tully2023', note: 'Cosmicflows-4 distance of Centaurus A, distance modulus 27.804 +- 0.038' },
      { id: 'virgo-cluster', name: 'the Virgo cluster', distanceMpc: 16.5, ref: 'mei2007', note: 'surface-brightness fluctuations, 16.5 +- 0.1 +- 1.1 Mpc' },
      { id: 'coma-cluster', name: 'the Coma cluster', distanceMpc: 98.5, ref: 'scolnic2025', note: 'type Ia supernovae on the Cepheid ladder, 98.5 +- 2.2 Mpc' },
    ],
  },
  references: {
    planck2018: { cite: 'Planck Collaboration 2020, A&A 641, A6', doi: '10.1051/0004-6361/201833910', arxiv: '1807.06209' },
    schroder2008: { cite: 'Schroeder, K.-P. & Connon Smith, R. 2008, "Distant future of the Sun and Earth revisited", MNRAS 386, 155-163', doi: '10.1111/j.1365-2966.2008.13022.x', arxiv: '0801.4031' },
    connelly2012: { cite: 'Connelly, J. N. et al. 2012, "The absolute chronology and thermal processing of solids in the solar protoplanetary disk", Science 338, 651-655', doi: '10.1126/science.1226919' },
    sawala2025: {
      cite: 'Sawala, T., Delhomelle, J., Deason, A. J. et al. 2025, "No certainty of a Milky Way-Andromeda collision", Nature Astronomy 9, 1206-1217',
      doi: '10.1038/s41550-025-02563-1',
      arxiv: '2408.00064',
      licence: 'CC BY 4.0 (published article)',
    },
    vandermarel2012: { cite: 'van der Marel, R. P. et al. 2012, "The M31 velocity vector. III. Future Milky Way-M31-M33 orbital evolution, merging, and fate of the Sun", ApJ 753, 9', doi: '10.1088/0004-637X/753/1/9', arxiv: '1205.6865' },
    cautun2019: { cite: 'Cautun, M. et al. 2019, "The aftermath of the Great Collision between our Galaxy and the Large Magellanic Cloud", MNRAS 483, 2185-2196', doi: '10.1093/mnras/sty3084', arxiv: '1809.09116' },
    fixsen2009: { cite: 'Fixsen, D. J. 2009, "The temperature of the cosmic microwave background", ApJ 707, 916-920', doi: '10.1088/0004-637X/707/2/916', arxiv: '0911.1955' },
    krauss2007: { cite: 'Krauss, L. M. & Scherrer, R. J. 2007, "The return of a static universe and the end of cosmology", Gen. Rel. Grav. 39, 1545-1550', doi: '10.1007/s10714-007-0472-9', arxiv: '0704.0221' },
    loeb2002: { cite: 'Loeb, A. 2002, "The long-term future of extragalactic astronomy", Phys. Rev. D 65, 047301', doi: '10.1103/PhysRevD.65.047301', arxiv: 'astro-ph/0107568' },
    tully2023: { cite: 'Tully, R. B. et al. 2023, "Cosmicflows-4", ApJ 944, 94', doi: '10.3847/1538-4357/ac94d8', arxiv: '2209.11238' },
    mei2007: { cite: 'Mei, S. et al. 2007, "The ACS Virgo Cluster Survey. XIII. SBF distance catalog and the three-dimensional structure of the Virgo cluster", ApJ 655, 144-162', doi: '10.1086/509598', arxiv: 'astro-ph/0702510' },
    scolnic2025: { cite: 'Scolnic, D., Riess, A. G. et al. 2025, "The Hubble tension in our own backyard: DESI and the nearness of the Coma cluster", ApJL 979, L9', doi: '10.3847/2041-8213/ada0bd', arxiv: '2409.14546' },
    karachentsev2009: { cite: 'Karachentsev, I. D., Kashibadze, O. G., Makarov, D. I. & Tully, R. B. 2009, "The Hubble flow around the Local Group", MNRAS 393, 1265-1274', doi: '10.1111/j.1365-2966.2008.14300.x', arxiv: '0811.4610' },
    adams1997: { cite: 'Adams, F. C. & Laughlin, G. 1997, "A dying universe: the long-term fate and evolution of astrophysical objects", Rev. Mod. Phys. 69, 337-372', doi: '10.1103/RevModPhys.69.337', arxiv: 'astro-ph/9701131' },
  },
  digitisation: {
    source: 'arXiv:2408.00064v1 source tarball, figures/figure_3/survival.pdf (vector paths)',
    xTicks: survival.xTicks,
    yTicks: survival.yTicks,
    pointsPerCurve: survival.points,
    precision: 'Curve vertices are the plotted points themselves; the reading error is below 0.1 percentage point. The Monte Carlo sampling error quoted by the paper is below 1%.',
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(future, null, 2) + '\n');
console.log(`wrote ${outPath}: P(merged within 10 Gyr) = ${future.localGroup.milkyWayAndromeda.probabilityWithin10Gyr}`);
