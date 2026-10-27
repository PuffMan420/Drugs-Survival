// Headless checks for the shared physics world: fixed 1/60 s steps,
// interpolation, frame-rate independence, live build-mode road colliders and
// the car's brake-then-reverse behaviour. Run with `npm test` in tests/.

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./rapier-resolve.mjs", import.meta.url);
const { createPhysics, STEP, GROUP, blendPose } = await import("../js/physics.js");
const { createPhysicsScene, roadBoxes } = await import("../js/physics-scene.js");
const { createDrive } = await import("../js/drive.js");
const { TILE } = await import("../js/constants.js");

const MAP = { cols: 60, rows: 60, buildings: [] };
const LIFT = 6.2;

function parkedCar() {
  return { x: 30 * TILE, z: 30 * TILE, y: 0.6, angle: 0, w: 36, h: 70 };
}

async function setup(pieces = [], map = MAP) {
  const physics = await createPhysics();
  const scene = createPhysicsScene(physics, map, pieces);
  const drive = createDrive(physics, scene);
  return { physics, scene, drive };
}

async function seated() {
  const rig = await setup();
  const car = parkedCar();
  assert.equal(rig.drive.enter([car], car.x + 28, car.z), true);
  return { ...rig, car };
}

function recordSteps(physics) {
  const world = physics.world;
  const used = [];
  const step = world.step.bind(world);
  world.step = (...args) => {
    used.push(world.timestep);
    return step(...args);
  };
  return used;
}

function upOf(q) {
  return {
    x: 2 * (q.qx * q.qy - q.qw * q.qz),
    y: 1 - 2 * (q.qx * q.qx + q.qz * q.qz),
    z: 2 * (q.qy * q.qz + q.qw * q.qx),
  };
}

function noseSpeed(body) {
  const v = body.linvel();
  const q = body.rotation();
  let x = -2 * (q.x * q.z + q.w * q.y);
  let z = 2 * (q.x * q.x + q.y * q.y) - 1;
  const len = Math.hypot(x, z) || 1;
  x /= len;
  z /= len;
  return { signed: v.x * x + v.z * z, speed: Math.hypot(v.x, v.z) };
}

function roadColliders(world) {
  let count = 0;
  world.forEachCollider((collider) => {
    if (collider.collisionGroups() >>> 16 === GROUP.ROAD) count += 1;
  });
  // The ground is a ROAD surface too.
  return count - 1;
}

function expectedRoadBoxes(pieces) {
  return roadBoxes(pieces).length;
}

