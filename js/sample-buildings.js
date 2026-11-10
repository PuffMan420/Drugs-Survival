// The realistic lot files stay on disk and in the build menu.
// They are not added when the game starts. The roads stay as they are.

import { Box3, Group, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";
import { tileAt } from "./city.js";
import {
  CHINATOWN_BUILDINGS,
  CHINATOWN_COPIES,
  CHINATOWN_FILE,
  LOT_MESHES,
  singleMeshPath,
} from "./single-mesh-buildings.js";

// Same person height as js/player.js, and the drawn sedan stands for a 4.6 m car.
const PERSON = (71 / 3) * 1.15 * 1.1 * 1.1 * 1.05;
const METER = ((71 * 1.1) / 4.6 + PERSON / 1.75) / 2;
const SIDEWALK = 1.8 * METER;
const ALLEY = 2.2 * METER;
const PASSAGE = 1.35 * METER;
const MODULE = 4 * TILE;
// Southwest crossroad of the low-income district.
export const LOW_INCOME_CORNER = { x: 66, z: 234 };
const GROUND_Y = 0.2;

function centerOf(tile) {
  return (tile + 0.5) * TILE;
}

function prepare(root, anisotropy) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat) continue;
      mat.toneMapped = false;
      for (const key of ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
        const tex = mat[key];
        if (!tex) continue;
        if (key === "map" || key === "emissiveMap") tex.colorSpace = SRGBColorSpace;
        tex.magFilter = LinearFilter;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
      }
    }
  });
}

function roadBoxes(pieces) {
  const boxes = [];
  for (const piece of pieces) {
    if (!piece || typeof piece.file !== "string") continue;
    const x = centerOf(piece.x);
    const z = centerOf(piece.z);
    boxes.push({
      minX: x - MODULE / 2,
      maxX: x + MODULE / 2,
      minZ: z - MODULE / 2,
      maxZ: z + MODULE / 2,
    });
  }
  return boxes;
}

function overlaps(a, b, pad) {
  return a.maxX > b.minX - pad && a.minX < b.maxX + pad && a.maxZ > b.minZ - pad && a.minZ < b.maxZ + pad;
}

function openGround(map, box) {
  const step = TILE * 2;
  for (let z = box.minZ; z <= box.maxZ; z += step) {
    for (let x = box.minX; x <= box.maxX; x += step) {
      const ground = tileAt(map, x, z);
      if (ground === "~" || ground === "g" || ground === "4" || ground === "8" || ground === "y" || ground === "p") {
        return false;
      }
    }
  }
  return true;
}

// Tile zones follow the sketch. Markers 1 and 2, west of the canal, stay empty.
function zoneAt(x, z) {
  const tx = x / TILE;
  const tz = z / TILE;
  if (tz < 148 && tx < 230) return null;
  if (tz >= 152 && tx < 248) return "blue";
  if (tz >= 152 && tx >= 248) return "red";
  if (tz < 152 && tx >= 220) return "green";
  return null;
}

function cluster(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs = [];
  if (!sorted.length) return runs;
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - prev > 6) {
      runs.push([start, prev]);
      start = sorted[i];
    }
    prev = sorted[i];
  }
  runs.push([start, prev]);
  return runs;
}

function frontages(pieces) {
  const ns = new Map();
  const ew = new Map();
  for (const piece of pieces) {
    if (piece.file !== "road-straight-7.glb" && piece.file !== "road-straight-stop.glb") continue;
    const turn = ((Math.round(piece.turn) % 4) + 4) % 4;
    if (turn % 2 === 1) {
      const list = ns.get(piece.x) || [];
      list.push(piece.z);
      ns.set(piece.x, list);
    } else {
      const list = ew.get(piece.z) || [];
      list.push(piece.x);
      ew.set(piece.z, list);
    }
  }
  const faces = [];
  for (const [x, zs] of ns) {
    for (const [z0, z1] of cluster(zs)) {
      const along0 = centerOf(z0) - MODULE / 2;
      const along1 = centerOf(z1) + MODULE / 2;
      if (along1 - along0 < 40) continue;
      const east = centerOf(x) + MODULE / 2 + SIDEWALK;
      const west = centerOf(x) - MODULE / 2 - SIDEWALK;
      faces.push({ side: "east", axis: "z", fixed: east, along0, along1, zone: zoneAt(east + 30, (along0 + along1) / 2) });
      faces.push({ side: "west", axis: "z", fixed: west, along0, along1, zone: zoneAt(west - 30, (along0 + along1) / 2) });
    }
  }
  for (const [z, xs] of ew) {
    for (const [x0, x1] of cluster(xs)) {
      const along0 = centerOf(x0) - MODULE / 2;
      const along1 = centerOf(x1) + MODULE / 2;
      if (along1 - along0 < 40) continue;
      const north = centerOf(z) - MODULE / 2 - SIDEWALK;
      const south = centerOf(z) + MODULE / 2 + SIDEWALK;
      faces.push({ side: "north", axis: "x", fixed: north, along0, along1, zone: zoneAt((along0 + along1) / 2, north - 30) });
      faces.push({ side: "south", axis: "x", fixed: south, along0, along1, zone: zoneAt((along0 + along1) / 2, south + 30) });
    }
  }
  return faces.filter((face) => face.zone);
}

