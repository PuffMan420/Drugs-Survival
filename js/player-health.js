// Player hit points and HIGH. Vera's HUD reads player.health and player.high
// (0–100) every frame as plain properties; no events are fired.
//
// Nothing hostile attacks the player yet. Car impacts are wired in main.js.
// Future police or enemies should call player.takeDamage(amount, source).
// Weapons should scale outgoing damage with damageDealt() while the player is high.

import { SHAKE_CAR_HIT_PLAYER, SHAKE_PLAYER_HURT, addShake } from "./game-feel.js";

export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_START_HEALTH = 100;
export const PLAYER_MAX_HIGH = 100;
export const PLAYER_START_HIGH = 0;

// Incoming damage from future enemies (and debug). Named so they stay easy to retune.
export const PUNCH_PLAYER_DAMAGE = 5;
export const BAT_PLAYER_DAMAGE = 15;
export const BOTTLE_PLAYER_DAMAGE = 15;
export const PISTOL_PLAYER_DAMAGE = 20;

// Car hits use the same speed floor as pedestrian run-overs (RUNOVER_SPEED in
// pedestrians.js). Below that, the car only shoves. At the floor deal the
// minimum; reach the maximum at CAR_HIT_FULL_SPEED (a fast cruise / light flee).
export const CAR_HIT_MIN_SPEED = 40;
export const CAR_HIT_MIN_DAMAGE = 10;
export const CAR_HIT_MAX_DAMAGE = 40;
export const CAR_HIT_FULL_SPEED = 160;

// After this many seconds without taking damage, health rises slowly, but
// only up to REGEN_MAX — never toward full health.
export const REGEN_DELAY = 8;
export const REGEN_MAX = 30;
export const REGEN_PER_SECOND = 5;

// HIGH drains steadily. While any HIGH is left, hits hurt less and the
// player's own attacks hit harder. Crossing OVERDOSE_HIGH burns health.
export const HIGH_DRAIN_PER_SECOND = 2;
export const HIGH_DAMAGE_TAKEN = 0.8;
export const HIGH_DAMAGE_DEALT = 1.25;
export const OVERDOSE_HIGH = 80;
export const OVERDOSE_HP_PER_SECOND = 3;

// Seconds of no control after health reaches 0, then respawn at the spawn
// point with full health and HIGH cleared (so an overdose cannot loop).
export const DEATH_RESPAWN_DELAY = 2;

// Debug: F10 and dsDebug.addHigh() add this much HIGH.
export const DEBUG_HIGH_AMOUNT = 30;

function clamp(value, lo, hi) {
  if (!(value > lo)) return lo;
  if (value > hi) return hi;
  return value;
}

export function createPlayerVitals() {
  return {
    health: PLAYER_START_HEALTH,
    high: PLAYER_START_HIGH,
    timeSinceDamage: REGEN_DELAY,
    dead: false,
    deathAge: 0,
  };
}

