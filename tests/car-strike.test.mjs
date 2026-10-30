import assert from "node:assert/strict";
import test from "node:test";
import { CAR_KILL_SPEED, carReachesPed, carVelocity } from "../js/car-strike.js";

const car = { x: 0, z: 0, y: 0.6, w: 36, h: 70, angle: 0, speed: 0 };

test("a slow car and a parked car do not strike", () => {
  assert.equal(carVelocity({ ...car, speed: CAR_KILL_SPEED }, null), null);
  assert.equal(carVelocity({ ...car, speed: CAR_KILL_SPEED - 1 }, null), null);
  assert.equal(carVelocity({ ...car }, null), null);
});

test("a fast traffic car strikes along its nose", () => {
  const motion = carVelocity({ ...car, speed: CAR_KILL_SPEED + 1, angle: 0 }, null);
  assert.ok(motion);
  assert.ok(Math.abs(motion.dirX) < 1e-6);
  assert.ok(motion.dirZ < 0);
});

test("the driven car uses its velocity, not the speed it had in traffic", () => {
  const held = { ...car, held: true, speed: 200, angle: 0 };
  assert.equal(carVelocity(held, { vx: 0, vz: 10 }), null);
  const motion = carVelocity(held, { vx: 40, vz: 0 });
  assert.ok(motion);
  assert.equal(motion.dirX, 40);
  assert.equal(motion.dirZ, 0);
});

test("the ped has to be inside the car box on the same level", () => {
  const fast = { ...car, speed: 80 };
  assert.equal(carReachesPed(fast, 0, 0, 0.6), true);
  assert.equal(carReachesPed(fast, 0, -20, 0.6), true);
  assert.equal(carReachesPed(fast, 30, 0, 0.6), false);
  assert.equal(carReachesPed(fast, 0, -60, 0.6), false);
  assert.equal(carReachesPed(fast, 0, 0, 80), false);
  const facingX = { ...fast, angle: Math.atan2(-1, 0) };
  assert.equal(carReachesPed(facingX, 20, 0, 0.6), true);
  assert.equal(carReachesPed(facingX, 0, 30, 0.6), false);
});
