// Gunfight punch helpers. Numbers that already live in game-feel.js stay there.
// This file has no "three" import so unit tests can run in Node.

export const ASPHALT_TOP = 0.2 + 192 * 0.01;
export const TIRE_ABOVE_ASPHALT = 0.15;

export const SHELL_KIND_BRASS = "brass";
export const SHELL_KIND_SHOTGUN = "shotgun";
export const SHELL_COLOR_BRASS = 0xd9b44a;
export const SHELL_COLOR_SHOTGUN = 0xd33b2c;
export const SHELL_FADE = 1.4;
export const SHELL_BOUNCES = 3;
export const SHELL_RESTITUTION = 0.35;
export const SHELL_SLIDE = 0.45;
export const SHOTGUN_SHELL_SIZE = [2.5, 0.75, 0.75];

export const IMPACT_METAL = "metal";
export const IMPACT_CONCRETE = "concrete";
export const IMPACT_FLESH = "flesh";

export const SPARK_COLOR_HOT = 0xff9a32;
export const SPARK_COLOR_CORE = 0xfff6e0;
export const DUST_COLOR_CONCRETE = 0xc8c0b4;
export const DUST_COLOR_DIRT = 0xb9a27a;
export const DUST_COLOR_METAL = 0x8a8a8a;
export const DEBRIS_COLOR_METAL = 0x6a5a4a;
export const DEBRIS_COLOR_CONCRETE = 0xb8b0a4;
export const FLESH_HIT_COLOR = 0x8a1e1e;

export const SPARKS_METAL = 12;
export const SPARKS_CONCRETE = 3;
export const SPARKS_FLESH = 0;
export const DEBRIS_METAL = 4;
export const DEBRIS_CONCRETE = 5;
export const FLESH_STREAKS = 4;

export const SMOKE_POOL = 40;
export const SMOKE_LIFE = 0.75;
export const SMOKE_SIZE = 9;
export const SMOKE_COLOR = 0xc4c4c4;

export const RAGDOLL_UP_MAX = 14;
export const RAGDOLL_UP_MIN = 6;

export const MAX_FX_CHANNEL = 16;

export function asphaltTopY(roadY) {
  if (!Number.isFinite(roadY)) return ASPHALT_TOP;
  return roadY - TIRE_ABOVE_ASPHALT;
}

export function shellRestY(roadY, halfHeight) {
  const half = Number.isFinite(halfHeight) && halfHeight > 0 ? halfHeight : 0;
  return asphaltTopY(roadY) + half;
}

export function shellSizeFor(kind, brassSize) {
  if (kind === SHELL_KIND_SHOTGUN) return SHOTGUN_SHELL_SIZE;
  return brassSize || null;
}

export function shellRadius(size) {
  const diameter = Array.isArray(size) ? size[1] : size;
  return (Number(diameter) > 0 ? Number(diameter) : 0.54) * 0.5;
}


export function shellColorFor(kind) {
  return kind === SHELL_KIND_SHOTGUN ? SHELL_COLOR_SHOTGUN : SHELL_COLOR_BRASS;
}

export function shellEjectVelocity(aimX, aimZ, random = Math.random, speed = 55, up = 45) {
  const len = Math.hypot(aimX, aimZ) || 1;
  const ax = aimX / len;
  const az = aimZ / len;
  const rightX = -az;
  const rightZ = ax;
  const spread = 0.8 + random() * 0.4;
  return {
    vx: rightX * speed * spread - ax * 12,
    vz: rightZ * speed * spread - az * 12,
    vy: up * (0.85 + random() * 0.35),
    spin: (random() * 2 - 1) * 20,
  };
}

