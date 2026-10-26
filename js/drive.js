// The car the player is sitting in is a Rapier ray-cast vehicle in the shared
// physics world. Every other car stays on the traffic sim. The car is a
// physics system: it only asks the world to step while someone is driving,
// so walking costs nothing. Wheels ray-cast the ROAD surface; the chassis
// does not collide with it, or a ramp would kick the box. The chassis does
// collide with buildings and with the other cars (SOLID).

import { GROUP, groups, yawQuat } from "./physics.js";

const MASS = 90;
const REST = 2;
const RADIUS = 3.2;
const WHEEL_Y = -1;
const LIFT = -WHEEL_Y + REST + RADIUS;
// Was 6400 at mass 70. Scaled with mass so acceleration stays the same.
const ENGINE = 8229;
const BRAKE = 50;
const TOP_SPEED = 180;
// Same motor in reverse, held to about a quarter of the forward cap.
const REVERSE_SPEED = TOP_SPEED * 0.25;
// S brakes while the car still rolls forward. Under this it shifts into reverse.
const HALT = 8;
const STEER = 0.42;

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

// The steered wheels sit at local -Z, so that axis is the nose. Negative
// engine force drives toward it; positive force backs the car up.
function noseXZ(q) {
  let x = -2 * (q.x * q.z + q.w * q.y);
  let z = 2 * (q.x * q.x + q.y * q.y) - 1;
  const len = Math.hypot(x, z) || 1;
  x /= len;
  z /= len;
  return { x, z };
}

function wheelDrive(input, signed, speed) {
  const ahead = signed > HALT;
  const back = signed < -HALT;
  let engine = 0;
  let brake = 0;
  if (input.brake && input.forward) brake = BRAKE;
  else if (input.brake && ahead) brake = BRAKE;
  else if (input.forward && back) brake = BRAKE;
  else if (input.brake && signed < -REVERSE_SPEED) brake = 12;
  else if (input.brake) engine = ENGINE;
  else if (input.forward && speed > TOP_SPEED) brake = 12;
  else if (input.forward) engine = -ENGINE;
  else if (speed > TOP_SPEED) brake = 12;
  return { engine, brake };
}

export function createDrive(physics, scene) {
  const { RAPIER, world } = physics;
  let chassis = null;
  let chassisCol = null;
  let vehicle = null;
  let tracked = null;
  let occupied = null;
  let steering = 0;
  let input = IDLE;
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

  function apply() {
    const velocity = chassis.linvel();
    const nose = noseXZ(chassis.rotation());
    const signed = velocity.x * nose.x + velocity.z * nose.z;
    const speed = Math.hypot(velocity.x, velocity.z);
    const target = (input.left ? STEER : 0) - (input.right ? STEER : 0);
    steering += (target - steering) * 0.35;
    const command = wheelDrive(input, signed, speed);
    const wheels = vehicle.numWheels();
    for (let i = 0; i < wheels; i += 1) {
      vehicle.setWheelSteering(i, i < 2 ? steering : 0);
      vehicle.setWheelEngineForce(i, command.engine);
      vehicle.setWheelBrake(i, command.brake);
    }
  }

  physics.addSystem({
    needsStep: () => vehicle != null,
    fixedUpdate(h) {
      if (!vehicle) return;
      apply();
      vehicle.updateVehicle(h, undefined, rayGroups, notChassis);
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
          .setAngularDamping(8)
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
        vehicle.setWheelFrictionSlip(i, 250);
        vehicle.setWheelSideFrictionStiffness(i, 1);
      }
      steering = 0;
      input = IDLE;
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
      steering = 0;
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
  };
}
