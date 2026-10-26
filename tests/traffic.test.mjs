// Headless checks for the driven car among traffic: stand-in boxes never
// jump, a stand-in moving away never launches the car, leaving a car hands it
// back to traffic, and the driven car never makes traffic yield, back up or
// vanish.

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./rapier-resolve.mjs", import.meta.url);
const { createPhysics, STEP } = await import("../js/physics.js");
const { createPhysicsScene } = await import("../js/physics-scene.js");
const { createDrive } = await import("../js/drive.js");
const { createSim, headingAngle } = await import("../js/routes.js");

const MAP = { cols: 60, rows: 60, buildings: [] };
const CAR_LENGTH = 70;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function setup() {
  const physics = await createPhysics();
  const list = [];
  const scene = createPhysicsScene(physics, MAP, [], { cars: () => list });
  const drive = createDrive(physics, scene);
  return { physics, scene, drive, list };
}

function standIns(world) {
  const bodies = [];
  world.forEachRigidBody((body) => {
    if (body.isKinematic()) bodies.push(body);
  });
  return bodies;
}

// Records the longest single-step move any stand-in is asked to make with
// setNextKinematicTranslation, which Rapier turns into velocity.
function watchNextMoves(world) {
  const seen = { max: 0, calls: 0 };
  for (const body of standIns(world)) {
    const next = body.setNextKinematicTranslation.bind(body);
    body.setNextKinematicTranslation = (to) => {
      const now = body.translation();
      seen.max = Math.max(seen.max, Math.hypot(to.x - now.x, to.y - now.y, to.z - now.z));
      seen.calls += 1;
      return next(to);
    };
  }
  return seen;
}

test("stand-in boxes never move more than a car length per step", async () => {
  const { physics, scene, list } = await setup();
  const seen = watchNextMoves(physics.world);
  assert.equal(standIns(physics.world).length, 12);
  const focus = { x: 1440, z: 1440 };
  scene.follow(focus);
  const random = rng(7);
  const spawn = () => ({
    x: focus.x + (random() - 0.5) * 600,
    z: focus.z + (random() - 0.5) * 600,
    y: 0.6,
    angle: random() * Math.PI * 2,
    vx: (random() - 0.5) * 5,
    vz: (random() - 0.5) * 5,
  });
  for (let i = 0; i < 30; i += 1) list.push(spawn());
  for (let step = 0; step < 900; step += 1) {
    for (const car of list) {
      car.x += car.vx;
      car.z += car.vz;
      car.angle += 0.01;
    }
    // Traffic reorders, reaps and spawns cars all the time.
    list.sort(() => random() - 0.5);
    if (step % 7 === 0) list.splice(Math.floor(random() * list.length), 1);
    if (step % 9 === 0) list.push(spawn());
    focus.x += 1.5;
    physics.step(STEP, () => {});
  }
  assert.ok(seen.calls > 1000, `only ${seen.calls} continuing moves`);
  assert.ok(seen.max <= CAR_LENGTH, `a stand-in was asked to move ${seen.max} in one step`);
  console.log(`stand-ins: ${seen.calls} continuing moves, longest ${seen.max.toFixed(2)} per step`);
});

test("the 12 nearest cars get stand-ins, whatever the list order", async () => {
  const { physics, scene, list } = await setup();
  const focus = { x: 1440, z: 1440 };
  scene.follow(focus);
  for (let i = 0; i < 20; i += 1) list.push({ x: focus.x + 200 - i * 10, z: focus.z, y: 0.6, angle: 0 });
  physics.step(STEP, () => {});
  const placed = standIns(physics.world).map((body) => body.translation().x).filter((x) => x > 0);
  assert.equal(placed.length, 12);
  for (const x of placed) assert.ok(Math.abs(x - focus.x) <= 120 + 1e-3, `far car ${x - focus.x} got a stand-in`);
});

