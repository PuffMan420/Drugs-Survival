import assert from "node:assert/strict";
import test from "node:test";
import { HOP_FORWARD, HOP_SIDE, hopTarget } from "../js/drive-seat.js";

test("the hop target sits left and forward of the car centre, at foot height", () => {
  const car = { x: 100, z: 200, y: 0.6, angle: 0, w: 36, h: 70 };
  const hop = hopTarget(car);
  // angle 0: forward is -Z, left is -X
  assert.ok(hop.x < car.x, "left of centre");
  assert.ok(hop.z < car.z, "toward the nose");
  assert.equal(hop.y, car.y);
  assert.ok(Math.abs((car.x - hop.x) - 36 * HOP_SIDE) < 1e-9);
  assert.ok(Math.abs((car.z - hop.z) - 70 * HOP_FORWARD) < 1e-9);
});

test("a turned car keeps the same local left-and-forward offset", () => {
  const car = { x: 0, z: 0, y: 0.6, angle: Math.PI / 2, w: 40, h: 80 };
  const hop = hopTarget(car);
  // angle 90: forward is -X, left is +Z
  assert.ok(hop.x < 0, "toward the nose (-X)");
  assert.ok(hop.z > 0, "to the left (+Z)");
  assert.equal(hop.y, car.y);
  assert.ok(Math.abs((0 - hop.x) - 80 * HOP_FORWARD) < 1e-9);
  assert.ok(Math.abs((hop.z - 0) - 40 * HOP_SIDE) < 1e-9);
});

test("a car with a right-side door hops to local +X", () => {
  const car = { x: 100, z: 200, y: 0.6, angle: 0, w: 36, h: 70, doorSide: 1 };
  const hop = hopTarget(car);
  assert.ok(hop.x > car.x, "right of centre");
  assert.ok(hop.z < car.z, "toward the nose");
  assert.ok(Math.abs((hop.x - car.x) - 36 * HOP_SIDE) < 1e-9);
});
