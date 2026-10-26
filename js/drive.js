// The car the player is sitting in is a Rapier ray-cast vehicle. Every other
// car stays on the traffic sim. The world only steps while someone is driving,
// so walking costs nothing. Roads are a driving surface the wheels ray-cast;
// the chassis does not collide with them, or a ramp would kick the box. The
// chassis does collide with buildings and with the other cars.

import RAPIER from "@dimforge/rapier3d-compat";
import { TILE } from "./constants.js";
import { builtRoadStrips } from "./built-lanes.js";

const GRAVITY = -40;
const MASS = 70;
const REST = 2;
const RADIUS = 3.2;
const WHEEL_Y = -1;
const LIFT = -WHEEL_Y + REST + RADIUS;
const ENGINE = 6400;
const BRAKE = 50;
const TOP_SPEED = 180;
// Same motor in reverse, held to about a quarter of the forward cap.
const REVERSE_SPEED = TOP_SPEED * 0.25;
// S brakes while the car still rolls forward. Under this it shifts into reverse.
const HALT = 8;
const STEER = 0.42;
const ROAD = 1;
const WHEEL = 2;
const SOLID = 4;
const STEP = 1 / 60;
const CAR_POOL = 12;
const CAR_REACH = 220;

const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: -1, y: 0, z: 0 };

function groups(membership, mask) {
  return ((membership & 0xffff) << 16) | (mask & 0xffff);
}

function quatFromBasis(rx, ry, rz, ux, uy, uz, dx, dy, dz) {
  const m00 = rx;
  const m01 = ux;
  const m02 = dx;
  const m10 = ry;
  const m11 = uy;
  const m12 = dy;
  const m20 = rz;
  const m21 = uz;
  const m22 = dz;
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return { x, y, z, w };
}

function yawQuat(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

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

function addRoadBox(world, body, a, b, half) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return;
  dx /= len;
  dy /= len;
  dz /= len;
  let ux = -dy * dx;
  let uy = 1 - dy * dy;
  let uz = -dy * dz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const rx = uy * dz - uz * dy;
  const ry = uz * dx - ux * dz;
  const rz = ux * dy - uy * dx;
  const thick = 3;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, thick / 2, len / 2 + 3)
      .setTranslation((a.x + b.x) / 2 - ux * thick / 2, (a.y + b.y) / 2 - uy * thick / 2, (a.z + b.z) / 2 - uz * thick / 2)
      .setRotation(quatFromBasis(rx, ry, rz, ux, uy, uz, dx, dy, dz))
      .setCollisionGroups(groups(ROAD, WHEEL)),
    body,
  );
}

