// A few capsules for a pedestrian the car has hit. Joints are spherical, with
// angle limits near a person's own ranges and a spring on each axis so the
// limbs, neck and hips stay together. Contacts between the parts are off, so
// the body does not jitter. The world steps while one of these is still simulating.

import { GROUP, groups } from "./physics.js";

export const RAGDOLL_LIFE = 10;
export const RAGDOLL_NEAR = 800;
export const MOBILE_RAGDOLLS = 4;
export const DESKTOP_RAGDOLLS = 8;

const rad = (deg) => (deg * Math.PI) / 180;

// Limits are radians from the pose at the moment of the hit, except elbows
// and knees: those are measured from a straight limb. The hinge is the
// parent bone's bend axis (local X, or local Z on the right forearm).
// Hip limits are the lower spine: the torso is one piece, so it folds at the hips.
const JOINTS = [
  { parent: "torso", child: "head", swing: rad(40), twist: rad(70), stiffness: 48, damping: 10 },
  { parent: "torso", child: "leftArm", swing: rad(80), twist: rad(70), stiffness: 24, damping: 6 },
  { parent: "leftArm", child: "leftFore", hinge: { x: 1, y: 0, z: 0 }, min: rad(-5), max: rad(145), side: rad(8), twist: rad(20), stiffness: 14, damping: 4 },
  { parent: "torso", child: "rightArm", swing: rad(80), twist: rad(70), stiffness: 24, damping: 6 },
  { parent: "rightArm", child: "rightFore", hinge: { x: 0, y: 0, z: 1 }, min: rad(-5), max: rad(145), side: rad(8), twist: rad(20), stiffness: 14, damping: 4 },
  { parent: "torso", child: "leftThigh", swing: rad(75), twist: rad(40), stiffness: 28, damping: 7 },
  { parent: "leftThigh", child: "leftShin", hinge: { x: 1, y: 0, z: 0 }, min: rad(-5), max: rad(140), side: rad(8), twist: rad(15), stiffness: 16, damping: 4 },
  { parent: "torso", child: "rightThigh", swing: rad(75), twist: rad(40), stiffness: 28, damping: 7 },
  { parent: "rightThigh", child: "rightShin", hinge: { x: 1, y: 0, z: 0 }, min: rad(-5), max: rad(140), side: rad(8), twist: rad(15), stiffness: 16, damping: 4 },
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

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function quatFromBasis(x, y, z) {
  const m00 = x.x;
  const m01 = y.x;
  const m02 = z.x;
  const m10 = x.y;
  const m11 = y.y;
  const m12 = z.y;
  const m20 = x.z;
  const m21 = y.z;
  const m22 = z.z;
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

function rotVec(q, v) {
  return rotate(q, v.x, v.y, v.z);
}

function copyQuat(q) {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function boneDir(body) {
  return rotVec(body.rotation(), { x: 0, y: 1, z: 0 });
}

function fallbackHinge(dir) {
  let axis = cross(dir, { x: 0, y: 1, z: 0 });
  if (Math.hypot(axis.x, axis.y, axis.z) < 0.2) axis = cross(dir, { x: 1, y: 0, z: 0 });
  return normalize(axis);
}

function hingeWorld(part, local) {
  if (part.qw == null) return fallbackHinge(boneDir(part.body));
  return rotVec({ x: part.qx, y: part.qy, z: part.qz, w: part.qw }, local);
}

function hingeInBody(bodyQuat, hinge) {
  const local = rotVec(quatConj(bodyQuat), hinge);
  local.y = 0;
  const len = Math.hypot(local.x, local.z);
  if (len < 1e-4) return { x: 1, y: 0, z: 0 };
  return { x: local.x / len, y: 0, z: local.z / len };
}

function frameFromHinge(xAxis) {
  const y = { x: 0, y: 1, z: 0 };
  const z = normalize({ x: -xAxis.z, y: 0, z: xAxis.x });
  return quatFromBasis(xAxis, y, z);
}

function signedBend(parent, child, axis) {
  const a = boneDir(parent.body);
  const b = boneDir(child.body);
  return Math.atan2(dot(cross(a, b), axis), dot(a, b));
}

function stiffenJoint(RAPIER, joint, spec, parent, child) {
  const q1 = copyQuat(parent.body.rotation());
  const q2 = copyQuat(child.body.rotation());
  let frame1 = { x: 0, y: 0, z: 0, w: 1 };
  let xMin = -spec.swing;
  let xMax = spec.swing;
  let zMin = -spec.swing;
  let zMax = spec.swing;
  const yMin = -spec.twist;
  const yMax = spec.twist;
  if (spec.hinge) {
    const axisBody = hingeInBody(q1, hingeWorld(parent, spec.hinge));
    frame1 = frameFromHinge(axisBody);
    const bend = signedBend(parent, child, rotVec(q1, axisBody));
    xMin = spec.min - bend;
    xMax = spec.max - bend;
    if (xMax < 0.08) xMax = 0.08;
    if (xMin > -0.08) xMin = -0.08;
    zMin = -spec.side;
    zMax = spec.side;
  }
  const frame2 = quatMul(quatConj(q2), quatMul(q1, frame1));
  joint.setFrameX1(frame1);
  joint.setFrameX2(frame2);
  const axes = [
    [RAPIER.JointAxis.AngX, xMin, xMax],
    [RAPIER.JointAxis.AngY, yMin, yMax],
    [RAPIER.JointAxis.AngZ, zMin, zMax],
  ];
  for (const [axis, min, max] of axes) {
    joint.rawSet.jointSetLimits(joint.handle, axis, min, max);
    joint.rawSet.jointConfigureMotorModel(joint.handle, axis, RAPIER.MotorModel.AccelerationBased);
    joint.rawSet.jointConfigureMotorPosition(joint.handle, axis, 0, spec.stiffness, spec.damping);
    joint.rawSet.jointSetMotorMaxForce(joint.handle, axis, 1e6);
  }
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
      qx: seg.qx,
      qy: seg.qy,
      qz: seg.qz,
      qw: seg.qw,
    });
  }
  const joints = [];
  for (const spec of JOINTS) {
    const parent = parts.get(spec.parent);
    const child = parts.get(spec.child);
    if (!parent || !child) continue;
    const anchor = worldToLocal(parent.body, child.body.translation());
    const joint = world.createImpulseJoint(
      RAPIER.JointData.spherical(anchor, { x: 0, y: 0, z: 0 }),
      parent.body,
      child.body,
      true,
    );
    joint.setContactsEnabled(false);
    stiffenJoint(RAPIER, joint, spec, parent, child);
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
