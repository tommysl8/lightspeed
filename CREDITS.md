# Credits and third-party licences

The Lightspeed source code is released under the [MIT Licence](LICENSE). The data files and images below are
not the author's work; they keep their own licences, which also apply to any copy you make of them.

| Files | Source | Licence |
| --- | --- | --- |
| `public/data/stars.bin`, `public/data/star-names.json` | Derived from the [HYG Database v4.4](https://codeberg.org/astronexus/hyg) by David Nash (astronexus) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). These derived files are released under the same licence. |
| `public/textures/2k_*.jpg`, `public/textures/2k_*.png` | [Solar System Scope](https://www.solarsystemscope.com/textures/) (INOVE) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/textures/pluto_nh_color.jpg` | [NASA/JHUAPL/SwRI](https://www.nasa.gov/image-article/pluto-global-color-map/), New Horizons global colour map | NASA media, public domain |
| `public/data/belts.bin` | Orbital elements from the [JPL Small-Body Database](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) | NASA/JPL-Caltech |

Other sources used by the code, but not redistributed as files:

- Planet, Moon and Pluto positions and rotation: [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don
  Cross (MIT), installed from npm.
- Voyager 1 state vectors: [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), NASA/JPL-Caltech.
- Physical data: [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/), US Government work.
- Proxima Centauri: Gaia DR3 (distance), Boyajian et al. 2012 (radius), Ségransan et al. 2003 (temperature).
- Colour science: the CIE 1931 fit by Wyman, Sloan and Shirley (2013); B−V to temperature by Ballesteros (2012).
- Typefaces: IBM Plex Sans (IBM), JetBrains Mono (JetBrains) and Source Serif 4 (Adobe), under the SIL Open Font
  Licence 1.1, installed from npm.

The scripts that build the data files are in `scripts/` (`npm run data:stars`, `npm run data:belts`). The raw
downloads they read are not redistributed.
