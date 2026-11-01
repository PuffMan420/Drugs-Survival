// The one Rapier world for the whole session. Every physical thing in the
// game (the driven car now; the player, pedestrians and traffic later) lives
// in this world and runs as a system on the same fixed 1/60 s step. Time left
// over after the whole steps is alpha, how far the renderer sits between the
// last two steps, so tracked bodies move smoothly at any refresh rate.

import RAPIER from "@dimforge/rapier3d-compat";

export const STEP = 1 / 60;
const GRAVITY = -40;
// A tab that was hidden for seconds must not replay all of it.
const MAX_FRAME = 0.25;
const MAX_STEPS = 5;
// Float drift: 144 frames of 1/144 s still make exactly 60 steps.
const SLACK = 1e-9;

// Collision layers shared by every system. Wheels ray-cast only ROAD, so a
// ramp never kicks a chassis; SOLID is everything that blocks bodies.
export const GROUP = {
  ROAD: 1,
  WHEEL: 2,
  SOLID: 4,
  // Pedestrian ragdolls. They filter ROAD, so the ground can include this
  // bit without the chassis (which never filters ROAD) landing on it.
  RAGDOLL: 8,
  // A box around the drawn car or building. Ragdolls hit it and stop.
  // Wheels and chassis do not, so driving keeps its own smaller box.
  SHELL: 16,
};

export function groups(membership, mask) {
  return ((membership & 0xffff) << 16) | (mask & 0xffff);
}

export function yawQuat(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

function readPose(body, out) {
  const t = body.translation();
  const q = body.rotation();
  out.x = t.x;
  out.y = t.y;
  out.z = t.z;
  out.qx = q.x;
  out.qy = q.y;
  out.qz = q.z;
  out.qw = q.w;
  return out;
}

// Render pose between two physics poses: lerp the position, slerp the rotation.
export function blendPose(from, to, alpha, out) {
  out.x = from.x + (to.x - from.x) * alpha;
  out.y = from.y + (to.y - from.y) * alpha;
  out.z = from.z + (to.z - from.z) * alpha;
  let bx = to.qx;
  let by = to.qy;
  let bz = to.qz;
  let bw = to.qw;
  let cos = from.qx * bx + from.qy * by + from.qz * bz + from.qw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let wa = 1 - alpha;
  let wb = alpha;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    wa = Math.sin((1 - alpha) * angle) / sin;
    wb = Math.sin(alpha * angle) / sin;
  }
  const qx = from.qx * wa + bx * wb;
  const qy = from.qy * wa + by * wb;
  const qz = from.qz * wa + bz * wb;
  const qw = from.qw * wa + bw * wb;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  out.qx = qx / len;
  out.qy = qy / len;
  out.qz = qz / len;
  out.qw = qw / len;
  return out;
}

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = STEP;
  const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // { needsStep?(): boolean, fixedUpdate?(h) }. Every fixedUpdate runs on
  // every step, in the order added; the world only steps while some system
  // needs it.
  const systems = [];
  const tracked = new Set();
  let acc = 0;
  let alpha = 0;

  function active() {
    for (const system of systems) {
      if (system.needsStep && system.needsStep()) return true;
    }
    return false;
  }

  return {
    RAPIER,
    world,
    fixedBody,
    groups,
    get alpha() {
      return alpha;
    },
    active,
    addSystem(system) {
      systems.push(system);
      return () => {
        const index = systems.indexOf(system);
        if (index >= 0) systems.splice(index, 1);
      };
    },
    // A body whose rendered pose should be interpolated. snap() after a teleport.
    track(body) {
      const entry = {
        body,
        prev: readPose(body, {}),
        cur: readPose(body, {}),
        snap() {
          readPose(body, entry.prev);
          readPose(body, entry.cur);
        },
        pose(out = {}) {
          return blendPose(entry.prev, entry.cur, alpha, out);
        },
      };
      tracked.add(entry);
      return entry;
    },
    untrack(entry) {
      tracked.delete(entry);
    },
    // Nothing steps while no system is active: walking around costs nothing.
    step(frameDt, onFixedStep) {
      if (!onFixedStep && !active()) {
        acc = 0;
        alpha = 0;
        return 0;
      }
      acc += Math.min(Math.max(frameDt, 0), MAX_FRAME);
      let steps = 0;
      while (acc >= STEP - SLACK && steps < MAX_STEPS) {
        for (const entry of tracked) readPose(entry.body, entry.prev);
        for (const system of systems) {
          if (system.fixedUpdate) system.fixedUpdate(STEP);
        }
        if (onFixedStep) onFixedStep(STEP);
        world.step();
        for (const entry of tracked) readPose(entry.body, entry.cur);
        acc -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS || acc < 0) acc = 0;
      alpha = acc / STEP;
      return steps;
    },
  };
}
