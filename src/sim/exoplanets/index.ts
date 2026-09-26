/**
 * Planets of other stars: the NASA Exoplanet Archive's 6,372 confirmed planets and eleven
 * featured systems built from their papers, as registry bodies on Kepler orbits about their
 * stars (docs/data/exoplanets.md, docs/bodies.md). The evaluator (kepler, sky, orbit, featured,
 * catalogue) is pure functions with no three.js.
 */
export * from './constants';
export * from './kepler';
export * from './sky';
export * from './orbit';
export * from './catalogue';
export * from './featured';
export * from './appearance';
export { orbitMuKm3S2, skyOrbitProvider, type SkyOrbitOptions } from './provider';
export {
  EXOPLANET_ARTICLE,
  FEATURED_HOSTS,
  KEPLER16_BARYCENTRE,
  NEW_FEATURED_HOSTS,
  NO_IMAGE_NOTE,
  PHASE_VALID_YEARS,
  catalogueHostId,
  cataloguePlanetId,
  cataloguePlanetRecord,
  featuredPlanetId,
  featuredRecords,
  featuredShown,
  hostRecordFromCatalogue,
  hostStarRecord,
  greekBayer,
  planetDisplayName,
  refUrl,
  shortCite,
  slug,
  spaceMotion,
} from './records';
export {
  FEATURED_ARCHIVE_HOSTS,
  RELEASE_HOST_PC,
  archiveHosts,
  catalogueStatus,
  ensureHost,
  exoplanetData,
  exoplanetsVersion,
  featuredBodyIds,
  featuredHostOfHost,
  featuredStatus,
  isNamedHost,
  hostBodyId,
  hostDistanceKm,
  hostOfCatalogueStar,
  loadExoplanetCatalogue,
  loadFeaturedExoplanets,
  planetBodyId,
  registerFeatured,
  setCatalogue,
  subscribeExoplanets,
  updateExoplanets,
  type ExoplanetStatus,
} from './load';
