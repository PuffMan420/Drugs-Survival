import assert from "node:assert/strict";
import {
  createWanted, addCrime, addShot, stepWanted, resetWanted, wantedStars, dealSeen, hitCrime,
  runOverCrime, theftCrime,
  MAX_WANTED, WANTED_DECAY_DELAY, WITNESS_RANGE, WANTED_DEAL_SEEN, WANTED_KILL, WANTED_HIT,
  WANTED_HIT_COP, WANTED_KILL_COP, WANTED_SHOT, WANTED_SHOT_COOLDOWN,
  WANTED_RUNOVER, WANTED_RUNOVER_COP, WANTED_CAR_THEFT, WANTED_CAR_THEFT_COP,
} from "../js/wanted.js";

const w = createWanted();
assert.equal(wantedStars(w), 0);
addCrime(w, WANTED_DEAL_SEEN);
assert.equal(wantedStars(w), 0);
addCrime(w, 1 - WANTED_DEAL_SEEN);
assert.equal(wantedStars(w), 1);
addCrime(w, hitCrime(true));
assert.equal(w.level, 1 + WANTED_KILL);
addCrime(w, 10);
assert.equal(w.level, MAX_WANTED);
// Decay: nothing before the delay, one star after it, crime restarts the timer
stepWanted(w, WANTED_DECAY_DELAY - 1);
assert.equal(w.level, MAX_WANTED);
stepWanted(w, 1.01);
assert.equal(w.level, MAX_WANTED - 1);
stepWanted(w, WANTED_DECAY_DELAY - 1);
addCrime(w, hitCrime(false));
assert.equal(w.level, MAX_WANTED - 1 + WANTED_HIT);
stepWanted(w, WANTED_DECAY_DELAY - 1);
assert.equal(w.level, MAX_WANTED - 1 + WANTED_HIT);
stepWanted(w, 1.01);
assert.equal(w.level, MAX_WANTED - 2 + WANTED_HIT);
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
// Cop crimes use fractional heat; stars on the HUD are still whole (floor).
assert.equal(hitCrime(false, true), WANTED_HIT_COP);
assert.equal(hitCrime(true, true), WANTED_KILL_COP);
const copHit = createWanted();
addCrime(copHit, hitCrime(false, true));
assert.equal(copHit.level, WANTED_HIT_COP);
assert.equal(wantedStars(copHit), Math.floor(WANTED_HIT_COP));
addCrime(copHit, hitCrime(true, true));
assert.equal(copHit.level, WANTED_HIT_COP + WANTED_KILL_COP);
assert.equal(wantedStars(copHit), Math.floor(WANTED_HIT_COP + WANTED_KILL_COP));
const clamped = createWanted();
addCrime(clamped, 4);
addCrime(clamped, hitCrime(true, true));
assert.equal(clamped.level, MAX_WANTED);

// Decay pauses (quiet resets) while a cop is in sight, and resumes when clear.
const decay = createWanted();
addCrime(decay, 3);
stepWanted(decay, WANTED_DECAY_DELAY - 1, false);
assert.equal(decay.level, 3);
assert.ok(decay.quiet > 0);
stepWanted(decay, 1, true);
assert.equal(decay.level, 3);
assert.equal(decay.quiet, 0);
stepWanted(decay, WANTED_DECAY_DELAY - 1, false);
assert.equal(decay.level, 3);
stepWanted(decay, 1.01, false);
assert.equal(decay.level, 2);

// Shot heat only counts once every WANTED_SHOT_COOLDOWN seconds.
const shots = createWanted();
assert.equal(addShot(shots, 0), WANTED_SHOT);
assert.equal(addShot(shots, WANTED_SHOT_COOLDOWN - 0.01), WANTED_SHOT);
assert.equal(shots.level, WANTED_SHOT);
assert.equal(addShot(shots, WANTED_SHOT_COOLDOWN), WANTED_SHOT * 2);
assert.equal(addShot(shots, Number.NaN), WANTED_SHOT * 2);
const burst = createWanted();
const rate = 12;
for (let i = 0; i <= 8 * rate; i += 1) addShot(burst, i / rate);
assert.equal(burst.level, WANTED_SHOT * 5);
assert.equal(wantedStars(burst), 1);
resetWanted(shots);
assert.equal(shots.lastShotAt, Number.NEGATIVE_INFINITY);
assert.equal(addShot(shots, 0.5), WANTED_SHOT);

// Run-over and car theft heat.
assert.equal(runOverCrime(false), WANTED_RUNOVER);
assert.equal(runOverCrime(true), WANTED_RUNOVER_COP);
assert.equal(theftCrime(0, 0, []), 0);
assert.equal(theftCrime(0, 0, [{ x: WITNESS_RANGE + 1, z: 0 }]), 0);
assert.equal(theftCrime(0, 0, [{ x: WITNESS_RANGE - 1, z: 0 }]), WANTED_CAR_THEFT);
assert.equal(theftCrime(0, 0, [{ x: 1, z: 0, dead: true }]), 0);
const copSight = 288;
assert.equal(theftCrime(0, 0, [{ x: 1, z: 0, cop: true }], copSight), WANTED_CAR_THEFT_COP);
assert.equal(theftCrime(0, 0, [{ x: copSight + 1, z: 0, cop: true }], copSight), 0);
assert.equal(
  theftCrime(0, 0, [{ x: 1, z: 0 }, { x: 2, z: 0, cop: true }], copSight),
  WANTED_CAR_THEFT_COP,
);

console.log("wanted tests passed");
