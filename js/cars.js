import {
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LoadingManager,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Uint32BufferAttribute,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  applyCarDamage,
  bulletHitCar,
  playBulletWorldHitSound,
  playCarExplodeSound,
  playCarSmokeSound,
  blastPeds,
  createCarDamageFx,
  initCarHealth,
  shouldCullWreck,
  wreckRgb,
} from "./car-damage.js";
import { isBulkyCar } from "./car-kind.js";
import {
  attachDoor,
  assignDoorFlags,
  bakeHinge,
  catalogName,
  closeCarDoor,
  doorIsOpen,
  doorPhase,
  doorSideFromHinge,
  hasSwingDoor,
  isDoorName,
  isInnerPanel,
  nearestCat,
  openCarDoor,
  readDoorClips,
  snapDoorShut,
  stepDoor,
} from "./car-door.js";
import { rockVertexColors } from "./bed-rocks.js";
import { foldHeadlightGeometry } from "./headlights.js";
import { pushOutOfCars } from "./car-push.js";
import { createSim, headingAngle, planCars, settleParked } from "./routes.js";
import { signalNow } from "./signals.js";

// Footprints in the same car units as the CARS list below.
export const CITYPACK_CAR_W = 37;
export const CITYPACK_CAR_H = 71;
export const CITYPACK_CAR2_W = 36;
export const CITYPACK_CAR2_H = 67;
export const CITYPACK_SUV_W = 40;
export const CITYPACK_SUV_H = 77;
export const CITYPACK_PICKUP_W = 36;
export const CITYPACK_PICKUP_H = 66;
export const CITYPACK_SPORTS_W = 35;
export const CITYPACK_SPORTS_H = 68;
export const CITYPACK_SPORTS2_W = 39;
export const CITYPACK_SPORTS2_H = 68;
export const CITYPACK_POLICE_W = 35;
export const CITYPACK_POLICE_H = 69;
export const CITYPACK_VAN_W = 40;
export const CITYPACK_VAN_H = 68;
export const CITYPACK_BUS_W = 41;
export const CITYPACK_BUS_H = 79;
// How far the front wheels can pivot, in radians.
export const CITYPACK_STEER_MAX = 0.55;
// Yaw rate (radians per second) times this becomes the wheel angle.
export const CITYPACK_STEER_GAIN = 0.35;
// Flip if the front wheels steer the wrong way.
export const CITYPACK_STEER_SIGN = -1;
// Flip if the wheels roll backwards.
export const CITYPACK_ROLL_SIGN = -1;

// Kenney Car Kit models (CC0), from https://kenney.nl/assets/car-kit.
// The old sprite names stay, so spawn weights and the rare set do not move.
// w and h are the cropped sprite sizes the routes and the push test already use.
// file is the Kenney Car Kit model that sits closest to that sprite.
const CARS = [
  { name: "ambulance", file: "ambulance", w: 38, h: 68 },
  { name: "blue_sedan", file: "sedan", w: 37, h: 71 },
  { name: "box_truck", file: "truck", w: 38, h: 70 },
  { name: "delivery_van", file: "delivery", w: 36, h: 68 },
  { name: "fire_truck", file: "firetruck", w: 41, h: 79 },
  { name: "garbage_truck", file: "garbage-truck", w: 38, h: 68 },
  { name: "green_hatch", file: "hatchback-sports", w: 35, h: 65 },
  { name: "icecream_van", file: "van", w: 40, h: 68 },
  { name: "junker", file: "sedan", w: 36, h: 67 },
  { name: "limo", file: "suv-luxury", w: 35, h: 79 },
  { name: "muscle_orange", file: "sedan-sports", w: 35, h: 68 },
  { name: "pickup", file: "truck", w: 36, h: 66 },
  { name: "pink_retro", file: "hatchback-sports", w: 37, h: 69 },
  { name: "police", file: "police", w: 35, h: 69 },
  { name: "purple_lowrider", file: "sedan", w: 33, h: 70 },
  { name: "red_coupe", file: "sedan-sports", w: 35, h: 68 },
  { name: "school_bus", file: "van", w: 37, h: 70 },
  { name: "supercar", file: "sedan-sports", w: 39, h: 68 },
  { name: "swat_van", file: "suv", w: 40, h: 77 },
  { name: "taco_truck", file: "delivery", w: 44, h: 70 },
  { name: "taxi", file: "taxi", w: 36, h: 69 },
  // KayKit props. Same footprints as the Kenney car they match. One model, no wear bakes.
  { name: "kaykit_hatch", file: "kaykit-hatch", w: 35, h: 65, url: "assets/buildings/kaykit/props/car_hatchback.glb" },
  { name: "kaykit_sedan", file: "kaykit-sedan", w: 37, h: 71, url: "assets/buildings/kaykit/props/car_sedan.glb" },
  { name: "kaykit_wagon", file: "kaykit-wagon", w: 37, h: 71, url: "assets/buildings/kaykit/props/car_stationwagon.glb" },
  { name: "kaykit_taxi", file: "kaykit-taxi", w: 36, h: 69, url: "assets/buildings/kaykit/props/car_taxi.glb" },
  { name: "kaykit_police", file: "kaykit-police", w: 35, h: 69, url: "assets/buildings/kaykit/props/car_police.glb" },
  // City Pack. Same footprints as the closest car already in the list.
  // rollWheels turns the separate wheel meshes. Van and bus have none.
  { name: "city_car", file: "citypack-car", w: CITYPACK_CAR_W, h: CITYPACK_CAR_H, rollWheels: true },
  { name: "city_car_2", file: "citypack-car-2", w: CITYPACK_CAR2_W, h: CITYPACK_CAR2_H, rollWheels: true },
  { name: "city_suv", file: "citypack-suv", w: CITYPACK_SUV_W, h: CITYPACK_SUV_H, rollWheels: true },
  { name: "city_pickup", file: "citypack-pickup", w: CITYPACK_PICKUP_W, h: CITYPACK_PICKUP_H, rollWheels: true },
  { name: "city_sports", file: "citypack-sports", w: CITYPACK_SPORTS_W, h: CITYPACK_SPORTS_H, rollWheels: true },
  { name: "city_sports_2", file: "citypack-sports-2", w: CITYPACK_SPORTS2_W, h: CITYPACK_SPORTS2_H, rollWheels: true },
  { name: "city_police", file: "citypack-police", w: CITYPACK_POLICE_W, h: CITYPACK_POLICE_H, rollWheels: true },
  { name: "city_van", file: "citypack-van", w: CITYPACK_VAN_W, h: CITYPACK_VAN_H },
  { name: "city_bus", file: "citypack-bus", w: CITYPACK_BUS_W, h: CITYPACK_BUS_H },
  // Generic service and passenger packs (tools/bake_pack_cars.py). Real proportions:
  // the pack sedan is as long as the Kenney sedan (71). lengthScale shrinks only the
  // length (1 = real length; about 0.5 puts a bus at the old 79 maximum).
  { name: "pack_ambulance", file: "pack-ambulance", w: 42, h: 113, lengthScale: 1 },
  { name: "pack_city_bus", file: "pack-city-bus", w: 41, h: 163, lengthScale: 1 },
  { name: "pack_fire_truck", file: "pack-fire-truck", w: 42, h: 136, lengthScale: 1 },
  { name: "pack_garbage_truck", file: "pack-garbage-truck", w: 43, h: 125, lengthScale: 1 },
  { name: "pack_police", file: "pack-police", w: 33, h: 85, lengthScale: 1 },
  { name: "pack_post_van", file: "pack-post-van", w: 35, h: 87, lengthScale: 1 },
  { name: "pack_road_service", file: "pack-road-service", w: 37, h: 87, lengthScale: 1 },
  { name: "pack_school_bus", file: "pack-school-bus", w: 42, h: 129, lengthScale: 1 },
  { name: "pack_taxi", file: "pack-taxi", w: 33, h: 83, lengthScale: 1 },
  { name: "pack_tow_truck", file: "pack-tow-truck", w: 39, h: 113, lengthScale: 1 },
  // Passenger pack footprints: keep each model's real width/length ratio
  // (uniform scale) but size them next to a Kenney sedan (37x71). The
  // raw meter sizes made the compact a toy (26x53) and the pickup a
  // long thin bar (34x84). Pickup is widened slightly off-ratio so it
  // does not look squashed beside the chunkier Kenney cars.
  { name: "pack_compact", file: "pack-compact", w: 34, h: 69, lengthScale: 1, rollWheels: true },
  { name: "pack_coupe", file: "pack-coupe", w: 34, h: 77, lengthScale: 1, rollWheels: true },
  { name: "pack_hatchback", file: "pack-hatchback", w: 34, h: 77, lengthScale: 1, rollWheels: true },
  { name: "pack_minivan", file: "pack-minivan", w: 34, h: 84, lengthScale: 1, rollWheels: true },
  { name: "pack_offroad", file: "pack-offroad", w: 36, h: 72, lengthScale: 1, rollWheels: true },
  { name: "pack_pickup", file: "pack-pickup", w: 38, h: 80, lengthScale: 1, rollWheels: true },
  { name: "pack_sedan", file: "pack-sedan", w: 36, h: 80, lengthScale: 1, rollWheels: true },
  { name: "pack_sport", file: "pack-sport", w: 34, h: 75, lengthScale: 1, rollWheels: true },
  { name: "pack_suv", file: "pack-suv", w: 37, h: 82, lengthScale: 1, rollWheels: true },
  { name: "pack_wagon", file: "pack-wagon", w: 36, h: 81, lengthScale: 1, rollWheels: true },
  // More Kenney Car Kit bodies. Same Kenney scale as the sedan above.
  { name: "flatbed_delivery", file: "delivery-flat", w: 42, h: 90, lengthScale: 1 },
  { name: "race_car", file: "race", w: 36, h: 71 },
  { name: "tractor", file: "tractor", w: 37, h: 61 },
  { name: "shovel_tractor", file: "tractor-shovel", w: 46, h: 69 },
];
for (const car of CARS) {
  if (car.lengthScale) car.h = Math.round(car.h * car.lengthScale);
}

