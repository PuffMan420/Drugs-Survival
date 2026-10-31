import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./rapier-resolve.mjs", import.meta.url);
const { createPhysics, STEP, GROUP } = await import("../js/physics.js");
const { createPhysicsScene } = await import("../js/physics-scene.js");
const { createRagdolls, quatFromY, RAGDOLL_LIFE } = await import("../js/ped-ragdoll.js");
const { TILE } = await import("../js/constants.js");

function rotateY(q, x, y, z) {
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

test("a limb axis follows the bone direction", () => {
  const down = quatFromY(0, -1, 0);
  const y = rotateY(down, 0, 1, 0);
  assert.ok(y.y < -0.99);
  const side = quatFromY(1, 0, 0);
  const x = rotateY(side, 0, 1, 0);
  assert.ok(x.x > 0.99);
});

test("the world steps for a ragdoll and stops when the bodies are gone", async () => {
  const physics = await createPhysics();
  const scene = createPhysicsScene(physics, { cols: 60, rows: 60, buildings: [] }, []);
  const x = 30 * TILE;
  const z = 30 * TILE;
  let groundMask = 0;
  physics.world.forEachCollider((collider) => {
    if ((collider.collisionGroups() >>> 16) === GROUP.ROAD) {
      groundMask |= collider.collisionGroups() & 0xffff;
    }
  });
  assert.ok(groundMask & GROUP.RAGDOLL, "ground does not collide with a ragdoll");

  const dolls = createRagdolls(physics, { limit: 4, near: 5000 });
  assert.equal(physics.step(STEP), 0);
  const doll = dolls.spawn(figure(x, z), { x: 50, z: 10 });
  assert.equal(dolls.active, 1);
  scene.watch(x, z);

  let minY = Infinity;
  let landed = null;
  for (let i = 0; i < 60 * 4; i += 1) {
    assert.ok(physics.step(STEP) >= 1);
    const hips = doll.hips();
    minY = Math.min(minY, hips.y);
    for (const part of doll.parts.values()) {
      const p = part.body.translation();
      assert.ok(Number.isFinite(p.y) && p.y > -1, `part ${part.id} fell through at ${p.y}`);
    }
    if (!landed && doll.speed() < 8 && hips.y < 12) landed = i / 60;
  }
  const hips = doll.hips();
  assert.ok(hips.y < 12, `torso stayed up at ${hips.y}`);
  assert.ok(hips.y > 1, `torso fell through to ${hips.y}`);
  assert.ok(landed != null, `never settled, y=${hips.y} speed=${doll.speed()} minY=${minY}`);

  for (let i = 0; i < RAGDOLL_LIFE / 0.05 + 5; i += 1) dolls.maintain(0.05, x, z);
  assert.equal(dolls.active, 0);
  assert.equal(doll.sim, false);
  assert.equal(physics.step(STEP), 0);
});

test("mobile keeps four ragdolls and the oldest one freezes", async () => {
  const physics = await createPhysics();
  const dolls = createRagdolls(physics, { limit: 4, near: 5000 });
  const made = [];
  for (let i = 0; i < 5; i += 1) made.push(dolls.spawn(figure(100 + i * 30, 100), { x: 0, z: 0 }));
  assert.equal(dolls.active, 4);
  assert.equal(made[0].sim, false);
  assert.equal(made[1].sim, true);
  assert.equal(made[4].sim, true);
  dolls.maintain(0.05, 10000, 10000);
  assert.equal(dolls.active, 0);
});
