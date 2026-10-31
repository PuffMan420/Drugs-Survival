// A moving car against one pedestrian. No scene raycasts.
// The shell is the mesh that is actually drawn: sprite w/h times the 1.1
// draw scale in cars.js. The ped is a radius outside that shell, and the
// test is swept from the previous pose so a fast car cannot step through.

export const CAR_DRAW_SCALE = 1.1;
export const PED_RADIUS = 8;
const CAR_LEVEL = 36;
const GROUND_Y = 0.6;

export function carVelocity(car, driven) {
  if (!car) return null;
  if (car.held) {
    if (!driven) return null;
    const dirX = driven.vx || 0;
    const dirZ = driven.vz || 0;
    const speed = Math.hypot(dirX, dirZ);
    if (!(speed > 0)) return null;
    return { dirX, dirZ, vx: dirX, vz: dirZ, speed };
  }
  const speed = car.speed || 0;
  if (!(speed > 0)) return null;
  const angle = car.angle || 0;
  const dirX = -Math.sin(angle);
  const dirZ = -Math.cos(angle);
  return { dirX, dirZ, vx: dirX * speed, vz: dirZ * speed, speed };
}

function toLocal(ox, oz, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: ox * c - oz * s, z: ox * s + oz * c };
}

function fromLocal(lx, lz, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  const pi = Math.PI;
  while (d > pi) d -= pi * 2;
  while (d < -pi) d += pi * 2;
  return a + d * t;
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Signed gap to the box. Negative means that far outside the hard shell.
function shellGap(x, z, hx, hz) {
  const cx = clamp(x, -hx, hx);
  const cz = clamp(z, -hz, hz);
  const ex = x - cx;
  const ez = z - cz;
  const dist = Math.hypot(ex, ez);
  if (dist > 1e-8) return { inside: false, dist, ex, ez, cx, cz };
  return {
    inside: true,
    dist: 0,
    ex: 0,
    ez: 0,
    cx,
    cz,
    penX: hx - Math.abs(x),
    penZ: hz - Math.abs(z),
  };
}

function pack(t, px, pz, nx, nz) {
  const len = Math.hypot(nx, nz) || 1;
  return { t, px, pz, nx: nx / len, nz: nz / len };
}

// First time a point moving from (x0,z0) to (x1,z1) comes within `radius`
// of the AABB. The returned point is the ped center, radius outside the shell.
function sweepRoundedBox(x0, z0, x1, z1, hx, hz, radius) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const start = shellGap(x0, z0, hx, hz);
  if (start.inside) {
    if (start.penX < start.penZ) {
      const nx = x0 >= 0 ? 1 : -1;
      return pack(0, nx * (hx + radius), z0, nx, 0);
    }
    const nz = z0 >= 0 ? 1 : -1;
    return pack(0, x0, nz * (hz + radius), 0, nz);
  }
  if (start.dist <= radius) {
    const nx = start.ex / start.dist;
    const nz = start.ez / start.dist;
    return pack(0, start.cx + nx * radius, start.cz + nz * radius, nx, nz);
  }

  let best = null;
  function consider(t, nx, nz) {
    if (!(t >= 0 && t <= 1)) return;
    if (best && t >= best.t - 1e-9) return;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    const gap = shellGap(px, pz, hx, hz);
    if (gap.inside || gap.dist > radius + 0.02) return;
    best = pack(t, px, pz, nx, nz);
  }

  if (dx !== 0) {
    const tRight = (hx + radius - x0) / dx;
    if (Math.abs(z0 + dz * tRight) <= hz) consider(tRight, 1, 0);
    const tLeft = (-hx - radius - x0) / dx;
    if (Math.abs(z0 + dz * tLeft) <= hz) consider(tLeft, -1, 0);
  }
  if (dz !== 0) {
    const tRear = (hz + radius - z0) / dz;
    if (Math.abs(x0 + dx * tRear) <= hx) consider(tRear, 0, 1);
    const tFront = (-hz - radius - z0) / dz;
    if (Math.abs(x0 + dx * tFront) <= hx) consider(tFront, 0, -1);
  }

  const span = dx * dx + dz * dz;
  if (span > 1e-12) {
    const corners = [
      [hx, hz],
      [hx, -hz],
      [-hx, hz],
      [-hx, -hz],
    ];
    for (let i = 0; i < corners.length; i += 1) {
      const cx = corners[i][0];
      const cz = corners[i][1];
      const ox = x0 - cx;
      const oz = z0 - cz;
      const b = 2 * (ox * dx + oz * dz);
      const c = ox * ox + oz * oz - radius * radius;
      let disc = b * b - 4 * span * c;
      if (disc < -1e-6) continue;
      if (disc < 0) disc = 0;
      const root = Math.sqrt(disc);
      const tA = (-b - root) / (2 * span);
      const tB = (-b + root) / (2 * span);
      if (tA >= 0 && tA <= 1) {
        const px = x0 + dx * tA;
        const pz = z0 + dz * tA;
        if (Math.abs(px) >= hx - 1e-4 && Math.abs(pz) >= hz - 1e-4) consider(tA, px - cx, pz - cz);
      }
      if (tB >= 0 && tB <= 1 && tB > tA + 1e-9) {
        const px = x0 + dx * tB;
        const pz = z0 + dz * tB;
        if (Math.abs(px) >= hx - 1e-4 && Math.abs(pz) >= hz - 1e-4) consider(tB, px - cx, pz - cz);
      }
    }
  }
  return best;
}

