import assert from "node:assert/strict";
import {
  DRUG_COUNT_FULE,
  DRUG_COUNT_METH,
  DRUG_HIGH_FULL,
  DRUG_MIN_SEPARATION,
  DRUG_PICKUP_RADIUS,
  DRUG_RESPAWN,
  DRUG_SOUNDS,
  FULE_DURATION,
  FULE_EFFECT,
  FULE_ID,
  FULE_LINE,
  FULE_SPEED,
  METH_DURATION,
  METH_EFFECT,
  METH_ID,
  METH_LINE,
  METH_REGEN_PER_SECOND,
  METH_SPEED,
  assignBagKinds,
  canPickup,
  chooseSpots,
  clearDrugBuffs,
  collectSidewalkSpots,
  createDrugBuffs,
  drugActive,
  drugEffect,
  drugHigh,
  drugLine,
  drugName,
  drugSound,
  drugSpeed,
  formatDrugChip,
  formatDrugClock,
  hideBag,
  isSidewalkHeight,
  maybeRespawnBag,
  stepDrugBuffs,
  takeDrug,
} from "../js/drugs.js";
import {
  OVERDOSE_HIGH,
  PLAYER_MAX_HEALTH,
  createPlayerVitals,
  healPlayer,
  stepPlayerVitals,
} from "../js/player-health.js";

const almost = (got, want, eps = 1e-6) => assert.ok(Math.abs(got - want) <= eps, `${got} != ${want}`);

// Meth: speed, regen, duration, and a full HIGH orb that drains with the buff.
{
  const buffs = createDrugBuffs();
  takeDrug(buffs, METH_ID);
  assert.equal(drugSpeed(buffs), METH_SPEED);
  assert.equal(drugHigh(buffs), DRUG_HIGH_FULL);
  const first = stepDrugBuffs(buffs, 1);
  almost(first.regen, METH_REGEN_PER_SECOND);
  almost(buffs.meth, METH_DURATION - 1);
  almost(first.high, ((METH_DURATION - 1) / METH_DURATION) * DRUG_HIGH_FULL);
  assert.equal(first.freezeHigh, true);
  const rest = stepDrugBuffs(buffs, METH_DURATION);
  almost(rest.regen, METH_REGEN_PER_SECOND * (METH_DURATION - 1));
  assert.equal(buffs.meth, 0);
  assert.equal(drugSpeed(buffs), 1);
  assert.equal(rest.freezeHigh, false);
}

// FULE: bigger speed, no regen, shorter timer.
{
  const buffs = createDrugBuffs();
  takeDrug(buffs, FULE_ID);
  assert.equal(drugSpeed(buffs), FULE_SPEED);
  const tick = stepDrugBuffs(buffs, 1);
  assert.equal(tick.regen, 0);
  almost(buffs.fule, FULE_DURATION - 1);
  stepDrugBuffs(buffs, FULE_DURATION);
  assert.equal(buffs.fule, 0);
  assert.equal(drugSpeed(buffs), 1);
}

// Same drug again resets its own timer and does not stack.
{
  const buffs = createDrugBuffs();
  takeDrug(buffs, METH_ID);
  stepDrugBuffs(buffs, 8);
  almost(buffs.meth, METH_DURATION - 8);
  takeDrug(buffs, METH_ID);
  almost(buffs.meth, METH_DURATION);
  takeDrug(buffs, METH_ID);
  almost(buffs.meth, METH_DURATION);
}

// Both at once: the higher speed wins. Meth still regenerates.
{
  const buffs = createDrugBuffs();
  takeDrug(buffs, METH_ID);
  takeDrug(buffs, FULE_ID);
  assert.equal(drugSpeed(buffs), FULE_SPEED);
  const tick = stepDrugBuffs(buffs, 1);
  almost(tick.regen, METH_REGEN_PER_SECOND);
  assert.equal(tick.speed, FULE_SPEED);
  // HIGH follows the stronger remaining fraction (meth lasts longer).
  almost(tick.high, ((METH_DURATION - 1) / METH_DURATION) * DRUG_HIGH_FULL);
}

// Pickup radius, and never while driving or dead.
{
  const bag = { x: 0, z: 0, hidden: false };
  assert.equal(canPickup(bag, 0, 0, { driving: false, dead: false }), true);
  assert.equal(canPickup(bag, DRUG_PICKUP_RADIUS, 0, {}), true);
  assert.equal(canPickup(bag, DRUG_PICKUP_RADIUS + 0.01, 0, {}), false);
  assert.equal(canPickup(bag, 0, 0, { driving: true }), false);
  assert.equal(canPickup(bag, 0, 0, { dead: true }), false);
  bag.hidden = true;
  assert.equal(canPickup(bag, 0, 0, {}), false);
}

