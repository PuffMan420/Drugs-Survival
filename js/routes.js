// Right-hand traffic for the fixed downtown.
// Eastbound and southbound curbs hold parked cars, so those directions drive
// one tile inward (still to the right of oncoming traffic). Westbound and
// northbound curbs stay clear and are the travel lanes. The ring lanes
// 1 (west), 2 (east), 5 (south) and 6 (north) are driven as marked.
// Medians 4 and 8 are never driven.

const CENTER_H = new Set(["H", "h"]);
const CENTER_V = new Set(["V", "v"]);
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const MAX_DRIVERS = 32;
const CRUISE_MIN = 108;
const STOP_GAP = 34;
const SLOW_GAP = 118;
const LANE_LAT = 30;
const SPAWN_MIN = 500;
const SPAWN_MAX = 860;
const DESPAWN = 1120;
const STUCK_TIME = 2.6;

function tileHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function isRoad(cell) {
  return (
    cell === "H" ||
    cell === "h" ||
    cell === "V" ||
    cell === "v" ||
    cell === "+" ||
    cell === "X" ||
    cell === "1" ||
    cell === "2" ||
    cell === "5" ||
    cell === "6"
  );
}

export function headingAngle(hx, hz) {
  return Math.atan2(-hx, -hz);
}

function lerpAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

