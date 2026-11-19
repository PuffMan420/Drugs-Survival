// Police v1: foot cops chase the player while the wanted level is 1 or more.
// The cops are pedestrians (same rig and clips, dark blue outfit) made by
// pedestrians.spawnCop; this module only steers them and runs the rules.
// The pure rules at the top run in node (tests/police.test.mjs).
//
// Distances are world units, not meters: a tile is 48, the player square 32.

import { PLAYER_SPEED } from "./constants.js";

// Ground speed while chasing. Equal to the player's jog (PLAYER_SPEED);
// player sprint is 1.4x, so the player can outrun cops on foot.
export const COP_SPEED = PLAYER_SPEED * 1.0;
export const COP_LEAVE_SPEED = PLAYER_SPEED * 0.5;
export const COP_DAMAGE = 8;
// Chase uses the same jog clip as pedestrians, played at native speed.
export const COP_CHASE_GAIT = "jog";
// Wanted decay only runs when no living cop is within this range (6 tiles of 48).
export const COP_SIGHT = 288;
// Seconds between one cop's punches.
export const COP_PUNCH_COOLDOWN = 1;
export const MAX_COPS = 4;
export const COPS_PER_STAR = 1;
// Seconds between two spawns, so cops arrive one by one.
export const COP_SPAWN_GAP = 0.6;
// Units from the player's centre a cop can punch from (player punch reach is 36).
export const COP_REACH = 40;
// Hit points; a fist takes two hits on a pedestrian, three on a cop.
export const COP_HP = 3;
// Busted: a cop in reach for BUST_TIME seconds while health is below BUST_HEALTH.
// Cops stop punching below BUST_HEALTH, so they arrest instead of killing.
export const BUST_TIME = 3;
export const BUST_HEALTH = 30;
export const BUST_CASH_LOSS = 0.5;
// Spawn and despawn distance past the visible half-diagonal.
export const OFFSCREEN_MARGIN = 80;

// True when any living cop is within range of (px, pz). Dead cops do not count.
export function copInSight(cops, px, pz, range = COP_SIGHT) {
  for (const cop of cops || []) {
    if (cop.dead) continue;
    if (Math.hypot(cop.x - px, cop.z - pz) <= range) return true;
  }
  return false;
}

export function desiredCops(level) {
  const stars = Math.max(0, Math.floor(Number(level) || 0));
  return Math.min(MAX_COPS, stars * COPS_PER_STAR);
}

// Returns the new timer and whether the player is busted this step.
// The timer only runs while a cop is in reach and health is low; otherwise it
// starts over, so the 3 s must be continuous.
export function stepBust(timer, copInReach, health, dt) {
  if (!copInReach || !(health < BUST_HEALTH)) return { timer: 0, busted: false };
  const next = timer + Math.max(0, Number(dt) || 0);
  return { timer: next, busted: next >= BUST_TIME };
}

// Lose all stock and BUST_CASH_LOSS of cash (rounded down).
export function applyBust(economy) {
  const lost = Math.floor(economy.cash * BUST_CASH_LOSS);
  economy.cash -= lost;
  const stockLost = economy.stock;
  economy.stock = 0;
  return { lost, stockLost };
}

export function createPolice({ pedestrians, player, wanted, economy, onBusted }) {
  const cops = [];
  let spawnWait = 0;
  let bustTimer = 0;

  function removeCop(cop) {
    pedestrians.removeCop(cop.ped);
    cops.splice(cops.indexOf(cop), 1);
  }

  function clear() {
    while (cops.length) removeCop(cops[cops.length - 1]);
    bustTimer = 0;
  }

  function spawn(radius) {
    const angle = Math.random() * Math.PI * 2;
    const x = player.x + Math.cos(angle) * radius;
    const z = player.z + Math.sin(angle) * radius;
    const ped = pedestrians.spawnCop(x, z, COP_HP);
    if (ped) cops.push({ ped, cooldown: 0, leaving: false });
  }

  function update(dt, halfW, halfH) {
    const radius = Math.hypot(halfW, halfH) + OFFSCREEN_MARGIN;
    const level = wanted.level;
    const want = level >= 1 ? desiredCops(level) : 0;
    let active = 0;
    for (const cop of cops) if (!cop.ped.dead && !cop.leaving) active += 1;
    // Fewer stars than cops: the farthest extra ones give up.
    if (active > want) {
      const chasing = cops.filter((c) => !c.ped.dead && !c.leaving);
      chasing.sort((a, b) => Math.hypot(b.ped.x - player.x, b.ped.z - player.z)
        - Math.hypot(a.ped.x - player.x, a.ped.z - player.z));
      for (let i = 0; i < active - want; i += 1) chasing[i].leaving = true;
      active = want;
    }
    spawnWait = Math.max(0, spawnWait - dt);
    const alive = cops.filter((c) => !c.ped.dead).length;
    if (active < want && alive < MAX_COPS && spawnWait === 0) {
      spawn(radius);
      spawnWait = COP_SPAWN_GAP;
    }

    let inReach = false;
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const ped = cop.ped;
      const dx = player.x - ped.x;
      const dz = player.z - ped.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (ped.dead) {
        if (dist > radius * 1.5) removeCop(cop);
        continue;
      }
      cop.cooldown = Math.max(0, cop.cooldown - dt);
      // A hit reaction plays in place.
      if (ped.phase) {
        ped.copGait = "idle";
        continue;
      }
      if (cop.leaving) {
        ped.dx = -dx / dist;
        ped.dz = -dz / dist;
        ped.x += ped.dx * COP_LEAVE_SPEED * dt;
        ped.z += ped.dz * COP_LEAVE_SPEED * dt;
        ped.copGait = "walk";
        if (dist > radius) removeCop(cop);
        continue;
      }
      ped.dx = dx / dist;
      ped.dz = dz / dist;
      if (dist > COP_REACH) {
        const stepLen = Math.min(COP_SPEED * dt, dist - COP_REACH * 0.8);
        ped.x += ped.dx * stepLen;
        ped.z += ped.dz * stepLen;
        ped.copGait = COP_CHASE_GAIT;
        continue;
      }
      ped.copGait = "idle";
      if (player.dead) continue;
      inReach = true;
      // Below BUST_HEALTH they stop hitting and hold the player for the bust.
      if (cop.cooldown === 0 && player.health >= BUST_HEALTH) {
        player.takeDamage(COP_DAMAGE, "police");
        cop.cooldown = COP_PUNCH_COOLDOWN;
      }
    }

    const bust = stepBust(bustTimer, inReach && !player.dead, player.health, dt);
    bustTimer = bust.timer;
    if (bust.busted) {
      const loss = applyBust(economy);
      wanted.level = 0;
      wanted.quiet = 0;
      clear();
      if (onBusted) onBusted(loss);
      return true;
    }
    return false;
  }

  return {
    update,
    clear,
    cops: () => cops.map((c) => c.ped),
    inSight: () => copInSight(cops.map((c) => c.ped), player.x, player.z),
    get bustTimer() {
      return bustTimer;
    },
  };
}
