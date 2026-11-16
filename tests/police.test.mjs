import assert from "node:assert/strict";
import { desiredCops, stepBust, applyBust, MAX_COPS, BUST_TIME, BUST_HEALTH } from "../js/police.js";

assert.equal(desiredCops(0), 0);
assert.equal(desiredCops(0.5), 0);
assert.equal(desiredCops(1), 1);
assert.equal(desiredCops(2.5), 2);
assert.equal(desiredCops(5), MAX_COPS);

// Bust needs reach + low health, continuously, for BUST_TIME
let t = 0;
let r = stepBust(t, true, BUST_HEALTH, 10);
assert.equal(r.busted, false); // health not below the limit
r = stepBust(0, true, BUST_HEALTH - 1, BUST_TIME - 0.5);
assert.equal(r.busted, false);
const broken = stepBust(r.timer, false, 10, 0.1);
assert.equal(broken.timer, 0);
r = stepBust(r.timer, true, 10, 0.6);
assert.equal(r.busted, true);

const econ = { cash: 151, stock: 3 };
const loss = applyBust(econ);
assert.deepEqual(loss, { lost: 75, stockLost: 3 });
assert.equal(econ.cash, 76);
assert.equal(econ.stock, 0);
console.log("police tests passed");
