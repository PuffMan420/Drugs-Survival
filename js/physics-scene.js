// What every body in the shared world collides with: the ground, roads
// placed in build mode, the buildings near the followed body, and kinematic
// stand-ins for the traffic cars around it. Roads are a ROAD surface that
// only wheels ray-cast, and ragdolls land on it; buildings and traffic are SOLID.
// Drawn cars and buildings also get a SHELL box fitted to the mesh. Ragdolls
// hit that box. The driving cuboids stay the size they were.

import { TILE } from "./constants.js";
import { builtRoadStrips } from "./built-lanes.js";
import { buildingShells, carShell } from "./model-shell.js";
import { GROUP, groups, yawQuat } from "./physics.js";

const BLOCK_CELL = 480;
const BLOCK_RANGE = 2;
const BLOCK_MOVE = 240;
const CAR_POOL = 12;
const CAR_REACH = 220;
// Every car a ragdoll can still reach. Separate from the 12 driving stand-ins.
const SHELL_POOL = 48;
const SHELL_REACH = 900;
// A stand-in that would move further than this in one step is teleported, so
// Rapier never gives it the huge velocity that launches the driven car.
const TELEPORT = 30;

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

function addRoadBox(RAPIER, world, body, a, b, half) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return null;
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
  return world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, thick / 2, len / 2 + 3)
      .setTranslation((a.x + b.x) / 2 - ux * thick / 2, (a.y + b.y) / 2 - uy * thick / 2, (a.z + b.z) / 2 - uz * thick / 2)
      .setRotation(quatFromBasis(rx, ry, rz, ux, uy, uz, dx, dy, dz))
      .setCollisionGroups(groups(GROUP.ROAD, GROUP.WHEEL | GROUP.RAGDOLL)),
    body,
  );
}

function colinearRun(a, b, c) {
  let abx = b.x - a.x;
  let aby = b.y - a.y;
  let abz = b.z - a.z;
  let bcx = c.x - b.x;
  let bcy = c.y - b.y;
  let bcz = c.z - b.z;
  const ab = Math.hypot(abx, aby, abz) || 1;
  const bc = Math.hypot(bcx, bcy, bcz) || 1;
  abx /= ab;
  aby /= ab;
  abz /= ab;
  bcx /= bc;
  bcy /= bc;
  bcz /= bc;
  return abx * bcx + aby * bcy + abz * bcz > 0.999;
}

// One cuboid per straight run. Colinear samples inside a piece collapse first,
// then flat axis-aligned runs that share a line collapse across pieces.
export function roadBoxes(pieces) {
  const spans = [];
  for (const strip of builtRoadStrips(pieces)) {
    const pts = strip.pts;
    if (pts.length < 2) continue;
    let start = 0;
    const emit = (from, to) => {
      const a = pts[from];
      const b = pts[to];
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.5) return;
      spans.push({ a, b, half: strip.half });
    };
    for (let i = 1; i < pts.length - 1; i += 1) {
      if (colinearRun(pts[start], pts[i], pts[i + 1])) continue;
      emit(start, i);
      start = i;
    }
    emit(start, pts.length - 1);
  }
  const loose = [];
  const groups = new Map();
  for (const box of spans) {
    const dx = box.b.x - box.a.x;
    const dy = box.b.y - box.a.y;
    const dz = box.b.z - box.a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const flat = Math.abs(dy) / len < 0.02;
    const y = Math.round((box.a.y + box.b.y) / 2);
    const half = Math.round(box.half);
    if (flat && Math.abs(dx) / len > 0.98) {
      const key = `x|${half}|${y}|${Math.round((box.a.z + box.b.z) / 2)}`;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push({ lo: Math.min(box.a.x, box.b.x), hi: Math.max(box.a.x, box.b.x), y: (box.a.y + box.b.y) / 2, z: (box.a.z + box.b.z) / 2, half: box.half, axis: "x" });
    } else if (flat && Math.abs(dz) / len > 0.98) {
      const key = `z|${half}|${y}|${Math.round((box.a.x + box.b.x) / 2)}`;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push({ lo: Math.min(box.a.z, box.b.z), hi: Math.max(box.a.z, box.b.z), y: (box.a.y + box.b.y) / 2, x: (box.a.x + box.b.x) / 2, half: box.half, axis: "z" });
    } else {
      loose.push(box);
    }
  }
  const boxes = loose.slice();
  for (const list of groups.values()) {
    list.sort((p, q) => p.lo - q.lo);
    let cur = { ...list[0] };
    const flush = () => {
      if (cur.axis === "x") {
        boxes.push({ a: { x: cur.lo, y: cur.y, z: cur.z }, b: { x: cur.hi, y: cur.y, z: cur.z }, half: cur.half });
      } else {
        boxes.push({ a: { x: cur.x, y: cur.y, z: cur.lo }, b: { x: cur.x, y: cur.y, z: cur.hi }, half: cur.half });
      }
    };
    for (let i = 1; i < list.length; i += 1) {
      const next = list[i];
      if (next.lo <= cur.hi + 4) {
        cur.hi = Math.max(cur.hi, next.hi);
        continue;
      }
      flush();
      cur = { ...next };
    }
    flush();
  }
  return boxes;
}