// Bind the same vitals onto a player object (session.player and the player
// sprite). health / high / dead stay plain readable (and writable) properties.
export function bindPlayerVitals(target, state) {
  if (!target || !state) return state;
  Object.defineProperty(target, "health", {
    get() {
      return state.health;
    },
    set(value) {
      state.health = clamp(Number(value) || 0, 0, PLAYER_MAX_HEALTH);
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(target, "high", {
    get() {
      return state.high;
    },
    set(value) {
      state.high = clamp(Number(value) || 0, 0, PLAYER_MAX_HIGH);
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(target, "dead", {
    get() {
      return state.dead;
    },
    set(value) {
      state.dead = Boolean(value);
    },
    enumerable: true,
    configurable: true,
  });
  target.takeDamage = (amount, source) => takeDamage(state, amount, source);
  target.addHigh = (amount) => addHigh(state, amount);
  return state;
}

// Damage a car deals when it hits the player on foot. 0 if too slow.
export function carHitDamage(speed) {
  if (!(speed >= CAR_HIT_MIN_SPEED)) return 0;
  const span = CAR_HIT_FULL_SPEED - CAR_HIT_MIN_SPEED;
  const t = span > 0 ? Math.min(1, (speed - CAR_HIT_MIN_SPEED) / span) : 1;
  return CAR_HIT_MIN_DAMAGE + t * (CAR_HIT_MAX_DAMAGE - CAR_HIT_MIN_DAMAGE);
}

export function damageTaken(amount, high) {
  const raw = Number(amount);
  if (!(raw > 0)) return 0;
  if (high > 0) return raw * HIGH_DAMAGE_TAKEN;
  return raw;
}

export function damageDealt(amount, high) {
  const raw = Number(amount);
  if (!(raw > 0)) return 0;
  if (high > 0) return raw * HIGH_DAMAGE_DEALT;
  return raw;
}

function beginDeath(state) {
  state.health = 0;
  state.dead = true;
  state.deathAge = 0;
}

export function takeDamage(state, amount, source = "unknown") {
  if (!state || state.dead) {
    return { applied: 0, health: state ? state.health : 0, died: false, justDied: false };
  }
  const raw = Number(amount);
  if (!(raw > 0)) {
    return { applied: 0, health: state.health, died: false, justDied: false };
  }
  // Overdose is already a tuned drain; HIGH should not soften it again.
  const applied = source === "overdose" ? raw : damageTaken(raw, state.high);
  state.health = Math.max(0, state.health - applied);
  state.timeSinceDamage = 0;
  // Overdose ticks every frame, so it does not shake. A car hit shakes harder.
  if (applied > 0 && source !== "overdose") {
    addShake(source === "car" ? SHAKE_CAR_HIT_PLAYER : SHAKE_PLAYER_HURT);
  }
  const justDied = state.health <= 0;
  if (justDied) beginDeath(state);
  return { applied, health: state.health, died: justDied, justDied, source };
}

export function addHigh(state, amount) {
  if (!state || state.dead) return state ? state.high : 0;
  const raw = Number(amount);
  if (!(raw > 0)) return state.high;
  state.high = clamp(state.high + raw, 0, PLAYER_MAX_HIGH);
  return state.high;
}

export function healPlayer(state, amount = PLAYER_MAX_HEALTH) {
  if (!state || state.dead) return state ? state.health : 0;
  const raw = Number(amount);
  if (!(raw > 0)) return state.health;
  state.health = clamp(state.health + raw, 0, PLAYER_MAX_HEALTH);
  return state.health;
}

export function respawnPlayer(state) {
  const next = state || createPlayerVitals();
  next.health = PLAYER_START_HEALTH;
  next.high = PLAYER_START_HIGH;
  next.timeSinceDamage = REGEN_DELAY;
  next.dead = false;
  next.deathAge = 0;
  return next;
}

export function shouldRespawn(state) {
  return Boolean(state && state.dead && state.deathAge >= DEATH_RESPAWN_DELAY);
}

export function stepPlayerVitals(state, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const result = { justDied: false, readyToRespawn: false, health: state.health, high: state.high };
  if (!state) return result;
  if (state.dead) {
    state.deathAge += step;
    result.readyToRespawn = shouldRespawn(state);
    result.health = state.health;
    result.high = state.high;
    return result;
  }
  if (state.high > 0) {
    state.high = Math.max(0, state.high - HIGH_DRAIN_PER_SECOND * step);
  }
  if (state.high > OVERDOSE_HIGH) {
    const hit = takeDamage(state, OVERDOSE_HP_PER_SECOND * step, "overdose");
    result.justDied = hit.justDied;
  }
  if (!state.dead) {
    state.timeSinceDamage += step;
    if (state.timeSinceDamage >= REGEN_DELAY && state.health < REGEN_MAX) {
      state.health = Math.min(REGEN_MAX, state.health + REGEN_PER_SECOND * step);
    }
  }
  result.health = state.health;
  result.high = state.high;
  result.readyToRespawn = shouldRespawn(state);
  return result;
}
