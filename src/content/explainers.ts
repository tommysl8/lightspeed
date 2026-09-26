/**
 * Index of the physics sections (ids, titles and a one-sentence plain-language summary).
 * The full text, with its equations, lives in reference.tsx and loads with the lab (its Reference tab).
 */
export type ExplainerId =
  | 'light-time'
  | 'scale'
  | 'lorentz'
  | 'time-dilation'
  | 'length-contraction'
  | 'aberration'
  | 'doppler'
  | 'mass-limit'
  | 'ftl'
  | 'rocket';

export interface ExplainerIndexEntry {
  id: ExplainerId;
  title: string;
  /** What is happening, in one plain sentence (shown in the margin note before the full section). */
  blurb: string;
}

export const EXPLAINERS: ExplainerIndexEntry[] = [
  {
    id: 'light-time',
    title: 'Light-travel time',
    blurb: 'Light takes minutes to hours to cross the Solar System, so everything you see is already in the past.',
  },
  {
    id: 'scale',
    title: 'The scale of the Solar System',
    blurb: 'Enlarged bodies are easier to find, but at true scale the planets are specks in an almost empty sky.',
  },
  {
    id: 'lorentz',
    title: 'The Lorentz factor',
    blurb: 'Past a tenth of the speed of light, one number, γ, starts to govern your clock, your ruler and the sky.',
  },
  {
    id: 'time-dilation',
    title: 'Time dilation and the twin paradox',
    blurb: 'Your clock on board runs slower than clocks left behind: you will arrive younger than the calendar says.',
  },
  {
    id: 'length-contraction',
    title: 'Length contraction',
    blurb: 'Measured from the ship, the distance still to cover has shrunk by the same factor γ.',
  },
  {
    id: 'aberration',
    title: 'Aberration of light',
    blurb: 'Your motion tilts incoming light, so the whole sky crowds towards the point you are heading for.',
  },
  {
    id: 'doppler',
    title: 'Doppler shift and relativistic beaming',
    blurb: 'Light from ahead is squeezed bluer and brighter; light from behind stretches redder and fades.',
  },
  {
    id: 'mass-limit',
    title: 'Why no massive body reaches c',
    blurb: 'Each extra nine in your speed costs far more energy than the last, and the speed of light stays out of reach.',
  },
  {
    id: 'ftl',
    title: 'Superluminal motion and causality',
    blurb: 'Faster than light is fiction here: some observers would see you arrive before you left.',
  },
  {
    id: 'rocket',
    title: 'The relativistic rocket',
    blurb: 'A ship that keeps pushing at one Earth gravity feels normal on board, yet nears the speed of light within a year.',
  },
];

export const explainerById = (id: ExplainerId): ExplainerIndexEntry => EXPLAINERS.find((e) => e.id === id)!;

/** Section number (§n) of a physics topic. */
export const sectionNo = (id: ExplainerId): number => EXPLAINERS.findIndex((e) => e.id === id) + 1;
