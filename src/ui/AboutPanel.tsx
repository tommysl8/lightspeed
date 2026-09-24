import type { ReactNode } from 'react';
import { useUI } from '../state/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{title}</h3>
      <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-white/75">{children}</ul>
    </section>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="text-sky-200/90 underline decoration-sky-200/30 underline-offset-2 hover:text-white" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

export function AboutPanel() {
  const open = useUI((s) => s.aboutOpen);
  if (!open) return null;
  const close = () => useUI.setState({ aboutOpen: false });
  return (
    <div className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="glass max-h-[calc(100vh-2rem)] w-[760px] max-w-full overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="About Lightspeed"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(253,230,138,0.9)]" />
              <h2 className="text-[18px] font-semibold tracking-[0.18em] text-white">LIGHTSPEED</h2>
            </div>
            <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-white/70">
              A true-scale Solar System you can fly through at (and, as fiction, past) the speed of light. Positions come
              from real ephemerides for the current date, every distance is to scale, and the relativistic optics are
              computed from the equations, not faked.
            </p>
          </div>
          <button className="chip shrink-0" onClick={close}>
            Close
          </button>
        </div>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Section title="Data">
              <li>
                Planet, Moon and Pluto positions and rotation: <A href="https://github.com/cosinekitty/astronomy">Astronomy Engine</A> by
                Don Cross (MIT).
              </li>
              <li>
                Physical data: <A href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/">NASA Planetary Fact Sheets</A> (NSSDCA).
              </li>
              <li>
                Voyager 1: <A href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</A> state vectors (NASA/JPL-Caltech).
              </li>
              <li>
                Asteroids, Trojans and trans-Neptunian objects: <A href="https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html">JPL Small-Body Database</A>.
              </li>
              <li>
                Stars: <A href="https://codeberg.org/astronexus/hyg">HYG Database v4.4</A> by David Nash, licensed{' '}
                <A href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>. The star data files derived from it
                are CC BY-SA 4.0 too.
              </li>
              <li>
                Proxima Centauri: distance from Gaia DR3 (ESA/Gaia/DPAC); radius from Boyajian et al. (2012); temperature from Ségransan et al. (2003).
              </li>
              <li>Constants: SI (BIPM) and IAU 2012/2015 resolutions.</li>
            </Section>
            <Section title="Imagery">
              <li>
                Planet, Sun and ring textures: <A href="https://www.solarsystemscope.com/textures/">Solar System Scope</A> (INOVE), licensed{' '}
                <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>.
              </li>
              <li>
                Pluto: <A href="https://www.nasa.gov/image-article/pluto-global-color-map/">global colour mosaic</A>, NASA/JHUAPL/SwRI
                (New Horizons). The southern latitudes New Horizons never saw are filled procedurally.
              </li>
            </Section>
          </div>
          <div>
            <Section title="Science references">
              <li>CIE 1931 colour matching: analytic fit by Wyman, Sloan &amp; Shirley (JCGT, 2013).</li>
              <li>B−V to temperature: Ballesteros (EPL, 2012).</li>
              <li>Limb darkening coefficients: approximating Neckel &amp; Labs (1994).</li>
              <li>Camera flights: van Wijk &amp; Nuij, “Smooth and efficient zooming and panning” (2003).</li>
            </Section>
            <Section title="Software">
              <li>three.js, React Three Fiber, postprocessing (pmndrs), zustand, KaTeX, Tailwind CSS and Vite.</li>
              <li>Inter typeface by Rasmus Andersson (SIL Open Font License).</li>
            </Section>
            <Section title="Simplified on purpose">
              <li>Stars are drawn from the Sun’s viewpoint, without parallax, except Proxima Centauri.</li>
              <li>Constant-speed trips boost and stop instantly. The 1 g rocket is the realistic version.</li>
              <li>Doppler colours of planets and other surfaces are an approximation. Stars are exact blackbodies.</li>
              <li>
                Planets are lit as if your eyes adapt: sunlight’s 1/r² dimming isn’t applied (Neptune gets 1/900 of Earth’s
                sunlight). The relativistic view also uses automatic exposure.
              </li>
              <li>Gravity doesn’t bend trips. Ships fly straight lines in the Sun’s frame.</li>
            </Section>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-white/40">Code released under the MIT License.</p>
      </div>
    </div>
  );
}