const RARE = new Set([
  "police",
  "ambulance",
  "fire_truck",
  "city_police",
  "pack_ambulance",
  "pack_fire_truck",
  "pack_police",
  "race_car",
]);
// Job and service liveries stay on the colours baked into the weathered model.
const SERVICE = new Set([
  "ambulance",
  "box_truck",
  "delivery_van",
  "fire_truck",
  "garbage_truck",
  "icecream_van",
  "police",
  "city_police",
  "school_bus",
  "swat_van",
  "taco_truck",
  "taxi",
  "pack_ambulance",
  "pack_city_bus",
  "pack_fire_truck",
  "pack_garbage_truck",
  "pack_police",
  "pack_post_van",
  "pack_road_service",
  "pack_school_bus",
  "pack_taxi",
  "pack_tow_truck",
  "flatbed_delivery",
  "tractor",
  "shovel_tractor",
]);
// Sports and upscale bodies only have an L2 bake, with light dust.
// Every other file has L2 and L3.
const SPORTS = new Set(["hatchback-sports", "sedan-sports", "race", "pack-sport", "pack-coupe", "pack-suv"]);
// One baked PBR model, no colormap recolor and no L2/L3 wear bakes.
// KayKit cars and Vera's upgraded Kenney cars keep their own materials.
const PLAIN = new Set([
  "kaykit-hatch", "kaykit-sedan", "kaykit-wagon", "kaykit-taxi", "kaykit-police",
  "sedan", "hatchback-sports", "sedan-sports", "taxi", "police",
  "suv", "suv-luxury", "van", "delivery", "race",
  "truck", "delivery-flat", "ambulance", "firetruck", "garbage-truck",
  "tractor", "tractor-shovel",
]);
const BUCKET = 96;
// Tires sit just above the road.
const GROUND_Y = 0.6;
// The mesh is drawn 10% past the footprint w and h. Routes and the push test keep those.
const DRAW_SCALE = 1.1;
// colormap.png gradient columns, sampled at the old mid-body UV
// (row start + 0.058 + 0.5 * 0.184). Civilians swap the baked paint hue for one
// of these, then the roof-to-sill shade below still runs pale to bright.
// Jobs keep the baked hue and only get that shade.
// The three darkest charcoal swatches were lifted to medium slate/silver/blue-grey
// so pack cars stay readable from the top-down camera (byte luma >= 120).
const PALETTE_RGB = [
  [145, 181, 232],
  [121, 82, 202],
  [197, 119, 235],
  [148, 89, 65],
  [217, 154, 115],
  [247, 211, 170],
  [54, 159, 118],
  [255, 173, 67],
  [255, 131, 68],
  [226, 94, 73],
  [93, 110, 199],
  [203, 167, 147],
  [128, 132, 152],
  [168, 170, 180],
  [112, 114, 135],
  [124, 144, 172],
  [149, 156, 187],
  [214, 214, 229],
  [202, 118, 82],
  [227, 243, 255],
  [255, 210, 46],
  [226, 72, 62],
  [74, 102, 202],
  [74, 158, 141],
  [153, 139, 230],
  [220, 165, 62],
  [226, 126, 153],
];
const PALETTE = PALETTE_RGB.map(([r, g, b]) => new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace));
const WHITE = new Color(0xffffff);
// Mean luma of the old gradient tip versus its mid, and the dark end versus its mid.
const PAINT_DARK = 0.88;
const PAINT_PALE = 1.12;
// Original colormap cells, in the V-flipped space the weather bake classified.
// glTF v=0 is the top of the sheet; Blender's row is 3 - that row.
const CELL_GLASS = 1;
const CELL_HEAD = 3;
const CELL_TAIL = 5;
const CELL_SIREN = 7;
const CELL_TYRE = 5 + 16;
const CELL_TRIM = 7 + 16;
const CELL_SMALL = 13 + 16;

function isWheel(obj) {
  return obj.name.startsWith("wheel") || (obj.parent && obj.parent.name.startsWith("wheel"));
}

const wheelLocal = new Matrix4();
const wheelWorld = new Matrix4();
const wheelSpinM = new Matrix4();
const wheelSteerM = new Matrix4();
const wheelToAxle = new Matrix4();
const wheelFromAxle = new Matrix4();

const doorToHinge = new Matrix4();
const doorFromHinge = new Matrix4();
const doorSpin = new Matrix4();
const doorLocal = new Matrix4();
const doorWorldM = new Matrix4();

function doorMatrix(carMatrix, hinge, angle) {
  doorFromHinge.makeTranslation(-hinge[0], -hinge[1], -hinge[2]);
  doorSpin.makeRotationY(angle);
  doorToHinge.makeTranslation(hinge[0], hinge[1], hinge[2]);
  doorLocal.copy(doorFromHinge);
  doorLocal.premultiply(doorSpin);
  doorLocal.premultiply(doorToHinge);
  doorWorldM.multiplyMatrices(carMatrix, doorLocal);
  return doorWorldM;
}

function wheelMatrix(carMatrix, part, travel, steer, scaleY) {
  const radius = Math.max(0.05, part.radius * scaleY);
  const spin = CITYPACK_ROLL_SIGN * travel / radius;
  const yaw = part.front ? steer : 0;
  const ax = part.axle[0];
  const ay = part.axle[1];
  const az = part.axle[2];
  wheelFromAxle.makeTranslation(-ax, -ay, -az);
  wheelSpinM.makeRotationX(spin);
  wheelSteerM.makeRotationY(yaw);
  wheelToAxle.makeTranslation(ax, ay, az);
  wheelLocal.copy(wheelFromAxle);
  wheelLocal.premultiply(wheelSpinM);
  wheelLocal.premultiply(wheelSteerM);
  wheelLocal.premultiply(wheelToAxle);
  wheelWorld.multiplyMatrices(carMatrix, wheelLocal);
  return wheelWorld;
}

function trackRoll(car, model, dt) {
  if (!model || !model.rollWheels) return;
  const prevX = car.rollX;
  const prevZ = car.rollZ;
  car.rollX = car.x;
  car.rollZ = car.z;
  if (prevX == null) {
    car.rollTravel = 0;
    car.rollSteer = 0;
    car.rollAngle = car.angle || 0;
    return;
  }
  const dx = car.x - prevX;
  const dz = car.z - prevZ;
  const dist = Math.hypot(dx, dz);
  const fx = -Math.sin(car.angle || 0);
  const fz = -Math.cos(car.angle || 0);
  const signed = dist < 0.04 ? 0 : Math.sign(dx * fx + dz * fz) * dist;
  car.rollTravel = (car.rollTravel || 0) + signed;
  let delta = (car.angle || 0) - (car.rollAngle || 0);
  car.rollAngle = car.angle || 0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (dt > 0 && dist > 0.2) {
    const yaw = delta / dt;
    const steer = yaw * CITYPACK_STEER_GAIN * CITYPACK_STEER_SIGN;
    car.rollSteer = Math.max(-CITYPACK_STEER_MAX, Math.min(CITYPACK_STEER_MAX, steer));
  } else {
    car.rollSteer = 0;
  }
}