// A used bag comes back after DRUG_RESPAWN seconds.
{
  const bag = { x: 1, z: 1, hidden: false, respawnAt: 0 };
  hideBag(bag, 10);
  assert.equal(bag.hidden, true);
  assert.equal(maybeRespawnBag(bag, 10 + DRUG_RESPAWN - 0.01), false);
  assert.equal(maybeRespawnBag(bag, 10 + DRUG_RESPAWN), true);
  assert.equal(bag.hidden, false);
}

// Placement: sidewalk filter, separation, and 4 of each kind.
{
  assert.equal(isSidewalkHeight(2.0, 0.6), true);
  assert.equal(isSidewalkHeight(1.2, 0.6), false);
  const spawn = { x: 0, z: 0 };
  const sample = (x, z) => ({ y: Math.abs(z) > 40 ? 3 : 0.6, streetY: 0.6 });
  const spots = collectSidewalkSpots(spawn, sample, { radius: 200, step: 20, minDist: 60 });
  assert.ok(spots.length >= 8, `spots ${spots.length}`);
  const picked = chooseSpots(spots, 8);
  assert.equal(picked.length, 8);
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      const dist = Math.hypot(picked[i].x - picked[j].x, picked[i].z - picked[j].z);
      assert.ok(dist >= DRUG_MIN_SEPARATION - 1e-6, `close bags ${dist}`);
    }
  }
  const bags = assignBagKinds(picked);
  assert.equal(bags.filter((b) => b.kind === METH_ID).length, DRUG_COUNT_METH);
  assert.equal(bags.filter((b) => b.kind === FULE_ID).length, DRUG_COUNT_FULE);
  const zs = new Set(picked.map((s) => Math.sign(s.z) || 1));
  assert.ok(zs.size >= 2, "bags should not all sit on one side");
}

// Joke lines stay as Ted wrote them.
assert.equal(drugLine(METH_ID), METH_LINE);
assert.equal(drugLine(FULE_ID), FULE_LINE);

// Meth heal is capped at max health, and street HIGH does not overdose.
{
  const vitals = createPlayerVitals();
  vitals.health = 90;
  healPlayer(vitals, METH_REGEN_PER_SECOND * 20);
  assert.equal(vitals.health, PLAYER_MAX_HEALTH);
  vitals.health = 80;
  vitals.high = DRUG_HIGH_FULL;
  vitals.freezeHigh = true;
  const tick = stepPlayerVitals(vitals, 1);
  assert.equal(vitals.high, DRUG_HIGH_FULL);
  assert.equal(vitals.health, 80);
  assert.ok(DRUG_HIGH_FULL > OVERDOSE_HIGH);
  assert.equal(tick.high, DRUG_HIGH_FULL);
}

// Death / clear wipes the timers.
{
  const buffs = createDrugBuffs();
  takeDrug(buffs, METH_ID);
  takeDrug(buffs, FULE_ID);
  assert.equal(drugActive(buffs), true);
  clearDrugBuffs(buffs);
  assert.equal(drugActive(buffs), false);
  assert.equal(drugSpeed(buffs), 1);
  assert.equal(drugHigh(buffs), 0);
}

// New durations, card copy, clock text, and sound slots.
assert.equal(METH_DURATION, 120);
assert.equal(FULE_DURATION, 60);
assert.equal(drugName(METH_ID), "METH");
assert.equal(drugName(FULE_ID), "FULE");
assert.equal(drugEffect(METH_ID), METH_EFFECT);
assert.equal(drugEffect(FULE_ID), FULE_EFFECT);
assert.equal(METH_EFFECT, "SPEED BOOST + HEALTH REGEN");
assert.equal(FULE_EFFECT, "SPEED BOOST");
assert.equal(formatDrugClock(120), "2:00");
assert.equal(formatDrugClock(107.2), "1:48");
assert.equal(formatDrugClock(0.2), "0:01");
assert.equal(formatDrugClock(0), "0:00");
assert.equal(formatDrugChip(METH_ID, 107.2), "METH 1:48");
assert.equal(formatDrugChip(FULE_ID, 60), "FULE 1:00");
assert.equal(drugSound(METH_ID), "assets/sounds/drugs/meth-pickup.mp3");
assert.equal(drugSound(FULE_ID), "assets/sounds/drugs/fule-pickup.mp3");
assert.equal(DRUG_SOUNDS.meth, "assets/sounds/drugs/meth-pickup.mp3");