// Scene queries see collider edits after the next world step, which in the
// game is the next fixed step after the edit.
function surfaceY(physics, x, z) {
  const { RAPIER, world, groups } = physics;
  physics.step(STEP, () => {});
  const ray = new RAPIER.Ray({ x, y: 400, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 800, true, undefined, groups(GROUP.WHEEL, GROUP.ROAD));
  return hit ? 400 - hit.timeOfImpact : null;
}

test("every world step is exactly 1/60 s, at most 5 per frame, alpha in [0, 1)", async () => {
  const physics = await createPhysics();
  const used = recordSteps(physics);
  const frames = [1 / 30, ...Array(10).fill(1 / 144), 0.3];
  const counts = [];
  const seen = [];
  for (const frameDt of frames) {
    const steps = physics.step(frameDt, (h) => seen.push(h));
    counts.push(steps);
    assert.ok(steps <= 5, `frame ${frameDt} ran ${steps} steps`);
    assert.ok(physics.alpha >= 0 && physics.alpha < 1, `alpha ${physics.alpha}`);
  }
  assert.ok(used.length > 0);
  // Rapier keeps the timestep as a 32-bit float.
  for (const dt of used) assert.equal(dt, Math.fround(STEP));
  for (const h of seen) assert.equal(h, STEP);
  assert.equal(counts[0], 2);
  assert.equal(counts.slice(1, 11).reduce((a, b) => a + b, 0), 4);
  // 0.3 s is clamped to 0.25 s, then capped at 5 steps; the rest is dropped.
  assert.equal(counts[11], 5);
  assert.equal(physics.alpha, 0);
  console.log(`steps per frame: ${counts.join(" ")}; world.timestep always ${STEP}`);
});

test("the world does not step while no system needs it", async () => {
  const { physics, drive } = await setup();
  const used = recordSteps(physics);
  assert.equal(drive.driving, false);
  assert.equal(physics.step(0.1), 0);
  assert.equal(used.length, 0);
  const car = parkedCar();
  drive.enter([car], car.x + 28, car.z);
  assert.ok(physics.step(0.1) > 0);
  drive.exit(() => false);
  used.length = 0;
  assert.equal(physics.step(0.1), 0);
  assert.equal(used.length, 0);
});

test("blendPose lerps position and slerps rotation on the short path", () => {
  const yaw = (a) => ({ qx: 0, qy: Math.sin(a / 2), qz: 0, qw: Math.cos(a / 2) });
  const from = { x: 0, y: 0, z: 0, ...yaw(0) };
  const to = { x: 10, y: 2, z: -4, ...yaw(Math.PI / 2) };
  const mid = blendPose(from, to, 0.5, {});
  assert.deepEqual([mid.x, mid.y, mid.z], [5, 1, -2]);
  const quarter = yaw(Math.PI / 4);
  assert.ok(Math.abs(mid.qy - quarter.qy) < 1e-9 && Math.abs(mid.qw - quarter.qw) < 1e-9);
  const start = blendPose(from, to, 0, {});
  const end = blendPose(from, to, 1, {});
  assert.ok(Math.abs(start.qw - 1) < 1e-9 && Math.abs(end.qy - to.qy) < 1e-9);
  // The same rotation written with the opposite sign must not spin the long way.
  const flipped = { ...to, qx: -to.qx, qy: -to.qy, qz: -to.qz, qw: -to.qw };
  const short = blendPose(from, flipped, 0.5, {});
  assert.ok(Math.abs(Math.abs(short.qy) - quarter.qy) < 1e-9);
});

test("the rendered car sits between the last two physics steps", async () => {
  const { physics, drive } = await seated();
  const body = drive.body;
  const world = physics.world;
  const step = world.step.bind(world);
  let before = null;
  let after = null;
  const read = () => {
    const t = body.translation();
    const q = body.rotation();
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  };
  world.step = () => {
    before = read();
    step();
    after = read();
  };
  drive.control({ forward: true, brake: false, left: true, right: false });
  let last = null;
  let smoothFrames = 0;
  for (let i = 0; i < 288; i += 1) {
    const steps = physics.step(1 / 144);
    const pose = drive.pose();
    if (!before) continue;
    const want = blendPose(before, after, physics.alpha, {});
    const up = upOf(want);
    assert.ok(Math.abs(pose.x - (want.x - up.x * LIFT)) < 1e-6);
    assert.ok(Math.abs(pose.y - (want.y - up.y * LIFT)) < 1e-6);
    assert.ok(Math.abs(pose.z - (want.z - up.z * LIFT)) < 1e-6);
    if (steps === 0 && last && Math.hypot(pose.x - last.x, pose.z - last.z) > 1e-4) smoothFrames += 1;
    last = pose;
  }
  assert.ok(smoothFrames > 50, `the car moved on ${smoothFrames} frames without a physics step`);
});

function inputAt(t) {
  return {
    forward: t < 3,
    brake: t >= 3,
    left: t >= 1 && t < 2,
    right: t >= 4,
  };
}

async function driveFor(fps, seconds) {
  const { physics, drive } = await seated();
  const used = recordSteps(physics);
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i += 1) {
    drive.control(inputAt(i / fps));
    physics.step(1 / fps);
  }
  const t = drive.body.translation();
  return { x: t.x, y: t.y, z: t.z, steps: used.length };
}

test("same inputs at 30, 60 and 144 fps end in the same place after 5 s", async () => {
  const runs = {};
  for (const fps of [30, 60, 144]) runs[fps] = await driveFor(fps, 5);
  for (const fps of [30, 144]) {
    assert.equal(runs[fps].steps, runs[60].steps);
    const gap = Math.hypot(runs[fps].x - runs[60].x, runs[fps].y - runs[60].y, runs[fps].z - runs[60].z);
    assert.ok(gap < 1e-3, `${fps} fps ended ${gap} from 60 fps`);
  }
  const moved = Math.hypot(runs[60].x - 30 * TILE, runs[60].z - 30 * TILE);
  assert.ok(moved > 100, `the car only moved ${moved}`);
  console.log(`after 5 s (${runs[60].steps} steps): ${JSON.stringify(runs)}`);
});

