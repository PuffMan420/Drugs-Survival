import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOTGUN_FIRE_DELAY,
  SHOTGUN_KICK_RETURN,
  SHOTGUN_MAG,
  SHOTGUN_PELLET_DAMAGE,
  SHOTGUN_PELLETS,
  SHOTGUN_RANGE,
  SHOTGUN_SPREAD_DEG,
  kickBlend,
  spreadDirection,
  spreadFlat,
} from "../js/shotgun.js";
import { SMG_FIRE_RATE, SMG_MAG, SMG_SPREAD_DEG } from "../js/smg.js";

test("the shotgun blast is five pellets, one a second, six shells", () => {
  assert.equal(SHOTGUN_PELLETS, 5);
  assert.equal(SHOTGUN_PELLET_DAMAGE, 1);
  assert.equal(SHOTGUN_RANGE, 144);
  assert.equal(SHOTGUN_SPREAD_DEG, 20);
  assert.equal(SHOTGUN_FIRE_DELAY, 1);
  assert.equal(SHOTGUN_MAG, 6);
});

test("the kick starts full and eases back to nothing", () => {
  assert.equal(kickBlend(0, SHOTGUN_KICK_RETURN), 1);
  assert.equal(kickBlend(SHOTGUN_KICK_RETURN, SHOTGUN_KICK_RETURN), 0);
  assert.ok(kickBlend(SHOTGUN_KICK_RETURN / 2, SHOTGUN_KICK_RETURN) > 0.4);
  assert.ok(kickBlend(SHOTGUN_KICK_RETURN / 2, SHOTGUN_KICK_RETURN) < 0.6);
});

test("pellets stay inside the cone", () => {
  const spread = (SHOTGUN_SPREAD_DEG * Math.PI) / 180;
  let n = 0;
  const random = () => {
    n += 1;
    return (n * 0.37) % 1;
  };
  for (let i = 0; i < 40; i += 1) {
    const dir = spreadDirection(0, 0, 1, SHOTGUN_SPREAD_DEG, random);
    const along = dir.z;
    const angle = Math.acos(Math.min(1, Math.max(-1, along)));
    assert.ok(angle <= spread + 1e-6, `pellet ${i} left the cone`);
  }
  const straight = spreadDirection(0, 0, 1, 0, () => 0.5);
  assert.ok(Math.abs(straight.z - 1) < 1e-6);
});

test("flat spread stays on the ground and inside the angle", () => {
  const spread = (SMG_SPREAD_DEG * Math.PI) / 180;
  let n = 0;
  const random = () => {
    n += 1;
    return (n * 0.37) % 1;
  };
  for (let i = 0; i < 40; i += 1) {
    const dir = spreadFlat(0, 1, SMG_SPREAD_DEG, random);
    assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-6);
    const angle = Math.atan2(dir.x, dir.z);
    assert.ok(Math.abs(angle) <= spread + 1e-6, `shot ${i} left the flat cone`);
  }
  const straight = spreadFlat(3, 4, 0, () => 0);
  assert.ok(Math.abs(straight.x - 0.6) < 1e-6);
  assert.ok(Math.abs(straight.z - 0.8) < 1e-6);
  const right = spreadFlat(0, 1, 90, () => 1);
  assert.ok(Math.abs(right.x + 1) < 1e-6);
  assert.ok(Math.abs(right.z) < 1e-6);
});

test("the scorpion is full auto with a 20 round mag", () => {
  assert.equal(SMG_FIRE_RATE, 12);
  assert.equal(SMG_MAG, 20);
  assert.equal(SMG_SPREAD_DEG, 6);
});

test("the pump racks back and home after a shot, inside the fire delay", async () => {
  const { pumpSlide } = await import("../js/shotgun.js");
  assert.equal(pumpSlide(0), 0);
  assert.equal(pumpSlide(0.3), 1);
  assert.ok(pumpSlide(0.4) > 0 && pumpSlide(0.4) < 1);
  assert.equal(pumpSlide(0.6), 0);
  assert.equal(pumpSlide(SHOTGUN_FIRE_DELAY), 0);
});

test("a reload pushes one shell per empty slot and ends with the hand back on the pump", async () => {
  const { reloadHand } = await import("../js/shotgun.js");
  assert.equal(reloadHand(0, 1.67, 3).lead, 0);
  assert.equal(reloadHand(1.67, 1.67, 3).lead, 0);
  let pushes = 0;
  let pushing = false;
  for (let t = 0; t <= 1.67; t += 0.005) {
    const hand = reloadHand(t, 1.67, 3);
    assert.ok(hand.away >= 0 && hand.away <= 1);
    if (hand.push > 0.5 && !pushing) pushes += 1;
    pushing = hand.push > 0.5;
  }
  assert.equal(pushes, 3);
});