async function crash(event) {
  const { physics, drive, list } = await setup();
  const parked = { x: 1440, z: 1440, y: 0.6, angle: 0, w: 36, h: 70 };
  assert.equal(drive.enter([parked], parked.x + 28, parked.z), true);
  for (let i = 0; i < 60; i += 1) physics.step(STEP);
  // A traffic car pressed against the nose (local -Z), and a crowd behind the
  // car, so a box handed from one to the other sweeps through the car.
  const settled = drive.body.translation();
  const touching = { x: settled.x, z: settled.z - 52, y: 0.6, angle: 0 };
  const crowd = [];
  for (let i = 0; i < 12; i += 1) crowd.push({ x: settled.x, z: settled.z + 150 + i, y: 0.6, angle: 0 });
  list.push(touching);
  for (let i = 0; i < 30; i += 1) physics.step(STEP);
  const restY = drive.body.translation().y;
  event(list, touching, crowd);
  let peak = 0;
  let maxY = -Infinity;
  for (let i = 0; i < 180; i += 1) {
    physics.step(STEP);
    const v = drive.body.linvel();
    peak = Math.max(peak, Math.hypot(v.x, v.y, v.z));
    maxY = Math.max(maxY, drive.body.translation().y);
  }
  return { peak, rise: maxY - restY };
}

for (const [name, event] of [
  ["the crowd is listed first", (list, touching, crowd) => list.unshift(...crowd)],
  ["the touching car leaves the list", (list) => list.splice(0, list.length)],
  ["the touching car jumps to behind the car", (list, touching) => {
    touching.z += 200;
  }],
]) {
  test(`no launch when ${name}`, async () => {
    const { peak, rise } = await crash(event);
    assert.ok(peak < 50, `peak speed ${peak}`);
    assert.ok(rise < 2, `the car rose ${rise}`);
    console.log(`${name}: peak speed ${peak.toFixed(2)}, rise ${rise.toFixed(2)}`);
  });
}

// A straight two-lane road: node 0 drives north along x 1000, node 1 south along x 1040.
function straightPlan() {
  const north = { pts: [{ x: 1000, z: 3000 }, { x: 1000, z: 0 }], seg: [3000], len: 3000, to: 1 };
  const south = { pts: [{ x: 1040, z: 0 }, { x: 1040, z: 3000 }], seg: [3000], len: 3000, to: 0 };
  return {
    nodes: [
      { index: 0, x: 1000, z: 3000, tx: 20, tz: 62, exits: [north] },
      { index: 1, x: 1040, z: 0, tx: 21, tz: 0, exits: [south] },
    ],
    parked: [],
    buckets: new Map(),
    poseFits: () => true,
  };
}

function driver(id, dist, extra = {}) {
  return {
    id,
    model: 0,
    w: 36,
    h: 70,
    x: 1000,
    z: 3000 - dist,
    angle: headingAngle(0, -1),
    speed: 0,
    cruise: 120,
    node: 0,
    exit: 0,
    dist,
    wait: 0,
    y: null,
    alive: true,
    blocked: false,
    arc: null,
    commit: null,
    ...extra,
  };
}

// The walking player stands on the sidewalk, out of the lanes.
function runSim(sim, seconds, cam, player = { x: cam.x + 120, z: cam.z }) {
  for (let i = 0; i < seconds * 60; i += 1) sim.step(STEP, cam.x, cam.z, player.x, player.z);
}

test("the driven car never makes traffic back up or vanish", async () => {
  for (const [label, placeHeld] of [
    ["overlapping a car just past a junction", (d) => ({ z: d.z - 10 })],
    ["parked right in front of it", (d) => ({ z: d.z - 80 })],
    ["across its nose", (d) => ({ z: d.z - 60, angle: Math.PI / 2 })],
  ]) {
    const sim = createSim(straightPlan(), [], () => 0);
    const victim = driver(5, 0.5, { speed: 60 });
    const held = driver(1, 10, { held: true, ...placeHeld(victim) });
    sim.drivers.push(held, victim);
    const cam = { x: victim.x, z: victim.z };
    let lowest = victim.dist;
    for (let i = 0; i < 5 * 60; i += 1) {
      sim.step(STEP, cam.x, cam.z, held.x, held.z);
      assert.ok(sim.drivers.includes(victim), `${label}: the car vanished after ${i} steps`);
      assert.notEqual(victim.reap, true, `${label}: marked for reaping`);
      lowest = Math.min(lowest, victim.dist);
    }
    assert.ok(lowest >= 0.5, `${label}: backed up to ${lowest}`);
    assert.ok(victim.speed < 1, `${label}: still driving at ${victim.speed}`);
    assert.equal(victim.blocked, true);
  }
});

