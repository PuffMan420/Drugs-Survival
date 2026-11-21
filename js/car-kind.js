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
  "delivery-flat",
  "tractor",
  "tractor-shovel",
]);

// City Pack and generic pack bodies that drive like the heavy Kenney cars.
const CITYPACK_BULKY = new Set([
  "citypack-suv",
  "citypack-pickup",
  "citypack-van",
  "citypack-bus",
  "pack-ambulance",
  "pack-city-bus",
  "pack-fire-truck",
  "pack-garbage-truck",
  "pack-post-van",
  "pack-road-service",
  "pack-school-bus",
  "pack-tow-truck",
  "pack-minivan",
  "pack-pickup",
  "pack-suv",
]);

export function isBulkyCar(car) {
  if (!car) return false;
  if (car.bulky === true) return true;
  if (car.file && (BULKY_FILES.has(car.file) || CITYPACK_BULKY.has(car.file))) return true;
  return false;
}
