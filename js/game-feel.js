// Camera shake, hit freeze, and the numbers for gun kick, flash, and knockback.
// Damage, range, fire rate, and ammo stay where they are.

export const SHAKE_MAX_OFFSET = 24;
export const SHAKE_DECAY = 2.0;
export const SHAKE_FREQ = 18;
export const SHAKE_PISTOL = 0.35;
export const SHAKE_SMG = 0.18;
export const SHAKE_SHOTGUN = 0.7;
export const SHAKE_PUNCH_HIT = 0.3;
export const SHAKE_BAT_HIT = 0.45;
export const SHAKE_BAT_HEAVY_HIT = 0.7;
export const SHAKE_BOTTLE_HIT = 0.35;
export const SHAKE_PLAYER_HURT = 0.4;
export const SHAKE_CAR_HIT_PLAYER = 0.7;

export const HITSTOP_SCALE = 0.05;
export const HITSTOP_MAX = 0.15;
export const HITSTOP_PUNCH = 0.06;
export const HITSTOP_BAT = 0.09;
export const HITSTOP_BAT_HEAVY = 0.14;
export const HITSTOP_BOTTLE = 0.07;
export const HITSTOP_PISTOL_HIT = 0.03;
export const HITSTOP_SHOTGUN_HIT = 0.06;
export const HITSTOP_SMG_HIT = 0;
export const HITSTOP_KILL_BONUS = 0.04;

export const HIT_FLASH_TIME = 0.08;
export const KNOCK_TIME = 0.15;
export const KNOCK_PUNCH = 8;
export const KNOCK_PISTOL = 6;
export const KNOCK_SMG = 1.5;
export const KNOCK_SHOTGUN_PELLET = 7;
export const KNOCK_BAT = 18;
export const KNOCK_BAT_HEAVY = 30;
export const KNOCK_BOTTLE = 10;
export const KILL_KNOCK_MULT = 1.6;

export const PISTOL_KICK_BACK = 0.08;
export const PISTOL_KICK_UP_DEG = 10;
export const PISTOL_KICK_RETURN = 0.12;
export const SMG_KICK_BACK = 0.04;
export const SMG_KICK_UP_DEG = 5;
export const SMG_KICK_RETURN = 0.06;
export const SMG_KICK_SIDE_DEG = 4;

export const SHOTGUN_PLAYER_PUSH = 4;
export const PLAYER_PUSH_TIME = 0.1;

export const FLASH_SCALE_PISTOL = 1.0;
export const FLASH_SCALE_SMG = 0.8;
export const FLASH_SCALE_SHOTGUN = 1.7;

export const MUZZLE_LIGHT_INTENSITY = 3;
export const MUZZLE_LIGHT_DISTANCE = 70;
export const MUZZLE_LIGHT_DECAY = 0;
export const MUZZLE_LIGHT_TIME = 0.05;

export const TRACER_TIME = 0.07;
export const TRACER_WIDTH = 2;
export const TRACER_POOL = 12;

export const HITMARK_SCALE = 1.3;
export const HITMARK_TIME = 0.1;
export const HITMARK_KILL_SCALE = 1.6;
export const HITMARK_KILL_TIME = 0.2;

// Screen kick: the view jumps a little away from the shot, then eases back.
// World units (one tile is 48). KICK_DECAY is per second; higher snaps back faster.
export const KICK_PISTOL = 2.5;
export const KICK_SMG = 1.2;
export const KICK_SHOTGUN = 9;
export const KICK_MAX = 12;
export const KICK_DECAY = 14;

// Muzzle flash: random turn every shot and a size wobble of +/- this much.
export const FLASH_JITTER = 0.2;

// Where a bullet stops on the ground or a wall: a dust puff and a spark.
export const IMPACT_POOL = 24;
export const IMPACT_TIME = 0.32;
export const IMPACT_SIZE = 9;
export const IMPACT_GROW = 2.2;
export const IMPACT_SPARK_SIZE = 7;
export const IMPACT_SPARK_TIME = 0.06;

// Empty shells thrown out of the gun's right side.
export const SHELL_POOL = 32;
export const SHELL_LIFE = 1.2;
export const SHELL_SPEED = 55;
export const SHELL_UP = 45;
export const SHELL_GRAVITY = 260;
export const SHELL_SIZE = [2.4, 1.1, 1.1];

let feel = true;
let trauma = 0;
let shakeClock = 0;
let stopLeft = 0;
let markLeft = 0;
let markScale = 1;
let pushX = 0;
let pushZ = 0;
let pushLeft = 0;
let kickX = 0;
let kickZ = 0;