function colourIndex(salt) {
  let h = Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h >>> 0) % PALETTE.length;
}

function wearLevel(file, salt) {
  if (PLAIN.has(file) || SPORTS.has(file)) return 2;
  return ((salt | 0) & 1) === 0 ? 2 : 3;
}

function levelsFor(file) {
  if (PLAIN.has(file) || SPORTS.has(file)) return [2];
  return [2, 3];
}

function srgbToLinear(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function triangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(nx, ny, nz);
}

function triKey(position, i0, i1, i2) {
  const q = (index) => [
    Math.round(position.getX(index) * 1000),
    Math.round(position.getY(index) * 1000),
    Math.round(position.getZ(index) * 1000),
  ].join(",");
  const pts = [q(i0), q(i1), q(i2)];
  pts.sort();
  return pts.join("|");
}

function cornerIndex(index, tri, corner) {
  return index ? index.getX(tri * 3 + corner) : tri * 3 + corner;
}

function triCountOf(geometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  return index ? index.count / 3 : position.count / 3;
}

function worldGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  return geometry;
}

// Paint faces come from the original GLB's colormap UVs. The weathered file
// has a new unwrap, so each triangle is matched by its vertex positions.
function faceCatalog(scene, options = {}) {
  scene.updateMatrixWorld(true);
  const prepared = [];
  const wheelBoxes = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    if (isWheel(obj)) {
      const geometry = worldGeometry(obj);
      geometry.computeBoundingBox();
      if (geometry.boundingBox) wheelBoxes.push(geometry.boundingBox.clone());
      geometry.dispose();
      return;
    }
    prepared.push({ name: catalogName(obj), geometry: worldGeometry(obj) });
  });
  let zMin = Infinity;
  let zMax = -Infinity;
  const area = new Map();
  for (const part of prepared) {
    const { geometry } = part;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const z0 = position.getZ(i0);
      const z1 = position.getZ(i1);
      const z2 = position.getZ(i2);
      if (z0 < zMin) zMin = z0;
      if (z1 < zMin) zMin = z1;
      if (z2 < zMin) zMin = z2;
      if (z0 > zMax) zMax = z0;
      if (z1 > zMax) zMax = z1;
      if (z2 > zMax) zMax = z2;
      const col = Math.min(15, Math.max(0, Math.floor(((uv.getX(i0) % 1) + 1) % 1 * 16)));
      const rawRow = Math.min(3, Math.max(0, Math.floor(((uv.getY(i0) % 1) + 1) % 1 * 4)));
      const cell = col + (3 - rawRow) * 16;
      const size = triangleArea(
        position.getX(i0), position.getY(i0), z0,
        position.getX(i1), position.getY(i1), z1,
        position.getX(i2), position.getY(i2), z2,
      );
      area.set(cell, (area.get(cell) || 0) + size);
    }
  }
  const catalog = new Map();
  for (const part of prepared) {
    const { geometry } = part;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const keys = new Map();
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const col = Math.min(15, Math.max(0, Math.floor(((uv.getX(i0) % 1) + 1) % 1 * 16)));
      const rawRow = Math.min(3, Math.max(0, Math.floor(((uv.getY(i0) % 1) + 1) % 1 * 4)));
      const cell = col + (3 - rawRow) * 16;
      let cat = 0;
      if (cell === CELL_GLASS) cat = 1;
      else if (cell === CELL_HEAD) cat = 2;
      else if (cell === CELL_TAIL) {
        const cz = (position.getZ(i0) + position.getZ(i1) + position.getZ(i2)) / 3;
        // Pack bakes used the tail colormap cell for both lamps. Tag the
        // front ones as headlights so they fold over the nose. Kenney cars
        // already use CELL_HEAD; this flag stays off for them.
        cat = options.foldFrontTails && Math.abs(cz - zMax) < Math.abs(cz - zMin) ? 2 : 3;
      }
      else if (cell === CELL_SIREN) cat = 7;
      else if (cell === CELL_TYRE) cat = 6;
      else if (cell === CELL_TRIM) cat = 5;
      else if (cell === CELL_SMALL && (area.get(cell) || 0) < 1) cat = 5;
      if (cat === 5) {
        let maxAbsX = 0;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const indexOf of [i0, i1, i2]) {
          const x = position.getX(indexOf);
          maxAbsX = Math.max(maxAbsX, Math.abs(x));
          sx += x;
          sy += position.getY(indexOf);
          sz += position.getZ(indexOf);
        }
        const nearEnd = Math.abs(sz / 3 - zMin) < 0.08 || Math.abs(sz / 3 - zMax) < 0.08;
        if (maxAbsX < 0.22 && nearEnd && sy / 3 < 0.5) cat = 4;
      }
      keys.set(triKey(position, i0, i1, i2), cat);
    }
    const existing = catalog.get(part.name);
    if (existing) {
      for (const [key, cat] of keys) existing.set(key, cat);
    } else {
      catalog.set(part.name, keys);
    }
  }
  maskRearSpare(prepared, catalog, zMin, zMax, wheelBoxes);
  for (const part of prepared) part.geometry.dispose();
  return catalog;
}


// A spare tyre baked into the body (pack_offroad) is not a wheel-* mesh, so
// the paint mask treats it as body and the respray tints it. Find a rear,
// mid-X disk with a tyre wall (radial faces) about the same size as the
// rolling wheels, and keep those triangles unpainted (cat 6).
function maskRearSpare(prepared, catalog, zMin, zMax, wheelBoxes) {
  if (!wheelBoxes.length) return;
  const radii = wheelBoxes.map((box) => 0.5 * Math.max(box.max.y - box.min.y, box.max.z - box.min.z));
  radii.sort((a, b) => a - b);
  const wr = radii[Math.floor(radii.length / 2)];
  if (wr < 0.05) return;
  let axleY = 0;
  for (const box of wheelBoxes) axleY += (box.min.y + box.max.y) / 2;
  axleY /= wheelBoxes.length;
  const zCut = zMin + wr * 1.8;
  const faces = [];
  for (const part of prepared) {
    const keys = catalog.get(part.name);
    if (!keys) continue;
    const { geometry } = part;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const key = triKey(position, i0, i1, i2);
      const cat = keys.get(key);
      if (cat !== 0 && cat !== 5) continue;
      const ax = position.getX(i0);
      const ay = position.getY(i0);
      const az = position.getZ(i0);
      const bx = position.getX(i1);
      const by = position.getY(i1);
      const bz = position.getZ(i1);
      const cx = position.getX(i2);
      const cy = position.getY(i2);
      const cz = position.getZ(i2);
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-10) continue;
      const area = 0.5 * len;
      faces.push({
        key,
        keys,
        cat,
        x: (ax + bx + cx) / 3,
        y: (ay + by + cy) / 3,
        z: (az + bz + cz) / 3,
        nx: nx / len,
        ny: ny / len,
        nz: nz / len,
        area,
      });
    }
  }
  const paint = faces.filter((face) => (
    face.cat === 0 && face.z <= zCut && Math.abs(face.nz) >= 0.5 && Math.abs(face.x) <= wr * 1.25
  ));
  if (paint.length < 12) return;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zLo = Infinity;
  let zHi = -Infinity;
  for (const face of paint) {
    if (face.y < yMin) yMin = face.y;
    if (face.y > yMax) yMax = face.y;
    if (face.z < zLo) zLo = face.z;
    if (face.z > zHi) zHi = face.z;
  }
  const expect = Math.PI * wr * wr;
  let best = null;
  for (let iy = 0; iy < 10; iy += 1) {
    const cy = yMin + (yMax - yMin) * (iy + 0.5) / 10;
    for (let iz = 0; iz < 8; iz += 1) {
      const cz = zLo + (zHi - zLo) * (iz + 0.5) / 8;
      let n = 0;
      let area = 0;
      let rMax = 0;
      let rSum = 0;
      for (const face of paint) {
        const radial = Math.hypot(face.x, face.y - cy);
        if (radial > wr * 1.08 || Math.abs(face.z - cz) > wr * 0.35) continue;
        n += 1;
        area += face.area;
        rSum += radial;
        if (radial > rMax) rMax = radial;
      }
      if (n < 12) continue;
      if (rMax < wr * 0.55 || rMax > wr * 1.15) continue;
      if (area < expect * 0.15 || area > expect * 1.6) continue;
      const rMean = rSum / n;
      if (rMean < wr * 0.25) continue;
      const score = area * (1 - Math.abs(rMax - wr) / wr);
      if (!best || score > best.score) best = { score, cy, cz, n, area, rMax };
    }
  }
  if (!best) return;
  if (best.cy < axleY + wr * 0.7) return;
  let treadN = 0;
  let treadArea = 0;
  for (const face of faces) {
    const dx = face.x;
    const dy = face.y - best.cy;
    const radial = Math.hypot(dx, dy);
    if (Math.abs(radial - wr) > wr * 0.35) continue;
    if (Math.abs(face.z - best.cz) > wr * 0.7) continue;
    const nxy = Math.hypot(face.nx, face.ny);
    if (nxy < 0.55 || radial < 1e-6) continue;
    const align = (face.nx * dx + face.ny * dy) / (nxy * radial);
    if (align > 0.4) {
      treadN += 1;
      treadArea += face.area;
    }
  }
  if (treadN < 40 && treadArea < 0.5) return;
  const marked = [];
  for (const face of paint) {
    const radial = Math.hypot(face.x, face.y - best.cy);
    if (radial > wr * 1.08 || Math.abs(face.z - best.cz) > wr * 0.35) continue;
    marked.push(face);
  }
  // Also keep the tyre wall (radial faces) unpainted.
  for (const face of faces) {
    if (face.cat !== 0) continue;
    const dx = face.x;
    const dy = face.y - best.cy;
    const radial = Math.hypot(dx, dy);
    if (Math.abs(radial - wr) > wr * 0.35) continue;
    if (Math.abs(face.z - best.cz) > wr * 0.7) continue;
    const nxy = Math.hypot(face.nx, face.ny);
    if (nxy < 0.55) continue;
    marked.push(face);
  }
  for (const face of marked) face.keys.set(face.key, 6);
}

