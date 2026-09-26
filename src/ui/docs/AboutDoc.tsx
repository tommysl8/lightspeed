/**
 * About Lightspeed: what it is, who made it, how to cite it, and where its data and methods
 * come from.
 */
import { useState, type ReactNode } from 'react';
import { APP, AUTHOR } from '../../content/author';
import { Icon } from '../icons';
import { LogoMark } from '../Logo';
import { Chapter, Ext, Ref, type TocEntry } from './parts';

export const ABOUT_TOC: TocEntry[] = [
  { id: 'overview', title: 'What it is' },
  { id: 'author', title: 'Author' },
  { id: 'cite', title: 'How to cite' },
  { id: 'sources', title: 'Sources and methods' },
  { id: 'limitations', title: 'Model limitations' },
  { id: 'software', title: 'Software and licences' },
  { id: 'privacy', title: 'Privacy' },
];

function Refs({ start, items }: { start: number; items: ReactNode[] }) {
  return (
    <ol className="doc-refs" start={start}>
      {items.map((c, i) => (
        <li key={i} value={start + i}>
          <span className="doc-refs-n">[{start + i}]</span>
          <span>{c}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          },
          () => {},
        );
      }}
      aria-label={label}
    >
      <Icon name={done ? 'check' : 'copy'} size={11} />
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

const PRINCIPLES: [string, string][] = [
  ['True scale', 'Distances and sizes are never compressed. Drawing bodies larger is an explicit option, and says so.'],
  ['The real sky', 'Positions from published ephemerides, good to an arcminute from 1700 to 2200 and to about half a degree from 3000 BCE to 3000 CE, among 329,770 stars placed in three dimensions at their measured distances.'],
  ['Exact relativity', 'Aberration, Doppler shift, beaming and time dilation follow from the Lorentz transformation, not from low-speed approximations.'],
  ['Fiction labelled', 'The one non-physical feature, faster-than-light travel, is marked in red and never enters the notebook.'],
];

function Overview() {
  return (
    <Chapter id="overview" title="What it is">
      <p className="doc-lead">
        Lightspeed is a space exploration tool with real physics. It shows the Solar System as it is right now, at true scale,
        and lets you fly through it close to the speed of light, with the sky and the clocks doing exactly what special
        relativity says they do.
      </p>
      <p>
        It is for anyone who has wondered what the sky would look like from a starship, and how long the trip would really
        take. The numbers are always a click away, and Learn tells the science behind it. For students and teachers there
        is also a lab: five guided experiments in special relativity that use the simulation as apparatus, with a notebook and
        printable reports. It runs in a web browser, needs no installation or account, and keeps anything you record on your
        own computer.
      </p>
      <div className="doc-principles">
        {PRINCIPLES.map(([t, d], i) => (
          <div key={t}>
            <span className="mono text-[10px] text-accent">0{i + 1}</span>
            <b>{t}</b>
            <span>{d}</span>
          </div>
        ))}
      </div>
      <TheMark />
    </Chapter>
  );
}

/** The mark, and what it depicts. */
function TheMark() {
  return (
    <div className="doc-markbox">
      <svg viewBox="4 4 56 56" width="96" height="96" aria-hidden className="shrink-0">
        <g fill="none" stroke="var(--color-fg)" strokeWidth="8">
          <circle cx="32" cy="32" r="24" />
          <circle cx="44" cy="32" r="12" />
        </g>
        <circle cx="52" cy="32" r="8" fill="var(--color-accent)" />
      </svg>
      <div>
        <h3 className="doc-h3-plain !mt-0">The mark</h3>
        <p>
          One circle on the sky, drawn twice: as it looks at rest, and as it looks from a ship moving at 0.6<i>c</i> towards the
          amber point, the apex. In stereographic projection, aberration shrinks everything towards the apex by the Doppler
          factor √((1 + <i>β</i>)/(1 − <i>β</i>)), which is exactly 2 at 0.6<i>c</i>. So the circle halves, and still passes
          through the apex. It is the same law the program uses to draw the sky in flight.
        </p>
      </div>
    </div>
  );
}

function Author() {
  return (
    <Chapter id="author" title="Author">
      <div className="doc-author">
        <div className="doc-monogram" aria-hidden>
          TL
        </div>
        <div className="min-w-0">
          <div className="doc-author-name">{AUTHOR.name}</div>
          <div className="doc-author-meta">
            <span className="mono">@{AUTHOR.handle}</span>
            <span aria-hidden>·</span>
            <span>{AUTHOR.affiliation}</span>
          </div>
          <div className="doc-author-links">
            <a className="btn" href={AUTHOR.github} target="_blank" rel="noreferrer">
              <Icon name="external" size={11} />
              GitHub
              <span className="mono text-fg-3">github.com/{AUTHOR.handle}</span>
            </a>
            <a className="btn" href={`mailto:${AUTHOR.email}?subject=Lightspeed`}>
              <Icon name="mail" size={11} />
              Email
              <span className="mono text-fg-3">{AUTHOR.email}</span>
            </a>
          </div>
        </div>
      </div>
      {AUTHOR.bio.map((p) => (
        <p key={p.slice(0, 16)}>{p}</p>
      ))}
      <p>
        Lightspeed was designed and built by {AUTHOR.name}. Corrections, bug reports and ideas for new journeys or experiments are
        welcome by email, or as an issue on the project’s <Ext href={`${AUTHOR.repo}/issues`}>GitHub page</Ext>.
      </p>
    </Chapter>
  );
}

function Cite() {
  const url = `${window.location.origin}/`;
  const apa = `${AUTHOR.citeShort} (${APP.year}). ${APP.citeTitle} (Version ${APP.version}) [Computer software]. ${url}`;
  const bib = `@software{liu_lightspeed_${APP.year},
  author  = {${AUTHOR.citeName}},
  title   = {Lightspeed: A Relativistic Solar System Explorer},
  year    = {${APP.year}},
  version = {${APP.version}},
  url     = {${url}}
}`;
  return (
    <Chapter id="cite" title="How to cite">
      <p>If you use Lightspeed in teaching or in written work, please cite it as:</p>
      <div className="doc-cite">
        <p>
          {AUTHOR.citeShort} ({APP.year}). <i>{APP.citeTitle}</i> (Version {APP.version}) [Computer software]. {url}
        </p>
        <CopyButton text={apa} label="Copy citation" />
      </div>
      <div className="doc-code">
        <div className="doc-code-bar">
          <span className="cap">BibTeX</span>
          <CopyButton text={bib} label="Copy BibTeX" />
        </div>
        <pre>{bib}</pre>
      </div>
    </Chapter>
  );
}

function Sources() {
  return (
    <Chapter id="sources" title="Sources and methods">
      <h3 className="doc-h3-plain">Ephemerides and constants</h3>
      <Refs
        start={1}
        items={[
          <>
            D. Cross, <Ext href="https://github.com/cosinekitty/astronomy">Astronomy Engine</Ext> (MIT licence): planetary, lunar
            and Pluto positions; IAU rotation models.
          </>,
          <>
            JPL <Ext href="https://ssd.jpl.nasa.gov/horizons/">Horizons</Ext> (DE441): Voyager 1 barycentric state vectors,
            propagated as a two-body orbit about the Solar System barycentre until the moon and track data have loaded.
          </>,
          <>
            Orbit models of 25 moons and of Pluto about its barycentre, fitted to JPL Horizons satellite ephemerides (MAR099,
            JUP365, SAT441, URA182/URA184, NEP097/NEP105, PLU060) and the{' '}
            <Ext href="https://ssd.jpl.nasa.gov/sats/elem/">JPL satellite mean elements</Ext>: within 0.6 to 1,500 km over
            1981–2199, the mean orbit outside. NASA/JPL-Caltech.
          </>,
          <>
            Chebyshev fits to JPL Horizons of the dwarf planets, trans-Neptunian objects, comets, interstellar objects and
            spacecraft (ephemerides from NASA/JPL, NASA/JHUAPL/SwRI and NASA/GSFC; Giorgini et al. 1996, BAAS 28, 1158):
            within 250 km for small bodies and 25 km for spacecraft, two-body orbits outside the data. NASA/JPL-Caltech.
          </>,
          <>BIPM, The International System of Units, 9th ed. (2019); IAU 2012 B2, 2015 B2 and B3 resolutions.</>,
          <>
            NASA NSSDCA <Ext href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/">Planetary Fact Sheets</Ext>: radii, GM,
            rotation and orbital data.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Moons and small bodies</h3>
      <Refs
        start={7}
        items={[
          <>
            B. A. Archinal et al. (2018), Celest. Mech. Dyn. Astr. 130, 22: the IAU WGCCRE 2015 rotation models, as encoded in
            NAIF’s <Ext href="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc">pck00011.tpc</Ext>; checked
            against the SPICE Toolkit to 3 × 10⁻¹⁰ rad.
          </>,
          <>
            JPL Solar System Dynamics: <Ext href="https://ssd.jpl.nasa.gov/sats/phys_par/">satellite physical parameters</Ext>,
            satellite mean elements and the <Ext href="https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html">Small-Body Database</Ext>:
            sizes, masses, albedos and orbits.
          </>,
          <>
            NASA PDS Small Bodies Node colour compilations (Neese 2014, 2020) and the PDS Rings Node ring tables: colours and
            rings.
          </>,
          <>
            The papers cited in the app’s body data, among them Ortiz et al. (2017, Haumea), Weaver et al. (2016, Nix and
            Hydra), Porter et al. (2024, Arrokoth), Pätzold et al. (2016, 67P) and Morgado et al. (2023, Quaoar); each fact on a
            body’s card links to its source.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Catalogues</h3>
      <Refs
        start={11}
        items={[
          <>
            D. Nash, <Ext href="https://codeberg.org/astronexus/athyg">AT-HYG v4.0</Ext> (
            <Ext href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Ext>), with distances and radial velocities
            from <Ext href="https://www.cosmos.esa.int/gaia">Gaia DR3</Ext> (ESA/Gaia/DPAC,{' '}
            <Ext href="https://www.cosmos.esa.int/web/gaia-users/license">CC BY-NC 3.0 IGO</Ext>; Gaia Collaboration 2023, A&amp;A
            674, A1; parallax zero-point of Lindegren et al. 2021), Hipparcos photometry and parallaxes (ESA 1997; van Leeuwen
            2007) via VizieR, variable-star names from <Ext href="https://codeberg.org/astronexus/hyg">HYG v4.4</Ext> and the{' '}
            <Ext href="https://www.iau.org/public/themes/naming_stars/">IAU star names</Ext>: 329,770 stars, every one to V ≈ 10
            and every catalogued one within 100 light-years. The derived star files may be used only non-commercially, with
            both credits.
          </>,
          <>
            O. Frohn, <Ext href="https://github.com/ofrohn/d3-celestial">d3-celestial</Ext> (BSD 3-Clause), after the IAU and Sky
            &amp; Telescope charts: the 88 constellation figures and names.
          </>,
          <>
            Star systems and named stars: orbits of Akeson et al. (2021, AJ 162, 14; Alpha Centauri A and B), Kervella et al.
            (2017, A&amp;A 598, L7; Proxima), Bond et al. (2017, ApJ 840, 70; Sirius) and (2015, ApJ 813, 106; Procyon), Shakht et
            al. (2017; 61 Cygni, preliminary) and Torres et al. (2015, ApJ 807, 26; Capella); of the 37 named stars and members
            of those systems, the sizes of 36 and the temperatures of 32 from the papers cited on their cards (the cards label
            the rest as estimates or colour temperatures). Sizes of other stars from their luminosity with the bolometric
            corrections of Flower (1996, ApJ 469, 355) as corrected by Torres (2010, AJ 140, 1158).
          </>,
          <>
            JPL <Ext href="https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html">Small-Body Database</Ext>: 31,930 asteroids, Trojans
            and trans-Neptunian objects, their orbits solved from Kepler’s equation on the GPU.
          </>,
          <>
            Proxima Centauri until the star catalogue has loaded: Gaia DR3 parallax; Boyajian et al. (2012), ApJ 757, 112:
            radius; Ségransan et al. (2003), A&amp;A 397, L5: temperature.
          </>,
          <>
            <Ext href="https://exoplanetarchive.ipac.caltech.edu/">NASA Exoplanet Archive</Ext>, Planetary Systems Composite
            Parameters (<Ext href="https://doi.org/10.26133/NEA13">doi:10.26133/NEA13</Ext>; Christiansen et al. 2025, PSJ 6, 186),
            retrieved 25 September 2026: 6,372 confirmed planets and their 4,779 stars. “This research has made use of the NASA
            Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National
            Aeronautics and Space Administration under the Exoplanet Exploration Program.” The stars’ J2000 positions are carried
            from Gaia DR3 (ESA/Gaia/DPAC, CC BY-NC 3.0 IGO) or the Hipparcos new reduction (van Leeuwen 2007, via VizieR), so this
            file too may be used only non-commercially, with the Gaia credit.
          </>,
          <>
            Eleven planetary systems from their papers, every value cited on the planet’s card: Agol et al. (2021, PSJ 2, 1;
            TRAPPIST-1), Suárez Mascareño et al. (2025, A&amp;A 700, A11; Proxima), Basant et al. (2025, ApJL 982, L1; Barnard’s
            Star), Cont et al. (2026, A&amp;A 710, A345; 51 Pegasi b), Wang et al. (2018, AJ 156, 192; HR 8799), Cabrera et al.
            (2014), Shallue &amp; Vanderburg (2018) and Shaw et al. (2025; Kepler-90), Pass et al. (2026, AJ 172, 175; TOI-700),
            Doyle et al. (2011, Science 333, 1602; Kepler-16), Thompson et al. (2025, AJ 170, 301; ε Eridani b), Feng et al.
            (2017, AJ 154, 135; τ Ceti), Beichman et al. and Sanghi et al. (2025, ApJL 989, L22 and L23; the candidate around α
            Centauri A). Sizes estimated from masses with the mass–radius relation of Chen &amp; Kipping (2017, ApJ 834, 17);
            the illustrative colours of giant planets follow the cloud classes of Sudarsky, Burrows &amp; Pinto (2000, ApJ 538,
            885).
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Imagery and shapes</h3>
      <Refs
        start={18}
        items={[
          <>
            <Ext href="https://www.solarsystemscope.com/textures/">Solar System Scope</Ext> (INOVE) surface and ring textures,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>.
          </>,
          <>NASA/JHUAPL/SwRI, New Horizons global colour mosaic of Pluto; unobserved southern latitudes filled procedurally.</>,
          <>
            <Ext href="https://astrogeology.usgs.gov/">USGS Astrogeology</Ext> global mosaics of 15 moons, Ceres and Vesta
            (Voyager, Galileo, Cassini, New Horizons, Dawn and Viking data: NASA/JPL-Caltech, SSI, DLR, JHUAPL/SwRI,
            UCLA/MPS/IDA, LPI; Mimas by T. Roatsch; Triton by P. Schenk; Phobos and Deimos by P. Stooke): public domain or no
            use constraints. Unimaged regions are a flat fill.
          </>,
          <>
            <Ext href="https://github.com/nasa/NASA-3D-Resources">NASA 3D Resources</Ext>: Voyager 2 maps of the five large
            Uranian moons, free and without copyright.
          </>,
          <>
            Shape models from the NASA PDS Small Bodies Node by R. Gaskell (Phobos), P. Thomas (Deimos, Hyperion), P. Stooke
            (Proteus, Halley) and S. Porter et al. (Arrokoth), and the DLR Dawn terrain model of Vesta: public.
          </>,
          <>
            Comet 67P: SHAP5 shape model by R. Gaskell, L. Jorda et al. (ESA/Rosetta/MPS for OSIRIS Team), licensed{' '}
            <Ext href="https://creativecommons.org/licenses/by-sa/3.0/igo/">CC BY-SA 3.0 IGO</Ext>; the simplified copy is under
            the same licence.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">The Milky Way and beyond (on the site ahead of the update that shows them)</h3>
      <Refs
        start={24}
        items={[
          <>
            NASA/Goddard Space Flight Center <Ext href="https://svs.gsfc.nasa.gov/4851">Scientific Visualization Studio</Ext>,
            Deep Star Maps 2020, Milky Way background layer (Gaia DR2: ESA/Gaia/DPAC), re-encoded: public domain.
          </>,
          <>
            A model of the Milky Way’s stars and dust, generated for Lightspeed from published parameters: GRAVITY Collaboration
            (2022), Bennett &amp; Bovy (2019), Bland-Hawthorn &amp; Gerhard (2016), Reid et al. (2019), Wegg &amp; Gerhard (2013),
            Wegg, Gerhard &amp; Portail (2015), Drimmel &amp; Spergel (2001) and Chen et al. (2019).
          </>,
          <>
            Star clusters: open clusters from Hunt &amp; Reffert (2023, 2024, A&amp;A; Gaia DR3), globular clusters from Vasiliev
            &amp; Baumgardt (2021, MNRAS 505, 5978) and Baumgardt &amp; Vasiliev (2021, MNRAS 505, 5957), all{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>, and the{' '}
            <Ext href="https://physics.mcmaster.ca/~harris/mwgc.dat">Harris catalogue</Ext> (1996, AJ 112, 1487; 2010 edition),
            supplied free of charge.
          </>,
          <>
            45 images of nebulae from ESA/Hubble, ESA/Webb, ESO and NSF NOIRLab,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>, modified for Lightspeed (resized, black
            level subtracted, edges faded; three cropped). The credit line of every image is listed in{' '}
            <Ext href={`${AUTHOR.repo}/blob/main/CREDITS.md#nebula-images`}>CREDITS.md</Ext>.
          </>,
          <>
            Galaxies: <Ext href="https://doi.org/10.3847/1538-4357/ac94d8">Cosmicflows-4</Ext> (Tully et al. 2023, ApJ 944, 94;
            CC BY 4.0) via CDS/VizieR, with the 2MASS Extended Source Catalog (“This publication makes use of data products from
            the Two Micron All Sky Survey, which is a joint project of the University of Massachusetts and the Infrared
            Processing and Analysis Center/California Institute of Technology, funded by the National Aeronautics and Space
            Administration and the National Science Foundation.”), and the{' '}
            <Ext href="https://github.com/apace7/local_volume_database">Local Volume Database</Ext> (Pace 2025, The Open Journal
            of Astrophysics 8, 142; CC0).
          </>,
          <>
            Cosmic microwave background: the{' '}
            <Ext href="https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html">WMAP 9-year ILC map</Ext>, NASA / WMAP
            Science Team: public domain.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Methods</h3>
      <Refs
        start={30}
        items={[
          <>
            Relativistic rendering: the rest-frame scene is rendered to a cube map and resampled per pixel by the aberration
            formula; point sources are transformed analytically. Colour: a blackbody at <i>D</i>·<i>T</i> for stars; surfaces use
            a reflectance basis under a 5,772 K spectrum shifted by <i>D</i>, with <i>I</i>′<sub>λ</sub> = <i>D</i>
            <sup className="sup">5</sup> <i>I</i>
            <sub>λ</sub>(<i>λD</i>).
          </>,
          <>C. Wyman, P.-P. Sloan, P. Shirley (2013), JCGT 2(2): analytic CIE 1931 colour-matching functions.</>,
          <>F. J. Ballesteros (2012), EPL 97, 34008: B−V to effective temperature.</>,
          <>H. Neckel, D. Labs (1994), Sol. Phys. 153, 91: solar limb darkening (approximated).</>,
          <>J. J. van Wijk, W. A. A. Nuij (2003), IEEE InfoVis: smooth and efficient zooming and panning (camera slews).</>,
          <>
            M. L. Finson, R. F. Probstein (1968), ApJ 154, 327: dust tails as syndynes; L. Biermann (1951), Z. Astrophys. 29,
            274: ion tails along the solar wind. Both in simplified form for the comet tails.
          </>,
          <>
            J. R. Taylor, An Introduction to Error Analysis, 2nd ed. (1997); P. R. Bevington, D. K. Robinson, Data Reduction and
            Error Analysis, 3rd ed. (2003): least-squares fits and uncertainties in the lab.
          </>,
          <>
            E. F. Taylor, J. A. Wheeler, Spacetime Physics, 2nd ed. (1992); W. Rindler, Relativity: Special, General, and
            Cosmological, 2nd ed. (2006).
          </>,
        ]}
      />
    </Chapter>
  );
}

function Limitations() {
  return (
    <Chapter id="limitations" title="Model limitations">
      <p>Lightspeed simplifies in the following ways. None of them affects what you see in flight, or the lab’s experiments as designed.</p>
      <ol className="doc-list-num">
        <li>Spacetime is flat: gravity bends neither trajectories nor light, and no gravitational time dilation is applied.</li>
        <li>Constant-speed trips start and stop instantaneously. The 1 g drive is the physically realisable profile.</li>
        <li>
          Stars move in straight lines (good for about a million years either side of 2000; they stand still beyond), with no
          interstellar dust; most double stars are one point, and the sizes of stars without a measured radius are estimates.
          The catalogue is complete to V ≈ 10 as seen from the Sun, so far from the Sun its stars thin out: that is the
          catalogue, not the Galaxy.
        </li>
        <li>
          Planets of other stars follow fixed Kepler orbits, so the tugs of their neighbours (transit-timing variations,
          precession) are left out, and so is the wobble they give their star. Most orbits’ orientation on the sky is not
          measured and is assumed; nobody has seen their surfaces, so their colours are illustrative. Each planet’s card says
          what is measured and what is assumed.
        </li>
        <li>Doppler colours of surfaces are approximate; stars are exact blackbodies. The cosmic microwave background is not modelled.</li>
        <li>Planets are lit without the 1/r² dimming of sunlight, and the relativistic view uses automatic exposure.</li>
        <li>The superluminal drive is fiction, provided for comparison; nothing measured during it has physical meaning.</li>
        <li>
          Moons, dwarf planets, comets and spacecraft are as good as their data: outside 1981–2199 the moons follow their mean
          orbits and the small bodies two-body orbits, both labelled; spacecraft do not exist before launch. Rotations nobody
          can predict (Hyperion, Halley, Nix), surfaces never mapped, Quaoar’s ring plane and the Adams arcs’ positions are
          illustrative, faint rings are drawn more visible than they are, and comet tails come from a simple physical model.
          Each body’s card says which.
        </li>
      </ol>
    </Chapter>
  );
}

function Software() {
  return (
    <Chapter id="software" title="Software and licences">
      <p>
        Built with React, three.js, React Three Fiber, postprocessing, zustand, KaTeX, Tailwind CSS and Vite. The typefaces are IBM
        Plex Sans, JetBrains Mono and Source Serif 4, all under the SIL Open Font Licence.
      </p>
      <p>
        The code is released under the MIT Licence, © {APP.year} {AUTHOR.name}. The star catalogue, maps, shape models and other data
        keep their own licences (the star and exoplanet files are for non-commercial use only, because of their Gaia DR3 values, and the star
        files are also CC BY-SA 4.0; the 67P shape model is CC BY-SA 3.0 IGO; the Solar System Scope textures and the nebula images are CC BY
        4.0), listed under <Ref page="about" to="sources">Sources and methods</Ref>.
      </p>
      <p>
        The source code is on GitHub at <Ext href={AUTHOR.repo}>{AUTHOR.repo.replace('https://', '')}</Ext>.
      </p>
      <p className="mono text-[12px] text-fg-3">
        Version {APP.version} · build {APP.build}
        {APP.date ? ` · ${APP.date}` : ''}
      </p>
    </Chapter>
  );
}

function Privacy() {
  return (
    <Chapter id="privacy" title="Privacy">
      <p>
        Lightspeed runs entirely in your browser. There are no accounts, cookies, advertising or analytics, and nothing you do is
        sent anywhere. Your preferences, and any readings and written answers from the lab, are kept in this browser’s local
        storage. The Notebook tab in the lab exports them and clears the readings; clearing this site’s data in your browser
        removes everything. The site is served as static files; the web host may keep ordinary request logs, but Lightspeed
        itself collects nothing.
      </p>
    </Chapter>
  );
}

export default function AboutDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">About</div>
        <h1 className="doc-mast-logo">
          <LogoMark size={52} className="text-fg" />
          Lightspeed
        </h1>
        <p>{APP.tagline}</p>
        <div className="doc-mast-meta mono">
          <span>Version {APP.version}</span>
          <span>by {AUTHOR.name}</span>
          <span>MIT Licence</span>
        </div>
      </header>
      <Overview />
      <Author />
      <Cite />
      <Sources />
      <Limitations />
      <Software />
      <Privacy />
    </>
  );
}
