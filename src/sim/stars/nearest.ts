/**
 * The catalogue star nearest the camera, as the last sweep of the catalogue found it (sim/stars/nearby.ts
 * writes it at the end of each sweep, about every nine frames; controls/roam.ts reads it for Roam's pace
 * and its readout). Its place is in world kilometres, moved to the sweep's date as the star field moves it,
 * so the reader measures the distance from wherever the camera is now.
 *
 * Why a module of its own, with no imports: the camera controller reads it, and the star loader's imports
 * reach the black holes and the gravity state, which import the controller.
 */
export const nearestStar = {
  /** Its index in the catalogue, or −1 before the full catalogue is in. */
  index: -1,
  /** Where it is, world km. */
  x: 0,
  y: 0,
  z: 0,
};