export function stepShellPhysics(slot, dt, floorY, opts = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const life = opts.life > 0 ? opts.life : 10;
  const fade = opts.fade > 0 ? opts.fade : SHELL_FADE;
  const gravity = Number.isFinite(opts.gravity) ? opts.gravity : 260;
  const maxBounces = opts.maxBounces > 0 ? opts.maxBounces : SHELL_BOUNCES;
  const floor = Number.isFinite(floorY) ? floorY : ASPHALT_TOP;
  slot.age = (slot.age || 0) + step;
  if (slot.age >= life) {
    slot.age = life;
    slot.scale = 0;
    slot.alive = false;
    return slot;
  }
  if ((slot.bounces || 0) < maxBounces) {
    slot.vy -= gravity * step;
    slot.x += slot.vx * step;
    slot.y += slot.vy * step;
    slot.z += slot.vz * step;
    slot.ry = (slot.ry || 0) + (slot.spin || 0) * step;
    slot.rz = (slot.rz || 0) + (slot.spin || 0) * 0.5 * step;
    if (slot.y <= floor && slot.vy < 0) {
      slot.y = floor;
      slot.vy = -slot.vy * SHELL_RESTITUTION;
      slot.vx *= SHELL_SLIDE;
      slot.vz *= SHELL_SLIDE;
      slot.spin *= 0.5;
      slot.bounces = (slot.bounces || 0) + 1;
      if (slot.bounces >= maxBounces) {
        slot.vy = 0;
        slot.vx = 0;
        slot.vz = 0;
        slot.spin = 0;
        slot.rz = 0;
        slot.y = floor;
      }
    }
  } else {
    slot.y = floor;
    slot.vy = 0;
    slot.vx = 0;
    slot.vz = 0;
  }
  const fadeStart = life - fade;
  if (slot.age > fadeStart) {
    slot.scale = Math.max(0.01, 1 - (slot.age - fadeStart) / fade);
  } else {
    slot.scale = 1;
  }
  slot.alive = true;
  return slot;
}

export function bloomSafeChannel(value, cap = MAX_FX_CHANNEL) {
  const n = Number(value);
  const limit = Number.isFinite(cap) && cap > 0 ? cap : MAX_FX_CHANNEL;
  if (!Number.isFinite(n) || n < 0 || n > limit) return 0;
  return n;
}

export function bloomSafeColor(hex, intensity = 1) {
  const raw = Number(hex);
  const color = Number.isFinite(raw) ? raw >>> 0 : 0;
  const glow = bloomSafeChannel(intensity, MAX_FX_CHANNEL) || 0;
  const r = bloomSafeChannel(((color >> 16) & 255) / 255 * glow);
  const g = bloomSafeChannel(((color >> 8) & 255) / 255 * glow);
  const b = bloomSafeChannel((color & 255) / 255 * glow);
  return { hex: color & 0xffffff, r, g, b, intensity: glow };
}

export function impactSpec(surface) {
  if (surface === IMPACT_METAL) {
    return {
      surface: IMPACT_METAL,
      sparks: SPARKS_METAL,
      sparkColor: SPARK_COLOR_CORE,
      sparkHot: SPARK_COLOR_HOT,
      sparkSize: 0.2,
      sparkLength: 9.5,
      sparkThick: 0.42,
      sparkLife: 0.15,
      dustColor: DUST_COLOR_METAL,
      dustSize: 6,
      dustLife: 0.28,
      debris: DEBRIS_METAL,
      debrisColor: DEBRIS_COLOR_METAL,
    };
  }
  if (surface === IMPACT_FLESH) {
    return {
      surface: IMPACT_FLESH,
      sparks: SPARKS_FLESH,
      sparkColor: FLESH_HIT_COLOR,
      sparkHot: FLESH_HIT_COLOR,
      sparkSize: 0.16,
      sparkLength: 3,
      sparkThick: 0.14,
      sparkLife: 0.1,
      dustColor: FLESH_HIT_COLOR,
      dustSize: 6,
      dustLife: 0.22,
      debris: 0,
      debrisColor: FLESH_HIT_COLOR,
      streaks: FLESH_STREAKS,
    };
  }
  return {
    surface: IMPACT_CONCRETE,
    sparks: SPARKS_CONCRETE,
    sparkColor: SPARK_COLOR_HOT,
    sparkHot: SPARK_COLOR_CORE,
    sparkSize: 0.16,
    sparkLength: 5.5,
    sparkThick: 0.32,
    sparkLife: 0.11,
    dustColor: surface === "dirt" ? DUST_COLOR_DIRT : DUST_COLOR_CONCRETE,
    dustSize: 12,
    dustLife: 0.45,
    debris: DEBRIS_CONCRETE,
    debrisColor: DEBRIS_COLOR_CONCRETE,
  };
}

function basisFromNormal(nx, ny, nz) {
  const len = Math.hypot(nx, ny, nz) || 1;
  const x = nx / len;
  const y = ny / len;
  const z = nz / len;
  let sx = -z;
  let sy = 0;
  let sz = x;
  let side = Math.hypot(sx, sy, sz);
  if (side < 1e-6) {
    sx = 1;
    sy = 0;
    sz = 0;
    side = 1;
  }
  sx /= side;
  sy /= side;
  sz /= side;
  return {
    nx: x,
    ny: y,
    nz: z,
    sx,
    sy,
    sz,
    ux: sy * z - sz * y,
    uy: sz * x - sx * z,
    uz: sx * y - sy * x,
  };
}

