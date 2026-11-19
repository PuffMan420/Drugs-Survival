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

test("the scorpion is full auto with a 20 round mag", () => {
  assert.equal(SMG_FIRE_RATE, 12);
  assert.equal(SMG_MAG, 20);
  assert.equal(SMG_SPREAD_DEG, 6);
});
