// Wanted level, first version. 0–5 stars, no police yet.
// Pure logic only (no three.js), so tests/wanted.test.mjs runs it in node.
// main.js reports crimes and the HUD fills the stars under the minimap.
//
// Distances are in world units, not meters. One map tile is 48 units.

export const MAX_WANTED = 5;
export const WANTED_DEAL_SEEN = 0.5;
export const WANTED_HIT = 1;
export const WANTED_SHOT = 1;
// A kill counts this instead of the hit.
export const WANTED_KILL = 2;
// A deal only counts when a pedestrian stands this close (4 tiles).
export const WITNESS_RANGE = 192;
// Seconds without a new crime before one star drops.
export const WANTED_DECAY_DELAY = 20;

export function createWanted() {
  return { level: 0, quiet: 0 };
}

export function addCrime(state, amount) {
  const raw = Number(amount);
  if (!(raw > 0)) return state.level;
  state.level = Math.min(MAX_WANTED, state.level + raw);
  state.quiet = 0;
  return state.level;
}

// One star (1.0) drops every WANTED_DECAY_DELAY quiet seconds.
export function stepWanted(state, dt) {
  if (state.level <= 0) {
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

// Points for one pedestrian hit: a kill counts WANTED_KILL, otherwise WANTED_HIT.
export function hitCrime(killed) {
  return killed ? WANTED_KILL : WANTED_HIT;
}