export function impactBurst(origin, normal, surface, random = Math.random) {
  const spec = impactSpec(surface);
  const nx = normal && Number.isFinite(normal.x) ? normal.x : 0;
  const ny = normal && Number.isFinite(normal.y) ? normal.y : 1;
  const nz = normal && Number.isFinite(normal.z) ? normal.z : 0;
  const basis = basisFromNormal(nx, ny, nz);
  const particles = [];
  const scatter = (speed) => {
    const yaw = (random() * 2 - 1) * 0.85;
    const pitch = (random() * 2 - 1) * 0.85;
    const vx = basis.nx + basis.sx * yaw + basis.ux * pitch;
    const vy = basis.ny + basis.sy * yaw + basis.uy * pitch;
    const vz = basis.nz + basis.sz * yaw + basis.uz * pitch;
    const len = Math.hypot(vx, vy, vz) || 1;
    const mag = speed * (0.65 + random() * 0.55);
    return { vx: (vx / len) * mag, vy: (vy / len) * mag, vz: (vz / len) * mag };
  };
  for (let i = 0; i < spec.sparks; i += 1) {
    const vel = scatter(surface === IMPACT_METAL ? 150 : 90);
    const length = (spec.sparkLength || 5) * (0.75 + random() * 0.5);
    const thick = (spec.sparkThick || 0.16) * (0.8 + random() * 0.4);
    particles.push({
      kind: "spark",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      ...vel,
      color: i % 2 === 0 ? spec.sparkColor : spec.sparkHot,
      size: thick,
      length,
      thick,
      life: spec.sparkLife * (0.85 + random() * 0.3),
    });
  }
  if (spec.dustLife > 0) {
    particles.push({
      kind: "dust",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: basis.nx * 4,
      vy: 8 + random() * 4,
      vz: basis.nz * 4,
      color: spec.dustColor,
      size: spec.dustSize * (0.85 + random() * 0.3),
      life: spec.dustLife,
    });
  }
  for (let i = 0; i < spec.debris; i += 1) {
    const vel = scatter(38);
    particles.push({
      kind: "debris",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: vel.vx,
      vy: Math.abs(vel.vy) * 0.6 + 10,
      vz: vel.vz,
      color: spec.debrisColor,
      size: 1.2 + random() * 1.1,
      life: 0.55,
    });
  }
  const streaks = spec.streaks || 0;
  for (let i = 0; i < streaks; i += 1) {
    const vel = scatter(42);
    particles.push({
      kind: "streak",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      ...vel,
      color: FLESH_HIT_COLOR,
      size: 3.2 + random() * 1.6,
      life: 0.2,
    });
  }
  for (const part of particles) {
    const safe = bloomSafeColor(part.color, 1);
    part.color = safe.hex;
    part.r = safe.r;
    part.g = safe.g;
    part.b = safe.b;
  }
  return { spec, particles };
}

export function stepImpactParticle(part, dt, floorY) {
  const step = Math.max(0, Number(dt) || 0);
  const life = part.life > 0 ? part.life : 0.2;
  part.age = (part.age || 0) + step;
  if (part.age >= life) {
    part.age = life;
    part.alive = false;
    part.opacity = 0;
    return part;
  }
  const t = part.age / life;
  part.x += (part.vx || 0) * step;
  part.y += (part.vy || 0) * step;
  part.z += (part.vz || 0) * step;
  if (part.kind === "debris" || part.kind === "streak") {
    part.vy = (part.vy || 0) - 220 * step;
    const floor = Number.isFinite(floorY) ? floorY : ASPHALT_TOP;
    if (part.y < floor) {
      part.y = floor;
      part.vy = 0;
      part.vx *= 0.4;
      part.vz *= 0.4;
    }
  }
  if (part.kind === "dust") {
    part.vy = (part.vy || 0) + 4 * step;
    if (!part.baseSize) part.baseSize = part.size;
    part.size = part.baseSize * (1 + 1.2 * t);
  }
  if (part.kind === "spark") {
    if (!part.baseLength) part.baseLength = part.length || part.size || 5;
    part.length = part.baseLength * (1 - 0.35 * t);
    part.vy = (part.vy || 0) - 40 * step;
  }
  part.opacity = part.kind === "spark" ? 1 - t * t : 1 - t;
  part.alive = true;
  return part;
}