test("traffic stops for the driven car ahead and drives on once it is gone", async () => {
  const sim = createSim(straightPlan(), [], () => 0);
  const follower = driver(5, 100, { speed: 100 });
  const held = driver(1, 400, { held: true });
  sim.drivers.push(held, follower);
  const cam = { x: 1000, z: 2700 };
  runSim(sim, 6, cam);
  const gap = follower.z - held.z - 70;
  assert.ok(follower.speed < 1 && gap > 20, `speed ${follower.speed}, gap ${gap}`);
  held.z -= 2000;
  runSim(sim, 2, cam);
  assert.ok(follower.speed > 50, `did not drive on (${follower.speed})`);
});

test("leaving a car clears held and hands it back to traffic", async () => {
  const { physics, drive } = await setup();
  const sim = createSim(straightPlan(), [], () => 0);
  const car = driver(3, 1500);
  sim.drivers.push(car);
  const cam = { x: car.x, z: car.z };
  assert.equal(drive.enter(sim.drivers, car.x + 28, car.z), true);
  assert.equal(car.held, true);
  for (let i = 0; i < 60; i += 1) {
    physics.step(STEP);
    drive.pose();
    sim.step(STEP, cam.x, cam.z, car.x, car.z);
  }
  car.wait = 9;
  car.speed = 40;
  drive.exit(() => false);
  assert.equal(car.held, false);
  assert.equal(car.speed, 0);
  assert.equal(car.wait, 0);
  const left = car.z;
  runSim(sim, 3, cam);
  assert.ok(sim.drivers.includes(car));
  assert.ok(!car.stray, "a car left on its lane was stranded");
  assert.equal(car.quat, null);
  assert.ok(left - car.z > 50, `it only drove ${left - car.z}`);
});

test("a car left off the road stays put until it is off screen", async () => {
  const { physics, drive } = await setup();
  const sim = createSim(straightPlan(), [], () => 0);
  const car = driver(3, 1500);
  sim.drivers.push(car);
  assert.equal(drive.enter(sim.drivers, car.x + 28, car.z), true);
  sim.step(STEP, car.x, car.z, car.x, car.z);
  const t = drive.body.translation();
  drive.body.setTranslation({ x: t.x + 200, y: t.y, z: t.z }, true);
  drive.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i += 1) physics.step(STEP);
  drive.exit(() => false);
  assert.equal(car.held, false);
  const spot = { x: car.x, z: car.z };
  runSim(sim, 3, spot);
  assert.equal(car.stray, true);
  assert.ok(sim.drivers.includes(car), "removed while on screen");
  assert.deepEqual({ x: car.x, z: car.z }, spot);
  runSim(sim, 0.1, { x: spot.x + 2000, z: spot.z });
  assert.ok(!sim.drivers.includes(car), "still there off screen");
});

test("a stranded car driven back onto its lane drives on again", async () => {
  const sim = createSim(straightPlan(), [], () => 0);
  const car = driver(3, 1500, { x: 1200, stray: true });
  sim.drivers.push(car);
  const cam = { x: 1000, z: 1500 };
  car.held = true;
  runSim(sim, 0.1, cam);
  car.x = 1000;
  car.held = false;
  runSim(sim, 2, cam);
  assert.ok(!car.stray);
  assert.ok(1500 - car.z > 50, `it only drove ${1500 - car.z}`);
});
