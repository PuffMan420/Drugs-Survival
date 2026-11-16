// First game loop: buy weed from one supplier, sell it to calm pedestrians.
// Pure logic only (no three.js), so tests/economy.test.mjs runs it in node.
// main.js owns the marker, the E key and the HUD calls.
//
// Distances are in world units, not meters. One map tile is 48 units, the
// player square is 32, and a sedan is about 71 long.

export const START_CASH = 200;
export const WEED_BUY_PRICE = 20;
export const WEED_SELL_MIN = 35;
export const WEED_SELL_MAX = 50;
export const MAX_STOCK = 10;
// Seconds before the same pedestrian will buy again.
export const BUYER_COOLDOWN = 30;
// Fraction of cash lost on death. All stock is lost too.
export const DEATH_CASH_LOSS = 0.25;
// Heat added per sale. Read later by a wanted level.
export const HEAT_PER_DEAL = 0.5;

// Supplier stands two tiles northeast of the island spawn (tile 98, 202,
// centre 4728, 9720). Units, not meters.
export const SUPPLIER_X = 4728 + 96;
export const SUPPLIER_Z = 9720 - 96;
// How close the player's centre must be to the supplier to buy (units).
export const SUPPLIER_RANGE = 48;
// How close a pedestrian must be to sell (units). Punch reach is 36 from the
// player's centre; this is a little more so a deal is not fiddly.
export const SELL_RANGE = 44;

export function createEconomy() {
  return { cash: START_CASH, stock: 0, heat: 0, clock: 0, cooldowns: new Map() };
}

export function nearSupplier(x, z) {
  return Math.hypot(x - SUPPLIER_X, z - SUPPLIER_Z) <= SUPPLIER_RANGE;
}

// Returns { ok, reason, cash, stock }.
export function buyWeed(state) {
  if (state.stock >= MAX_STOCK) return { ok: false, reason: "full", cash: state.cash, stock: state.stock };
  if (state.cash < WEED_BUY_PRICE) return { ok: false, reason: "cash", cash: state.cash, stock: state.stock };
  state.cash -= WEED_BUY_PRICE;
  state.stock += 1;
  return { ok: true, cash: state.cash, stock: state.stock };
}

export function sellPrice(random = Math.random) {
  return WEED_SELL_MIN + Math.floor(random() * (WEED_SELL_MAX - WEED_SELL_MIN + 1));
}

export function canSellTo(state, buyer) {
  const until = state.cooldowns.get(buyer);
  return !(until > state.clock);
}

// Returns { ok, reason, price, cash, stock }.
export function sellWeed(state, buyer, random = Math.random) {
  if (state.stock <= 0) return { ok: false, reason: "stock", cash: state.cash, stock: state.stock };
  if (!canSellTo(state, buyer)) return { ok: false, reason: "cooldown", cash: state.cash, stock: state.stock };
  const price = sellPrice(random);
  state.stock -= 1;
  state.cash += price;
  state.heat += HEAT_PER_DEAL;
  state.cooldowns.set(buyer, state.clock + BUYER_COOLDOWN);
  return { ok: true, price, cash: state.cash, stock: state.stock };
}

// Pick the closest buyer in SELL_RANGE that the cooldown allows.
// isCalm(ped) filters out panicking, fleeing, hurt, dead and ragdolled people.
export function pickBuyer(state, x, z, peds, isCalm = () => true) {
  let best = null;
  let bestDist = SELL_RANGE;
  for (const ped of peds || []) {
    const dist = Math.hypot(ped.x - x, ped.z - z);
    if (dist > bestDist) continue;
    if (!isCalm(ped) || !canSellTo(state, ped)) continue;
    best = ped;
    bestDist = dist;
  }
  return best;
}

export function stepEconomy(state, dt) {
  state.clock += Math.max(0, Number(dt) || 0);
  for (const [buyer, until] of state.cooldowns) {
    if (until <= state.clock) state.cooldowns.delete(buyer);
  }
}

// Lose all stock and DEATH_CASH_LOSS of cash (rounded down to whole dollars).
export function loseOnDeath(state) {
  const lost = Math.floor(state.cash * DEATH_CASH_LOSS);
  state.cash -= lost;
  const stockLost = state.stock;
  state.stock = 0;
  return { lost, stockLost, cash: state.cash, stock: state.stock };
}