export function gunsmokeWisp(origin, aimX, aimZ, random = Math.random, heat = 1) {
  const len = Math.hypot(aimX, aimZ) || 1;
  const ax = aimX / len;
  const az = aimZ / len;
  const side = (random() * 2 - 1) * 6;
  return {
    x: origin.x + ax * 1.2,
    y: origin.y,
    z: origin.z + az * 1.2,
    vx: -ax * 4 + -az * side * 0.15,
    vy: 10 + random() * 6 + Math.max(0, heat) * 3,
    vz: -az * 4 + ax * side * 0.15,
    curl: (random() * 2 - 1) * 2.2,
    size: SMOKE_SIZE * (0.7 + random() * 0.5) * (0.85 + Math.min(1.4, Math.max(0.6, heat)) * 0.2),
    life: SMOKE_LIFE * (0.85 + random() * 0.3),
    age: 0,
    opacity: 0.7,
    rotation: random() * Math.PI * 2,
  };
}

export function stepGunsmoke(wisp, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const life = wisp.life > 0 ? wisp.life : SMOKE_LIFE;
  wisp.age = (wisp.age || 0) + step;
  if (wisp.age >= life) {
    wisp.age = life;
    wisp.alive = false;
    wisp.opacity = 0;
    return wisp;
  }
  const t = wisp.age / life;
  const swirl = Math.sin(wisp.age * 8) * (wisp.curl || 0);
  wisp.x += ((wisp.vx || 0) + swirl) * step;
  wisp.y += (wisp.vy || 0) * step;
  wisp.z += ((wisp.vz || 0) + swirl * 0.35) * step;
  wisp.vy = (wisp.vy || 0) * Math.exp(-0.8 * step);
  wisp.rotation = (wisp.rotation || 0) + (wisp.curl || 0) * step;
  if (!wisp.baseSize) wisp.baseSize = wisp.size;
  wisp.size = wisp.baseSize * (1 + 0.9 * t);
  wisp.opacity = 0.7 * (1 - t) * (t < 0.12 ? t / 0.12 : 1);
  wisp.alive = true;
  return wisp;
}

export function shotDirection(dirX, dirZ) {
  const len = Math.hypot(dirX, dirZ) || 1;
  return { x: dirX / len, z: dirZ / len };
}

export function livingKnockOffset(dirX, dirZ, distance) {
  const dir = shotDirection(dirX, dirZ);
  const dist = Math.max(0, Number(distance) || 0);
  return { x: dir.x * dist, z: dir.z * dist };
}

export function ragdollKickFromShot(dirX, dirZ, knock, kill = false, killMult = 1.6) {
  const dir = shotDirection(dirX, dirZ);
  const dist = Math.max(0, Number(knock) || 0) * (kill ? killMult : 1);
  const up = Math.min(RAGDOLL_UP_MAX, Math.max(RAGDOLL_UP_MIN, 7 + dist * 0.08));
  return { x: dir.x * dist, y: up, z: dir.z * dist };
}

export function ragdollLinvel(kick) {
  const hx = kick && Number.isFinite(kick.x) ? kick.x : 0;
  const hz = kick && Number.isFinite(kick.z) ? kick.z : 0;
  const speed = Math.hypot(hx, hz) || 1;
  const scale = Math.min(26 + speed * 0.28, 70) / speed;
  const fallback = Math.min(12 + speed * 0.05, 26);
  const hasUp = kick && Number.isFinite(kick.y);
  const rawUp = hasUp ? kick.y : fallback;
  const up = hasUp ? Math.min(RAGDOLL_UP_MAX, Math.max(0, rawUp)) : rawUp;
  return { x: hx * scale, y: up, z: hz * scale };
}

export function fleshStreaks(origin, dirX, dirZ, random = Math.random, count = FLESH_STREAKS) {
  const dir = shotDirection(dirX, dirZ);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const yaw = (random() * 2 - 1) * 0.45;
    const cx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
    const cz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
    const speed = 28 + random() * 22;
    out.push({
      kind: "streak",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: cx * speed,
      vy: 8 + random() * 10,
      vz: cz * speed,
      color: FLESH_HIT_COLOR,
      size: 3 + random() * 1.8,
      life: 0.2,
    });
  }
  return out;
}