function boxKey(box) {
  const r = (n) => Math.round(n * 100) / 100;
  return [r(box.a.x), r(box.a.y), r(box.a.z), r(box.b.x), r(box.b.y), r(box.b.z), r(box.half)].join("|");
}

// cars() lists the traffic cars; the followed one is skipped.
export function createPhysicsScene(physics, map, pieces, { cars = () => [] } = {}) {
  const { RAPIER, world, fixedBody } = physics;
  const mapW = map.cols * TILE;
  const mapD = map.rows * TILE;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(mapW, 2, mapD)
      .setTranslation(mapW / 2, 0.6 - 2, mapD / 2)
      .setCollisionGroups(groups(GROUP.ROAD, GROUP.WHEEL | GROUP.RAGDOLL)),
    fixedBody,
  );

  // Boxes per placed road piece. A piece that did not change keeps its boxes,
  // so dragging one piece in build mode only rebuilds that piece.
  const roadColliders = new Map();

  const buildingColliders = new Map();

  function shellDesc(hx, hy, hz) {
    return RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setCollisionGroups(groups(GROUP.SHELL, GROUP.RAGDOLL))
      .setFriction(0.85)
      .setRestitution(0.12)
      .setDensity(0);
  }

  function syncBuildings(list) {
    const wanted = new Map();
    for (const shell of buildingShells(list)) {
      if (!wanted.has(shell.key)) wanted.set(shell.key, shell);
    }
    for (const [key, collider] of buildingColliders) {
      if (wanted.has(key)) continue;
      world.removeCollider(collider, true);
      buildingColliders.delete(key);
    }
    for (const [key, shell] of wanted) {
      if (buildingColliders.has(key)) continue;
      buildingColliders.set(key, world.createCollider(
        shellDesc(shell.hx, shell.hy, shell.hz)
          .setTranslation(shell.x, shell.y, shell.z)
          .setRotation(yawQuat(shell.yaw)),
        fixedBody,
      ));
    }
  }

  function setRoads(list) {
    const wanted = new Map();
    for (const box of roadBoxes(list)) {
      const key = boxKey(box);
      if (!wanted.has(key)) wanted.set(key, box);
    }
    for (const [key, collider] of roadColliders) {
      if (wanted.has(key)) continue;
      world.removeCollider(collider, true);
      roadColliders.delete(key);
    }
    for (const [key, box] of wanted) {
      if (roadColliders.has(key)) continue;
      const collider = addRoadBox(RAPIER, world, fixedBody, box.a, box.b, box.half);
      if (collider) roadColliders.set(key, collider);
    }
    syncBuildings(list);
  }

  setRoads(pieces);

  const pool = [];
  for (let i = 0; i < CAR_POOL; i += 1) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -800, i * 20),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(16, 7, 30)
        .setCollisionGroups(groups(GROUP.SOLID, GROUP.SOLID | GROUP.RAGDOLL))
        .setRestitution(0),
      body,
    );
    body.userData = { slot: i };
    pool.push(body);
  }
  // Each car near the focus keeps the same stand-in until it leaves reach.
  const assigned = new Map();
  const free = [...pool];

  const blockCells = new Map();
  for (const building of map.buildings || []) {
    const cx = (building.x + building.w / 2) * TILE;
    const cz = (building.z + building.d / 2) * TILE;
    const key = `${Math.floor(cx / BLOCK_CELL)},${Math.floor(cz / BLOCK_CELL)}`;
    let list = blockCells.get(key);
    if (!list) {
      list = [];
      blockCells.set(key, list);
    }
    list.push(building);
  }
  let blockAnchor = null;
  let blockColliders = [];

  function streamBlocks(x, z) {
    if (blockAnchor && Math.hypot(x - blockAnchor.x, z - blockAnchor.z) < BLOCK_MOVE) return;
    blockAnchor = { x, z };
    for (const collider of blockColliders) world.removeCollider(collider, false);
    blockColliders = [];
    const ix = Math.floor(x / BLOCK_CELL);
    const iz = Math.floor(z / BLOCK_CELL);
    for (let dz = -BLOCK_RANGE; dz <= BLOCK_RANGE; dz += 1) {
      for (let dx = -BLOCK_RANGE; dx <= BLOCK_RANGE; dx += 1) {
        const list = blockCells.get(`${ix + dx},${iz + dz}`);
        if (!list) continue;
        for (const building of list) {
          const hx = (building.w * TILE) / 2;
          const hy = (building.h * TILE) / 2;
          const hz = (building.d * TILE) / 2;
          blockColliders.push(world.createCollider(
            RAPIER.ColliderDesc.cuboid(hx, hy, hz)
              .setTranslation((building.x + building.w / 2) * TILE, hy, (building.z + building.d / 2) * TILE)
              .setCollisionGroups(groups(GROUP.SOLID, GROUP.SOLID | GROUP.RAGDOLL))
              .setFriction(0.8)
              .setRestitution(0),
            fixedBody,
          ));
        }
      }
    }
  }

  function park(body) {
    body.setTranslation({ x: 0, y: -800, z: body.userData.slot * 20 }, false);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
    free.push(body);
  }

  function releaseAll() {
    for (const body of assigned.values()) park(body);
    assigned.clear();
  }

  function syncTraffic(list, focus) {
    const near = [];
    for (const car of list) {
      if (car === focus) continue;
      const dx = car.x - focus.x;
      const dz = car.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= CAR_REACH * CAR_REACH) near.push({ car, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    if (near.length > pool.length) near.length = pool.length;
    const keep = new Set();
    for (const item of near) keep.add(item.car);
    for (const [car, body] of assigned) {
      if (keep.has(car)) continue;
      assigned.delete(car);
      park(body);
    }
    for (const { car } of near) {
      const at = { x: car.x, y: (car.y == null ? 0.6 : car.y) + 7, z: car.z };
      const turn = yawQuat(car.angle || 0);
      let body = assigned.get(car);
      if (body) {
        const now = body.translation();
        if (Math.hypot(at.x - now.x, at.y - now.y, at.z - now.z) <= TELEPORT) {
          body.setNextKinematicTranslation(at);
          body.setNextKinematicRotation(turn);
          continue;
        }
      } else {
        body = free.pop();
        assigned.set(car, body);
      }
      body.setTranslation(at, true);
      body.setRotation(turn, true);
    }
  }

  // The object whose x and z the buildings and traffic stand-ins follow.
  let focus = null;
  // Buildings around a walking player while a ragdoll exists. Traffic
  // stand-ins stay tied to the driven car. Car shells follow the ragdoll.
  let watch = null;

  let shellPool = null;
  let shellAssigned = null;
  let shellFree = null;

  function ensureShells() {
    if (shellPool) return;
    shellPool = [];
    shellAssigned = new Map();
    shellFree = [];
    for (let i = 0; i < SHELL_POOL; i += 1) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -900, i * 30),
      );
      body.userData = { slot: i, live: false };
      shellPool.push(body);
      shellFree.push(body);
    }
  }

  function fitShell(body, shell) {
    const prev = body.userData.fit;
    if (
      prev
      && Math.abs(prev.hx - shell.hx) < 0.05
      && Math.abs(prev.hy - shell.hy) < 0.05
      && Math.abs(prev.hz - shell.hz) < 0.05
    ) return;
    if (!body.userData.shellCol) {
      body.userData.shellCol = world.createCollider(shellDesc(shell.hx, shell.hy, shell.hz), body);
    } else {
      body.userData.shellCol.setHalfExtents({ x: shell.hx, y: shell.hy, z: shell.hz });
    }
    body.userData.fit = { hx: shell.hx, hy: shell.hy, hz: shell.hz };
  }

  function carTurn(car) {
    const q = car.quat;
    if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)) return q;
    return yawQuat(car.angle || 0);
  }

  function placeShell(body, car) {
    const shell = carShell(car);
    const at = {
      x: car.x,
      y: (car.y == null ? 0.6 : car.y) + shell.lift,
      z: car.z,
    };
    const turn = carTurn(car);
    fitShell(body, shell);
    const now = body.translation();
    if (body.userData.live && Math.hypot(at.x - now.x, at.y - now.y, at.z - now.z) <= TELEPORT) {
      body.setNextKinematicTranslation(at);
      body.setNextKinematicRotation(turn);
      return;
    }
    body.setTranslation(at, true);
    body.setRotation(turn, true);
    body.userData.live = true;
  }

  function parkShell(body) {
    body.userData.live = false;
    body.setTranslation({ x: 0, y: -900, z: body.userData.slot * 30 }, false);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
    shellFree.push(body);
  }

  function releaseShells() {
    if (!shellAssigned || shellAssigned.size === 0) return;
    for (const body of shellAssigned.values()) parkShell(body);
    shellAssigned.clear();
  }

  function syncShells(list, around) {
    ensureShells();
    const near = [];
    for (const car of list) {
      if (!car || car.held || car === focus) continue;
      if (!Number.isFinite(car.x) || !Number.isFinite(car.z)) continue;
      const dx = car.x - around.x;
      const dz = car.z - around.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= SHELL_REACH * SHELL_REACH) near.push({ car, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    if (near.length > shellPool.length) near.length = shellPool.length;
    const keep = new Set();
    for (const item of near) keep.add(item.car);
    for (const [car, body] of shellAssigned) {
      if (keep.has(car)) continue;
      shellAssigned.delete(car);
      parkShell(body);
    }
    for (const { car } of near) {
      let body = shellAssigned.get(car);
      if (!body) {
        body = shellFree.pop();
        if (!body) continue;
        shellAssigned.set(car, body);
      }
      placeShell(body, car);
    }
  }

  physics.addSystem({
    fixedUpdate() {
      const at = focus || watch;
      if (at) streamBlocks(at.x, at.z);
      if (focus) syncTraffic(cars(), focus);
      if (watch) syncShells(cars(), watch);
      else releaseShells();
    },
  });

  return {
    setRoads,
    follow(target) {
      if ((target || null) !== focus) releaseAll();
      focus = target || null;
      if (focus) streamBlocks(focus.x, focus.z);
      else if (watch) streamBlocks(watch.x, watch.z);
    },
    watch(x, z) {
      if (x == null) {
        watch = null;
        return;
      }
      watch = { x, z };
      if (!focus) streamBlocks(x, z);
    },
    roadColliderCount() {
      return roadColliders.size;
    },
  };
}
