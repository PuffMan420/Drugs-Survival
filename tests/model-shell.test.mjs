import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./rapier-resolve.mjs", import.meta.url);
const { createPhysics, STEP, GROUP } = await import("../js/physics.js");
const { createPhysicsScene } = await import("../js/physics-scene.js");
const { createDrive } = await import("../js/drive.js");
const { createRagdolls } = await import("../js/ped-ragdoll.js");
const { buildingShell, carShell, clearModelBounds, setModelBounds } = await import("../js/model-shell.js");

function rotate(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return {
    x: x + q.w * tx + (q.y * tz - q.z * ty),
    y: y + q.w * ty + (q.z * tx - q.x * tz),
    z: z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function figure(x, z) {
  const seg = (id, y, dx, dy, dz, length, radius, ox = 0) => ({
    id, x: x + ox, y, z, dx, dy, dz, length, radius,
  });
  return [
    seg("torso", 16, 0, 1, 0, 8, 3),
    seg("head", 24, 0, 1, 0, 4, 2.2),
    seg("leftArm", 22, 1, 0, 0, 5, 1.5, 4),
    seg("leftFore", 22, 1, 0, 0, 5, 1.3, 9),
    seg("rightArm", 22, -1, 0, 0, 5, 1.5, -4),
    seg("rightFore", 22, -1, 0, 0, 5, 1.3, -9),
    seg("leftThigh", 16, 0, -1, 0, 6, 1.8, 1.5),
    seg("leftShin", 10, 0, -1, 0, 6, 1.5, 1.5),
    seg("rightThigh", 16, 0, -1, 0, 6, 1.8, -1.5),
    seg("rightShin", 10, 0, -1, 0, 6, 1.5, -1.5),
  ];
}

function shellColliders(world) {
  const list = [];
  world.forEachCollider((collider) => {
    if ((collider.collisionGroups() >>> 16) === GROUP.SHELL) list.push(collider);
  });
  return list;
}

function aabbOf(shell) {
  return {
    minX: shell.x - shell.hx,
    maxX: shell.x + shell.hx,
    minY: shell.y - shell.hy,
    maxY: shell.y + shell.hy,
    minZ: shell.z - shell.hz,
    maxZ: shell.z + shell.hz,
  };
}

function deepInside(point, box, slop) {
  return point.x > box.minX + slop
    && point.x < box.maxX - slop
    && point.y > box.minY + slop
    && point.y < box.maxY - slop
    && point.z > box.minZ + slop
    && point.z < box.maxZ - slop;
}

function capsuleCenter(part) {
  const t = part.body.translation();
  const q = part.body.rotation();
  const arm = rotate(q, 0, part.length * 0.5, 0);
  return { x: t.x + arm.x, y: t.y + arm.y, z: t.z + arm.z };
}

const BOUNDS = { minX: -0.25, maxX: 0.75, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 };

test("a building shell is the model box, scaled and turned with the piece", () => {
  const piece = {
    kit: "commercial",
    file: "building-a.glb",
    x: 10,
    z: 4,
    turn: 1,
    scale: 1,
    mirror: false,
    bounds: BOUNDS,
  };
  const shell = buildingShell(piece);
  assert.equal(shell.hx, 96);
  assert.equal(shell.hy, 192);
  assert.equal(shell.hz, 96);
  assert.ok(Math.abs(shell.x - 504) < 1e-6);
  assert.ok(Math.abs(shell.y - 192.2) < 1e-6);
  assert.ok(Math.abs(shell.z - 168) < 1e-6);
  assert.ok(Math.abs(shell.yaw - Math.PI / 2) < 1e-6);

  const mirrored = buildingShell({ ...piece, turn: 0, mirror: true });
  assert.ok(Math.abs(mirrored.x - 456) < 1e-6);
  assert.ok(Math.abs(mirrored.z - 216) < 1e-6);

  assert.equal(buildingShell({ ...piece, file: "road-straight.glb" }), null);
  assert.equal(buildingShell({ kit: "commercial", file: "building-a.glb", x: 0, z: 0, turn: 0 }), null);
});

test("a car shell covers the drawn footprint and the baked height", () => {
  const shell = carShell({ w: 36, h: 70, bodyH: 30, bodyLift: 15 });
  assert.ok(Math.abs(shell.hx - 19.8) < 1e-6);
  assert.ok(Math.abs(shell.hz - 38.5) < 1e-6);
  assert.equal(shell.hy, 15);
  assert.equal(shell.lift, 15);
  clearModelBounds();
  setModelBounds("suburban", "building-type-a.glb", BOUNDS);
  const fromFile = buildingShell({
    kit: "suburban",
    file: "building-type-a.glb",
    x: 0,
    z: 0,
    turn: 0,
    scale: 1,
  });
  assert.equal(fromFile.hx, 96);
  clearModelBounds();
});

test("ragdoll limbs stay outside a building shell and the shell is static", async () => {
  const physics = await createPhysics();
  const piece = {
    kit: "commercial",
    file: "building-a.glb",
    x: 30,
    z: 30,
    turn: 0,
    scale: 1,
    bounds: { minX: -0.5, maxX: 0.5, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 },
  };
  const scene = createPhysicsScene(physics, { cols: 80, rows: 80, buildings: [] }, []);
  scene.setRoads([piece]);
  const shell = buildingShell(piece);
  const fixed = shellColliders(physics.world).filter((collider) => collider.parent().isFixed());
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].collisionGroups() & 0xffff, GROUP.RAGDOLL);
  const half = fixed[0].halfExtents();
  assert.ok(Math.abs(half.x - shell.hx) < 1e-3);
  assert.ok(Math.abs(half.y - shell.hy) < 1e-3);
  assert.ok(Math.abs(half.z - shell.hz) < 1e-3);

  const box = aabbOf(shell);
  const dolls = createRagdolls(physics, { limit: 2, near: 5000 });
  const doll = dolls.spawn(figure(box.minX - 30, shell.z), { x: 120, z: 0 });
  let closest = Infinity;
  for (let i = 0; i < 180; i += 1) {
    physics.step(STEP);
    for (const part of doll.parts.values()) {
      const point = capsuleCenter(part);
      assert.equal(deepInside(point, box, 3), false, `${part.id} entered the building`);
      closest = Math.min(closest, box.minX - point.x);
    }
  }
  assert.ok(closest < 8, `the body never met the wall (${closest})`);
  scene.setRoads([]);
  assert.equal(shellColliders(physics.world).length, 0);
});

