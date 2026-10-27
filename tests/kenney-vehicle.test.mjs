// The ported Kenney arcade sphere: forward, brake-then-reverse, and drift smoke.

import test from "node:test";
import assert from "node:assert/strict";
import { createArcadeVehicle, dbToGain, METERS_TO_WORLD } from "../js/kenney-vehicle.js";

const STEP = 1 / 60;

function run(seconds, inputAt, vehicle = createArcadeVehicle()) {
  let last = null;
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) last = vehicle.step(STEP, inputAt(i * STEP), true);
  return last;
}

test("W settles near 180 world units and noses toward -Z", () => {
  const done = run(8, () => ({ forward: true }));
  const speed = Math.hypot(done.vx, done.vz);
  assert.ok(speed > 160 && speed < 200, `speed ${speed}`);
  assert.ok(done.vz < -100, `vz ${done.vz}`);
  assert.ok(Math.abs(done.vx) < 1, `vx ${done.vx}`);
  assert.equal(METERS_TO_WORLD, 180 / 11);
});

test("S brakes to a stop before it reverses, then holds about half speed", () => {
  const vehicle = createArcadeVehicle();
  run(4, () => ({ forward: true }), vehicle);
  let reversedEarly = false;
  let reversed = false;
  for (let i = 0; i < 30; i += 1) {
    const frame = vehicle.step(STEP, { brake: true }, true);
    if (frame.vz > 0) reversedEarly = true;
    assert.ok(frame.linearSpeed > -0.05, "the throttle went negative before the brake finished");
  }
  assert.equal(reversedEarly, false);
  const done = run(4, () => ({ brake: true }), vehicle);
  if (done.vz > 20) reversed = true;
  assert.ok(reversed, `never reversed (${done.vz})`);
  const speed = Math.hypot(done.vx, done.vz);
  assert.ok(speed > 70 && speed < 110, `reverse speed ${speed}`);
});

test("a hard turn drifts: heading and velocity split, and the tires smoke", () => {
  const vehicle = createArcadeVehicle();
  run(1.5, () => ({ forward: true }), vehicle);
  let smoked = false;
  let slipped = 0;
  for (let i = 0; i < 45; i += 1) {
    const frame = vehicle.step(STEP, { forward: true, right: true }, true);
    if (frame.emit) smoked = true;
    const heading = Math.atan2(-frame.vx, -frame.vz);
    let slip = heading - frame.yaw;
    while (slip > Math.PI) slip -= Math.PI * 2;
    while (slip < -Math.PI) slip += Math.PI * 2;
    slipped = Math.max(slipped, Math.abs(slip));
  }
  assert.ok(smoked, "drift smoke never turned on");
  assert.ok(slipped > 0.35, `slip only ${slipped}`);
});

test("engine and skid gains follow the kit's decibel curve", () => {
  assert.ok(Math.abs(dbToGain(-15) - 10 ** (-15 / 20)) < 1e-9);
  assert.ok(dbToGain(0) === 1);
  const idle = createArcadeVehicle().feel();
  assert.ok(idle.engineGain < 0.25 && idle.skidGain < 0.001);
  const pulling = run(2, () => ({ forward: true }));
  assert.ok(pulling.enginePitch > 1.5, `pitch ${pulling.enginePitch}`);
  assert.ok(pulling.engineGain > dbToGain(-12));
});
