// Per-class driving feel for the car the player sits in.
// The arcade sphere in js/kenney-vehicle.js and the Rapier chassis mass in
// js/drive.js both read this table. Sedan is the live baseline (muscle memory).
// Unknown models fall back to sedan. Looks, models, and traffic AI are untouched.

export const DEFAULT_HANDLING_CLASS = "sedan";

// Class order is only for docs and tests: sports is the quickest, heavy the
// slowest and heaviest. Every value is a named field on the class row.
export const HANDLING_CLASSES = [
  "sports",
  "police",
  "compact",
  "sedan",
  "suv",
  "van",
  "heavy",
];

// One row per class. SPEED 1.0 is the live drive force (cruise near 180).
// MASS 90 is the live Rapier chassis mass. BULKY selects the lower engine rumble.
export const HANDLING = {
  // Fast and snappy, with a fun slight drift that still hooks up.
  sports: {
    SPEED: 1.16,
    THROTTLE_BLEND: 4.0,
    BRAKE_BLEND: 4.4,
    REVERSE_BLEND: 1.4,
    SPOOL: 2.8,
    OVERRUN: 5.0,
    STEER_CRAWL: 3.6,
    STEER_FAST: 3.1,
    STEER_FOLLOW: 1.45,
    DRIFT_ON: 158,
    DRIFT_OFF: 130,
    GRIP_ALIGN: 16,
    SLIDE_ALIGN: 1.1,
    MASS: 76,
    BULKY: false,
  },
  // A little quicker than a sedan, with stronger brakes and a planted slide.
  police: {
    SPEED: 1.08,
    THROTTLE_BLEND: 3.5,
    BRAKE_BLEND: 4.6,
    REVERSE_BLEND: 1.25,
    SPOOL: 2.3,
    OVERRUN: 4.4,
    STEER_CRAWL: 3.35,
    STEER_FAST: 2.95,
    STEER_FOLLOW: 1.25,
    DRIFT_ON: 170,
    DRIFT_OFF: 142,
    GRIP_ALIGN: 18,
    SLIDE_ALIGN: 0.9,
    MASS: 94,
    BULKY: false,
  },
  // Lighter and a bit more nimble, a touch slower than a sedan.
  compact: {
    SPEED: 0.94,
    THROTTLE_BLEND: 3.4,
    BRAKE_BLEND: 4.1,
    REVERSE_BLEND: 1.25,
    SPOOL: 2.2,
    OVERRUN: 4.4,
    STEER_CRAWL: 3.4,
    STEER_FAST: 3.0,
    STEER_FOLLOW: 1.25,
    DRIFT_ON: 162,
    DRIFT_OFF: 134,
    GRIP_ALIGN: 17,
    SLIDE_ALIGN: 0.9,
    MASS: 80,
    BULKY: false,
  },
  // Live baseline. Keep these numbers unless Ted asks to retune the sedan.
  sedan: {
    SPEED: 1,
    THROTTLE_BLEND: 3.2,
    BRAKE_BLEND: 4.0,
    REVERSE_BLEND: 1.2,
    SPOOL: 2.0,
    OVERRUN: 4.2,
    STEER_CRAWL: 3.2,
    STEER_FAST: 2.8,
    STEER_FOLLOW: 1.15,
    DRIFT_ON: 166,
    DRIFT_OFF: 138,
    GRIP_ALIGN: 18,
    SLIDE_ALIGN: 0.8,
    MASS: 90,
    BULKY: false,
  },
  // Heavier and a little slower, stable, harder to break loose.
  suv: {
    SPEED: 0.94,
    THROTTLE_BLEND: 2.4,
    BRAKE_BLEND: 3.2,
    REVERSE_BLEND: 1.0,
    SPOOL: 1.5,
    OVERRUN: 2.4,
    STEER_CRAWL: 2.95,
    STEER_FAST: 2.55,
    STEER_FOLLOW: 0.95,
    DRIFT_ON: 178,
    DRIFT_OFF: 148,
    GRIP_ALIGN: 18,
    SLIDE_ALIGN: 0.7,
    MASS: 108,
    BULKY: true,
  },
  // Slower and heavier than an SUV, still quick enough to be fun.
  van: {
    SPEED: 0.90,
    THROTTLE_BLEND: 1.9,
    BRAKE_BLEND: 2.7,
    REVERSE_BLEND: 0.85,
    SPOOL: 1.25,
    OVERRUN: 1.7,
    STEER_CRAWL: 2.8,
    STEER_FAST: 2.45,
    STEER_FOLLOW: 0.88,
    DRIFT_ON: 185,
    DRIFT_OFF: 154,
    GRIP_ALIGN: 18,
    SLIDE_ALIGN: 0.65,
    MASS: 116,
    BULKY: true,
  },
  // Trucks and buses. Same spool and steering as the old bulky body, a little
  // slower on top, and the heaviest ram. Still gets up to a useful cruise.
  heavy: {
    SPEED: 0.86,
    THROTTLE_BLEND: 1.55,
    BRAKE_BLEND: 2.4,
    REVERSE_BLEND: 0.8,
    SPOOL: 1.05,
    OVERRUN: 1.35,
    STEER_CRAWL: 2.75,
    STEER_FAST: 2.4,
    STEER_FOLLOW: 0.85,
    DRIFT_ON: 200,
    DRIFT_OFF: 166,
    GRIP_ALIGN: 18,
    SLIDE_ALIGN: 0.6,
    MASS: 126,
    BULKY: true,
  },
};

