import assert from "node:assert/strict";
import {
  createWanted, addCrime, stepWanted, resetWanted, wantedStars, dealSeen, hitCrime,
  MAX_WANTED, WANTED_DECAY_DELAY, WITNESS_RANGE, WANTED_KILL, WANTED_HIT,
} from "../js/wanted.js";

const w = createWanted();
assert.equal(wantedStars(w), 0);
addCrime(w, 0.5);
assert.equal(wantedStars(w), 0);
addCrime(w, 0.5);
assert.equal(wantedStars(w), 1);
addCrime(w, hitCrime(true));
assert.equal(w.level, 1 + WANTED_KILL);
addCrime(w, 10);
assert.equal(w.level, MAX_WANTED);
// Decay: nothing before the delay, one star after it, crime restarts the timer
stepWanted(w, WANTED_DECAY_DELAY - 1);
assert.equal(w.level, 5);
stepWanted(w, 1.01);
assert.equal(w.level, 4);
stepWanted(w, WANTED_DECAY_DELAY - 1);
addCrime(w, hitCrime(false));
assert.equal(w.level, 4 + WANTED_HIT);
stepWanted(w, WANTED_DECAY_DELAY - 1);
assert.equal(w.level, 5);
stepWanted(w, WANTED_DECAY_DELAY * 10);
assert.equal(w.level, 0);
// Reset
addCrime(w, 3); resetWanted(w);
assert.equal(w.level, 0);
// Witnesses
const buyer = { x: 0, z: 0 };
assert.equal(dealSeen(0, 0, [buyer], buyer), false);
assert.equal(dealSeen(0, 0, [buyer, { x: WITNESS_RANGE - 1, z: 0 }], buyer), true);
assert.equal(dealSeen(0, 0, [buyer, { x: WITNESS_RANGE + 1, z: 0 }], buyer), false);
assert.equal(dealSeen(0, 0, [{ x: 1, z: 0, dead: true }]), false);
console.log("wanted tests passed");