test("ragdoll limbs stay outside a traffic car and a solid body does not", async () => {
  const physics = await createPhysics();
  const car = {
    x: 2000,
    z: 2000,
    y: 0.6,
    angle: 0,
    w: 40,
    h: 80,
    bodyH: 80,
    bodyLift: 40,
  };
  const list = [car];
  const scene = createPhysicsScene(physics, { cols: 80, rows: 80, buildings: [] }, [], { cars: () => list });
  scene.watch(car.x, car.z);
  physics.step(STEP, () => {});
  const shells = shellColliders(physics.world);
  assert.equal(shells.length, 1);
  assert.equal(shells[0].parent().isFixed(), false);
  assert.equal(shells[0].parent().isKinematic(), true);
  const fitted = carShell(car);
  const half = shells[0].halfExtents();
  assert.ok(Math.abs(half.x - fitted.hx) < 1e-3);
  assert.ok(Math.abs(half.y - fitted.hy) < 1e-3);
  assert.ok(Math.abs(half.z - fitted.hz) < 1e-3);
  const standIn = [];
  physics.world.forEachCollider((collider) => {
    if ((collider.collisionGroups() >>> 16) === GROUP.SOLID && collider.parent().isKinematic()) {
      standIn.push(collider.halfExtents());
    }
  });
  assert.equal(standIn.length, 12);
  assert.equal(standIn[0].x, 16);
  assert.equal(standIn[0].y, 7);
  assert.equal(standIn[0].z, 30);

  const box = {
    minX: car.x - fitted.hx,
    maxX: car.x + fitted.hx,
    minY: car.y + fitted.lift - fitted.hy,
    maxY: car.y + fitted.lift + fitted.hy,
    minZ: car.z - fitted.hz,
    maxZ: car.z + fitted.hz,
  };
  const dolls = createRagdolls(physics, { limit: 2, near: 5000 });
  const doll = dolls.spawn(figure(box.minX - 25, car.z), { x: 100, z: 0 });
  let closest = Infinity;
  for (let i = 0; i < 180; i += 1) {
    physics.step(STEP);
    for (const part of doll.parts.values()) {
      const point = capsuleCenter(part);
      assert.equal(deepInside(point, box, 4), false, `${part.id} entered the car`);
      closest = Math.min(closest, box.minX - point.x);
    }
  }
  assert.ok(closest < 10, `the body never met the car (${closest})`);
  dolls.drop(doll);

  const probe = physics.world.createRigidBody(
    physics.RAPIER.RigidBodyDesc.dynamic().setTranslation(car.x, 120, car.z),
  );
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(2, 2, 2)
      .setDensity(1)
      .setCollisionGroups((GROUP.SOLID << 16) | (GROUP.SOLID | GROUP.ROAD | GROUP.RAGDOLL)),
    probe,
  );
  for (let i = 0; i < 180; i += 1) physics.step(STEP, () => {});
  const landed = probe.translation().y;
  assert.ok(landed < 40, `a solid body sat on the car shell at y=${landed}`);

  scene.watch(null, null);
  physics.step(STEP, () => {});
  const parked = shellColliders(physics.world).filter((collider) => collider.parent().translation().y < -100);
  assert.equal(parked.length, 1);
});

