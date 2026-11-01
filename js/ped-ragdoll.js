// A few capsules for a pedestrian the car has hit. Joints are spherical and
// contacts between the parts are off, so the body flops instead of jittering.
// The world steps while one of these is still simulating.

import { GROUP, groups } from "./physics.js";

export const RAGDOLL_LIFE = 10;
export const RAGDOLL_NEAR = 800;
export const MOBILE_RAGDOLLS = 4;
export const DESKTOP_RAGDOLLS = 8;

const LINKS = [
  ["torso", "head"],
  ["torso", "leftArm"],
  ["leftArm", "leftFore"],
  ["torso", "rightArm"],
  ["rightArm", "rightFore"],
  ["torso", "leftThigh"],
  ["leftThigh", "leftShin"],
  ["torso", "rightThigh"],
  ["rightThigh", "rightShin"],
];

export function quatFromY(dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  if (dy > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dy < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };
  // cross((0, 1, 0), direction)
  const ax = dz;
  const ay = 0;
  const az = -dx;
  const al = Math.hypot(ax, ay, az) || 1;
  const angle = Math.acos(Math.min(1, Math.max(-1, dy)));
  const s = Math.sin(angle / 2);
  return { x: (ax / al) * s, y: (ay / al) * s, z: (az / al) * s, w: Math.cos(angle / 2) };
}

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

function worldToLocal(body, point) {
  const t = body.translation();
  const q = body.rotation();
  return rotate(
    { x: -q.x, y: -q.y, z: -q.z, w: q.w },
    point.x - t.x,
    point.y - t.y,
    point.z - t.z,
  );
}

function linSpeed(body) {
  const v = body.linvel();
  return Math.hypot(v.x, v.y, v.z);
}

export function createPedRagdoll(RAPIER, world, physics, segments, kick) {
  const parts = new Map();
  const groupsRagdoll = groups(GROUP.RAGDOLL, GROUP.ROAD | GROUP.SOLID | GROUP.SHELL);
  for (const seg of segments) {
    const radius = Math.min(Math.max(seg.radius, 1.2), seg.length * 0.4);
    const half = Math.max(seg.length * 0.5 - radius, 0.25);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(seg.x, seg.y, seg.z)
        .setRotation(quatFromY(seg.dx, seg.dy, seg.dz))
        .setLinearDamping(0.85)
        .setAngularDamping(3.2)
        .setCanSleep(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.capsule(half, radius)
        .setTranslation(0, seg.length * 0.5, 0)
        .setDensity(seg.density ?? 0.012)
        .setFriction(0.9)
        .setRestitution(0.08)
        .setCollisionGroups(groupsRagdoll),
      body,
    );
    const tracked = physics.track(body);
    parts.set(seg.id, {
      id: seg.id,
      body,
      tracked,
      out: {},
      length: seg.length,
    });
  }
  const joints = [];
  for (const [a, b] of LINKS) {
    const parent = parts.get(a);
    const child = parts.get(b);
    if (!parent || !child) continue;
    const anchor = worldToLocal(parent.body, child.body.translation());
    const joint = world.createImpulseJoint(
      RAPIER.JointData.spherical(anchor, { x: 0, y: 0, z: 0 }),
      parent.body,
      child.body,
      true,
    );
    joint.setContactsEnabled(false);
    joints.push(joint);
  }
  const torso = parts.get("torso");
  if (torso && kick) {
    const speed = Math.hypot(kick.x, kick.z) || 1;
    const scale = Math.min(26 + speed * 0.28, 70) / speed;
    const up = Math.min(12 + speed * 0.05, 26);
    const vx = kick.x * scale;
    const vz = kick.z * scale;
    torso.body.setLinvel({ x: vx, y: up, z: vz }, true);
    torso.body.setAngvel({ x: vz * 0.03, y: 0.4, z: -vx * 0.03 }, true);
    for (const part of parts.values()) {
      if (part === torso) continue;
      part.body.setLinvel({ x: vx * 0.7, y: up * 0.45, z: vz * 0.7 }, true);
    }
  }
  const doll = {
    parts,
    joints,
    sim: true,
    age: 0,
    still: 0,
    settled: false,
    locked: false,
    pose(id) {
      const part = parts.get(id);
      if (!part || !part.tracked) return null;
      return part.tracked.pose(part.out);
    },
    speed() {
      return torso ? linSpeed(torso.body) : 0;
    },
    hips() {
      return torso ? torso.body.translation() : null;
    },
    dispose(physicsTrack) {
      if (!doll.sim && joints.length === 0 && parts.size === 0) return;
      for (const joint of joints) physicsTrack.world.removeImpulseJoint(joint, false);
      joints.length = 0;
      for (const part of parts.values()) {
        if (part.tracked) physicsTrack.untrack(part.tracked);
        part.tracked = null;
        physicsTrack.world.removeRigidBody(part.body);
      }
      parts.clear();
      doll.sim = false;
    },
  };
  return doll;
}

export function createRagdolls(physics, { limit = DESKTOP_RAGDOLLS, near = RAGDOLL_NEAR } = {}) {
  const { RAPIER, world } = physics;
  const active = [];

  function drop(doll) {
    if (!doll || !doll.sim) return;
    const index = active.indexOf(doll);
    if (index >= 0) active.splice(index, 1);
    doll.dispose(physics);
  }

  physics.addSystem({
    needsStep() {
      return active.length > 0;
    },
  });

  return {
    get active() {
      return active.length;
    },
    needsStep() {
      return active.length > 0;
    },
    spawn(segments, kick) {
      while (active.length >= limit) drop(active[0]);
      const doll = createPedRagdoll(RAPIER, world, physics, segments, kick);
      active.push(doll);
      return doll;
    },
    drop,
    // Age, settle, and drop bodies that have lain there or left the player.
    // Bone poses are written by the caller before this, so the mesh keeps
    // the last lying pose when the bodies go.
    maintain(dt, x, z) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const doll = active[i];
        doll.age += step;
        const hips = doll.hips();
        const speed = doll.speed();
        if (speed < 5) doll.still += step;
        else doll.still = 0;
        if (doll.still > 0.45) doll.settled = true;
        if (doll.settled && !doll.locked) {
          for (const part of doll.parts.values()) {
            part.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            part.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          }
          doll.locked = true;
        }
        const far = hips && Math.hypot(hips.x - x, hips.z - z) > near;
        if (doll.age >= RAGDOLL_LIFE || far) drop(doll);
      }
    },
  };
}
