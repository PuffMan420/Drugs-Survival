import assert from "node:assert/strict";
import test from "node:test";
import {
  CROSS,
  CROSS_HIT,
  CROSS_POSE,
  JAB,
  JAB_HIT,
  JAB_POSE,
  PUNCH_REACH,
  PUNCH_SIDE,
  nextPunch,
  punchHits,
  punchTiming,
} from "../js/punch.js";

test("punches alternate, jab first", () => {
  assert.equal(nextPunch(""), JAB);
  assert.equal(nextPunch(JAB), CROSS);
  assert.equal(nextPunch(CROSS), JAB);
  assert.equal(nextPunch(nextPunch(JAB)), JAB);
});

test("the hit is the arm's extension, and it lands before the clip ends", () => {
  assert.equal(JAB_HIT, 0.208);
  assert.equal(CROSS_HIT, 0.292);
  assert.ok(JAB_HIT < JAB_POSE);
  assert.ok(CROSS_HIT < CROSS_POSE);
  assert.deepEqual(punchTiming(JAB), { hit: JAB_HIT, pose: JAB_POSE });
  assert.deepEqual(punchTiming(CROSS), { hit: CROSS_HIT, pose: CROSS_POSE });
  assert.equal(PUNCH_REACH, 36);
  assert.equal(PUNCH_SIDE, 14);
});

test("a punch reaches in front and misses the side and the back", () => {
  assert.equal(punchHits(0, 0, 0, 1, 0, 30), true);
  assert.equal(punchHits(0, 0, 0, 1, 10, 24), true);
  assert.equal(punchHits(0, 0, 0, 1, 16, 20), false);
  assert.equal(punchHits(0, 0, 0, 1, 0, 40), false);
  assert.equal(punchHits(0, 0, 0, 1, 0, -4), false);
  assert.equal(punchHits(10, 20, 1, 0, 40, 20), true);
});