export function planCars(map) {
  const { cols, rows, ground, tile } = map;
  const span = tile || 48;
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };
  const key = (x, z) => x + z * cols;

  const drive = [new Set(), new Set(), new Set(), new Set()];
  const dirIndex = (dx, dz) => (dx === 1 ? 0 : dx === -1 ? 1 : dz === 1 ? 2 : 3);

  function curbShoulder(x, z, dx, dz) {
    const cell = at(x, z);
    if (cell !== "+" && cell !== "X") return false;
    const left = at(x + dz, z - dx);
    if (dx !== 0) return CENTER_H.has(left);
    return CENTER_V.has(left);
  }

  function isDrive(x, z, dx, dz) {
    const cell = at(x, z);
    if (dx === 1 && dz === 0 && cell === "2") return true;
    if (dx === -1 && dz === 0 && cell === "1") return true;
    if (dx === 0 && dz === 1 && cell === "5") return true;
    if (dx === 0 && dz === -1 && cell === "6") return true;
    if (!isRoad(cell)) return false;
    // Westbound and northbound travel the clear right-hand curb.
    if ((dx === -1 && dz === 0) || (dx === 0 && dz === -1)) return curbShoulder(x, z, dx, dz);
    // Eastbound and southbound curbs are for parking, so travel the next tile inward.
    const rx = -dz;
    const rz = dx;
    return curbShoulder(x + rx, z + rz, dx, dz);
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      for (let i = 0; i < 4; i += 1) {
        const [dx, dz] = DIRS[i];
        if (isDrive(x, z, dx, dz)) drive[i].add(key(x, z));
      }
    }
  }

  const reserved = [];
  const markClear = (tx, tz) => {
    for (let dz = -3; dz <= 3; dz += 1) {
      for (let dx = -3; dx <= 3; dx += 1) reserved.push(key(tx + dx, tz + dz));
    }
  };
  markClear(map.spawn.x, map.spawn.z);
  for (const view of map.views || []) markClear(view.x, view.z);
  const clear = new Set(reserved);

  const parked = [];
  const parkedTiles = new Set();
  const taken = new Set();
  for (let z = 1; z < rows - 1; z += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (parked.length >= 220) break;
      const cell = at(x, z);
      if (cell !== "+" && cell !== "X") continue;
      if (clear.has(key(x, z))) continue;
      if (tileHash(x, z) % 8 !== 0) continue;
      let kind = 0;
      if (CENTER_H.has(at(x, z - 1)) && isRoad(at(x, z - 1))) kind = 1;
      else if (CENTER_V.has(at(x + 1, z)) && isRoad(at(x + 1, z))) kind = 2;
      if (kind === 0) continue;
      const sidewalk = DIRS.find(([dx, dz]) => at(x + dx, z + dz) === "s");
      if (!sidewalk) continue;
      let nearH = false;
      let nearV = false;
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const other = at(x + dx, z + dz);
          if (CENTER_H.has(other) || other === "1" || other === "2") nearH = true;
          if (CENTER_V.has(other) || other === "5" || other === "6") nearV = true;
        }
      }
      if (nearH && nearV) continue;
      for (let i = 0; i < 4; i += 1) {
        if (drive[i].has(key(x, z))) kind = 0;
      }
      if (kind === 0) continue;
      const bucket = `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
      if (taken.has(bucket)) continue;
      taken.add(bucket);
      parkedTiles.add(key(x, z));
      const flip = tileHash(z, x) % 2 === 0 ? 1 : -1;
      parked.push({
        x: (x + 0.5) * span,
        z: (z + 0.5) * span,
        hx: kind === 1 ? flip : 0,
        hz: kind === 1 ? 0 : flip,
        hash: tileHash(x, z),
        tx: x,
        tz: z,
      });
    }
  }

  function open(x, z) {
    if (parkedTiles.has(key(x, z))) return false;
    return isRoad(at(x, z));
  }

  const nodes = [];
  const nodeAt = new Map();
  for (let i = 0; i < 4; i += 1) {
    const [dx, dz] = DIRS[i];
    for (const id of drive[i]) {
      const x = id % cols;
      const z = (id / cols) | 0;
      const index = nodes.length;
      nodes.push({
        index,
        tx: x,
        tz: z,
        dx,
        dz,
        x: (x + 0.5) * span,
        z: (z + 0.5) * span,
        exits: [],
      });
      nodeAt.set(`${id},${i}`, index);
    }
  }

  function seekStraight(node) {
    const { tx, tz, dx, dz } = node;
    const path = [[tx, tz]];
    let x = tx;
    let z = tz;
    const di = dirIndex(dx, dz);
    for (let step = 0; step < 10; step += 1) {
      x += dx;
      z += dz;
      if (!open(x, z)) return null;
      path.push([x, z]);
      if (drive[di].has(key(x, z))) return { tx: x, tz: z, dx, dz, di, path };
    }
    return null;
  }

  function seekTurn(node, ndx, ndz) {
    const di = dirIndex(ndx, ndz);
    const { tx, tz, dx, dz } = node;
    const queue = [[tx, tz, 0]];
    const prev = new Map();
    prev.set(key(tx, tz), -1);
    let goal = null;
    let guard = 0;
    while (queue.length > 0 && guard < 48) {
      const [x, z, depth] = queue.shift();
      guard += 1;
      if (depth >= 6) continue;
      for (let i = 0; i < 4; i += 1) {
        const nx = x + DIRS[i][0];
        const nz = z + DIRS[i][1];
        const id = key(nx, nz);
        if (prev.has(id) || !open(nx, nz)) continue;
        prev.set(id, key(x, z));
        const along = (nx - tx) * dx + (nz - tz) * dz;
        const across = (nx - tx) * ndx + (nz - tz) * ndz;
        if (drive[di].has(id) && !(nx === tx && nz === tz) && along >= -1 && across >= 0 && depth + 1 <= 6) {
          goal = [nx, nz];
          queue.length = 0;
          break;
        }
        queue.push([nx, nz, depth + 1]);
      }
    }
    if (!goal) return null;
    const path = [];
    let cursor = key(goal[0], goal[1]);
    const start = key(tx, tz);
    while (cursor !== start) {
      const x = cursor % cols;
      const z = (cursor / cols) | 0;
      path.push([x, z]);
      cursor = prev.get(cursor);
      if (cursor == null || cursor < 0) return null;
    }
    path.push([tx, tz]);
    path.reverse();
    return { tx: goal[0], tz: goal[1], dx: ndx, dz: ndz, di, path };
  }

  function nearTurn(node) {
    const { tx, tz, dx, dz } = node;
    const right = dirIndex(-dz, dx);
    const left = dirIndex(dz, -dx);
    for (let z = tz - 3; z <= tz + 3; z += 1) {
      for (let x = tx - 3; x <= tx + 3; x += 1) {
        if (x === tx && z === tz) continue;
        const id = key(x, z);
        if (drive[right].has(id) || drive[left].has(id)) return true;
      }
    }
    return false;
  }

  function roadAt(x, z) {
    return isRoad(at(Math.floor(x / span), Math.floor(z / span)));
  }

  // The longest sprite is about 44 by 80. Its nose reaches the next tile, so a
  // path is only kept when that whole rectangle stays on asphalt, including a
  // halfway turn at each corner.
  function poseFits(x, z, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const lx of [-22, 22]) {
      for (const lz of [-40, 40]) {
        if (!roadAt(x + lx * c + lz * s, z - lx * s + lz * c)) return false;
      }
    }
    return true;
  }

  function pathFits(pts) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const angle = headingAngle(b.x - a.x, b.z - a.z);
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const steps = Math.max(1, Math.ceil(len / 12));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        if (!poseFits(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, angle)) return false;
      }
      if (i + 2 < pts.length) {
        const c = pts[i + 2];
        const turned = lerpAngle(angle, headingAngle(c.x - b.x, c.z - b.z), 0.5);
        if (!poseFits(b.x, b.z, turned)) return false;
      }
    }
    return true;
  }

  function shapePath(pts) {
    const out = pts.map((point) => ({ x: point.x, z: point.z }));
    for (let i = 1; i < out.length - 1; i += 1) {
      const prev = out[i - 1];
      const next = out[i + 1];
      const ix = Math.sign(out[i].x - prev.x);
      const iz = Math.sign(out[i].z - prev.z);
      const ox = Math.sign(next.x - out[i].x);
      const oz = Math.sign(next.z - out[i].z);
      if (ix === ox && iz === oz) continue;
      let bestX = out[i].x;
      let bestZ = out[i].z;
      let best = -1;
      for (const [dx, dz] of DIRS) {
        const nx = out[i].x + dx * 18;
        const nz = out[i].z + dz * 18;
        if (!roadAt(nx, nz)) continue;
        const angIn = headingAngle(nx - prev.x, nz - prev.z);
        const angOut = headingAngle(next.x - nx, next.z - nz);
        let score = 0;
        if (poseFits(nx, nz, angIn)) score += 4;
        if (poseFits(nx, nz, angOut)) score += 4;
        if (poseFits(nx, nz, lerpAngle(angIn, angOut, 0.5))) score += 3;
        if (score > best) {
          best = score;
          bestX = nx;
          bestZ = nz;
        }
      }
      if (best > 0) {
        out[i].x = bestX;
        out[i].z = bestZ;
      }
    }
    return out;
  }

  function addExit(node, found) {
    if (!found) return;
    const dest = nodeAt.get(`${key(found.tx, found.tz)},${found.di}`);
    if (dest == null || dest === node.index) return;
    if (node.exits.some((exit) => exit.to === dest)) return;
    const raw = [];
    for (const [tx, tz] of found.path) {
      const x = (tx + 0.5) * span;
      const z = (tz + 0.5) * span;
      const last = raw[raw.length - 1];
      if (last && last.x === x && last.z === z) continue;
      raw.push({ x, z });
    }
    if (raw.length < 2) return;
    let pts = raw;
    if (!pathFits(pts)) pts = shapePath(raw);
    if (!pathFits(pts)) return;
    const seg = [];
    let len = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const step = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      if (step < 1) continue;
      seg.push(step);
      len += step;
    }
    if (len < 8 || seg.length !== pts.length - 1) return;
    node.exits.push({ to: dest, pts, seg, len });
  }

  for (const node of nodes) {
    addExit(node, seekStraight(node));
    if (!nearTurn(node)) continue;
    addExit(node, seekTurn(node, -node.dz, node.dx));
    addExit(node, seekTurn(node, node.dz, -node.dx));
  }

  const linked = nodes.filter((node) => node.exits.length > 0);
  const buckets = new Map();
  for (const node of linked) {
    const id = `${Math.floor(node.x / 480)},${Math.floor(node.z / 480)}`;
    let list = buckets.get(id);
    if (!list) {
      list = [];
      buckets.set(id, list);
    }
    list.push(node);
  }
  return { parked, nodes, linked, buckets, span, cols, rows, at, isRoad, poseFits };
}

function pointAlong(exit, dist, out) {
  let remain = dist;
  if (remain < 0) remain = 0;
  for (let i = 0; i < exit.seg.length; i += 1) {
    const len = exit.seg[i];
    if (remain <= len || i === exit.seg.length - 1) {
      const t = len > 0 ? Math.min(1, remain / len) : 0;
      const a = exit.pts[i];
      const b = exit.pts[i + 1];
      out.x = a.x + (b.x - a.x) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.hx = b.x - a.x;
      out.hz = b.z - a.z;
      return out;
    }
    remain -= len;
  }
  const last = exit.pts[exit.pts.length - 1];
  out.x = last.x;
  out.z = last.z;
  out.hx = 0;
  out.hz = -1;
  return out;
}

function obbOverlap(a, b, pad) {
  return projectHit(a, b, pad) && projectHit(b, a, pad);
}

function projectHit(a, b, pad) {
  const ox = b.x - a.x;
  const oz = b.z - a.z;
  const c = Math.cos(a.angle);
  const s = Math.sin(a.angle);
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  const bc = Math.cos(b.angle);
  const bs = Math.sin(b.angle);
  const axes = [
    [bc, -bs],
    [bs, bc],
  ];
  const hw = b.w / 2;
  const hh = b.h / 2;
  let extentX = 0;
  let extentZ = 0;
  for (let i = 0; i < 2; i += 1) {
    const len = i === 0 ? hw : hh;
    const wx = axes[i][0];
    const wz = axes[i][1];
    extentX += Math.abs(wx * c - wz * s) * len;
    extentZ += Math.abs(wx * s + wz * c) * len;
  }
  return Math.abs(lx) <= a.w / 2 + extentX + pad && Math.abs(lz) <= a.h / 2 + extentZ + pad;
}

export function createSim(plan, models, pick) {
  const scratch = { x: 0, z: 0, hx: 0, hz: 0 };
  const ahead = { x: 0, z: 0, hx: 0, hz: 0 };
  const drivers = [];
  let spawnSerial = 1;

  function chooseExit(node) {
    const exits = plan.nodes[node].exits;
    if (exits.length === 0) return -1;
    return Math.floor(Math.random() * exits.length);
  }

  function inwardExit(node, camX, camZ) {
    let best = -1;
    let bestDot = 0;
    for (let index = 0; index < node.exits.length; index += 1) {
      const exit = node.exits[index];
      const hx = exit.pts[1].x - exit.pts[0].x;
      const hz = exit.pts[1].z - exit.pts[0].z;
      const dot = hx * (camX - node.x) + hz * (camZ - node.z);
      if (dot > bestDot) {
        bestDot = dot;
        best = index;
      }
    }
    return best;
  }

  function place(driver, nodeIndex, exit) {
    const node = plan.nodes[nodeIndex];
    if (exit == null || exit < 0) exit = chooseExit(nodeIndex);
    if (exit < 0) return false;
    const edge = node.exits[exit];
    pointAlong(edge, 0, scratch);
    driver.node = nodeIndex;
    driver.exit = exit;
    driver.dist = 0;
    driver.x = scratch.x;
    driver.z = scratch.z;
    driver.angle = headingAngle(edge.pts[1].x - edge.pts[0].x, edge.pts[1].z - edge.pts[0].z);
    driver.speed = 0;
    driver.wait = 0;
    driver.cruise = CRUISE_MIN + (tileHash(node.tx, node.tz + spawnSerial) % 40);
    return true;
  }

  function clearOf(x, z, self) {
    if (Math.hypot(x - self.px, z - self.pz) < 150) return false;
    for (const other of drivers) {
      if (!other.alive) continue;
      if (Math.hypot(x - other.x, z - other.z) < 130) return false;
    }
    for (const car of plan.parked) {
      if (Math.hypot(x - car.x, z - car.z) < 80) return false;
    }
    return true;
  }

  function spawn(camX, camZ, playerX, playerZ) {
    const near = [];
    const x0 = Math.floor((camX - SPAWN_MAX) / 480);
    const x1 = Math.floor((camX + SPAWN_MAX) / 480);
    const z0 = Math.floor((camZ - SPAWN_MAX) / 480);
    const z1 = Math.floor((camZ + SPAWN_MAX) / 480);
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const bucket = plan.buckets.get(`${x},${z}`);
        if (bucket) near.push(...bucket);
      }
    }
    if (near.length === 0) return null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const node = near[(Math.random() * near.length) | 0];
      const dx = node.x - camX;
      const dz = node.z - camZ;
      const dist = Math.hypot(dx, dz);
      if (dist < SPAWN_MIN || dist > SPAWN_MAX) continue;
      if (Math.abs(dx) < 520 && dz > -380 && dz < 520) continue;
      const exit = inwardExit(node, camX, camZ);
      if (exit < 0) continue;
      const probe = { px: playerX, pz: playerZ };
      if (!clearOf(node.x, node.z, probe)) continue;
      const hash = tileHash(node.tx + spawnSerial, node.tz);
      spawnSerial += 1;
      const driver = {
        id: spawnSerial,
        model: pick(hash),
        w: models[pick(hash)].w,
        h: models[pick(hash)].h,
        x: node.x,
        z: node.z,
        angle: 0,
        speed: 0,
        cruise: CRUISE_MIN,
        node: 0,
        exit: 0,
        dist: 0,
        wait: 0,
        alive: true,
        blocked: false,
      };
      driver.model = pick(hash);
      driver.w = models[driver.model].w;
      driver.h = models[driver.model].h;
      if (!place(driver, node.index, exit)) continue;
      return driver;
    }
    return null;
  }

  function gapOf(driver, other) {
    const fx = -Math.sin(driver.angle);
    const fz = -Math.cos(driver.angle);
    const ox = other.x - driver.x;
    const oz = other.z - driver.z;
    const aheadDot = ox * fx + oz * fz;
    if (aheadDot <= 0) return Infinity;
    const lat = Math.abs(ox * fz - oz * fx);
    const limit = Math.max(LANE_LAT, (driver.w + other.w) * 0.42);
    if (lat > limit) return Infinity;
    return aheadDot - driver.h / 2 - other.h / 2;
  }

  function inFront(driver, other) {
    const fx = -Math.sin(driver.angle);
    const fz = -Math.cos(driver.angle);
    const ox = other.x - driver.x;
    const oz = other.z - driver.z;
    const aheadDot = ox * fx + oz * fz;
    if (aheadDot < 8 || aheadDot > driver.h / 2 + 96) return false;
    const lat = Math.abs(ox * fz - oz * fx);
    const turn = Math.abs(Math.atan2(Math.sin(other.angle - driver.angle), Math.cos(other.angle - driver.angle)));
    const reach = turn > 0.8 ? other.h / 2 : other.w / 2;
    return lat - reach < driver.w / 2 + 8;
  }

  return {
    drivers,
    step(dt, camX, camZ, playerX, playerZ) {
      for (let i = drivers.length - 1; i >= 0; i -= 1) {
        const driver = drivers[i];
        const dist = Math.hypot(driver.x - camX, driver.z - camZ);
        const onScreen = Math.abs(driver.x - camX) < 560 && driver.z > camZ - 420 && driver.z < camZ + 560;
        if (driver.reap || dist > DESPAWN || (driver.wait > STUCK_TIME && !driver.blocked && !onScreen)) {
          drivers.splice(i, 1);
        }
      }
      let guard = 0;
      while (drivers.length < MAX_DRIVERS && guard < 12) {
        guard += 1;
        const born = spawn(camX, camZ, playerX, playerZ);
        if (!born) break;
        drivers.push(born);
      }

      const player = { x: playerX, z: playerZ, angle: 0, w: 32, h: 32, speed: 0 };
      for (const driver of drivers) {
        let limit = driver.cruise;
        let blocked = false;
        let backing = false;
        const seen = gapOf(driver, player);
        if (seen < STOP_GAP) {
          limit = 0;
          blocked = true;
        } else if (seen < SLOW_GAP) {
          limit = Math.min(limit, driver.cruise * ((seen - STOP_GAP) / (SLOW_GAP - STOP_GAP)));
          blocked = true;
        }
        for (const other of drivers) {
          if (other === driver) continue;
          const turn = Math.abs(Math.atan2(Math.sin(other.angle - driver.angle), Math.cos(other.angle - driver.angle)));
          if (turn < 0.8) {
            const gap = gapOf(driver, other);
            if (gap < STOP_GAP) {
              limit = 0;
              blocked = true;
            } else if (gap < SLOW_GAP) {
              const t = (gap - STOP_GAP) / (SLOW_GAP - STOP_GAP);
              limit = Math.min(limit, other.speed + (driver.cruise - other.speed) * t);
              blocked = true;
            }
          }
          const overlapping = obbOverlap(driver, other, -2) && obbOverlap(other, driver, -2);
          if (overlapping) {
            limit = 0;
            blocked = true;
            if (other.id < driver.id) backing = true;
          } else if (inFront(driver, other) && (other.id < driver.id || other.speed < 8)) {
            limit = 0;
            blocked = true;
            if (other.speed < 8 && driver.wait > 0.7 && other.id < driver.id) backing = true;
          }
        }
        if (backing) {
          limit = 0;
          blocked = true;
          if (driver.dist <= 1) driver.reap = true;
        }
        for (const car of plan.parked) {
          if (Math.abs(car.x - driver.x) > 160 || Math.abs(car.z - driver.z) > 160) continue;
          const body = {
            x: car.x,
            z: car.z,
            angle: headingAngle(car.hx, car.hz),
            w: car.w || 40,
            h: car.h || 70,
          };
          const gap = gapOf(driver, body);
          if (gap < STOP_GAP) {
            limit = 0;
            blocked = true;
          } else if (gap < SLOW_GAP) {
            limit = Math.min(limit, driver.cruise * ((gap - STOP_GAP) / (SLOW_GAP - STOP_GAP)));
            blocked = true;
          }
          if (obbOverlap(driver, body, 2)) {
            limit = 0;
            blocked = true;
          }
        }
        if (limit < 8 && !backing) driver.wait += dt;
        else driver.wait = 0;
        driver.blocked = blocked;
        driver.speed = limit;
        if (backing) driver.dist = Math.max(0, driver.dist - 80 * dt);
        if ((driver.speed < 1 && !backing) || (driver.wait > STUCK_TIME && !blocked)) {
          continue;
        }

        let left = backing ? 0 : driver.speed * dt;
        let hops = 0;
        while (left > 0 && hops < 4) {
          hops += 1;
          const node = plan.nodes[driver.node];
          const edge = node.exits[driver.exit];
          if (!edge) {
            driver.wait = STUCK_TIME;
            break;
          }
          const remain = edge.len - driver.dist;
          if (left < remain) {
            driver.dist += left;
            left = 0;
          } else {
            left -= remain;
            const arrived = edge.to;
            const nextExit = chooseExit(arrived);
            if (nextExit < 0) {
              driver.wait = STUCK_TIME;
              driver.blocked = false;
              break;
            }
            driver.node = arrived;
            driver.exit = nextExit;
            driver.dist = 0;
          }
        }
        const edge = plan.nodes[driver.node].exits[driver.exit];
        if (!edge) continue;
        pointAlong(edge, driver.dist, scratch);
        driver.x = scratch.x;
        driver.z = scratch.z;
        const lane = headingAngle(scratch.hx, scratch.hz);
        pointAlong(edge, Math.min(edge.len, driver.dist + 36), ahead);
        let target = lane;
        if (ahead.hx * ahead.hx + ahead.hz * ahead.hz > 4) {
          const look = headingAngle(ahead.x - scratch.x, ahead.z - scratch.z);
          if (plan.poseFits(scratch.x, scratch.z, look)) target = look;
        }
        const blend = 1 - Math.exp(-dt * 10);
        const turned = lerpAngle(driver.angle, target, blend);
        driver.angle = plan.poseFits(scratch.x, scratch.z, turned) ? turned : lane;
      }
    },
  };
}