export async function createDrive(map, pieces) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const mapW = map.cols * TILE;
  const mapD = map.rows * TILE;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mapW, 2, mapD)
      .setTranslation(mapW / 2, 0.6 - 2, mapD / 2)
      .setCollisionGroups(groups(ROAD, WHEEL)),
    fixed,
  );

  for (const strip of builtRoadStrips(pieces)) {
    const pts = strip.pts;
    for (let i = 0; i < pts.length - 1; i += 1) addRoadBox(world, fixed, pts[i], pts[i + 1], strip.half);
  }

  const blockCells = new Map();
  for (const building of map.buildings) {
    const cx = (building.x + building.w / 2) * TILE;
    const cz = (building.z + building.d / 2) * TILE;
    const key = `${Math.floor(cx / 480)},${Math.floor(cz / 480)}`;
    let list = blockCells.get(key);
    if (!list) {
      list = [];
      blockCells.set(key, list);
    }
    list.push(building);
  }
  let blockAnchor = null;
  let blockColliders = [];

  function refreshBlocks(x, z) {
    if (blockAnchor && Math.hypot(x - blockAnchor.x, z - blockAnchor.z) < 240) return;
    blockAnchor = { x, z };
    for (const collider of blockColliders) world.removeCollider(collider, false);
    blockColliders = [];
    const ix = Math.floor(x / 480);
    const iz = Math.floor(z / 480);
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const list = blockCells.get(`${ix + dx},${iz + dz}`);
        if (!list) continue;
        for (const building of list) {
          const hx = (building.w * TILE) / 2;
          const hy = (building.h * TILE) / 2;
          const hz = (building.d * TILE) / 2;
          blockColliders.push(world.createCollider(
            RAPIER.ColliderDesc.cuboid(hx, hy, hz)
              .setTranslation((building.x + building.w / 2) * TILE, hy, (building.z + building.d / 2) * TILE)
              .setCollisionGroups(groups(SOLID, SOLID))
              .setFriction(0.8)
              .setRestitution(0),
            fixed,
          ));
        }
      }
    }
  }

  const pool = [];
  for (let i = 0; i < CAR_POOL; i += 1) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -800, i * 20),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(16, 7, 30)
        .setCollisionGroups(groups(SOLID, SOLID))
        .setRestitution(0),
      body,
    );
    pool.push(body);
  }

  let chassis = null;
  let chassisCol = null;
  let vehicle = null;
  let occupied = null;
  let steering = 0;
  const rayGroups = groups(WHEEL, ROAD);

  function writePose() {
    if (!chassis || !occupied) return;
    const t = chassis.translation();
    const q = chassis.rotation();
    const up = upOf(q);
    occupied.x = t.x - up.x * LIFT;
    occupied.y = t.y - up.y * LIFT;
    occupied.z = t.z - up.z * LIFT;
    occupied.angle = yawOf(q);
    occupied.quat = { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  function syncCars(cars) {
    let count = 0;
    const ox = occupied ? occupied.x : 0;
    const oz = occupied ? occupied.z : 0;
    for (const car of cars) {
      if (count >= pool.length || car === occupied) continue;
      const dx = car.x - ox;
      const dz = car.z - oz;
      if (dx * dx + dz * dz > CAR_REACH * CAR_REACH) continue;
      const body = pool[count];
      count += 1;
      const y = (car.y == null ? 0.6 : car.y) + 7;
      body.setNextKinematicTranslation({ x: car.x, y, z: car.z });
      body.setNextKinematicRotation(yawQuat(car.angle || 0));
    }
    for (let i = count; i < pool.length; i += 1) {
      pool[i].setNextKinematicTranslation({ x: 0, y: -800, z: i * 20 });
      pool[i].setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    }
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

  function apply(input) {
    const velocity = { x: 0, y: 0, z: 0 };
    chassis.linvel(velocity);
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

  return {
    get driving() {
      return occupied != null;
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
          .setAdditionalMass(MASS)
          .setCanSleep(false),
      );
      chassisCol = world.createCollider(
        RAPIER.ColliderDesc.cuboid(Math.max(10, w * 0.38), 3, Math.max(16, h * 0.31))
          .setTranslation(0, -1.5, -h * 0.04)
          .setCollisionGroups(groups(SOLID, SOLID))
          .setFriction(0.5)
          .setRestitution(0)
          .setDensity(0),
        chassis,
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
      best.held = true;
      occupied = best;
      refreshBlocks(best.x, best.z);
      writePose();
      return true;
    },
    exit(blocked) {
      if (!occupied) return null;
      writePose();
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
      world.removeVehicleController(vehicle);
      world.removeRigidBody(chassis);
      vehicle = null;
      chassis = null;
      chassisCol = null;
      occupied = null;
      steering = 0;
      return spot;
    },
    update(dt, input, cars) {
      if (!vehicle) return;
      let left = Math.min(Math.max(dt, 0), 0.05);
      while (left > 1e-4) {
        const h = Math.min(STEP, left);
        apply(input);
        refreshBlocks(occupied.x, occupied.z);
        syncCars(cars);
        world.timestep = h;
        vehicle.updateVehicle(h, undefined, rayGroups, (collider) => collider.handle !== chassisCol.handle);
        world.step();
        left -= h;
      }
      writePose();
      return { x: occupied.x, y: occupied.y, z: occupied.z };
    },
  };
}
