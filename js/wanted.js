// Wanted level, 0–5 stars. Pure logic only (no three.js), so
// tests/wanted.test.mjs runs it in node. main.js reports crimes and the HUD
// fills the stars under the minimap. Decay only runs when no cop is in sight.
//
// Distances are in world units, not meters. One map tile is 48 units.

export const MAX_WANTED = 5;
export const WANTED_DEAL_SEEN = 0.25;
export const WANTED_HIT = 0.34;
export const WANTED_SHOT = 0.25;
// A shot only adds heat if this many seconds have passed since the last counted shot.
export const WANTED_SHOT_COOLDOWN = 2;
// A kill counts this instead of the hit.
export const WANTED_KILL = 1;
// Hitting a cop is worse than hitting a pedestrian. A kill replaces the hit.
export const WANTED_HIT_COP = 0.75;
export const WANTED_KILL_COP = 2;
// A deal or car theft only counts when a pedestrian stands this close (2 tiles).
export const WITNESS_RANGE = 96;
// Seconds without a new crime before one star drops.
export const WANTED_DECAY_DELAY = 20;
// Running someone over in the player's driven car. A cop counts more.
export const WANTED_RUNOVER = 0.5;
export const WANTED_RUNOVER_COP = 1;
// Stealing a car, only when a living witness is nearby. A cop in sight counts more.
export const WANTED_CAR_THEFT = 0.25;
export const WANTED_CAR_THEFT_COP = 1;

export function createWanted() {
  return { level: 0, quiet: 0, lastShotAt: Number.NEGATIVE_INFINITY };
}

export function addCrime(state, amount) {
  const raw = Number(amount);
  if (!(raw > 0)) return state.level;
  state.level = Math.min(MAX_WANTED, state.level + raw);
  state.quiet = 0;
  return state.level;
}

// Adds WANTED_SHOT if at least WANTED_SHOT_COOLDOWN seconds have passed since
// the last counted shot. `now` is a clock in seconds (same unit as stepWanted).
export function addShot(state, now) {
  const t = Number(now);
  if (!Number.isFinite(t)) return state.level;
  const last = Number(state.lastShotAt);
  if (Number.isFinite(last) && t - last < WANTED_SHOT_COOLDOWN) return state.level;
  state.lastShotAt = t;
  return addCrime(state, WANTED_SHOT);
}

// One star (1.0) drops every WANTED_DECAY_DELAY quiet seconds.
// watched: a living cop is within COP_SIGHT. The quiet timer resets and does
// not advance, so decay needs a continuous stretch with no cop nearby.
export function stepWanted(state, dt, watched = false) {
  if (state.level <= 0) {
    state.quiet = 0;
    return state.level;
  }
  if (watched) {
    state.quiet = 0;
    return state.level;
  }
  state.quiet += Math.max(0, Number(dt) || 0);
  while (state.quiet >= WANTED_DECAY_DELAY && state.level > 0) {
    state.quiet -= WANTED_DECAY_DELAY;
    state.level = Math.max(0, state.level - 1);
  }
  return state.level;
}

export function resetWanted(state) {
  state.level = 0;
  state.quiet = 0;
  state.lastShotAt = Number.NEGATIVE_INFINITY;
}

// Whole stars shown on the HUD.
export function wantedStars(state) {
  return Math.min(MAX_WANTED, Math.floor(state.level));
}

// True when any of peds (except the buyer) is within WITNESS_RANGE of x, z.
export function dealSeen(x, z, peds, buyer = null) {
  for (const ped of peds || []) {
    if (ped === buyer || ped.dead) continue;
    if (Math.hypot(ped.x - x, ped.z - z) <= WITNESS_RANGE) return true;
  }
  return false;
}

// Points for one hit: a kill counts the kill amount instead of the hit.
// Cops use WANTED_HIT_COP / WANTED_KILL_COP; everyone else uses the pedestrian values.
export function hitCrime(killed, isCop = false) {
  if (isCop) return killed ? WANTED_KILL_COP : WANTED_HIT_COP;
  return killed ? WANTED_KILL : WANTED_HIT;
}

// Heat for running someone over in the player's driven car.
export function runOverCrime(isCop = false) {
  return isCop ? WANTED_RUNOVER_COP : WANTED_RUNOVER;
}

// Heat for stealing a car. A living cop within copSight counts more than a
// living pedestrian within WITNESS_RANGE. Nobody is excluded. No witness means no heat.
export function theftCrime(x, z, peds, copSight) {
  const sight = Number(copSight);
  let copWitness = false;
  let pedWitness = false;
  for (const ped of peds || []) {
    if (ped.dead) continue;
    const dist = Math.hypot(ped.x - x, ped.z - z);
    if (ped.cop && Number.isFinite(sight) && dist <= sight) copWitness = true;
    else if (dist <= WITNESS_RANGE) pedWitness = true;
  }
  if (copWitness) return WANTED_CAR_THEFT_COP;
  if (pedWitness) return WANTED_CAR_THEFT;
  return 0;
}
