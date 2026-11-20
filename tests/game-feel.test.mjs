import assert from "node:assert/strict";
import test from "node:test";
import {
  HITSTOP_MAX,
  HITSTOP_SCALE,
  SHAKE_DECAY,
  SHAKE_MAX_OFFSET,
  addShake,
  crosshairScale,
  hitStop,
  markHit,
  sampleShake,
  setFeel,
  worldScale,
} from "../js/game-feel.js";

test("game feel helpers", () => {
  setFeel(false);
  setFeel(true);
  sampleShake(1);

  addShake(0.8);
  addShake(0.8);
  const full = sampleShake(0);
  const length = Math.hypot(full.x, full.z);
  assert.ok(length > 0);
  assert.ok(length <= SHAKE_MAX_OFFSET + 0.001);
  sampleShake(1 / SHAKE_DECAY);
  const gone = sampleShake(0);
  assert.equal(gone.x, 0);
  assert.equal(gone.z, 0);

  hitStop(0.02);
  hitStop(0.4);
  assert.equal(worldScale(0), HITSTOP_SCALE);
  assert.equal(worldScale(HITSTOP_MAX), HITSTOP_SCALE);
  assert.equal(worldScale(0), 1);

  addShake(1);
  hitStop(0.1);
  markHit(true);
  assert.equal(crosshairScale(), 1.6);
  setFeel(false);
  const off = sampleShake(0);
  assert.equal(off.x, 0);
  assert.equal(off.z, 0);
  assert.equal(worldScale(0.05), 1);
  assert.equal(crosshairScale(), 1);
  setFeel(true);
});