const offset = { x: 0, z: 0 };
const pushOut = { x: 0, z: 0 };

export function feelOn() {
  return feel;
}

export function setFeel(on) {
  feel = Boolean(on);
  if (feel) return;
  trauma = 0;
  stopLeft = 0;
  markLeft = 0;
  markScale = 1;
  pushLeft = 0;
  kickX = 0;
  kickZ = 0;
  offset.x = 0;
  offset.z = 0;
}

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function noise(t) {
  const i = Math.floor(t);
  const f = t - i;
  return hash(i) + (hash(i + 1) - hash(i)) * fade(f);
}

export function addShake(amount) {
  if (!feel || !(amount > 0)) return;
  trauma = Math.min(1, trauma + amount);
}

// Push the view away from a shot along the ground (dirX, dirZ is the aim).
// Works at any camera yaw: it is a world offset, like the shake.
export function addKick(dirX, dirZ, amount) {
  if (!feel || !(amount > 0)) return;
  const len = Math.hypot(dirX, dirZ) || 1;
  kickX -= (dirX / len) * amount;
  kickZ -= (dirZ / len) * amount;
  const size = Math.hypot(kickX, kickZ);
  if (size > KICK_MAX) {
    kickX *= KICK_MAX / size;
    kickZ *= KICK_MAX / size;
  }
}

// Ground-plane offset for this frame (shake plus kick). Call once, with real time, after the shots.
export function sampleShake(realDt) {
  const dt = Math.max(0, realDt);
  if (markLeft > 0) markLeft = Math.max(0, markLeft - dt);
  offset.x = 0;
  offset.z = 0;
  if (!feel) {
    trauma = 0;
    kickX = 0;
    kickZ = 0;
    return offset;
  }
  if (kickX !== 0 || kickZ !== 0) {
    offset.x = kickX;
    offset.z = kickZ;
    const keep = Math.exp(-KICK_DECAY * dt);
    kickX *= keep;
    kickZ *= keep;
    if (Math.hypot(kickX, kickZ) < 0.05) {
      kickX = 0;
      kickZ = 0;
    }
  }
  if (trauma <= 0) {
    trauma = 0;
    return offset;
  }
  shakeClock += dt * SHAKE_FREQ;
  const nx = noise(shakeClock) * 2 - 1;
  const nz = noise(shakeClock + 19.2) * 2 - 1;
  const len = Math.hypot(nx, nz) || 1;
  const mag = SHAKE_MAX_OFFSET * trauma * trauma;
  offset.x += (nx / len) * mag;
  offset.z += (nz / len) * mag;
  trauma = Math.max(0, trauma - SHAKE_DECAY * dt);
  return offset;
}

// Keeps the longest freeze asked for, and never longer than HITSTOP_MAX.
export function hitStop(seconds) {
  if (!feel || !(seconds > 0)) return;
  stopLeft = Math.min(HITSTOP_MAX, Math.max(stopLeft, seconds));
}

// 1, or HITSTOP_SCALE while a freeze is running. The timer uses real time.
export function worldScale(realDt) {
  if (!feel || stopLeft <= 0) {
    stopLeft = 0;
    return 1;
  }
  stopLeft = Math.max(0, stopLeft - Math.max(0, realDt));
  return HITSTOP_SCALE;
}

export function markHit(kill) {
  if (!feel) return;
  const scale = kill ? HITMARK_KILL_SCALE : HITMARK_SCALE;
  const time = kill ? HITMARK_KILL_TIME : HITMARK_TIME;
  if (kill || markLeft <= 0 || scale >= markScale) {
    markScale = scale;
    markLeft = time;
    return;
  }
  markLeft = Math.max(markLeft, time);
}

export function crosshairScale() {
  if (!feel || markLeft <= 0) return 1;
  return markScale;
}

export function requestPlayerPush(dirX, dirZ, distance) {
  if (!feel || !(distance > 0)) return;
  const len = Math.hypot(dirX, dirZ) || 1;
  pushX = (dirX / len) * distance;
  pushZ = (dirZ / len) * distance;
  pushLeft = PLAYER_PUSH_TIME;
}

export function consumePlayerPush(realDt) {
  pushOut.x = 0;
  pushOut.z = 0;
  if (!feel || pushLeft <= 0) {
    pushLeft = 0;
    return pushOut;
  }
  const step = Math.min(Math.max(realDt, 0), pushLeft);
  pushOut.x = pushX * (step / PLAYER_PUSH_TIME);
  pushOut.z = pushZ * (step / PLAYER_PUSH_TIME);
  pushLeft -= step;
  return pushOut;
}