test("build-mode edits add, move and remove road colliders at once", async () => {
  const { physics, scene } = await setup([]);
  const { world } = physics;
  assert.equal(roadColliders(world), 0);
  const pieces = [];

  const straight = { kit: "roads", file: "road-straight.glb", x: 10, z: 10, turn: 0, scale: 1, mirror: false };
  pieces.push(straight);
  scene.setRoads(pieces);
  const oneStraight = expectedRoadBoxes([straight]);
  assert.ok(oneStraight > 0);
  assert.equal(roadColliders(world), oneStraight);
  const atStraight = surfaceY(physics, 10.5 * TILE, 10.5 * TILE);
  assert.ok(atStraight > 1, `no road under the new straight (${atStraight})`);

  const bridge = { kit: "roads", file: "road-bridge.glb", x: 30, z: 30, turn: 1, scale: 1, mirror: false };
  pieces.push(bridge);
  scene.setRoads(pieces);
  assert.equal(roadColliders(world), expectedRoadBoxes(pieces));
  const deck = surfaceY(physics, 30.5 * TILE, 30.5 * TILE);
  assert.ok(deck > 50, `no bridge deck (${deck})`);

  straight.x = 20;
  scene.setRoads(pieces);
  assert.equal(roadColliders(world), expectedRoadBoxes(pieces));
  assert.ok(Math.abs(surfaceY(physics, 10.5 * TILE, 10.5 * TILE) - 0.6) < 1e-3, "old straight left a collider");
  assert.ok(surfaceY(physics, 20.5 * TILE, 10.5 * TILE) > 1, "moved straight has no collider");

  straight.turn = 1;
  straight.mirror = true;
  straight.scale = 1.5;
  scene.setRoads(pieces);
  assert.equal(roadColliders(world), expectedRoadBoxes(pieces));

  pieces.splice(pieces.indexOf(bridge), 1);
  scene.setRoads(pieces);
  assert.equal(roadColliders(world), expectedRoadBoxes(pieces));
  assert.ok(Math.abs(surfaceY(physics, 30.5 * TILE, 30.5 * TILE) - 0.6) < 1e-3, "removed bridge left a collider");

  pieces.length = 0;
  scene.setRoads(pieces);
  assert.equal(roadColliders(world), 0);
  assert.equal(scene.roadColliderCount(), 0);
});

test("buildings near the followed body get colliders", async () => {
  const map = { ...MAP, buildings: [{ x: 31, z: 29, w: 2, d: 2, h: 3 }] };
  const { physics, scene } = await setup([], map);
  const solids = () => {
    let count = 0;
    physics.world.forEachCollider((collider) => {
      if (collider.collisionGroups() >>> 16 === GROUP.SOLID && collider.parent()?.isFixed()) count += 1;
    });
    return count;
  };
  assert.equal(solids(), 0);
  scene.follow({ x: 30 * TILE, z: 30 * TILE });
  assert.equal(solids(), 1);
});

test("W tops out near 180; S brakes first, then reverses", async () => {
  const { physics, drive } = await seated();
  const body = drive.body;
  let peak = 0;
  drive.control({ forward: true, brake: false, left: false, right: false });
  for (let i = 0; i < 60 * 8; i += 1) {
    physics.step(STEP);
    peak = Math.max(peak, noseSpeed(body).speed);
  }
  const cruising = noseSpeed(body).signed;
  assert.ok(cruising > 160 && peak < 200, `cruise ${cruising}, peak ${peak}`);

  drive.control({ forward: false, brake: true, left: false, right: false });
  let rollingBack = false;
  let fastestBack = 0;
  let stopAt = null;
  for (let i = 0; i < 60 * 8; i += 1) {
    physics.step(STEP);
    const { signed } = noseSpeed(body);
    if (signed > 8) assert.equal(rollingBack, false, "reversed while still rolling forward");
    if (signed < -1) {
      rollingBack = true;
      if (stopAt == null) stopAt = i / 60;
    }
    fastestBack = Math.min(fastestBack, signed);
  }
  const reverse = noseSpeed(body).signed;
  assert.ok(rollingBack, "S never reversed");
  assert.ok(reverse < -35 && fastestBack > -60, `reverse ${reverse}, fastest ${fastestBack}`);
  console.log(`top ${cruising.toFixed(1)} (peak ${peak.toFixed(1)}), stopped and reversed after ${stopAt?.toFixed(2)} s, reverse ${reverse.toFixed(1)}`);
});