function tooClose(x, z, hx, hz, radius) {
  const gap = shellGap(x, z, hx, hz);
  if (gap.inside) return true;
  return gap.dist < radius - 1e-4;
}

// Slide along the outward normal until the center clears the current shell.
// The first step can pass deeper through the cabin before it exits, so the
// search runs far enough to cross the whole box.
function pushOut(x, z, nx, nz, hx, hz, radius) {
  if (!tooClose(x, z, hx, hz, radius)) return { x, z };
  const len = Math.hypot(nx, nz) || 1;
  const ux = nx / len;
  const uz = nz / len;
  let lo = 0;
  let hi = (hx + hz) * 2 + radius + 1;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (tooClose(x + ux * mid, z + uz * mid, hx, hz, radius)) lo = mid;
    else hi = mid;
  }
  const out = { x: x + ux * hi, z: z + uz * hi };
  if (!tooClose(out.x, out.z, hx, hz, radius)) return out;
  const gap = shellGap(x, z, hx, hz);
  if (gap.inside) {
    if (gap.penX < gap.penZ) {
      const face = x >= 0 ? 1 : -1;
      return { x: face * (hx + radius), z };
    }
    const face = z >= 0 ? 1 : -1;
    return { x, z: face * (hz + radius) };
  }
  const n = Math.hypot(gap.ex, gap.ez) || 1;
  return {
    x: gap.cx + (gap.ex / n) * radius,
    z: gap.cz + (gap.ez / n) * radius,
  };
}

// prev is the last frame: { x, z, angle, pedX, pedZ }. Null tests the pose now.
// The point returned is where the ped center should stand: on the contact, outside.
export function carContact(car, x, z, y, prev) {
  if (!car) return null;
  const carY = car.y == null ? GROUND_Y : car.y;
  if (y != null && Math.abs(carY - y) > CAR_LEVEL) return null;
  const hx = (car.w || 36) * CAR_DRAW_SCALE * 0.5;
  const hz = (car.h || 70) * CAR_DRAW_SCALE * 0.5;
  const angle = car.angle || 0;
  const fromX = prev ? prev.x : car.x;
  const fromZ = prev ? prev.z : car.z;
  const fromAngle = prev && prev.angle != null ? prev.angle : angle;
  const pedX0 = prev && prev.pedX != null ? prev.pedX : x;
  const pedZ0 = prev && prev.pedZ != null ? prev.pedZ : z;
  const a = toLocal(pedX0 - fromX, pedZ0 - fromZ, fromAngle);
  const b = toLocal(x - car.x, z - car.z, angle);
  const hit = sweepRoundedBox(a.x, a.z, b.x, b.z, hx, hz, PED_RADIUS);
  if (!hit) return null;
  const t = hit.t;
  const cx = fromX + (car.x - fromX) * t;
  const cz = fromZ + (car.z - fromZ) * t;
  const ang = lerpAngle(fromAngle, angle, t);
  const at = fromLocal(hit.px, hit.pz, ang);
  const n = fromLocal(hit.nx, hit.nz, ang);
  const nlen = Math.hypot(n.x, n.z) || 1;
  const nx = n.x / nlen;
  const nz = n.z / nlen;
  const now = toLocal(cx + at.x - car.x, cz + at.z - car.z, angle);
  const nNow = toLocal(nx, nz, angle);
  const out = pushOut(now.x, now.z, nNow.x, nNow.z, hx, hz, PED_RADIUS);
  const world = fromLocal(out.x, out.z, angle);
  return { x: car.x + world.x, z: car.z + world.z, nx, nz, t };
}
