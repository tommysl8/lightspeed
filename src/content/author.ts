/** Author credit shown on the About page, in the welcome screen and in citations. */
export const AUTHOR = {
  name: 'Tommy Liu',
  /** For citations: family name, given name. */
  citeName: 'Liu, Tommy',
  citeShort: 'Liu, T.',
  handle: 'tommysl8',
  github: 'https://github.com/tommysl8',
  email: 'tommysliu8@gmail.com',
  affiliation: 'Electrical and Computer Engineering, University of Illinois Urbana-Champaign',
  bio: [
    'Tommy Liu has been building and taking apart electronics since middle school. His work spans analog/digital IC design and signal processing, most recently a low-cost, high-precision digital oscilloscope that EDN named one of its 20 most-read articles of 2025.',
    'He is also drawn to the mathematics and physics underneath the hardware, having qualified for the USA Mathematical Olympiad and earned distinction in the USA Physics Olympiad. He is currently studying Electrical and Computer Engineering at the University of Illinois Urbana-Champaign.',
  ],
} as const;

export const APP = {
  name: 'Lightspeed',
  tagline: 'A virtual laboratory for special relativity',
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  build: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'local',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '',
  year: 2026,
} as const;
