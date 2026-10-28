// The car the player is sitting in. Horizontal motion is the Kenney arcade
// sphere (js/kenney-vehicle.js): throttle, brake-then-reverse, and steering
// that yaws the body while the sphere's velocity keeps going, which is the
// drift. A Rapier ray-cast suspension still plants the chassis on the road
// and the cuboid still blocks on buildings and the other cars. Every other
// car stays on the traffic sim. The world only steps while someone is driving.

import { createArcadeVehicle } from "./kenney-vehicle.js";
import { GROUP, groups, yawQuat } from "./physics.js";

const MASS = 90;
const REST = 2;
const RADIUS = 3.2;
const WHEEL_Y = -1;
const LIFT = -WHEEL_Y + REST + RADIUS;

const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: -1, y: 0, z: 0 };
const IDLE = { forward: false, brake: false, left: false, right: false };

function yawOf(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function upOf(q) {
  return {
    x: 2 * (q.x * q.y - q.w * q.z),
    y: 1 - 2 * (q.x * q.x + q.z * q.z),
    z: 2 * (q.y * q.z + q.w * q.x),
  };
}

function sideGap(px, pz, car) {
  const w = car.w || 36;
  const h = car.h || 70;
  const angle = car.angle || 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ox = px - car.x;
  const oz = pz - car.z;
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  const gap = Math.abs(lx) - w / 2;
  if (gap < 4 || gap > 40) return Infinity;
  if (Math.abs(lz) > h / 2 - 8) return Infinity;
  return gap;
}

function localPoint(car, lx, lz) {
  const c = Math.cos(car.angle || 0);
  const s = Math.sin(car.angle || 0);
  return {
    x: car.x + lx * c + lz * s,
    z: car.z - lx * s + lz * c,
    y: car.y == null ? 0.6 : car.y,
  };
}

export function createDrive(physics, scene) {
  const { RAPIER, world } = physics;
  let chassis = null;
  let chassisCol = null;
  let vehicle = null;
  let tracked = null;
  let occupied = null;
  let input = IDLE;
  let arcade = null;
  let commanded = { x: 0, z: 0 };
  const rayGroups = groups(GROUP.WHEEL, GROUP.ROAD);
  const notChassis = (collider) => collider.handle !== chassisCol.handle;
  const blended = {};

  // The rendered car: between the last two physics steps, or the latest step.
  function writePose(latest) {
    if (!tracked || !occupied) return;
    const pose = latest ? tracked.cur : tracked.pose(blended);
    const q = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
    const up = upOf(q);
    occupied.x = pose.x - up.x * LIFT;
    occupied.y = pose.y - up.y * LIFT;
    occupied.z = pose.z - up.z * LIFT;
    occupied.angle = yawOf(q);
    occupied.quat = q;
  }

  function onGround() {
    const t = chassis.translation();
    const ray = new RAPIER.Ray({ x: t.x, y: t.y + 8, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, 40, true, undefined, rayGroups);
    return hit != null;
  }

  // The suspension keeps the car on the road. The arcade sphere supplies the
  // horizontal velocity and the yaw rate; the wheels do not grip or drive.
  function apply(h) {
    const velocity = chassis.linvel();
    const have = Math.hypot(velocity.x, velocity.z);
    const want = Math.hypot(commanded.x, commanded.z);
    if (want > 40 && have < want * 0.7) arcade.scalePlanar(have / want);
    arcade.syncYaw(yawOf(chassis.rotation()));
    const motion = arcade.step(h, input, onGround());
    commanded = { x: motion.vx, z: motion.vz };
    const wheels = vehicle.numWheels();
    for (let i = 0; i < wheels; i += 1) {
      vehicle.setWheelSteering(i, 0);
      vehicle.setWheelEngineForce(i, 0);
      vehicle.setWheelBrake(i, 0);
    }
    vehicle.updateVehicle(h, undefined, rayGroups, notChassis);
    const planted = chassis.linvel();
    chassis.setLinvel({ x: motion.vx, y: planted.y, z: motion.vz }, true);
    chassis.setAngvel({ x: 0, y: motion.yawRate, z: 0 }, true);
  }

  physics.addSystem({
    needsStep: () => vehicle != null,
    fixedUpdate(h) {
      if (!vehicle) return;
      apply(h);
    },
  });

  return {
    get driving() {
      return occupied != null;
    },
    // The physics body, for tests and later systems; null while walking.
    get body() {
      return chassis;
    },
    enter(cars, px, pz) {
      if (occupied) return false;
      let best = null;
      let bestGap = Infinity;
      for (const car of cars) {
        const gap = sideGap(px, pz, car);
        if (gap < bestGap) {
          bestGap = gap;
          best = car;
        }
      }
      if (!best) return false;
      const w = best.w || 36;
      const h = best.h || 70;
      const y = best.y == null ? 0.6 : best.y;
      const quat = best.quat || yawQuat(best.angle || 0);
      const up = upOf(quat);
      chassis = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(best.x + up.x * LIFT, y + up.y * LIFT, best.z + up.z * LIFT)
          .setRotation(quat)
          .setLinearDamping(0.35)
          .setAngularDamping(0)
          .setCanSleep(false),
      );
      const hx = Math.max(10, w * 0.38);
      const hy = 3;
      const hz = Math.max(16, h * 0.31);
      chassisCol = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(0, -1.5, -h * 0.04)
          .setCollisionGroups(groups(GROUP.SOLID, GROUP.SOLID))
          .setFriction(0.5)
          .setRestitution(0)
          .setDensity(0),
        chassis,
      );
      // A little lower and a little toward the nose (local -Z) than the chassis box.
      chassis.setAdditionalMassProperties(
        MASS,
        { x: 0, y: -2.8, z: -3.2 },
        {
          x: (MASS * (hy * hy + hz * hz)) / 3,
          y: (MASS * (hx * hx + hz * hz)) / 3,
          z: (MASS * (hx * hx + hy * hy)) / 3,
        },
        { x: 0, y: 0, z: 0, w: 1 },
        true,
      );
      vehicle = world.createVehicleController(chassis);
      const wx = Math.max(8, w * 0.3);
      const zf = Math.max(12, h * 0.22);
      const zr = Math.max(10, h * 0.2);
      const spots = [
        { x: -wx, y: WHEEL_Y, z: -zf },
        { x: wx, y: WHEEL_Y, z: -zf },
        { x: -wx, y: WHEEL_Y, z: zr },
        { x: wx, y: WHEEL_Y, z: zr },
      ];
      for (const spot of spots) vehicle.addWheel(spot, DOWN, AXLE, REST, RADIUS);
      for (let i = 0; i < spots.length; i += 1) {
        vehicle.setWheelSuspensionStiffness(i, 280);
        vehicle.setWheelSuspensionCompression(i, 10);
        vehicle.setWheelSuspensionRelaxation(i, 8);
        vehicle.setWheelMaxSuspensionTravel(i, 2.5);
        vehicle.setWheelMaxSuspensionForce(i, 80000);
        vehicle.setWheelFrictionSlip(i, 0);
        vehicle.setWheelSideFrictionStiffness(i, 0);
      }
      input = IDLE;
      arcade = createArcadeVehicle({ bulky: !!best.bulky });
      arcade.syncYaw(yawOf(quat));
      commanded = { x: 0, z: 0 };
      tracked = physics.track(chassis);
      best.held = true;
      occupied = best;
      scene.follow(occupied);
      writePose(true);
      return true;
    },
    exit(blocked) {
      if (!occupied) return null;
      writePose(true);
      const car = occupied;
      // Hand the car back to traffic, standing still where it was left.
      car.held = false;
      car.speed = 0;
      car.wait = 0;
      const reachX = (car.w || 36) / 2 + 22;
      const reachZ = (car.h || 70) / 2 + 22;
      const spots = [localPoint(car, reachX, 0), localPoint(car, -reachX, 0), localPoint(car, 0, reachZ)];
      let spot = spots[0];
      for (const candidate of spots) {
        if (!blocked(candidate.x, candidate.z)) {
          spot = candidate;
          break;
        }
      }
      physics.untrack(tracked);
      world.removeVehicleController(vehicle);
      world.removeRigidBody(chassis);
      scene.follow(null);
      tracked = null;
      vehicle = null;
      chassis = null;
      chassisCol = null;
      occupied = null;
      arcade = null;
      commanded = { x: 0, z: 0 };
      input = IDLE;
      return spot;
    },
    // Held keys for the coming physics steps.
    control(next) {
      input = next || IDLE;
    },
    // The interpolated pose after physics.step(); null while walking.
    pose() {
      if (!occupied) return null;
      writePose(false);
      return { x: occupied.x, y: occupied.y, z: occupied.z };
    },
    // Throttle, drift, and the engine/skid levels, plus where the car is drawn.
    sample() {
      if (!occupied || !arcade) return null;
      writePose(false);
      return {
        x: occupied.x,
        y: occupied.y,
        z: occupied.z,
        angle: occupied.angle,
        w: occupied.w,
        h: occupied.h,
        ...arcade.feel(),
      };
    },
  };
}
