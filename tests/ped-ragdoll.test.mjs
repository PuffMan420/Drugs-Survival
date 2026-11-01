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

function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatConj(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function rotate(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function boneDir(body) {
  return rotate(body.rotation(), { x: 0, y: 1, z: 0 });
}

function signedBend(parent, child, axis) {
  const a = boneDir(parent);
  const b = boneDir(child);
  const cx = a.y * b.z - a.z * b.y;
  const cy = a.z * b.x - a.x * b.z;
  const cz = a.x * b.y - a.y * b.x;
  const sin = cx * axis.x + cy * axis.y + cz * axis.z;
  const cos = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.atan2(sin, cos);
}

function hingeOf(joint, body) {
  const frame = joint.frameX1();
  return rotate(quatMul(body.rotation(), frame), { x: 1, y: 0, z: 0 });
}

test("knees, elbows and the neck stay inside human ranges", async () => {
  const physics = await createPhysics();
  const dolls = createRagdolls(physics, { limit: 2, near: 5000 });
  const bent = figure(0, 0);
  const shin = bent.find((seg) => seg.id === "leftShin");
  const thigh = bent.find((seg) => seg.id === "leftThigh");
  // Thirty degrees of knee flexion around world X. The thigh bone's X is that hinge.
  const lean = Math.PI / 6;
  shin.dx = 0;
  shin.dy = -Math.cos(lean);
  shin.dz = -Math.sin(lean);
  const thighQuat = quatFromY(thigh.dx, thigh.dy, thigh.dz);
  thigh.qx = thighQuat.x;
  thigh.qy = thighQuat.y;
  thigh.qz = thighQuat.z;
  thigh.qw = thighQuat.w;
  const doll = dolls.spawn(bent, null);
  const thighPart = doll.parts.get("leftThigh");
  const shinPart = doll.parts.get("leftShin");
  const head = doll.parts.get("head");
  const torso = doll.parts.get("torso");
  torso.body.setBodyType(physics.RAPIER.RigidBodyType.Fixed, true);
  thighPart.body.setBodyType(physics.RAPIER.RigidBodyType.Fixed, true);

  const knee = doll.joints[6];
  const neck = doll.joints[0];
  const elbow = doll.joints[2];
  const Ang = physics.RAPIER.JointAxis;
  const kneeX = [knee.rawSet.jointLimitsMin(knee.handle, Ang.AngX), knee.rawSet.jointLimitsMax(knee.handle, Ang.AngX)];
  const kneeZ = [knee.rawSet.jointLimitsMin(knee.handle, Ang.AngZ), knee.rawSet.jointLimitsMax(knee.handle, Ang.AngZ)];
  assert.ok(knee.rawSet.jointLimitsEnabled(knee.handle, Ang.AngX));
  assert.ok(kneeX[1] - kneeX[0] > 2.2 && kneeX[1] - kneeX[0] < 2.8, `knee hinge span ${kneeX}`);
  assert.ok(Math.abs(kneeZ[0]) < 0.25 && Math.abs(kneeZ[1]) < 0.25, `knee side bend ${kneeZ}`);
  const neckX = neck.rawSet.jointLimitsMax(neck.handle, Ang.AngX);
  const neckY = neck.rawSet.jointLimitsMax(neck.handle, Ang.AngY);
  assert.ok(neckX < 0.85 && neckX > 0.55, `neck swing ${neckX}`);
  assert.ok(neckY < 1.4 && neckY > 0.9, `neck twist ${neckY}`);
  assert.ok(elbow.rawSet.jointLimitsMax(elbow.handle, Ang.AngZ) < 0.25);

  let maxBend = -Infinity;
  let minBend = Infinity;
  for (let i = 0; i < 90; i += 1) {
    const hinge = hingeOf(knee, thighPart.body);
    shinPart.body.setAngvel({ x: hinge.x * 12, y: hinge.y * 12, z: hinge.z * 12 }, true);
    physics.world.step();
    const bend = signedBend(thighPart.body, shinPart.body, hingeOf(knee, thighPart.body));
    maxBend = Math.max(maxBend, bend);
    minBend = Math.min(minBend, bend);
  }
  for (let i = 0; i < 90; i += 1) {
    const hinge = hingeOf(knee, thighPart.body);
    shinPart.body.setAngvel({ x: -hinge.x * 12, y: -hinge.y * 12, z: -hinge.z * 12 }, true);
    physics.world.step();
    const bend = signedBend(thighPart.body, shinPart.body, hingeOf(knee, thighPart.body));
    maxBend = Math.max(maxBend, bend);
    minBend = Math.min(minBend, bend);
  }
  assert.ok(maxBend < 2.6, `knee flexed to ${maxBend}`);
  assert.ok(minBend > -0.2, `knee hyperextended to ${minBend}`);

  let neckBend = 0;
  for (let i = 0; i < 60; i += 1) {
    head.body.setAngvel({ x: 10, y: 10, z: 10 }, true);
    physics.world.step();
    const a = boneDir(torso.body);
    const b = boneDir(head.body);
    const bend = Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)));
    neckBend = Math.max(neckBend, bend);
  }
  assert.ok(neckBend < 1.15, `neck folded to ${neckBend}`);
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
