/**
 * The shipped exoplanet files, decoded once per test run (Node's zlib through test/stars.ts).
 */
import { packCatalogue, type ExoplanetCatalogue, type ExoplanetCatalogueJson } from '../sim/exoplanets/catalogue';
import type { FeaturedFile } from '../sim/exoplanets/featured';
import { gunzipFile } from './stars';

let catalogueJson: ExoplanetCatalogueJson | undefined;
let catalogue: ExoplanetCatalogue | undefined;
let featured: FeaturedFile | undefined;

const text = (path: string): string => new TextDecoder().decode(gunzipFile(path));

/** public/data/exoplanets.json.gz as parsed (nulls and all). */
export const loadCatalogueJson = (): ExoplanetCatalogueJson => (catalogueJson ??= JSON.parse(text('public/data/exoplanets.json.gz')) as ExoplanetCatalogueJson);
/** The same, packed as the app keeps it (a fresh copy is cheap to make, but one is shared). */
export const loadExoplanetFile = (): ExoplanetCatalogue => (catalogue ??= packCatalogue(loadCatalogueJson()));
/** public/data/exoplanets-featured.json.gz. */
export const loadFeaturedFile = (): FeaturedFile => (featured ??= JSON.parse(text('public/data/exoplanets-featured.json.gz')) as FeaturedFile);
