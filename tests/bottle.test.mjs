import assert from "node:assert/strict";
import test from "node:test";
import {
  BOTTLES,
  GRAVITY,
  PUNCH_POSE,
  RELEASE,
  THROW_REACH,
  aimTarget,
  arcPoint,
  bottleSurface,
  carContains,
  carRayHit,
  flightTime,
  nextWeapon,
  pickBottle,
  throwVelocity,
} from "../js/bottle.js";

test("the wheel walks hands, pistol, bottle, bat, then hands", () => {
  assert.equal(nextWeapon("hands"), "pistol");
  assert.equal(nextWeapon("pistol"), "bottle");
  assert.equal(nextWeapon("bottle"), "bat");
  assert.equal(nextWeapon("bat"), "hands");
  assert.equal(nextWeapon("nope"), "pistol");
});

test("each bottle keeps its own splash set", () => {
  assert.deepEqual(BOTTLES.map((bottle) => bottle.id), ["beer", "wine-red", "wine-white", "oil"]);
  assert.equal(BOTTLES[0].file, "soda-bottle.glb");
  assert.deepEqual(BOTTLES[0].splats, ["beer-soda_1.png", "beer-soda_2.png", "beer-soda_3.png", "beer-soda_4.png"]);
  assert.equal(BOTTLES[2].splats[3], "wine-white_4.png");
  assert.equal(BOTTLES[3].splats[0], "oil_1.png");
  assert.equal(pickBottle(() => 0).id, "beer");
  assert.equal(pickBottle(() => 0.99).id, "oil");
});

test("the bottle leaves the hand when the cross extends", () => {
  assert.ok(RELEASE > 0.3 && RELEASE < 0.5);
  assert.ok(PUNCH_POSE > RELEASE);
  assert.equal(THROW_REACH, 144);
});

test("a lob lands on the aim point and clears the straight line", () => {
  const start = { x: 0, y: 18, z: 0 };
  const target = { x: THROW_REACH, y: 0.6, z: 0 };
  const time = flightTime(THROW_REACH);
  const velocity = throwVelocity(start, target, time);
  const end = arcPoint(start, velocity, time);
  assert.ok(Math.abs(end.x - target.x) < 1e-6);
  assert.ok(Math.abs(end.y - target.y) < 1e-6);
  assert.ok(Math.abs(end.z - target.z) < 1e-6);
  const mid = arcPoint(start, velocity, time / 2);
  const chord = (start.y + target.y) / 2;
  assert.ok(mid.y > chord + 12);
  const bump = 0.125 * Math.abs(GRAVITY) * time * time;
  assert.ok(Math.abs(mid.y - (chord + bump)) < 1e-6);
});

test("a short aim is pushed out so the bottle clears the body", () => {
  const origin = { x: 10, y: 1, z: 20 };
  const nudged = aimTarget(origin, { x: 12, y: 1, z: 20 });
  assert.ok(Math.hypot(nudged.x - origin.x, nudged.z - origin.z) >= 18 - 1e-6);
  assert.equal(nudged.y, 1);
  const far = aimTarget(origin, { x: 80, y: 2, z: 20 });
  assert.equal(far.x, 80);
  assert.equal(far.y, 2);
});

test("a bottle meets a car inside its footprint and misses the roof line", () => {
  const car = { x: 0, z: 0, y: 0.6, w: 10, h: 20, angle: 0 };
  assert.equal(carContains(0, 10, 0, car), true);
  assert.equal(carContains(0, 10, 12, car), false);
  assert.equal(carContains(0, 60, 0, car), false);
  const turned = { x: 0, z: 0, y: 0.6, w: 10, h: 20, angle: Math.PI / 2 };
  assert.equal(carContains(8, 10, 0, turned), true);
  assert.equal(carContains(0, 10, 8, turned), false);
});

test("a bullet ray meets the near face of a car and misses from inside", () => {
  const car = { x: 0, z: 0, y: 0.6, w: 10, h: 20, angle: 0 };
  const front = carRayHit({ x: 0, y: 10, z: -40 }, { x: 0, y: 0, z: 1 }, car);
  assert.ok(Math.abs(front.t - 30) < 1e-6);
  assert.ok(Math.abs(front.z + 10) < 1e-6);
  assert.equal(carContains(front.x, front.y, front.z, car), true);
  assert.equal(carRayHit({ x: 20, y: 10, z: -40 }, { x: 0, y: 0, z: 1 }, car), null);
  assert.equal(carRayHit({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 1 }, car), null);
  const turned = { x: 0, z: 0, y: 0.6, w: 10, h: 20, angle: Math.PI / 2 };
  const side = carRayHit({ x: 40, y: 10, z: 0 }, { x: -1, y: 0, z: 0 }, turned);
  assert.ok(Math.abs(side.x - 10) < 1e-6);
  assert.equal(carContains(side.x, side.y, side.z, turned), true);
  const roof = carRayHit({ x: 0, y: 80, z: 0 }, { x: 0, y: -1, z: 0 }, car);
  assert.ok(Math.abs(roof.y - 46.6) < 1e-6);
});

test("hits sort into ground, car, wall, and pedestrian", () => {
  assert.equal(bottleSurface({ file: "road-straight-7.glb" }), "ground");
  assert.equal(bottleSurface({ file: "building-skyscraper-a.glb" }), "wall");
  assert.equal(bottleSurface({ file: "traffic-light.glb" }), "wall");
  assert.equal(bottleSurface({ car: true }), "car");
  assert.equal(bottleSurface({ ped: true, car: true }), "pedestrian");
  assert.equal(bottleSurface({ tree: true }), "wall");
  assert.equal(bottleSurface({}), "ground");
  assert.equal(bottleSurface({ underPlayer: true, file: "building-a.glb" }), null);
  assert.equal(bottleSurface({ transparent: true, car: true }), null);
  assert.equal(bottleSurface({ bottleFx: true }), null);
});
