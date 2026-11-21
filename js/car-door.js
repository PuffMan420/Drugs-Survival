// Driver-door helpers for traffic cars. A clean GLB with a Door_FL node
// (and Door_Open / Door_Close clips) is enough — the weathered draw model
// can still have the door baked into the body; we cut those triangles out
// and instance the door so one car can swing it.
export const DOOR_NODE = "Door_FL";
export const DOOR_INNER_MATERIAL = "DoorInnerDark";
export const DOOR_OPEN_ANGLE = (65 * Math.PI) / 180;
export const DOOR_OPEN_TIME = 0.15;
export const DOOR_CLOSE_TIME = 0.15;

export function isDoorName(name) {
  return name === DOOR_NODE || (typeof name === "string" && name.startsWith("Door_"));
}

// The GLTF loader may put a mesh with two primitives under a Group. Walk
// up so paint keys and door parts use the named node (body, Door_FL, wheel).
export function catalogName(obj) {
  let node = obj;
  while (node) {
    const name = node.name || "";
    if (isDoorName(name) || name === "body" || name.startsWith("wheel")) return name;
    node = node.parent;
  }
  return obj.name || "body";
}

export function materialName(obj) {
  const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
  return material && material.name ? material.name : "";
}

export function isInnerPanel(obj) {
  return catalogName(obj) === "body" && materialName(obj) === DOOR_INNER_MATERIAL;
}

// Same centre-and-turn bakeLevel applies to every part of the car.
export function bakeHinge(hinge, cx, minY, cz) {
  const x = hinge.x - cx;
  const y = hinge.y - minY;
  const z = hinge.z - cz;
  return { x: -x, y, z: -z };
}

// After the 180° bake, a hinge with +X sits on the game's left (driver) side.
export function doorSideFromHinge(hinge) {
  return hinge.x >= 0 ? 1 : -1;
}

export function yAngleOfQuaternion(x, y, z, w) {
  return 2 * Math.atan2(y, w);
}

export function readDoorClips(gltf) {
  const result = {
    openAngle: DOOR_OPEN_ANGLE,
    openTime: DOOR_OPEN_TIME,
    closeTime: DOOR_CLOSE_TIME,
  };
  const clips = gltf && gltf.animations;
  if (!clips) return result;
  for (const clip of clips) {
    const name = clip.name || "";
    const duration = clip.duration || 0;
    let angle = 0;
    const tracks = clip.tracks || [];
    for (const track of tracks) {
      const trackName = track.name || "";
      const values = track.values;
      if (!values || values.length < 4) continue;
      if (trackName.endsWith(".quaternion")) {
        const last = values.length - 4;
        angle = yAngleOfQuaternion(values[last], values[last + 1], values[last + 2], values[last + 3]);
      }
    }
    if (name === "Door_Open") {
      if (duration > 0) result.openTime = duration;
      if (angle !== 0) result.openAngle = angle;
    } else if (name === "Door_Close") {
      if (duration > 0) result.closeTime = duration;
    }
  }
  return result;
}

// Flag weathered body triangles that belong to the cut-out door.
// Exact paint-key hits first; leftover recut edges go to the nearer side.
export function assignDoorFlags(triKeys, centroids, doorKeys, bodyKeys, doorCentroids, bodyCentroids) {
  const flags = new Array(triKeys.length);
  for (let i = 0; i < triKeys.length; i += 1) {
    const key = triKeys[i];
    if (doorKeys && doorKeys.has(key)) {
      flags[i] = true;
      continue;
    }
    if (bodyKeys && bodyKeys.has(key)) {
      flags[i] = false;
      continue;
    }
    const point = centroids[i];
    flags[i] = nearestDoor(point, doorCentroids, bodyCentroids);
  }
  return flags;
}

function nearestDoor(point, doorCentroids, bodyCentroids) {
  if (!point) return false;
  const doorDist = minDist2(point, doorCentroids);
  const bodyDist = minDist2(point, bodyCentroids);
  if (doorDist === Infinity) return false;
  return doorDist <= bodyDist;
}

function minDist2(point, list) {
  if (!list || list.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const other = list[i];
    const dx = point.x - other.x;
    const dy = point.y - other.y;
    const dz = point.z - other.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

export function nearestCat(point, samples) {
  if (!point || !samples || samples.length === 0) return undefined;
  let best = Infinity;
  let cat;
  for (let i = 0; i < samples.length; i += 1) {
    const other = samples[i];
    const dx = point.x - other.x;
    const dy = point.y - other.y;
    const dz = point.z - other.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) {
      best = d2;
      cat = other.cat;
    }
  }
  return cat;
}

export function attachDoor(car, model) {
  if (!car || !model) return car;
  if (model.hasDoor) {
    car.hasDoor = true;
    car.doorSide = model.doorSide;
    car.doorOpenAngle = model.doorOpenAngle;
    car.doorOpenTime = model.doorOpenTime;
    car.doorCloseTime = model.doorCloseTime;
    if (car.doorAngle == null) car.doorAngle = 0;
  } else {
    car.hasDoor = false;
  }
  return car;
}

export function hasSwingDoor(car) {
  return Boolean(car && car.hasDoor);
}

export function openCarDoor(car) {
  if (!hasSwingDoor(car)) return false;
  const target = car.doorOpenAngle || DOOR_OPEN_ANGLE;
  const from = car.doorAngle || 0;
  const full = car.doorOpenTime || DOOR_OPEN_TIME;
  const span = Math.abs(target);
  const duration = span < 1e-6 ? full : Math.max(0.01, (Math.abs(target - from) / span) * full);
  car.doorAnim = { kind: "open", from, to: target, duration, age: 0 };
  return true;
}

export function closeCarDoor(car) {
  if (!hasSwingDoor(car)) return false;
  const from = car.doorAngle || 0;
  const full = car.doorCloseTime || DOOR_CLOSE_TIME;
  const target = car.doorOpenAngle || DOOR_OPEN_ANGLE;
  const span = Math.abs(target);
  const duration = span < 1e-6 ? full : Math.max(0.01, (Math.abs(from) / span) * full);
  car.doorAnim = { kind: "close", from, to: 0, duration, age: 0 };
  return true;
}

export function snapDoorShut(car) {
  if (!car) return;
  car.doorAngle = 0;
  car.doorAnim = null;
}

export function stepDoor(car, dt) {
  if (!hasSwingDoor(car) || !car.doorAnim) return;
  const anim = car.doorAnim;
  anim.age += dt;
  const t = Math.min(1, anim.age / Math.max(0.0001, anim.duration));
  car.doorAngle = anim.from + (anim.to - anim.from) * t;
  if (t >= 1) {
    car.doorAngle = anim.to;
    car.doorAnim = null;
  }
}

export function doorIsOpen(car) {
  if (!hasSwingDoor(car)) return false;
  const target = car.doorOpenAngle || DOOR_OPEN_ANGLE;
  const open = (car.doorAngle || 0) >= target - 0.02 || (target < 0 && (car.doorAngle || 0) <= target + 0.02);
  return open && (!car.doorAnim || car.doorAnim.kind !== "close");
}

export function doorPhase(car) {
  if (!hasSwingDoor(car)) return "none";
  if (car.doorAnim) return car.doorAnim.kind;
  return (car.doorAngle || 0) > 0.02 ? "open" : "shut";
}
