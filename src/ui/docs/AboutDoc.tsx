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
  ['The real sky', 'Positions from published ephemerides for any instant from 1981 to 2199, among 8 920 catalogued stars.'],
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
        take. The numbers are always a click away, and the physics is explained as it happens. For students and teachers there
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
        welcome by email or on GitHub.
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
            propagated as a two-body orbit about the Solar System barycentre.
          </>,
          <>BIPM, The International System of Units, 9th ed. (2019); IAU 2012 B2, 2015 B2 and B3 resolutions.</>,
          <>
            NASA NSSDCA <Ext href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/">Planetary Fact Sheets</Ext>: radii, GM,
            rotation and orbital data.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Catalogues</h3>
      <Refs
        start={5}
        items={[
          <>
            D. Nash, <Ext href="https://codeberg.org/astronexus/hyg">HYG Database v4.4</Ext>, licensed{' '}
            <Ext href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Ext>: 8 920 stars to V = 6.5. The derived
            star files are CC BY-SA 4.0.
          </>,
          <>
            JPL <Ext href="https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html">Small-Body Database</Ext>: 31 930 asteroids, Trojans
            and trans-Neptunian objects, their orbits solved from Kepler’s equation on the GPU.
          </>,
          <>
            Gaia Collaboration (2023), Gaia DR3, A&amp;A 674, A1: Proxima Centauri parallax. Boyajian et al. (2012), ApJ 757,
            112: radius. Ségransan et al. (2003), A&amp;A 397, L5: temperature.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Imagery</h3>
      <Refs
        start={8}
        items={[
          <>
            <Ext href="https://www.solarsystemscope.com/textures/">Solar System Scope</Ext> (INOVE) surface and ring textures,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>.
          </>,
          <>NASA/JHUAPL/SwRI, New Horizons global colour mosaic of Pluto; unobserved southern latitudes filled procedurally.</>,
        ]}
      />
      <h3 className="doc-h3-plain">Methods</h3>
      <Refs
        start={10}
        items={[
          <>
            Relativistic rendering: the rest-frame scene is rendered to a cube map and resampled per pixel by the aberration
            formula; point sources are transformed analytically. Colour: a blackbody at <i>D</i>·<i>T</i> for stars; surfaces use
            a reflectance basis under a 5 772 K spectrum shifted by <i>D</i>, with <i>I</i>′<sub>λ</sub> = <i>D</i>
            <sup className="sup">5</sup> <i>I</i>
            <sub>λ</sub>(<i>λD</i>).
          </>,
          <>C. Wyman, P.-P. Sloan, P. Shirley (2013), JCGT 2(2): analytic CIE 1931 colour-matching functions.</>,
          <>F. J. Ballesteros (2012), EPL 97, 34008: B−V to effective temperature.</>,
          <>H. Neckel, D. Labs (1994), Sol. Phys. 153, 91: solar limb darkening (approximated).</>,
          <>J. J. van Wijk, W. A. A. Nuij (2003), IEEE InfoVis: smooth and efficient zooming and panning (camera slews).</>,
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
        <li>Stars are placed as seen from the Sun, without parallax, except Proxima Centauri.</li>
        <li>Doppler colours of surfaces are approximate; stars are exact blackbodies. The cosmic microwave background is not modelled.</li>
        <li>Planets are lit without the 1/r² dimming of sunlight, and the relativistic view uses automatic exposure.</li>
        <li>The superluminal drive is fiction, provided for comparison; nothing measured during it has physical meaning.</li>
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
        The code is released under the MIT Licence, © {APP.year} {AUTHOR.name}. The star catalogue and textures keep their own
        licences, listed under <Ref page="about" to="sources">Sources and methods</Ref>.
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
        storage. The Notebook tab under Physics exports them and clears the readings; clearing this site’s data in your browser
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
