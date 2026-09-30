/**
 * Registration of the black holes besides Sagittarius A* (which the Galaxy's core registers with its stars):
 * the binaries and the lone lensing hole at the end of the synchronous registerStars (sim/stars/load.ts), M87*
 * at the end of registerCosmos (sim/cosmos/load.ts), so every test that registers the universe gets them. Their
 * ids are kept in a list of their own (the stars' tests count starIds()). Registering again replaces the
 * records in place.
 *
 * M87* is also given M87's anchor in the expanding universe (sim/cosmos/expansion.ts), so its light-time,
 * redshift and drawn place (with light-delayed positions on) are its galaxy's.
 *
 * Cost: once, when the stars' or the galaxies' data arrive; nothing per frame.
 *
 * Twins: ./records.ts (the records themselves); scripts/build-blackholes.mjs (the data).
 */
import { getBody, isBody, registerBodies, replaceBodies, type BodyId, type BodyRecord } from '../bodies';
import type { Stars3D } from '../stars/catalogue';
import { starStatus } from '../stars/load';
import { cosmosStatus } from '../cosmos/load';
import { cosmicSky, setExpansionMembers } from '../cosmos/expansion';
import { BLACK_HOLES, binaryHoleRecords, holeJson, isolatedHoleRecord, m87StarRecord } from './records';

/** Ids registered here, in their own list (not the stars'). */
const registered = new Set<BodyId>();
/** The catalogue the binaries were last registered with (a companion that is a catalogue star reads its card's note from it). */
let catalogue: Stars3D | null = null;

/** Register records, or replace them if they are registered already. */
function place(records: readonly BodyRecord[]): BodyId[] {
  const known = (r: BodyRecord) => isBody(r.id) || !!getBody(r.id);
  const replace = records.filter(known);
  const add = records.filter((r) => !known(r));
  registerBodies(add);
  if (replace.length) replaceBodies(replace);
  for (const r of records) registered.add(r.id);
  return records.map((r) => r.id);
}

/**
 * The binaries with a black hole (Gaia BH1–3, Cygnus X-1 and four X-ray binaries): barycentres, holes and
 * companions. Their ids (sim/stars/load.ts calls this at the end of registerStars, with the catalogue).
 */
export function registerBinaryHoles(stars: Stars3D | null = catalogue): BodyId[] {
  catalogue = stars;
  return place(binaryHoleRecords(BLACK_HOLES, stars));
}

/** The black hole with no companion (OGLE-2011-BLG-0462): its ids. */
export function registerIsolatedHoles(): BodyId[] {
  return place(BLACK_HOLES.holes.filter((h) => h.placement === 'isolated').map((h) => isolatedHoleRecord(h, BLACK_HOLES)));
}

/** M87* at the centre of M87, once the galaxies are registered (null while M87 is not). */
export function registerM87Star(): BodyId | null {
  const m87 = getBody('m87');
  const json = holeJson('m87-star');
  if (!m87 || !json) return null;
  const [id] = place([m87StarRecord(json, m87, BLACK_HOLES)]);
  // In the expanding universe it goes where its galaxy goes: M87's anchor (its cluster's).
  const anchor = cosmicSky.byId.get(m87.id)?.anchorKm;
  if (anchor) setExpansionMembers([{ id, anchorWorldKm: [anchor.x, anchor.y, anchor.z], home: false }]);
  return id;
}

/** Every id registered here so far (barycentres included). */
export const blackHoleIds = (): readonly BodyId[] => [...registered];

/**
 * For scene loading messages (scenes.ts SOURCES): 'ready' once registered; otherwise how the data it comes
 * with (the stars', or for M87* the galaxies') stand. Sgr A* comes with the Galaxy's core, at start-up.
 */
export function blackHoleStatus(id: BodyId): 'idle' | 'loading' | 'ready' | 'failed' {
  if (isBody(id)) return 'ready';
  const json = holeJson(id);
  if (!json) return 'idle';
  if (json.placement === 'galaxy-centre') return cosmosStatus();
  if (json.placement === 'sstars') return 'idle';
  return starStatus();
}
