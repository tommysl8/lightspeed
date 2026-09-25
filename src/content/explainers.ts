/**
 * Index of the reference sections (ids and titles only). The text, with its equations,
 * lives in reference.tsx and loads with the lab manual.
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
}

export const EXPLAINERS: ExplainerIndexEntry[] = [
  { id: 'light-time', title: 'Light-travel time' },
  { id: 'scale', title: 'The scale of the Solar System' },
  { id: 'lorentz', title: 'The Lorentz factor' },
  { id: 'time-dilation', title: 'Time dilation and the twin paradox' },
  { id: 'length-contraction', title: 'Length contraction' },
  { id: 'aberration', title: 'Aberration of light' },
  { id: 'doppler', title: 'Doppler shift and relativistic beaming' },
  { id: 'mass-limit', title: 'Why no massive body reaches c' },
  { id: 'ftl', title: 'Superluminal motion and causality' },
  { id: 'rocket', title: 'The relativistic rocket' },
];

export const explainerById = (id: ExplainerId): ExplainerIndexEntry => EXPLAINERS.find((e) => e.id === id)!;

/** Section number (§n) of a reference topic. */
export const sectionNo = (id: ExplainerId): number => EXPLAINERS.findIndex((e) => e.id === id) + 1;