// The file is in metres. The shared metre puts a door next to the player.
// A mesh shorter than a person after that scale is not a lot building.
function fitMeterModel(node, anisotropy, name) {
  const clone = node.clone(true);
  let meshes = 0;
  clone.traverse((obj) => {
    if (obj.isMesh) meshes += 1;
  });
  if (!meshes) return null;
  prepare(clone, anisotropy);
  const pivot = new Group();
  pivot.add(clone);
  pivot.updateMatrixWorld(true);
  const raw = new Box3().setFromObject(pivot);
  const height = raw.max.y - raw.min.y;
  const wide = Math.max(raw.max.x - raw.min.x, raw.max.z - raw.min.z);
  const deep = Math.min(raw.max.x - raw.min.x, raw.max.z - raw.min.z);
  if (!(height > 0) || !(wide > 0)) return null;
  if (height * METER < PERSON * 0.8) return null;
  pivot.position.set(
    -((raw.min.x + raw.max.x) / 2),
    -raw.min.y,
    -((raw.min.z + raw.max.z) / 2),
  );
  return { pivot, scale: METER, name, wide: wide * METER, deep: deep * METER };
}

// A shop front, in metres. Wider market chunks shrink to this so a row fits
// the street. Downtown-sized meshes are not passed in here.
const SHOP_FRONT = 14;

function fitShop(node, anisotropy, name) {
  const fitted = fitMeterModel(node, anisotropy, name);
  if (!fitted) return null;
  const metresWide = fitted.wide / METER;
  const metresDeep = fitted.deep / METER;
  if (metresWide <= 22) return fitted;
  const scale = (SHOP_FRONT / metresWide) * METER;
  return {
    pivot: fitted.pivot,
    scale,
    name,
    wide: SHOP_FRONT * METER,
    deep: metresDeep * (SHOP_FRONT / metresWide) * METER,
  };
}

function yawFor(side) {
  if (side === "east") return -Math.PI / 2;
  if (side === "west") return Math.PI / 2;
  if (side === "north") return 0;
  return Math.PI;
}

function placeOnFace(model, face, cursor, roads, occupied, map, fromEnd = false) {
  const group = new Group();
  group.name = model.name;
  group.add(model.pivot);
  group.rotation.y = yawFor(face.side);
  group.scale.setScalar(model.scale);
  group.position.y = 0;
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(group);
  const along = face.axis === "z" ? box.max.z - box.min.z : box.max.x - box.min.x;
  const at = fromEnd ? cursor - along : cursor;
  if (at < face.along0 - 1 || at + along > face.along1 + 1) return null;
  if (face.axis === "z") group.position.z = at - box.min.z;
  else group.position.x = at - box.min.x;
  if (face.side === "east") group.position.x = face.fixed - box.min.x;
  else if (face.side === "west") group.position.x = face.fixed - box.max.x;
  else if (face.side === "north") group.position.z = face.fixed - box.max.z;
  else group.position.z = face.fixed - box.min.z;
  group.position.y = GROUND_Y - box.min.y;
  group.updateMatrixWorld(true);
  const world = new Box3().setFromObject(group);
  const rect = { minX: world.min.x, maxX: world.max.x, minZ: world.min.z, maxZ: world.max.z };
  if (zoneAt((rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2) !== face.zone) return null;
  if (!openGround(map, rect)) return null;
  for (const road of roads) {
    if (overlaps(rect, road, 2)) return null;
  }
  for (const other of occupied) {
    if (overlaps(rect, other, PASSAGE)) return null;
  }
  return { group, rect, next: fromEnd ? at : at + along, height: world.max.y - world.min.y };
}

function cornerFaces(faces) {
  const cx = centerOf(LOW_INCOME_CORNER.x);
  const cz = centerOf(LOW_INCOME_CORNER.z);
  const near = [];
  for (const face of faces) {
    if (face.zone !== "blue") continue;
    if (face.axis === "z") {
      const east = cx + MODULE / 2 + SIDEWALK;
      const west = cx - MODULE / 2 - SIDEWALK;
      if (Math.abs(face.fixed - east) > 3 && Math.abs(face.fixed - west) > 3) continue;
      if (face.along1 < cz - MODULE * 3 || face.along0 > cz + MODULE * 2) continue;
    } else {
      const north = cz - MODULE / 2 - SIDEWALK;
      const south = cz + MODULE / 2 + SIDEWALK;
      if (Math.abs(face.fixed - north) > 3 && Math.abs(face.fixed - south) > 3) continue;
      if (face.along1 < cx - MODULE * 2 || face.along0 > cx + MODULE * 3) continue;
    }
    near.push(face);
  }
  near.sort((a, b) => {
    const inland = (face) => (face.side === "east" || face.side === "north" ? 0 : 1);
    return inland(a) - inland(b);
  });
  return near;
}

function packsFromCornerEnd(face) {
  const cx = centerOf(LOW_INCOME_CORNER.x);
  const cz = centerOf(LOW_INCOME_CORNER.z);
  const mid = (face.along0 + face.along1) / 2;
  if (face.axis === "z") return mid < cz;
  return mid < cx;
}

export async function placeSampleBuildings(scene, map, renderer, pieces = [], savedZones = []) {
  // The realistic lot files stay on disk. They are not added when the game starts.
  // Build mode still gets an empty group so later placement has somewhere to go.
  const group = new Group();
  group.name = "zone-buildings";
  group.userData.removedZones = [];
  scene.add(group);
  map.buildings = [];
  return group;
}