function applyPaintMask(geometry, keys, label, samples) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const count = position.count;
  const blocked = new Uint8Array(count);
  const marked = new Uint8Array(count);
  const tris = triCountOf(geometry);
  let misses = 0;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = cornerIndex(index, tri, 0);
    const i1 = cornerIndex(index, tri, 1);
    const i2 = cornerIndex(index, tri, 2);
    let cat = keys ? keys.get(triKey(position, i0, i1, i2)) : undefined;
    if (cat == null && samples) {
      cat = nearestCat(triCentroid(position, i0, i1, i2), samples);
    }
    const paintTri = cat === 0;
    if (cat == null) misses += 1;
    for (const indexOf of [i0, i1, i2]) {
      if (paintTri) marked[indexOf] = 1;
      else blocked[indexOf] = 1;
    }
  }
  if (misses > 0) console.warn(`Car paint mask missed ${misses} triangles on ${label}`);
  const paint = new Float32Array(count);
  let any = false;
  for (let i = 0; i < count; i += 1) {
    if (marked[i] && !blocked[i]) {
      paint[i] = 1;
      any = true;
    }
  }
  if (any) geometry.setAttribute("aPaint", new Float32BufferAttribute(paint, 1));
  return any;
}

function averagePaintLuma(material, geometry) {
  const texture = material && material.map;
  const image = texture && texture.image;
  if (!image || !image.width || !image.height) return 0.2;
  const width = image.width;
  const height = image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const uv = geometry.getAttribute("uv");
  const paint = geometry.getAttribute("aPaint");
  const index = geometry.getIndex();
  const tris = triCountOf(geometry);
  let sum = 0;
  let n = 0;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = cornerIndex(index, tri, 0);
    const i1 = cornerIndex(index, tri, 1);
    const i2 = cornerIndex(index, tri, 2);
    if (paint.getX(i0) < 0.5 || paint.getX(i1) < 0.5 || paint.getX(i2) < 0.5) continue;
    const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3;
    const v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
    const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * height)));
    const pixel = (y * width + x) * 4;
    const luma = srgbToLinear(pixels[pixel]) * 0.2126
      + srgbToLinear(pixels[pixel + 1]) * 0.7152
      + srgbToLinear(pixels[pixel + 2]) * 0.0722;
    sum += luma;
    n += 1;
  }
  return n > 0 ? sum / n : 0.2;
}

// One material per baked mesh. Instances share it. The hue lives on instanceColor
// and aRecolor, so a different tint does not clone the material or its textures.
function installPaintShader(material, baseLum) {
  if (!material || !material.isMeshStandardMaterial || material.userData.paintShader) return;
  material.userData.paintShader = true;
  material.toneMapped = false;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    MeshStandardMaterial.prototype.onBeforeCompile.call(this, shader, renderer);
    shader.uniforms.uPaintBase = { value: baseLum };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <uv_pars_vertex>",
        `#include <uv_pars_vertex>
        attribute float aPaint;
        attribute float aPaintT;
        attribute float aRecolor;
        attribute float aLamp;
        varying float vPaint;
        varying float vPaintT;
        varying float vRecolor;
        varying float vLamp;
        varying vec3 vTint;`,
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        vPaint = aPaint;
        vPaintT = aPaintT;
        vRecolor = aRecolor;
        vLamp = aLamp;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3(1.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <uv_pars_fragment>",
        `#include <uv_pars_fragment>
        varying float vPaint;
        varying float vPaintT;
        varying float vRecolor;
        varying float vLamp;
        varying vec3 vTint;
        uniform float uPaintBase;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float carShade = mix(${PAINT_DARK.toFixed(2)}, ${PAINT_PALE.toFixed(2)}, clamp(vPaintT, 0.0, 1.0));
        float carLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float carWear = carLum / max(uPaintBase, 0.045);
        vec3 carRespray = vTint * carWear * carShade;
        vec3 carKept = diffuseColor.rgb * carShade;
        vec3 carPainted = mix(carKept, carRespray, clamp(vRecolor, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, carPainted, step(0.5, vPaint));
        // Pack headlamps: force a Kenney-like white so the nose quads show
        // up in the top-down camera even on dusty weathered textures.
        vec3 lampWhite = vec3(0.97, 0.96, 0.90);
        diffuseColor.rgb = mix(diffuseColor.rgb, lampWhite, step(0.5, vLamp));`,
      );
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    const prior = MeshStandardMaterial.prototype.customProgramCacheKey.call(this);
    return `${prior}|car-paint-2`;
  };
}

// Rocks in the truck bed share one grey sheet. A vertex colour per lump
// darkens that sheet, and each lump gets a different grey. The body is a
// different mesh, so its paint stays put.
function shadeBedRocks(geometry, material) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index || !position || !material) return;
  const packed = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    packed[i * 3] = position.getX(i);
    packed[i * 3 + 1] = position.getY(i);
    packed[i * 3 + 2] = position.getZ(i);
  }
  geometry.setAttribute(
    "color",
    new Float32BufferAttribute(rockVertexColors(packed, index.array), 3),
  );
  material.vertexColors = true;
}


function triCentroid(position, i0, i1, i2) {
  return {
    x: (position.getX(i0) + position.getX(i1) + position.getX(i2)) / 3,
    y: (position.getY(i0) + position.getY(i1) + position.getY(i2)) / 3,
    z: (position.getZ(i0) + position.getZ(i1) + position.getZ(i2)) / 3,
  };
}

function mergeKeyMaps(...maps) {
  const out = new Map();
  for (const map of maps) {
    if (!map) continue;
    for (const [key, cat] of map) out.set(key, cat);
  }
  return out;
}

function paintKeysFor(catalog, name, doorRig) {
  if (!catalog) return null;
  if (doorRig && (name === "body" || isDoorName(name))) {
    return mergeKeyMaps(catalog.get("body"), catalog.get(doorRig.nodeName), catalog.get(name));
  }
  return catalog.get(name) || null;
}

function triangleList(geometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const tris = triCountOf(geometry);
  const keys = [];
  const centroids = [];
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = cornerIndex(index, tri, 0);
    const i1 = cornerIndex(index, tri, 1);
    const i2 = cornerIndex(index, tri, 2);
    keys.push(triKey(position, i0, i1, i2));
    centroids.push(triCentroid(position, i0, i1, i2));
  }
  return { keys, centroids };
}

function extractTris(geometry, flags, keepDoor) {
  const index = geometry.getIndex();
  const kept = [];
  for (let tri = 0; tri < flags.length; tri += 1) {
    if (Boolean(flags[tri]) !== keepDoor) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      kept.push(index ? index.getX(tri * 3 + corner) : tri * 3 + corner);
    }
  }
  if (kept.length === 0) return null;
  const slice = geometry.clone();
  slice.setIndex(kept);
  slice.clearGroups();
  return slice;
}

