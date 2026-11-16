import assert from "node:assert/strict";
import {
  createEconomy, buyWeed, sellWeed, pickBuyer, stepEconomy, loseOnDeath, nearSupplier,
  START_CASH, WEED_BUY_PRICE, MAX_STOCK, BUYER_COOLDOWN, WEED_SELL_MIN, WEED_SELL_MAX,
  SUPPLIER_X, SUPPLIER_Z, SELL_RANGE, HEAT_PER_DEAL,
} from "../js/economy.js";

const e = createEconomy();
assert.equal(e.cash, START_CASH);
assert.equal(e.stock, 0);
assert.equal(buyWeed(e).ok, true);
assert.equal(e.cash, START_CASH - WEED_BUY_PRICE);
assert.equal(e.stock, 1);

// Max stock
while (e.stock < MAX_STOCK) buyWeed(e);
assert.equal(buyWeed(e).reason, "full");
// Not enough cash
const poor = createEconomy(); poor.cash = WEED_BUY_PRICE - 1;
assert.equal(buyWeed(poor).reason, "cash");
assert.equal(poor.stock, 0);

// Selling
const s = createEconomy(); s.stock = 2;
const ped = { x: 0, z: 0 };
const low = sellWeed(s, ped, () => 0);
assert.equal(low.price, WEED_SELL_MIN);
assert.equal(s.cash, START_CASH + WEED_SELL_MIN);
assert.equal(s.heat, HEAT_PER_DEAL);
assert.equal(sellWeed(s, ped).reason, "cooldown");
stepEconomy(s, BUYER_COOLDOWN + 0.01);
const high = sellWeed(s, ped, () => 0.9999);
assert.equal(high.price, WEED_SELL_MAX);
assert.equal(sellWeed(s, { x: 0, z: 0 }).reason, "stock");

// Buyer pick: range, calm, cooldown
const b = createEconomy();
const near = { x: SELL_RANGE - 1, z: 0 }, far = { x: SELL_RANGE + 1, z: 0 }, scared = { x: 1, z: 0, scared: true };
assert.equal(pickBuyer(b, 0, 0, [far, near, scared], (p) => !p.scared), near);
b.cooldowns.set(near, b.clock + 5);
assert.equal(pickBuyer(b, 0, 0, [far, near], () => true), null);

// Death
const d = createEconomy(); d.cash = 201; d.stock = 4;
const loss = loseOnDeath(d);
assert.equal(loss.lost, 50);
assert.equal(d.cash, 151);
assert.equal(d.stock, 0);

assert.equal(nearSupplier(SUPPLIER_X, SUPPLIER_Z), true);
assert.equal(nearSupplier(SUPPLIER_X + 500, SUPPLIER_Z), false);
console.log("economy tests passed");
