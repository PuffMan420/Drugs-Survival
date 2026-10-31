import assert from "node:assert/strict";
import test from "node:test";
import { CAR_DRAW_SCALE, PED_RADIUS, carContact, carVelocity } from "../js/car-strike.js";

const car = { x: 0, z: 0, y: 0.6, w: 36, h: 70, angle: 0, speed: 0 };
const hx = (car.w * CAR_DRAW_SCALE) / 2;
const hz = (car.h * CAR_DRAW_SCALE) / 2;

function shellDist(x, z) {
  const cx = Math.max(-hx, Math.min(hx, x));
  const cz = Math.max(-hz, Math.min(hz, z));
  return Math.hypot(x - cx, z - cz);
}

test("a parked car does not strike and a slow car does", () => {
  assert.equal(carVelocity({ ...car, speed: 0 }, null), null);
  const slow = carVelocity({ ...car, speed: 1, angle: 0 }, null);
  assert.ok(slow);
  assert.equal(slow.speed, 1);
  assert.ok(Math.abs(slow.dirX) < 1e-6);
  assert.ok(slow.dirZ < 0);
  assert.ok(slow.vz < 0);
});

test("a fast traffic car strikes along its nose", () => {
  const motion = carVelocity({ ...car, speed: 80, angle: 0 }, null);
  assert.ok(motion);
  assert.equal(motion.speed, 80);
  assert.ok(Math.abs(motion.dirX) < 1e-6);
  assert.ok(motion.dirZ < 0);
  assert.ok(Math.abs(motion.vx) < 1e-6);
  assert.ok(Math.abs(motion.vz - -80) < 1e-6);
});

test("the driven car uses its velocity, not the speed it had in traffic", () => {
  const held = { ...car, held: true, speed: 200, angle: 0 };
  assert.equal(carVelocity(held, { vx: 0, vz: 0 }), null);
  const crawl = carVelocity(held, { vx: 0, vz: 2 });
  assert.equal(crawl.speed, 2);
  assert.equal(crawl.vz, 2);
  const motion = carVelocity(held, { vx: 40, vz: 0 });
  assert.ok(motion);
  assert.equal(motion.dirX, 40);
  assert.equal(motion.dirZ, 0);
  assert.equal(motion.vx, 40);
  assert.equal(motion.speed, 40);
});

test("contact is the drawn shell plus the ped radius, on every side", () => {
  const moving = { ...car, speed: 1 };
  const front = carContact(moving, 0, -(hz + PED_RADIUS), 0.6, null);
  assert.ok(front);
  assert.ok(Math.abs(front.x) < 1e-6);
  assert.ok(Math.abs(front.z - -(hz + PED_RADIUS)) < 1e-4);
  assert.ok(front.nz < -0.99);

  const rear = carContact(moving, 0, hz + PED_RADIUS, 0.6, null);
  assert.ok(rear);
  assert.ok(rear.nz > 0.99);
  assert.ok(Math.abs(rear.z - (hz + PED_RADIUS)) < 1e-4);

  const side = carContact(moving, hx + PED_RADIUS, 0, 0.6, null);
  assert.ok(side);
  assert.ok(side.nx > 0.99);
  assert.ok(Math.abs(side.x - (hx + PED_RADIUS)) < 1e-4);

  const other = carContact(moving, -(hx + PED_RADIUS), 0, 0.6, null);
  assert.ok(other);
  assert.ok(other.nx < -0.99);

  assert.equal(carContact(moving, 0, -(hz + PED_RADIUS + 0.5), 0.6, null), null);
  assert.equal(carContact(moving, hx + PED_RADIUS + 0.5, 0, 0.6, null), null);
  assert.equal(carContact(moving, 0, 0, 80), null);
});

test("a ped already inside is placed outside the shell along the contact normal", () => {
  const moving = { ...car, speed: 1 };
  const hit = carContact(moving, 0, -20, 0.6, null);
  assert.ok(hit);
  assert.ok(shellDist(hit.x, hit.z) >= PED_RADIUS - 1e-3);
  assert.ok(hit.nz < -0.99);
  assert.ok(Math.abs(hit.z - -(hz + PED_RADIUS)) < 1e-3);
});

test("a corner touch pushes out along the corner, not through a face", () => {
  const moving = { ...car, speed: 1 };
  const px = hx + 2;
  const pz = hz + 2;
  const hit = carContact(moving, px, pz, 0.6, null);
  assert.ok(hit);
  assert.ok(hit.nx > 0.5 && hit.nz > 0.5);
  assert.ok(Math.abs(shellDist(hit.x, hit.z) - PED_RADIUS) < 1e-2);
});

test("a fast car that would skip the ped still hits the front edge", () => {
  const moving = { ...car, speed: 108, x: 0, z: -100 };
  const prev = { x: 0, z: 0, angle: 0, pedX: 0, pedZ: -50 };
  const hit = carContact(moving, 0, -50, 0.6, prev);
  assert.ok(hit);
  assert.equal(carContact(moving, 0, -50, 0.6, null), null);
  assert.ok(hit.nz < -0.99);
  assert.ok(shellDist(hit.x - moving.x, hit.z - moving.z) >= PED_RADIUS - 1e-3);
});

test("the side and the rear are swept the same way", () => {
  const side = carContact(
    { ...car, speed: 40, x: 30, z: 0 },
    0,
    0,
    0.6,
    { x: -30, z: 0, angle: 0, pedX: 0, pedZ: 0 },
  );
  assert.ok(side);
  assert.ok(side.nx > 0.99);
  assert.ok(shellDist(side.x - 30, side.z) >= PED_RADIUS - 1e-3);

  const rear = carContact(
    { ...car, speed: 40, x: 0, z: 40 },
    0,
    0,
    0.6,
    { x: 0, z: -40, angle: 0, pedX: 0, pedZ: 0 },
  );
  assert.ok(rear);
  assert.ok(rear.nz > 0.99);
});

test("a car that has already overlapped still leaves the ped outside", () => {
  const moving = { ...car, speed: 20, x: 0, z: -10 };
  const prev = { x: 0, z: 0, angle: 0, pedX: 0, pedZ: -40 };
  const hit = carContact(moving, 0, -40, 0.6, prev);
  assert.ok(hit);
  assert.ok(hit.nz < -0.99);
  const localZ = hit.z - moving.z;
  assert.ok(localZ < -hz);
  assert.ok(Math.abs(shellDist(hit.x, localZ) - PED_RADIUS) < 0.05);
});

test("a rotated car uses its nose, not the sprite axes", () => {
  const facingX = { ...car, speed: 10, angle: Math.atan2(-1, 0) };
  const ahead = hz + PED_RADIUS;
  const hit = carContact(facingX, ahead, 0, 0.6, null);
  assert.ok(hit);
  assert.ok(hit.nx > 0.99);
  assert.ok(Math.abs(hit.x - ahead) < 1e-3);
  assert.equal(carContact(facingX, 0, ahead, 0.6, null), null);
});