function collectDoorRig(scene, gltf, catalog) {
  scene.updateMatrixWorld(true);
  let doorNode = null;
  scene.traverse((obj) => {
    if (obj.name === "Door_FL") doorNode = obj;
  });
  if (!doorNode) return null;
  const e = doorNode.matrixWorld.elements;
  const hinge = { x: e[12], y: e[13], z: e[14] };
  const clips = readDoorClips(gltf);
  const doorKeys = catalog.get("Door_FL") || new Map();
  const bodyKeys = catalog.get("body") || new Map();
  const doorCentroids = [];
  const bodyCentroids = [];
  const samples = [];
  const innerGeoms = [];
  let innerMaterial = null;
  scene.traverse((obj) => {
    if (!obj.isMesh || isWheel(obj)) return;
    const geometry = worldGeometry(obj);
    const name = catalogName(obj);
    const keys = catalog.get(name);
    const { centroids } = triangleList(geometry);
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const sample = { ...centroids[tri], cat: keys ? keys.get(triKey(position, i0, i1, i2)) : undefined };
      samples.push(sample);
      if (isDoorName(name)) doorCentroids.push(centroids[tri]);
      else if (name === "body") bodyCentroids.push(centroids[tri]);
    }
    if (isInnerPanel(obj)) {
      innerGeoms.push(geometry);
      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (material && !innerMaterial) {
        innerMaterial = material.clone();
        innerMaterial.toneMapped = false;
        innerMaterial.side = material.side;
      }
    } else {
      geometry.dispose();
    }
  });
  return {
    nodeName: "Door_FL",
    hinge,
    doorKeys,
    bodyKeys,
    doorCentroids,
    bodyCentroids,
    samples,
    innerGeoms,
    innerMaterial,
    ...clips,
  };
}

function splitDoorParts(parts, doorRig) {
  // bakeLevel clears `parts` and copies this result back in, so early
  // returns must be a new array, not the same one.
  if (!doorRig) return parts.slice();
  if (parts.some((part) => part.door)) return parts.slice();
  const next = [];
  for (const part of parts) {
    if (part.wheel) {
      next.push(part);
      continue;
    }
    const list = triangleList(part.geometry);
    const flags = assignDoorFlags(
      list.keys,
      list.centroids,
      doorRig.doorKeys,
      doorRig.bodyKeys,
      doorRig.doorCentroids,
      doorRig.bodyCentroids,
    );
    const doorCount = flags.reduce((sum, flag) => sum + (flag ? 1 : 0), 0);
    if (doorCount === 0) {
      next.push(part);
      continue;
    }
    const bodyGeom = extractTris(part.geometry, flags, false);
    const doorGeom = extractTris(part.geometry, flags, true);
    part.geometry.dispose();
    if (bodyGeom) next.push({ ...part, geometry: bodyGeom, door: false });
    if (doorGeom) next.push({ ...part, name: doorRig.nodeName, geometry: doorGeom, door: true });
  }
  for (const geometry of doorRig.innerGeoms) {
    next.push({
      name: "DoorInner",
      geometry: geometry.clone(),
      material: doorRig.innerMaterial,
      paintable: false,
      wheel: false,
      front: false,
      door: false,
    });
  }
  return next;
}

function bakeDoorParts(parts, doorRig, cx, minY, cz) {
  if (!doorRig) return null;
  const hinge = bakeHinge(doorRig.hinge, cx, minY, cz);
  for (const part of parts) {
    if (part.door) part.hinge = [hinge.x, hinge.y, hinge.z];
  }
  return {
    hinge,
    side: doorSideFromHinge(hinge),
    openAngle: doorRig.openAngle,
    openTime: doorRig.openTime,
    closeTime: doorRig.closeTime,
  };
}

