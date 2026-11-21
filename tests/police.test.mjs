import assert from "node:assert/strict";
import { PLAYER_SPEED } from "../js/constants.js";
import {
  desiredCops, stepBust, applyBust, copInSight, pickCopVariant, COP_COWBOY_CHANCE,
  MAX_COPS, BUST_TIME, BUST_HEALTH, COP_SPEED, COP_SIGHT, COP_CHASE_GAIT,
} from "../js/police.js";

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
assert.equal(COP_SPEED, PLAYER_SPEED * 1.0);
assert.equal(COP_CHASE_GAIT, "jog");
assert.equal(COP_SIGHT, 288);
assert.equal(copInSight([{ x: 0, z: 0 }], 0, 0), true);
assert.equal(copInSight([{ x: COP_SIGHT, z: 0 }], 0, 0), true);
assert.equal(copInSight([{ x: COP_SIGHT + 1, z: 0 }], 0, 0), false);
assert.equal(copInSight([{ x: 0, z: 0, dead: true }], 0, 0), false);
assert.equal(copInSight([], 0, 0), false);
// Cop body pick: below COP_COWBOY_CHANCE is the cowboy-hat cop (1), else the normal cop (0).
assert.equal(COP_COWBOY_CHANCE, 0.15);
assert.equal(pickCopVariant(0), 1);
assert.equal(pickCopVariant(COP_COWBOY_CHANCE - 0.001), 1);
assert.equal(pickCopVariant(COP_COWBOY_CHANCE), 0);
assert.equal(pickCopVariant(0.99), 0);
assert.equal(pickCopVariant(0.5, 1), 1);
assert.equal(pickCopVariant(0, 0), 0);
console.log("police tests passed");