// Every live roster name (js/cars.js) maps to a class. Name wins over file, so
// a pickup that reuses the truck file still drives like an SUV.
export const HANDLING_BY_NAME = {
  ambulance: "van",
  blue_sedan: "sedan",
  box_truck: "heavy",
  delivery_van: "van",
  fire_truck: "heavy",
  garbage_truck: "heavy",
  green_hatch: "sports",
  icecream_van: "van",
  junker: "sedan",
  limo: "suv",
  muscle_orange: "sports",
  pickup: "suv",
  pink_retro: "sports",
  police: "police",
  purple_lowrider: "sedan",
  red_coupe: "sports",
  school_bus: "heavy",
  supercar: "sports",
  swat_van: "van",
  taco_truck: "van",
  taxi: "sedan",
  kaykit_hatch: "compact",
  kaykit_sedan: "sedan",
  kaykit_wagon: "sedan",
  kaykit_taxi: "sedan",
  kaykit_police: "police",
  city_car: "sedan",
  city_car_2: "sedan",
  city_suv: "suv",
  city_pickup: "suv",
  city_sports: "sports",
  city_sports_2: "sports",
  city_police: "police",
  city_van: "van",
  city_bus: "heavy",
  pack_ambulance: "van",
  pack_city_bus: "heavy",
  pack_fire_truck: "heavy",
  pack_garbage_truck: "heavy",
  pack_police: "police",
  pack_post_van: "van",
  pack_road_service: "van",
  pack_school_bus: "heavy",
  pack_taxi: "sedan",
  pack_tow_truck: "heavy",
  pack_compact: "compact",
  pack_coupe: "sports",
  pack_hatchback: "compact",
  pack_minivan: "van",
  pack_offroad: "suv",
  pack_pickup: "suv",
  pack_sedan: "sedan",
  pack_sport: "sports",
  pack_suv: "suv",
  pack_wagon: "sedan",
  flatbed_delivery: "heavy",
  race_car: "sports",
  tractor: "heavy",
  shovel_tractor: "heavy",
};

// Used when only the Kenney / pack file name is known.
export const HANDLING_BY_FILE = {
  ambulance: "van",
  sedan: "sedan",
  truck: "heavy",
  delivery: "van",
  firetruck: "heavy",
  "garbage-truck": "heavy",
  "hatchback-sports": "sports",
  van: "van",
  "suv-luxury": "suv",
  "sedan-sports": "sports",
  police: "police",
  suv: "suv",
  taxi: "sedan",
  "kaykit-hatch": "compact",
  "kaykit-sedan": "sedan",
  "kaykit-wagon": "sedan",
  "kaykit-taxi": "sedan",
  "kaykit-police": "police",
  "citypack-car": "sedan",
  "citypack-car-2": "sedan",
  "citypack-suv": "suv",
  "citypack-pickup": "suv",
  "citypack-sports": "sports",
  "citypack-sports-2": "sports",
  "citypack-police": "police",
  "citypack-van": "van",
  "citypack-bus": "heavy",
  "pack-ambulance": "van",
  "pack-city-bus": "heavy",
  "pack-fire-truck": "heavy",
  "pack-garbage-truck": "heavy",
  "pack-police": "police",
  "pack-post-van": "van",
  "pack-road-service": "van",
  "pack-school-bus": "heavy",
  "pack-taxi": "sedan",
  "pack-tow-truck": "heavy",
  "pack-compact": "compact",
  "pack-coupe": "sports",
  "pack-hatchback": "compact",
  "pack-minivan": "van",
  "pack-offroad": "suv",
  "pack-pickup": "suv",
  "pack-sedan": "sedan",
  "pack-sport": "sports",
  "pack-suv": "suv",
  "pack-wagon": "sedan",
  "delivery-flat": "heavy",
  race: "sports",
  tractor: "heavy",
  "tractor-shovel": "heavy",
};

for (const name of HANDLING_CLASSES) {
  Object.freeze(HANDLING[name]);
}
Object.freeze(HANDLING);
Object.freeze(HANDLING_CLASSES);
Object.freeze(HANDLING_BY_NAME);
Object.freeze(HANDLING_BY_FILE);

function asClass(value) {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(HANDLING, value)) {
    return value;
  }
  return null;
}

// Resolve a class from a class name, a roster name, a file, or a car object.
// Unknown values fall back to sedan. A bare { bulky: true } is the heavy class,
// so older callers of createArcadeVehicle still work.
export function handlingClassFor(source) {
  if (source == null) return DEFAULT_HANDLING_CLASS;
  if (typeof source === "string") {
    return asClass(source)
      || HANDLING_BY_NAME[source]
      || HANDLING_BY_FILE[source]
      || DEFAULT_HANDLING_CLASS;
  }
  const explicit = asClass(source.handling);
  if (explicit) return explicit;
  if (source.name && HANDLING_BY_NAME[source.name]) return HANDLING_BY_NAME[source.name];
  if (source.file && HANDLING_BY_FILE[source.file]) return HANDLING_BY_FILE[source.file];
  if (source.bulky === true) return "heavy";
  return DEFAULT_HANDLING_CLASS;
}

export function handlingFor(source) {
  return HANDLING[handlingClassFor(source)];
}
