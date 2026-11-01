// Throw math and the hands -> pistol -> bottle -> bat cycle. The punch clip's
// RightForeArm is furthest from rest at 0.375s, which is when the bottle leaves the hand.

export const WEAPONS = ["hands", "pistol", "bottle", "bat"];
export const RELEASE = 0.375;
export const PUNCH_POSE = 0.72;
// Three ground tiles. A phone has no cursor, so the lob uses this reach.
export const THROW_REACH = 144;
export const MIN_REACH = 18;
// The midpoint of a three-tile lob sits about half a body above the straight line.
export const GRAVITY = -180;

const SPLATS = [1, 2, 3, 4];

export const BOTTLES = [
  {
    id: "beer",
    file: "soda-bottle.glb",
    splats: SPLATS.map((n) => `beer-soda_${n}.png`),
  },
  {
    id: "wine-red",
    file: "wine-red.glb",
    splats: SPLATS.map((n) => `wine-red_${n}.png`),
  },
  {
    id: "wine-white",
    file: "wine-white.glb",
    splats: SPLATS.map((n) => `wine-white_${n}.png`),
  },
  {
    id: "oil",
    file: "bottle-oil.glb",
    splats: SPLATS.map((n) => `oil_${n}.png`),
  },
];

export function nextWeapon(current) {
  const index = WEAPONS.indexOf(current);
  const next = index < 0 ? 1 : index + 1;
  return WEAPONS[next % WEAPONS.length];
}

export function pickBottle(random = Math.random) {
  const index = Math.min(BOTTLES.length - 1, Math.floor(random() * BOTTLES.length));
  return BOTTLES[Math.max(0, index)];
}

export function flightTime(distance) {
  return Math.min(1.05, Math.max(0.42, 0.4 + distance / 320));
}

export function aimTarget(origin, point, minReach = MIN_REACH) {
  let dx = point.x - origin.x;
  let dz = point.z - origin.z;
  let dist = Math.hypot(dx, dz);
  if (!(dist > 0.001)) {
    dx = 0;
    dz = 1;
    dist = 1;
  }
  if (dist < minReach) {
    const scale = minReach / dist;
    dx *= scale;
    dz *= scale;
  }
  return { x: origin.x + dx, y: point.y, z: origin.z + dz };
}

export function throwVelocity(start, target, time, gravity = GRAVITY) {
  const half = 0.5 * gravity * time * time;
  return {
    x: (target.x - start.x) / time,
    y: (target.y - start.y - half) / time,
    z: (target.z - start.z) / time,
  };
}

export function arcPoint(start, velocity, time, gravity = GRAVITY) {
  return {
    x: start.x + velocity.x * time,
    y: start.y + velocity.y * time + 0.5 * gravity * time * time,
    z: start.z + velocity.z * time,
  };
}

// What a ray hit breaks on. Null means the ray should keep looking.
// Same flat footprint as the car push: local x is width, local z is length.
// The vertical band covers the sedan roof, which lands about 44 units tall.
export function carContains(x, y, z, car) {
  if (!car || !(car.w > 0) || !(car.h > 0)) return false;
  const base = car.y == null ? 0.6 : car.y;
  if (y < base - 2 || y > base + 46) return false;
  const ox = x - car.x;
  const oz = z - car.z;
  const c = Math.cos(car.angle || 0);
  const s = Math.sin(car.angle || 0);
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  return Math.abs(lx) <= car.w / 2 && Math.abs(lz) <= car.h / 2;
}

// First face a unit ray meets on the carContains box. t is distance along
// the ray. A ray that starts inside the box does not count.
export function carRayHit(origin, direction, car) {
  if (!car || !(car.w > 0) || !(car.h > 0)) return null;
  const base = car.y == null ? 0.6 : car.y;
  const c = Math.cos(car.angle || 0);
  const s = Math.sin(car.angle || 0);
  const ox = origin.x - car.x;
  const oz = origin.z - car.z;
  const o = {
    x: ox * c - oz * s,
    y: origin.y,
    z: ox * s + oz * c,
  };
  const d = {
    x: direction.x * c - direction.z * s,
    y: direction.y,
    z: direction.x * s + direction.z * c,
  };
  const min = { x: -car.w / 2, y: base - 2, z: -car.h / 2 };
  const max = { x: car.w / 2, y: base + 46, z: car.h / 2 };
  let t0 = 0;
  let t1 = Infinity;
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(d[axis]) < 1e-8) {
      if (o[axis] < min[axis] || o[axis] > max[axis]) return null;
      continue;
    }
    let near = (min[axis] - o[axis]) / d[axis];
    let far = (max[axis] - o[axis]) / d[axis];
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return null;
  }
  if (!(t0 > 1e-4)) return null;
  return {
    t: t0,
    x: origin.x + direction.x * t0,
    y: origin.y + direction.y * t0,
    z: origin.z + direction.z * t0,
  };
}

export function bottleSurface(info) {
  if (!info || info.bottleFx || info.underPlayer || info.transparent) return null;
  if (info.ped) return "pedestrian";
  if (info.file) return info.file.startsWith("road") ? "ground" : "wall";
  if (info.car) return "car";
  if (info.tree) return "wall";
  return "ground";
}
