// Kenney Car Kit files that are trucks, vans, and the other heavy bodies.
// Sprite names in js/cars.js that use one of these files count as bulky.
export const BULKY_FILES = new Set([
  "ambulance",
  "delivery",
  "firetruck",
  "garbage-truck",
  "suv",
  "truck",
  "van",
]);

// City Pack bodies that drive like the heavy Kenney cars.
const CITYPACK_BULKY = new Set([
  "citypack-suv",
  "citypack-pickup",
  "citypack-van",
  "citypack-bus",
]);

export function isBulkyCar(car) {
  if (!car) return false;
  if (car.bulky === true) return true;
  if (car.file && (BULKY_FILES.has(car.file) || CITYPACK_BULKY.has(car.file))) return true;
  return false;
}
