import type { ReactNode } from 'react';
import { useUI } from '../../state/ui';
import { Dialog } from '../kit';

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="text-fg underline decoration-fg-4 underline-offset-2 hover:decoration-accent" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

function Refs({ start, children }: { start: number; children: ReactNode[] }) {
  return (
    <ol className="m-0 list-none space-y-1.5 p-0">
      {children.map((c, i) => (
        <li key={i} className="grid grid-cols-[2.2em_1fr] text-[12px] leading-snug text-fg-2">
          <span className="mono text-fg-3">[{start + i}]</span>
          <span>{c}</span>
        </li>
      ))}
    </ol>
  );
}

export function AboutPanel() {
  const open = useUI((s) => s.aboutOpen);
  if (!open) return null;
  const close = () => useUI.setState({ aboutOpen: false });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-[900px] max-w-full">
        <Dialog title="Sources and methods" onClose={close} className="max-h-[calc(100vh-2rem)]">
          <div className="scroll p-4">
            <p className="max-w-[720px] font-serif text-[14px] leading-relaxed text-fg-2">
              Lightspeed simulates the Solar System at true scale for the current epoch and lets you move through it at a
              significant fraction of the speed of light. Positions come from published ephemerides, distances are not
              compressed, and the relativistic optics are computed from the transformation laws of special relativity.
            </p>
            <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
              <div>
                <h3 className="man-h">Ephemerides and constants</h3>
                <Refs start={1}>
                  {[
                    <>
                      D. Cross, <A href="https://github.com/cosinekitty/astronomy">Astronomy Engine</A> (MIT licence): planetary,
                      lunar and Pluto positions; IAU rotation models.
                    </>,
                    <>
                      JPL <A href="https://ssd.jpl.nasa.gov/horizons/">Horizons</A> (DE441): Voyager 1 barycentric state vectors,
                      propagated as a two-body orbit about the Solar System barycentre.
                    </>,
                    <>BIPM, The International System of Units, 9th ed. (2019); IAU 2012 B2, 2015 B2 and B3 resolutions.</>,
                    <>
                      NASA NSSDCA <A href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/">Planetary Fact Sheets</A>: radii,
                      GM, rotation and orbital data.
                    </>,
                  ]}
                </Refs>
                <h3 className="man-h">Catalogues</h3>
                <Refs start={5}>
                  {[
                    <>
                      D. Nash, <A href="https://codeberg.org/astronexus/hyg">HYG Database v4.4</A>, licensed{' '}
                      <A href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>: 8 920 stars to V = 6.5. Derived
                      star files are CC BY-SA 4.0.
                    </>,
                    <>
                      JPL <A href="https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html">Small-Body Database</A>: 31 930 asteroids,
                      Trojans and trans-Neptunian objects; orbits solved from Kepler’s equation on the GPU.
                    </>,
                    <>
                      Gaia Collaboration (2023), Gaia DR3, A&amp;A 674, A1: Proxima Centauri parallax. Boyajian et al. (2012), ApJ
                      757, 112: radius. Ségransan et al. (2003), A&amp;A 397, L5: temperature.
                    </>,
                  ]}
                </Refs>
                <h3 className="man-h">Imagery</h3>
                <Refs start={8}>
                  {[
                    <>
                      <A href="https://www.solarsystemscope.com/textures/">Solar System Scope</A> (INOVE) surface and ring
                      textures, <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>.
                    </>,
                    <>NASA/JHUAPL/SwRI, New Horizons global colour mosaic of Pluto; unobserved southern latitudes filled procedurally.</>,
                  ]}
                </Refs>
              </div>
              <div>
                <h3 className="man-h">Methods</h3>
                <Refs start={10}>
                  {[
                    <>
                      Relativistic rendering: the rest-frame scene is rendered to a cube map and resampled per pixel by the
                      aberration formula; point sources are transformed analytically. Colour: blackbody at D·T for stars;
                      surfaces use a reflectance basis under a 5772 K spectrum shifted by D, with I′<sub>λ</sub> = D<sup>5</sup> I<sub>λ</sub>(λD).
                    </>,
                    <>C. Wyman, P.-P. Sloan, P. Shirley (2013), JCGT 2(2): analytic CIE 1931 colour-matching functions.</>,
                    <>F. J. Ballesteros (2012), EPL 97, 34008: B−V to effective temperature.</>,
                    <>H. Neckel, D. Labs (1994), Sol. Phys. 153, 91: solar limb darkening (approximated).</>,
                    <>J. J. van Wijk, W. A. A. Nuij (2003), IEEE InfoVis: smooth and efficient zooming and panning (camera slews).</>,
                    <>
                      J. R. Taylor, An Introduction to Error Analysis, 2nd ed. (1997); P. R. Bevington, D. K. Robinson, Data
                      Reduction and Error Analysis, 3rd ed. (2003): least-squares fits and uncertainties in the lab manual.
                    </>,
                    <>
                      E. F. Taylor, J. A. Wheeler, Spacetime Physics, 2nd ed. (1992); W. Rindler, Relativity: Special, General,
                      and Cosmological, 2nd ed. (2006).
                    </>,
                  ]}
                </Refs>
                <h3 className="man-h">Model limitations</h3>
                <ol className="m-0 list-decimal space-y-1 pl-5 text-[12px] leading-snug text-fg-2 marker:text-fg-4">
                  <li>Flat spacetime: gravity neither bends trajectories nor light, and no gravitational time dilation is applied.</li>
                  <li>Constant-speed trips boost and stop instantaneously. The 1 g drive is the physically realisable profile.</li>
                  <li>Stars are placed as seen from the Sun, without parallax, except Proxima Centauri.</li>
                  <li>Doppler colours of surfaces are approximate; stars are exact blackbodies. The cosmic microwave background is not modelled.</li>
                  <li>Planets are lit without the 1/r² dimming of sunlight, and the relativistic view uses automatic exposure.</li>
                  <li>The superluminal drive is fiction, provided for comparison; no quantity measured during it has physical meaning.</li>
                </ol>
                <h3 className="man-h">Software</h3>
                <p className="text-[12px] leading-snug text-fg-2">
                  three.js, React Three Fiber, postprocessing, zustand, KaTeX, Tailwind CSS, Vite. Typefaces: IBM Plex Sans,
                  JetBrains Mono, Source Serif 4 (SIL Open Font Licence). Code released under the MIT Licence.
                </p>
              </div>
            </div>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