function bakeLevel(scene, catalog, doorRig = null, bakeOpts = {}) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geometry = worldGeometry(obj);
    const wheel = isWheel(obj);
    const name = catalogName(obj);
    const paintable = Boolean(catalog) && !wheel && applyPaintMask(
      geometry,
      paintKeysFor(catalog, name, doorRig),
      name,
      doorRig && doorRig.samples,
    );
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (material) {
      material.toneMapped = false;
      // worldGeometry() keeps only position/normal/uv, so COLOR_0 is dropped.
      // City Pack weathered bodies still ship COLOR_0, and GLTFLoader leaves
      // vertexColors=true. A missing color attribute reads as (0,0,0) and the
      // body renders pitch black regardless of palette or instanceColor.
      if (material.vertexColors && !geometry.getAttribute("color")) {
        material.vertexColors = false;
      }
    }
    // Only the old colormap trash mesh needs the 8-rock grey tint.
    if (catalog && obj.name === "trash") shadeBedRocks(geometry, material);
    if (paintable) installPaintShader(material, averagePaintLuma(material, geometry));
    parts.push({
      name,
      geometry,
      material,
      paintable,
      wheel,
      front: wheel && name.startsWith("wheel-front"),
      door: isDoorName(name),
    });
  });
  const split = splitDoorParts(parts, doorRig);
  parts.length = 0;
  parts.push(...split);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (box.min.x < minX) minX = box.min.x;
    if (box.max.x > maxX) maxX = box.max.x;
    if (box.min.y < minY) minY = box.min.y;
    if (box.min.z < minZ) minZ = box.min.z;
    if (box.max.z > maxZ) maxZ = box.max.z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  // Measured before the headlight fold so a lamp that reaches the nose
  // corner cannot change how big the car is drawn.
  const width = Math.max(0.001, maxX - minX);
  const length = Math.max(0.001, maxZ - minZ);
  for (const part of parts) {
    foldBakedHeadlights(part.geometry, catalog && catalog.get(part.name), bakeOpts);
    if (part.paintable && !part.geometry.getAttribute("aLamp")) {
      const count = part.geometry.getAttribute("position").count;
      part.geometry.setAttribute("aLamp", new Float32BufferAttribute(new Float32Array(count), 1));
    }
    part.geometry.translate(-cx, -minY, -cz);
    // Kenney cars face +Z. A heading of 0 drives toward -Z, same as the sprites.
    part.geometry.rotateY(Math.PI);
  }
  if (bakeOpts.seatAtSilhouette || bakeOpts.housingInPlace) {
    const extras = [];
    for (const part of parts) {
      if (!part.paintable) continue;
      const lampGeom = extractHeadlamps(part.geometry);
      if (!lampGeom) continue;
      const material = new MeshStandardMaterial({
        color: 0xf8f6e6,
        emissive: 0xf8f6e6,
        emissiveIntensity: 0.55,
        roughness: 0.35,
        metalness: 0,
        toneMapped: false,
      });
      extras.push({
        name: "headlamps",
        geometry: lampGeom,
        material,
        paintable: false,
        wheel: false,
        front: false,
        door: false,
      });
    }
    parts.push(...extras);
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const part of parts) {
    if (!part.paintable) continue;
    const position = part.geometry.getAttribute("position");
    const paint = part.geometry.getAttribute("aPaint");
    for (let i = 0; i < paint.count; i += 1) {
      if (paint.getX(i) < 0.5) continue;
      const y = position.getY(i);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  const span = Math.max(0.001, yMax - yMin);
  for (const part of parts) {
    if (!part.paintable) continue;
    const position = part.geometry.getAttribute("position");
    const paint = part.geometry.getAttribute("aPaint");
    const paintT = new Float32Array(paint.count);
    for (let i = 0; i < paint.count; i += 1) {
      if (paint.getX(i) < 0.5) continue;
      paintT[i] = (position.getY(i) - yMin) / span;
    }
    part.geometry.setAttribute("aPaintT", new Float32BufferAttribute(paintT, 1));
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  for (const part of parts) {
    if (part.paintable) continue;
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  for (const part of parts) {
    if (!part.wheel || !part.geometry.boundingBox) continue;
    const box = part.geometry.boundingBox;
    part.axle = [
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2,
    ];
    part.radius = Math.max(0.001, box.max.y - box.min.y, box.max.z - box.min.z) / 2;
  }
  let low = Infinity;
  let high = -Infinity;
  for (const part of parts) {
    const box = part.geometry.boundingBox;
    if (!box) continue;
    if (box.min.y < low) low = box.min.y;
    if (box.max.y > high) high = box.max.y;
  }
  const height = Number.isFinite(low) ? Math.max(0.001, high - low) : 1;
  const lift = Number.isFinite(low) ? (low + high) / 2 : 0.5;
  const door = bakeDoorParts(parts, doorRig, cx, minY, cz);
  return { parts, width, length, height, lift, door };
}


// Pickup and SUV: Ted's marks already sit on the folded-and-extracted
// nose housings, so keep that path. Other pack cars below light the
// model's own front-corner housings in place (no bumper fold).
const NOSE_EXTRACT = new Set(["pack-pickup", "pack-suv"]);
const HOUSING_LAMPS = new Set([
  "pack-offroad",
  "pack-sedan",
  "pack-wagon",
]);

// In +Z-nose space, light only the front-outer cluster of head faces
// so a long hood slash does not stay white — just the housing Ted marked.
function markHousingHeads(position, index, cats, lamp) {
  const sides = [[], []];
  for (let tri = 0; tri < cats.length; tri += 1) {
    if (cats[tri] !== 2) continue;
    const i0 = index.getX(tri * 3);
    const i1 = index.getX(tri * 3 + 1);
    const i2 = index.getX(tri * 3 + 2);
    const cx = (position.getX(i0) + position.getX(i1) + position.getX(i2)) / 3;
    const cy = (position.getY(i0) + position.getY(i1) + position.getY(i2)) / 3;
    const cz = (position.getZ(i0) + position.getZ(i1) + position.getZ(i2)) / 3;
    sides[cx < 0 ? 0 : 1].push({ i0, i1, i2, cx, cy, cz });
  }
  const RADIUS = 0.15;
  const r2 = RADIUS * RADIUS;
  for (const side of sides) {
    if (!side.length) continue;
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const t of side) {
      if (t.cx < xMin) xMin = t.cx;
      if (t.cx > xMax) xMax = t.cx;
      if (t.cz < zMin) zMin = t.cz;
      if (t.cz > zMax) zMax = t.cz;
    }
    // A compact authored housing (sport, offroad) is used in full.
    const compact = (xMax - xMin) < 0.28 && (zMax - zMin) < 0.20;
    let keep = side;
    if (!compact) {
      let best = side[0];
      let bestScore = -Infinity;
      for (const t of side) {
        const outer = t.cx < 0 ? -t.cx : t.cx;
        const score = t.cz + 0.45 * outer;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      keep = side.filter((t) => {
        const dx = t.cx - best.cx;
        const dy = t.cy - best.cy;
        const dz = t.cz - best.cz;
        return dx * dx + dy * dy + dz * dz <= r2;
      });
    }
    for (const t of keep) {
      lamp[t.i0] = 1;
      lamp[t.i1] = 1;
      lamp[t.i2] = 1;
    }
  }
}

// Headlight quads are exclusive vertices on the baked body. Folding them
// after the paint mask (which matches on the original positions) and after
// the bounds above keeps the body colour and the car footprint put.

function extractHeadlamps(geometry) {
  const index = geometry.getIndex();
  const lamp = geometry.getAttribute("aLamp");
  const position = geometry.getAttribute("position");
  if (!index || !lamp || !position) return null;
  const kept = [];
  const lampTris = [];
  const tris = index.count / 3;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = index.getX(tri * 3);
    const i1 = index.getX(tri * 3 + 1);
    const i2 = index.getX(tri * 3 + 2);
    const isLamp = lamp.getX(i0) > 0.5 && lamp.getX(i1) > 0.5 && lamp.getX(i2) > 0.5;
    if (isLamp) lampTris.push(i0, i1, i2);
    else kept.push(i0, i1, i2);
  }
  if (!lampTris.length) return null;
  geometry.setIndex(new Uint32BufferAttribute(Uint32Array.from(kept), 1));
  const lampGeom = geometry.clone();
  lampGeom.setIndex(new Uint32BufferAttribute(Uint32Array.from(lampTris), 1));
  // Drop paint attrs so this mesh can use a plain unlit material.
  for (const name of ["aPaint", "aPaintT", "aRecolor", "aLamp"]) {
    if (lampGeom.getAttribute(name)) lampGeom.deleteAttribute(name);
  }
  return lampGeom;
}

function foldBakedHeadlights(geometry, keys, bakeOpts = {}) {
  if (!keys) return;
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!index || !position || !normal || !uv) return;
  const tris = index.count / 3;
  const cats = new Array(tris);
  let any = false;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = index.getX(tri * 3);
    const i1 = index.getX(tri * 3 + 1);
    const i2 = index.getX(tri * 3 + 2);
    const cat = keys.get(triKey(position, i0, i1, i2));
    cats[tri] = cat == null ? -1 : cat;
    if (cat === 2) any = true;
  }
  if (!any) return;
  if (bakeOpts.housingInPlace) {
    const lamp = new Float32Array(position.count);
    markHousingHeads(position, index, cats, lamp);
    geometry.setAttribute("aLamp", new Float32BufferAttribute(lamp, 1));
    return;
  }
  const paintAttr = geometry.getAttribute("aPaint");
  const folded = foldHeadlightGeometry({
    positions: position.array.slice(0, position.count * 3),
    normals: normal.array.slice(0, normal.count * 3),
    uvs: uv.array.slice(0, uv.count * 2),
    indices: index.array.slice(0, index.count),
    cats,
    paint: paintAttr ? paintAttr.array.slice(0, paintAttr.count) : null,
  }, bakeOpts);
  geometry.setAttribute("position", new Float32BufferAttribute(folded.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(folded.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(folded.uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(folded.indices, 1));
  if (folded.paint) {
    geometry.setAttribute("aPaint", new Float32BufferAttribute(folded.paint, 1));
  }
  // Pack weathered lamp texels are dull grey. Paint these faces bright
  // white so the folded quads read as headlights from the game camera.
  const lamp = new Float32Array(folded.positions.length / 3);
  if (bakeOpts.seatAtSilhouette) {
    for (let tri = 0; tri < folded.cats.length; tri += 1) {
      if (folded.cats[tri] !== 2) continue;
      lamp[folded.indices[tri * 3]] = 1;
      lamp[folded.indices[tri * 3 + 1]] = 1;
      lamp[folded.indices[tri * 3 + 2]] = 1;
    }
  }
  geometry.setAttribute("aLamp", new Float32BufferAttribute(lamp, 1));
}

function disposeModel(scene) {
  const textures = new Set();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of ["map", "roughnessMap", "metalnessMap", "emissiveMap", "normalMap", "aoMap"]) {
        if (material[key]) textures.add(material[key]);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

function releaseGeometries(scene) {
  scene.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
}

function sliceGroup(geometry, start, count) {
  const slice = geometry.clone();
  const index = slice.getIndex();
  if (!index) return slice;
  slice.setIndex(Array.from(index.array.slice(start, start + count)));
  slice.clearGroups();
  return slice;
}

// A KayKit body is one mesh with a paint material and a glass material.
// The traffic bake keeps the first material only, so split them first.
function splitMaterials(root) {
  const meshes = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !Array.isArray(obj.material) || !(obj.geometry.groups?.length > 1)) return;
    meshes.push(obj);
  });
  for (const mesh of meshes) {
    if (mesh.matrixAutoUpdate) mesh.updateMatrix();
    for (const group of mesh.geometry.groups) {
      const child = new Mesh(
        sliceGroup(mesh.geometry, group.start, group.count),
        mesh.material[group.materialIndex] || mesh.material[0],
      );
      child.name = mesh.name;
      child.matrix.copy(mesh.matrix);
      child.matrixAutoUpdate = false;
      mesh.parent.add(child);
    }
    mesh.geometry.dispose();
    mesh.removeFromParent();
  }
}

async function loadGltf(loader, url, label) {
  try {
    return await loader.loadAsync(url);
  } catch {
    throw new Error(`The car model failed to load: ${label}`);
  }
}

async function loadScene(loader, url, label) {
  const gltf = await loadGltf(loader, url, label);
  return gltf.scene;
}

export async function createTraffic(scene, map, pieces = []) {
  const colormapUrl = new URL("../assets/cars3d/colormap.png", import.meta.url).href;
  const maskManager = new LoadingManager();
  // The original GLBs still point at the shared sheet. Their UVs classify paint.
  maskManager.setURLModifier((url) => (url.includes("colormap.png") ? colormapUrl : url));
  const maskLoader = new GLTFLoader(maskManager);
  const loader = new GLTFLoader();
  const files = [...new Set(CARS.map((car) => car.file))];
  const plainUrl = new Map(CARS.filter((car) => car.url).map((car) => [car.file, car.url]));
  const baked = new Map();
  await Promise.all(files.map(async (file) => {
    if (plainUrl.has(file) || PLAIN.has(file)) {
      const rel = plainUrl.get(file) || `assets/cars3d/${file}.glb`;
      const model = await loadScene(
        loader,
        new URL(`../${rel}`, import.meta.url).href,
        rel,
      );
      splitMaterials(model);
      // catalog is null so paint masks and colormap recolor never run.
      const built = bakeLevel(model, null);
      releaseGeometries(model);
      baked.set(file, {
        width: built.width,
        length: built.length,
        height: built.height,
        lift: built.lift,
        levels: { 2: built.parts },
      });
      return;
    }
    const maskGltf = await loadGltf(
      maskLoader,
      new URL(`../assets/cars3d/${file}.glb`, import.meta.url).href,
      `${file}.glb`,
    );
    const maskScene = maskGltf.scene;
    splitMaterials(maskScene);
    const lampFile = NOSE_EXTRACT.has(file) || HOUSING_LAMPS.has(file);
    const catalog = faceCatalog(maskScene, { foldFrontTails: lampFile });
    const doorRig = collectDoorRig(maskScene, maskGltf, catalog);
    const levels = {};
    let measured = null;
    for (const level of levelsFor(file)) {
      const label = `${file}-L${level}.glb`;
      const url = new URL(`../assets/cars3d/weathered/${label}`, import.meta.url).href;
      let weathered;
      try {
        weathered = await loadScene(loader, url, label);
      } catch (err) {
        // coupe/sport/suv/race only ship L2. If something still asks for
        // L3, reuse the L2 bake instead of failing the whole traffic set.
        if (level !== 2 && levels[2]) {
          levels[level] = levels[2];
          continue;
        }
        throw err;
      }
      const built = bakeLevel(weathered, catalog, doorRig, {
        seatAtSilhouette: NOSE_EXTRACT.has(file),
        housingInPlace: HOUSING_LAMPS.has(file),
      });
      levels[level] = built.parts;
      if (level === 2) measured = built;
      releaseGeometries(weathered);
    }
    disposeModel(maskScene);
    baked.set(file, {
      width: measured.width,
      length: measured.length,
      height: measured.height,
      lift: measured.lift,
      levels,
      door: measured.door || null,
    });
  }));

  const models = CARS.map((car) => {
    const file = baked.get(car.file);
    return {
      ...car,
      bulky: isBulkyCar(car),
      weight: RARE.has(car.name) ? 1 : 6,
      scaleX: car.w / file.width * DRAW_SCALE,
      scaleY: car.h / file.length * DRAW_SCALE,
      scaleZ: car.h / file.length * DRAW_SCALE,
      bodyH: file.height / file.length * car.h * DRAW_SCALE,
      bodyLift: file.lift / file.length * car.h * DRAW_SCALE,
      levels: file.levels,
      hasDoor: Boolean(file.door),
      doorSide: file.door ? file.door.side : 0,
      doorOpenAngle: file.door ? file.door.openAngle : 0,
      doorOpenTime: file.door ? file.door.openTime : 0,
      doorCloseTime: file.door ? file.door.closeTime : 0,
    };
  });
  const weightTotal = models.reduce((sum, model) => sum + model.weight, 0);
  const pick = (hash) => {
    let cursor = hash % weightTotal;
    for (let index = 0; index < models.length; index += 1) {
      if (cursor < models[index].weight) return index;
      cursor -= models[index].weight;
    }
    return 0;
  };

  const plan = planCars(map, pieces);
  for (const car of plan.parked) {
    car.model = pick(car.hash);
    car.w = models[car.model].w;
    car.h = models[car.model].h;
    car.bodyH = models[car.model].bodyH;
    car.bodyLift = models[car.model].bodyLift;
    car.bulky = !!models[car.model].bulky;
    car.y = GROUND_Y;
    car.angle = headingAngle(car.hx, car.hz);
    car.level = wearLevel(models[car.model].file, car.hash);
    attachDoor(car, models[car.model]);
    settleParked(car, map);
    initCarHealth(car);
    car.smokeSoundPlayed = false;
  }
  const parked = plan.parked;
  const sim = createSim(plan, models, pick);
  const dummy = new Object3D();
  const matrixAt = (x, y, z, angle, model, quat) => {
    dummy.position.set(x, y, z);
    if (quat) dummy.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    else dummy.rotation.set(0, angle, 0);
    dummy.scale.set(model.scaleX, model.scaleY, model.scaleZ);
    dummy.updateMatrix();
    return dummy.matrix;
  };

  const parkedBodies = [];
  const buckets = new Map();
  const groups = [];
  for (const car of parked) {
    const model = models[car.model];
    const body = {
      x: car.x,
      z: car.z,
      y: car.y,
      w: model.w,
      h: model.h,
      angle: car.angle,
      src: car,
    };
    parkedBodies.push(body);
    const id = `${Math.floor(car.x / BUCKET)},${Math.floor(car.z / BUCKET)}`;
    let list = buckets.get(id);
    if (!list) {
      list = [];
      buckets.set(id, list);
    }
    list.push(body);
  }

  const lampMaterials = [];
  let lampGlow = 0.55;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    for (const level of levelsFor(model.file)) {
      const parkedHere = parked.filter((car) => car.model === modelIndex && car.level === level);
      // Extra slots so wrecks can linger without dropping a live car of the same model.
      const capacity = parkedHere.length + 56;
      const partDraws = [];
      for (const part of model.levels[level]) {
        if (part.name === "headlamps" && part.material && !lampMaterials.includes(part.material)) {
          lampMaterials.push(part.material);
        }
        const geometry = part.geometry.clone();
        let recolor = null;
        if (part.paintable) {
          recolor = new InstancedBufferAttribute(new Float32Array(capacity), 1);
          recolor.setUsage(DynamicDrawUsage);
          geometry.setAttribute("aRecolor", recolor);
        }
        const mesh = new InstancedMesh(geometry, part.material, capacity);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        mesh.matrixAutoUpdate = false;
        mesh.count = 0;
        if (part.paintable) {
          mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        }
        scene.add(mesh);
        partDraws.push({
          mesh,
          recolor,
          paintable: part.paintable,
          wheel: part.wheel,
          front: part.front,
          axle: part.axle,
          radius: part.radius,
          door: part.door,
          hinge: part.hinge,
        });
      }
      groups.push({
        parts: partDraws,
        model,
        modelIndex,
        level,
        parked: parkedHere,
      });
    }
  }

  const inView = (x, z, camX, camZ) => x > camX - 560 && x < camX + 560 && z > camZ - 420 && z < camZ + 560;
  const groupAt = models.map(() => [0, 0, 0, 0]);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    groupAt[group.modelIndex][group.level] = index + 1;
  }
  const driversByGroup = groups.map(() => []);
  const listed = [];
  const LIGHT_CAP = 192;
  const lightPool = Array.from({ length: LIGHT_CAP }, () => ({ kind: "head", x: 0, y: 0, z: 0 }));
  const lightList = [];
  const nearPool = parkedBodies.map(() => ({ car: null, dist: 0 }));
  const nearList = [];

  function byDist(a, b) {
    return a.dist - b.dist;
  }

  function syncParked() {
    for (const body of parkedBodies) {
      const car = body.src;
      body.x = car.x;
      body.z = car.z;
      body.y = car.y;
      body.angle = car.angle;
    }
  }

  const wreckTint = new Color().setRGB(wreckRgb().r, wreckRgb().g, wreckRgb().b);

  function placeCar(group, car, salt, count) {
    const matrix = matrixAt(
      car.x,
      car.y == null ? GROUND_Y : car.y,
      car.z,
      car.angle,
      group.model,
      car.quat,
    );
    const civilian = !SERVICE.has(group.model.name);
    const tint = car.wrecked ? wreckTint : (civilian ? PALETTE[colourIndex(salt)] : WHITE);
    const rec = car.wrecked ? 1 : (civilian ? 1 : 0);
    attachDoor(car, group.model);
    for (const part of group.parts) {
      const rolling = group.model.rollWheels && part.wheel && part.axle;
      const swinging = part.door && part.hinge;
      const drawn = rolling
        ? wheelMatrix(matrix, part, car.rollTravel || 0, car.rollSteer || 0, group.model.scaleY)
        : swinging
          ? doorMatrix(matrix, part.hinge, car.doorAngle || 0)
          : matrix;
      part.mesh.setMatrixAt(count, drawn);
      if (!part.paintable) continue;
      part.recolor.setX(count, rec);
      part.mesh.setColorAt(count, tint);
    }
    return count + 1;
  }

  function slotCap(group) {
    const part = group.parts[0];
    return part ? part.mesh.instanceMatrix.count : 0;
  }

  function removeParked(car) {
    const at = parked.indexOf(car);
    if (at >= 0) parked.splice(at, 1);
    for (const group of groups) {
      const gi = group.parked.indexOf(car);
      if (gi >= 0) group.parked.splice(gi, 1);
    }
    for (let i = parkedBodies.length - 1; i >= 0; i -= 1) {
      const body = parkedBodies[i];
      if (body.src !== car) continue;
      const id = `${Math.floor(body.x / BUCKET)},${Math.floor(body.z / BUCKET)}`;
      const list = buckets.get(id);
      if (list) {
        const bi = list.indexOf(body);
        if (bi >= 0) list.splice(bi, 1);
      }
      parkedBodies.splice(i, 1);
    }
  }

  let peds = null;
  let crashSounds = null;
  let hearX = 0;
  let hearZ = 0;
  const damageFx = await createCarDamageFx(scene);

  function finishWreck(car) {
    if (!car || car.blew) return;
    car.blew = true;
    car.speed = 0;
    damageFx.explode(car);
    playCarExplodeSound(crashSounds, car.x, car.z, {
      listenerX: hearX,
      listenerZ: hearZ,
      isPlayerCar: Boolean(car.held),
    });
    blastPeds(car, peds);
  }

  function pushLight(kind, x, y, z) {
    const slot = lightPool[lightList.length];
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    lightList.push(slot);
  }

  return {
    setLampGlow(intensity) {
      const value = Number.isFinite(intensity) ? intensity : 0.55;
      if (value === lampGlow) return;
      lampGlow = value;
      for (const material of lampMaterials) material.emissiveIntensity = value;
    },
    scare(x, z) {
      sim.scare(x, z);
    },
    usePeds(pedestrians) {
      peds = pedestrians;
    },
    useCrashSounds(sounds) {
      crashSounds = sounds;
    },
    hit(car, amount, kind = "crash") {
      const result = applyCarDamage(car, amount);
      if (result.damaged && crashSounds) {
        crashSounds.play({
          damage: amount,
          kind,
          x: car.x,
          z: car.z,
          listenerX: hearX,
          listenerZ: hearZ,
          isPlayerCar: Boolean(car.held),
        });
      }
      if (result.smokeSound) {
        playCarSmokeSound(crashSounds, car.x, car.z, {
          listenerX: hearX,
          listenerZ: hearZ,
          isPlayerCar: Boolean(car.held),
        });
      }
      if (result.justWrecked) finishWreck(car);
      return result;
    },
    // Any gun that fires bullets should call bulletHit when a shot hits a car.
    bulletHit(car, damage, x, z) {
      const result = bulletHitCar(car, damage, x, z, {
        sounds: crashSounds,
        listenerX: hearX,
        listenerZ: hearZ,
      });
      if (result.justWrecked) finishWreck(car);
      return result;
    },
    // Call playBulletWorldHitSound when a bullet hits a wall, building, or prop.
    // Do not call it for the ground, the street, people, or cars.
    playBulletWorldHitSound(x, z) {
      return playBulletWorldHitSound(crashSounds, x, z, {
        listenerX: hearX,
        listenerZ: hearZ,
      });
    },
    cars() {
      const total = parked.length + sim.drivers.length;
      listed.length = total;
      for (let i = 0; i < parked.length; i += 1) listed[i] = parked[i];
      for (let i = 0; i < sim.drivers.length; i += 1) listed[parked.length + i] = sim.drivers[i];
      for (const car of listed) attachDoor(car, models[car.model]);
      return listed;
    },
    hasSwingDoor,
    openDoor(car) {
      attachDoor(car, car && models[car.model]);
      return openCarDoor(car);
    },
    closeDoor(car) {
      attachDoor(car, car && models[car.model]);
      return closeCarDoor(car);
    },
    snapDoorShut(car) {
      snapDoorShut(car);
    },
    doorIsOpen(car) {
      return doorIsOpen(car);
    },
    doorPhase(car) {
      return doorPhase(car);
    },
    roadHeight(x, z, y) {
      return plan.heightAt ? plan.heightAt(x, z, y) : null;
    },
    junctions: plan.junctions,
    signalTime() {
      return signalNow();
    },
    update(dt, camX, camZ, playerX, playerZ) {
      hearX = playerX;
      hearZ = playerZ;
      sim.step(dt, camX, camZ, playerX, playerZ);
      for (const car of parked) {
        if (car.wrecked) car.wreckAge = (car.wreckAge || 0) + dt;
      }
      for (let i = parked.length - 1; i >= 0; i -= 1) {
        if (shouldCullWreck(parked[i], playerX, playerZ)) removeParked(parked[i]);
      }
      syncParked();
      const all = parked.concat(sim.drivers);
      for (const car of all) trackRoll(car, models[car.model], dt);
      for (const car of all) {
        attachDoor(car, models[car.model]);
        stepDoor(car, dt);
      }
      for (const car of all) {
        if (car.wrecked && !car.blew) finishWreck(car);
      }
      damageFx.update(dt, all, playerX, playerZ);
      for (const list of driversByGroup) list.length = 0;
      for (const car of sim.drivers) {
        const row = groupAt[car.model];
        if (!row) continue;
        const index = row[wearLevel(models[car.model].file, car.id)] - 1;
        if (index < 0) continue;
        driversByGroup[index].push(car);
      }
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        let count = 0;
        const cap = slotCap(group);
        for (const car of group.parked) {
          if (count >= cap) break;
          if (!inView(car.x, car.z, camX, camZ)) continue;
          count = placeCar(group, car, car.hash, count);
        }
        for (const car of driversByGroup[index]) {
          if (count >= cap) break;
          if (!inView(car.x, car.z, camX, camZ)) continue;
          count = placeCar(group, car, car.id, count);
        }
        for (const part of group.parts) {
          part.mesh.count = count;
          part.mesh.instanceMatrix.needsUpdate = count > 0;
          if (!part.paintable) continue;
          part.recolor.needsUpdate = count > 0;
          part.mesh.instanceColor.needsUpdate = count > 0;
        }
      }
    },
    lights(camX, camZ) {
      lightList.length = 0;
      const pushCar = (car) => {
        if (car.wrecked) return;
        if (lightList.length >= LIGHT_CAP) return;
        if (!inView(car.x, car.z, camX, camZ)) return;
        const fx = -Math.sin(car.angle);
        const fz = -Math.cos(car.angle);
        const rx = -fz;
        const rz = fx;
        const nose = car.h * 0.4;
        const tail = car.h * 0.38;
        const side = Math.min(12, car.w * 0.22);
        const y = car.y == null ? 4.2 : car.y + 3.6;
        pushLight("head", car.x + fx * nose + rx * side, y, car.z + fz * nose + rz * side);
        pushLight("head", car.x + fx * nose - rx * side, y, car.z + fz * nose - rz * side);
        pushLight("tail", car.x - fx * tail + rx * side, y, car.z - fz * tail + rz * side);
        pushLight("tail", car.x - fx * tail - rx * side, y, car.z - fz * tail - rz * side);
      };
      for (const car of sim.drivers) pushCar(car);
      nearList.length = 0;
      for (const car of parkedBodies) {
        if (!inView(car.x, car.z, camX, camZ)) continue;
        const dx = car.x - camX;
        const dz = car.z - camZ;
        const slot = nearPool[nearList.length];
        slot.car = car;
        slot.dist = dx * dx + dz * dz;
        nearList.push(slot);
      }
      nearList.sort(byDist);
      for (let i = 0; i < nearList.length && i < 16; i += 1) pushCar(nearList[i].car);
      return lightList;
    },
    shove(x, z, radius, blocked) {
      syncParked();
      const bodies = [];
      const ix = Math.floor(x / BUCKET);
      const iz = Math.floor(z / BUCKET);
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const list = buckets.get(`${ix + dx},${iz + dz}`);
          if (list) bodies.push(...list);
        }
      }
      for (const body of sim.drivers) {
        if (body.y != null && Math.abs(body.y - GROUND_Y) > 36) continue;
        const ox = x - body.x;
        const oz = z - body.z;
        if (ox * ox + oz * oz > 280 * 280) continue;
        bodies.push(body);
      }
      return pushOutOfCars(x, z, bodies, radius, blocked);
    },
  };
}
