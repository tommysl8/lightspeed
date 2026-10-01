/**
 * How long to wait before a failed download is tried again: 2 s, doubling with each failure in a row, at most a
 * minute, and never giving up for the session (the star files: sim/stars/extensionLoad.ts; the galaxy surveys:
 * sim/surveys/load.ts).
 */
export const retryAfterMs = (failures: number): number => Math.min(60_000, 1000 * 2 ** Math.max(1, failures));