test("the driven car keeps its chassis box and gains a ragdoll shell", async () => {
  const physics = await createPhysics();
  const scene = createPhysicsScene(physics, { cols: 40, rows: 40, buildings: [] }, []);
  const drive = createDrive(physics, scene);
  const car = { x: 400, z: 400, y: 0.6, angle: 0, w: 36, h: 70, bodyH: 30, bodyLift: 15 };
  assert.equal(drive.enter([car], car.x + 28, car.z), true);
  physics.step(STEP);
  assert.equal(drive.body.mass(), 90);
  const shells = [];
  const chassis = [];
  physics.world.forEachCollider((collider) => {
    if (collider.parent() !== drive.body) return;
    const kind = collider.collisionGroups() >>> 16;
    if (kind === GROUP.SHELL) shells.push(collider);
    if (kind === GROUP.SOLID) chassis.push(collider);
  });
  assert.equal(shells.length, 1);
  assert.equal(chassis.length, 1);
  assert.equal(shells[0].collisionGroups() & 0xffff, GROUP.RAGDOLL);
  const shell = carShell(car);
  const shellHalf = shells[0].halfExtents();
  assert.ok(Math.abs(shellHalf.x - shell.hx) < 1e-3);
  assert.ok(Math.abs(shellHalf.y - shell.hy) < 1e-3);
  assert.ok(Math.abs(shellHalf.z - shell.hz) < 1e-3);
  const local = shells[0].translationWrtParent();
  assert.ok(Math.abs(local.y - (-6.2 + shell.lift)) < 1e-3);
  const driveHalf = chassis[0].halfExtents();
  assert.ok(Math.abs(driveHalf.x - 13.68) < 1e-3);
  assert.ok(Math.abs(driveHalf.y - 3) < 1e-3);
  assert.ok(Math.abs(driveHalf.z - 21.7) < 1e-3);
  drive.control({ forward: true, brake: false, left: false, right: false });
  for (let i = 0; i < 120; i += 1) physics.step(STEP);
  const velocity = drive.body.linvel();
  assert.ok(Math.hypot(velocity.x, velocity.z) > 40, "the shell stopped the car driving");
  assert.ok(drive.body.translation().y < 20, "the shell threw the car up");
});
