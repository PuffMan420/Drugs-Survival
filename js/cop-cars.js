// Police escalation tunables (owner: Loke). Paste at the top of js/cop-cars.js.
// Foot cops stay in police.js (COPS_PER_STAR 1, MAX_COPS 4). Units are car units (sedan ~71, tile 48).

// Cop cars join at this many whole stars.
export const COP_CAR_MIN_STARS = 3;
// Extra cop cars per star from COP_CAR_MIN_STARS (3 stars = 1, 4 stars = 2).
export const COP_CARS_PER_STAR = 1;
export const MAX_COP_CARS = 2;
// Top speed as a multiplier of the sedan (sports is 1.16, so a fast car can escape).
export const COP_CAR_SPEED = 1.05;
// Damage to the player on foot per ram. In a car, the ram damages the player's car instead.
export const COP_CAR_RAM_DAMAGE = 15;
// Seconds between rams from the same car.
export const COP_CAR_RAM_COOLDOWN = 1.5;
// When a cop car stops this close to the player, cops get out.
export const COP_CAR_EXIT_RANGE = 120;
// Cops that get out of each car. They count toward MAX_COPS.
export const COP_CAR_CREW = 2;
// Seconds between cop car spawns.
export const COP_CAR_SPAWN_GAP = 4;

// One roadblock of 2 parked cop cars across the player's road.
export const ROADBLOCK_MIN_STARS = 5;
export const ROADBLOCK_CARS = 2;
// Distance ahead of the player along the road.
export const ROADBLOCK_AHEAD = 400;
// Seconds before a new roadblock may spawn after the last one is removed.
export const ROADBLOCK_COOLDOWN = 30;

// How many cop cars should chase at this whole-star level.
export function desiredCopCars(stars) {
  if (stars < COP_CAR_MIN_STARS) return 0;
  return Math.min(MAX_COP_CARS, (stars - COP_CAR_MIN_STARS + 1) * COP_CARS_PER_STAR);
}

// ---------------------------------------------------------------------------
// Engine side (owner: Mr G). Everything above this line is Loke's and stays
// exactly as he wrote it. Cop cars are the police car models that already
// drive in traffic (handling class "police"). They live in the traffic
// driver list (traffic.addCopCar), so drawing, lights, engine sound, bullet
// hits, wrecks and the Rapier stand-ins all come from the existing traffic
// code. This module only steers them and runs the rules. No new models, no
// new Rapier bodies, no change to world.timestep.
// The pure rules below run in node (tests/cop-cars.test.mjs).

import { MAX_COPS, OFFSCREEN_MARGIN } from "./police.js";

// Measured: the sedan arcade car at full throttle settles at about 179.7
// units/s (police 194, sports 208). COP_CAR_SPEED multiplies this.
export const SEDAN_TOP_SPEED = 180;
export const COP_CAR_TOP_SPEED = SEDAN_TOP_SPEED * COP_CAR_SPEED;
// Driving feel of the AI car (engine numbers, not balance).
const COP_ACCEL = 150;
const COP_BRAKE = 280;
const COP_CORNER_SPEED = 80;
// Yaw rate (rad/s) at speed while steering straight at the player.
const COP_TURN_RATE = 2.4;
// Closer than this, the car stops following roads and drives straight at the player.
export const COP_DIRECT_RANGE = 220;
// Farther than this, a direct chase goes back to following roads.
export const COP_ROUTE_RANGE = 320;
// Road grid for the chase: cars follow a road-distance map toward the player,
// built on cells of this size out to ROAD_REACH cells around the player.
export const ROAD_CELL = 32;
export const ROAD_REACH = 64;
// Off the road, a direct chase only continues this close to the player.
const COP_OFFROAD_RANGE = 150;
// Seconds a car brakes and backs off after a ram.
export const COP_RAM_BACKOFF = 0.8;
// A ram only counts at this speed or more.
export const COP_RAM_MIN_SPEED = 40;
// Slower than this counts as stopped (for the crew getting out).
export const COP_EXIT_STOP_SPEED = 12;
// Seconds a car may sit almost still before it counts as stopped.
const COP_STUCK_TIME = 1.2;
// Seconds a blocked car backs up before trying again.
const COP_REVERSE_TIME = 0.9;
// Player on foot as a circle against the drawn car box.
const PLAYER_RADIUS = 14;
// The drawn car is the sprite size times this (cars.js DRAW_SCALE).
const CAR_DRAW_SCALE = 1.1;
// A chasing car this many spawn radii away has lost the player and goes.
const COP_LOST_FACTOR = 2.4;
// Debug cap for ?copcars=N.
export const COP_CARS_FLAG_MAX = 8;

// Same rule as desiredCopCars, with a different cap (the ?copcars=N test flag).
export function copCarsFor(stars, max = MAX_COP_CARS) {
  const whole = Math.max(0, Math.floor(Number(stars) || 0));
  if (max === MAX_COP_CARS) return desiredCopCars(whole);
  if (whole < COP_CAR_MIN_STARS) return 0;
  return Math.max(0, Math.min(max, (whole - COP_CAR_MIN_STARS + 1) * COP_CARS_PER_STAR));
}

// URL flags. All off by default.
function readParam(search, name) {
  if (search == null) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get(name);
}

// ?copcars=N overrides MAX_COP_CARS (0..COP_CARS_FLAG_MAX). null when absent.
export function parseCopCarsFlag(search) {
  const raw = readParam(search, "copcars");
  if (raw == null || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(COP_CARS_FLAG_MAX, n));
}

// ?stars=N sets the wanted level at start (0..5). null when absent.
export function parseStarsFlag(search) {
  const raw = readParam(search, "stars");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
}

// ?fps=1 shows the FPS counter.
export function parseFpsFlag(search) {
  return readParam(search, "fps") === "1";
}

export function stepCooldown(cooldown, dt) {
  return Math.max(0, (Number(cooldown) || 0) - Math.max(0, Number(dt) || 0));
}

// A ram lands when the cooldown is over and the car is moving fast enough.
export function canRam(cooldown, speed) {
  return !(cooldown > 0) && Math.abs(Number(speed) || 0) >= COP_RAM_MIN_SPEED;
}

// On foot the player takes the damage; in a car the player's car does.
export function ramEffect(playerInCar) {
  return { target: playerInCar ? "car" : "player", damage: COP_CAR_RAM_DAMAGE, cooldown: COP_CAR_RAM_COOLDOWN };
}

// The crew gets out once: the car is stopped within COP_CAR_EXIT_RANGE.
export function crewShouldExit(dist, speed, crewOut, range = COP_CAR_EXIT_RANGE) {
  if (crewOut) return false;
  return dist <= range && Math.abs(Number(speed) || 0) <= COP_EXIT_STOP_SPEED;
}

// How many of the crew fit under MAX_COPS.
export function crewRoom(aliveCops, crew = COP_CAR_CREW, maxCops = MAX_COPS) {
  return Math.max(0, Math.min(crew, maxCops - Math.max(0, aliveCops | 0)));
}

// Spawn and despawn radius: past the visible half-diagonal, like foot cops.
export function spawnRadius(halfW, halfH, margin = OFFSCREEN_MARGIN) {
  return Math.hypot(halfW, halfH) + margin;
}

// Heading convention of the game: angle 0 faces -Z, forward is (-sin, -cos).
export function headingOf(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function wrapAngle(delta) {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Door spots beside a car: left, right, then behind. count of them.
export function crewSpots(car, count = COP_CAR_CREW) {
  const fx = -Math.sin(car.angle || 0);
  const fz = -Math.cos(car.angle || 0);
  const rx = -fz;
  const rz = fx;
  const side = (car.w || 36) / 2 + 14;
  const back = (car.h || 70) / 2 + 14;
  const all = [
    { x: car.x - rx * side, z: car.z - rz * side },
    { x: car.x + rx * side, z: car.z + rz * side },
    { x: car.x - fx * back, z: car.z - fz * back },
  ];
  return all.slice(0, Math.max(0, Math.min(all.length, count | 0)));
}

// Circle (player on foot) against the drawn car box.
export function circleHitsCar(car, px, pz, radius = PLAYER_RADIUS) {
  const c = Math.cos(car.angle || 0);
  const s = Math.sin(car.angle || 0);
  const ox = px - car.x;
  const oz = pz - car.z;
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  const hw = ((car.w || 36) * CAR_DRAW_SCALE) / 2;
  const hh = ((car.h || 70) * CAR_DRAW_SCALE) / 2;
  const ex = Math.max(0, Math.abs(lx) - hw);
  const ez = Math.max(0, Math.abs(lz) - hh);
  return Math.hypot(ex, ez) <= radius;
}

function projectHit(a, b, pad) {
  const ox = b.x - a.x;
  const oz = b.z - a.z;
  const c = Math.cos(a.angle || 0);
  const s = Math.sin(a.angle || 0);
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  const rel = (b.angle || 0) - (a.angle || 0);
  const rc = Math.abs(Math.cos(rel));
  const rs = Math.abs(Math.sin(rel));
  const bw = (b.w || 36) / 2;
  const bh = (b.h || 70) / 2;
  const extentX = rc * bw + rs * bh;
  const extentZ = rs * bw + rc * bh;
  return Math.abs(lx) <= (a.w || 36) / 2 + extentX + pad && Math.abs(lz) <= (a.h || 70) / 2 + extentZ + pad;
}

// Two car boxes touch (separating axis test on both boxes).
export function carsOverlap(a, b, pad = 3) {
  return projectHit(a, b, pad) && projectHit(b, a, pad);
}

// The nearest of the four map directions (the city is a tile grid).
export function snapHeading(angle) {
  const quarter = Math.PI / 2;
  return wrapAngle(Math.round((Number(angle) || 0) / quarter) * quarter);
}

// Where the roadblock goes: on the player's road about `ahead` units in front.
// isRoad(x, z) says whether a point is asphalt. The heading snaps to the grid,
// the spot is searched from `ahead` outward (closest first, never behind
// ROADBLOCK_AHEAD * 0.75), then centred across the road. Returns null when no
// road is found. cars are placed across the road, nose to tail.
export function roadblockSpot(px, pz, angle, isRoad, options = {}) {
  const ahead = options.ahead ?? ROADBLOCK_AHEAD;
  const count = options.count ?? ROADBLOCK_CARS;
  const carW = options.carW ?? 35;
  const carH = options.carH ?? 69;
  const heading = snapHeading(angle);
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = -fz;
  const rz = fx;
  const tries = [0];
  for (let d = 24; d <= ahead * 0.25; d += 24) tries.push(d, -d);
  for (const extra of tries) {
    const along = ahead + extra;
    const cx = px + fx * along;
    const cz = pz + fz * along;
    if (!isRoad(cx, cz)) continue;
    // Road edges across the heading, in 8-unit steps up to 3 tiles each way.
    let left = 0;
    let right = 0;
    while (left < 144 && isRoad(cx - rx * (left + 8), cz - rz * (left + 8))) left += 8;
    while (right < 144 && isRoad(cx + rx * (right + 8), cz + rz * (right + 8))) right += 8;
    const shift = (right - left) / 2;
    const x = cx + rx * shift;
    const z = cz + rz * shift;
    const span = carH + 4;
    const across = wrapAngle(heading + Math.PI / 2);
    const cars = [];
    for (let i = 0; i < count; i += 1) {
      const off = (i - (count - 1) / 2) * span;
      cars.push({ x: x + rx * off, z: z + rz * off, angle: across, w: carW, h: carH });
    }
    return { x, z, heading, along, width: left + right, cars };
  }
  return null;
}

// The roadblock goes once it is off-screen behind the player, or very far.
export function roadblockGone(block, px, pz, heading, radius) {
  if (!block) return true;
  const dx = block.x - px;
  const dz = block.z - pz;
  const dist = Math.hypot(dx, dz);
  if (dist > radius * 2.5) return true;
  if (dist <= radius) return false;
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  return dx * fx + dz * fz < 0;
}

// Road distance map (pure). isRoad(x, z) says whether a point is asphalt.
// A breadth-first search over road cells from the player's cell (or the
// nearest road cell within 4 cells). dist is in cells, -1 when not reached.
export function roadField(isRoad, px, pz, reach = ROAD_REACH, cell = ROAD_CELL) {
  const n = reach * 2 + 1;
  const ox = Math.floor(px / cell) - reach;
  const oz = Math.floor(pz / cell) - reach;
  const dist = new Int16Array(n * n).fill(-1);
  const road = new Int8Array(n * n).fill(-1);
  const roadAt = (i, j) => {
    if (i < 0 || j < 0 || i >= n || j >= n) return false;
    const k = j * n + i;
    if (road[k] < 0) road[k] = isRoad((ox + i + 0.5) * cell, (oz + j + 0.5) * cell) ? 1 : 0;
    return road[k] === 1;
  };
  let si = reach;
  let sj = reach;
  if (!roadAt(si, sj)) {
    let found = false;
    for (let r = 1; r <= 4 && !found; r += 1) {
      for (let dj = -r; dj <= r && !found; dj += 1) {
        for (let di = -r; di <= r && !found; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (roadAt(reach + di, reach + dj)) {
            si = reach + di;
            sj = reach + dj;
            found = true;
          }
        }
      }
    }
    if (!found) return { ox, oz, n, cell, dist, reached: 0, at: () => -1, next: () => null };
  }
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  dist[sj * n + si] = 0;
  queue[tail++] = sj * n + si;
  while (head < tail) {
    const k = queue[head++];
    const i = k % n;
    const j = (k - i) / n;
    const d = dist[k] + 1;
    const around = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
    for (const [a, b] of around) {
      if (!roadAt(a, b)) continue;
      const kk = b * n + a;
      if (dist[kk] >= 0) continue;
      dist[kk] = d;
      queue[tail++] = kk;
    }
  }
  const index = (x, z) => {
    const i = Math.floor(x / cell) - ox;
    const j = Math.floor(z / cell) - oz;
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return j * n + i;
  };
  return {
    ox,
    oz,
    n,
    cell,
    dist,
    reached: tail,
    at(x, z) {
      const k = index(x, z);
      return k < 0 ? -1 : dist[k];
    },
    // Centre of the neighbour cell one step closer (or farther when away).
    // Diagonals only when both side cells are road too. null at the goal.
    next(x, z, away = false) {
      const k = index(x, z);
      if (k < 0 || dist[k] < 0) return null;
      const i = k % n;
      const j = (k - i) / n;
      let best = -1;
      let bestD = dist[k];
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if (di === 0 && dj === 0) continue;
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          const d = dist[b * n + a];
          if (d < 0) continue;
          if (di !== 0 && dj !== 0 && (dist[j * n + a] < 0 || dist[b * n + i] < 0)) continue;
          const better = away ? d > bestD : d < bestD;
          if (better) {
            bestD = d;
            best = b * n + a;
          }
        }
      }
      if (best < 0) return null;
      const bi = best % n;
      const bj = (best - bi) / n;
      return { x: (ox + bi + 0.5) * cell, z: (oz + bj + 0.5) * cell, d: bestD };
    },
  };
}

// Highest speed that still makes the turn onto a target `dist` away at
// `delta` radians off the nose, with yaw rate `rate`. Stops orbiting.
export function turnSpeedCap(dist, delta, rate, top) {
  const off = Math.abs(wrapAngle(delta));
  if (off < 0.05) return top;
  const radius = dist / (2 * Math.sin(Math.min(off, Math.PI / 2)));
  return Math.max(30, Math.min(top, rate * radius));
}

// ---------------------------------------------------------------------------
// Runtime (browser). traffic: createTraffic(); police: createPolice().

export function createCopCars({ traffic, police, player, wanted, drive, onRamPlayer, onRamCar, maxCars = null }) {
  const graph = traffic.roadGraph;
  const cap = maxCars == null ? MAX_COP_CARS : maxCars;
  const entries = [];
  let block = null;
  let blockWait = 0;
  let spawnWait = 0;
  let heading = 0;
  let lastX = player.x;
  let lastZ = player.z;
  // Road per grid cell never changes in play, so it is cached across maps.
  const roadCache = new Map();
  const isRoad = (x, z) => {
    const key = `${Math.floor(x / ROAD_CELL)},${Math.floor(z / ROAD_CELL)}`;
    let value = roadCache.get(key);
    if (value === undefined) {
      value = Boolean(graph.roadAt(x, z));
      roadCache.set(key, value);
    }
    return value;
  };
  let field = null;
  let fieldCell = "";
  let fieldAge = Infinity;

  function refreshField(dt) {
    fieldAge += dt;
    const cell = `${Math.floor(player.x / ROAD_CELL)},${Math.floor(player.z / ROAD_CELL)}`;
    if (field && cell === fieldCell && fieldAge < 2) return;
    if (field && fieldAge < 0.4) return;
    field = roadField(isRoad, player.x, player.z);
    fieldCell = cell;
    fieldAge = 0;
  }

  function distToPlayer(car) {
    return Math.hypot(player.x - car.x, player.z - car.z);
  }

  function turnToward(car, target, rate, dt) {
    const delta = wrapAngle(target - car.angle);
    const step = rate * dt;
    car.angle = wrapAngle(car.angle + Math.max(-step, Math.min(step, delta)));
  }

  function approachSpeed(car, target, dt) {
    if (car.speed < target) car.speed = Math.min(target, car.speed + COP_ACCEL * dt);
    else car.speed = Math.max(target, car.speed - COP_BRAKE * dt);
  }

  // Where to drive: straight at the player when close, else down the road map.
  function aimPoint(entry, away) {
    const car = entry.car;
    if (!away && entry.mode === "direct") return { x: player.x, z: player.z };
    if (!field) return away ? null : { x: player.x, z: player.z };
    let x = car.x;
    let z = car.z;
    let target = null;
    for (let i = 0; i < 3; i += 1) {
      const step = field.next(x, z, away);
      if (!step) break;
      target = step;
      x = step.x;
      z = step.z;
    }
    if (target) return target;
    // Off the map or off the road: head for the nearest reached cell.
    if (field.at(car.x, car.z) < 0) {
      let best = null;
      for (let r = 1; r <= 4 && !best; r += 1) {
        for (let dj = -r; dj <= r; dj += 1) {
          for (let di = -r; di <= r; di += 1) {
            const px = car.x + di * ROAD_CELL;
            const pz = car.z + dj * ROAD_CELL;
            const d = field.at(px, pz);
            if (d < 0) continue;
            const score = d + Math.hypot(di, dj);
            if (!best || score < best.score) best = { x: px, z: pz, score };
          }
        }
      }
      if (best) return best;
    }
    return away ? null : { x: player.x, z: player.z };
  }

  function steer(entry, dt, away) {
    const car = entry.car;
    const dist = distToPlayer(car);
    if (entry.reverse > 0) {
      entry.reverse -= dt;
      approachSpeed(car, -60, dt);
    } else {
      const aim = aimPoint(entry, away);
      let target = COP_CAR_TOP_SPEED;
      if (aim) {
        const want = headingOf(aim.x - car.x, aim.z - car.z);
        const grip = Math.max(0.35, Math.min(1, Math.abs(car.speed) / 70));
        const rate = COP_TURN_RATE * grip + 0.5;
        const aimDist = Math.hypot(aim.x - car.x, aim.z - car.z);
        target = turnSpeedCap(Math.max(aimDist, 40), want - car.angle, COP_TURN_RATE, COP_CAR_TOP_SPEED);
        turnToward(car, want, rate, dt);
      }
      // Do not drive through the player while the ram cools down.
      if (!away && dist < (car.h || 70) / 2 + 30 && entry.ramCooldown > 0) target = 0;
      if (player.dead && !away) target = 0;
      approachSpeed(car, target, dt);
    }
    const fx = -Math.sin(car.angle);
    const fz = -Math.cos(car.angle);
    const nx = car.x + fx * car.speed * dt;
    const nz = car.z + fz * car.speed * dt;
    const nose = car.speed >= 0 ? (car.h || 70) * 0.45 : -(car.h || 70) * 0.45;
    const free = isRoad(nx + fx * nose, nz + fz * nose)
      || (!away && dist < COP_OFFROAD_RANGE)
      || !isRoad(car.x, car.z);
    if (!free) {
      car.speed = Math.min(car.speed, 20);
      entry.blocked = (entry.blocked || 0) + dt;
      if (entry.blocked > 0.6) {
        entry.reverse = COP_REVERSE_TIME;
        entry.blocked = 0;
      }
      return;
    }
    entry.blocked = 0;
    car.x = nx;
    car.z = nz;
    const y = traffic.roadHeight(nx, nz, car.y == null ? 0.6 : car.y);
    car.y = y == null ? null : y;
  }

  function stepBrake(entry, dt) {
    const car = entry.car;
    entry.brakeTime -= dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - COP_BRAKE * dt);
    else car.speed = Math.min(0, car.speed + COP_BRAKE * 0.5 * dt);
    const fx = -Math.sin(car.angle);
    const fz = -Math.cos(car.angle);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
  }

  function playerBox() {
    const sample = drive.driving ? drive.sample() : null;
    return sample ? { x: sample.x, z: sample.z, angle: sample.angle, w: sample.w, h: sample.h } : null;
  }

  function tryRam(entry, inCarBox) {
    const car = entry.car;
    if (!canRam(entry.ramCooldown, car.speed)) return false;
    const hit = inCarBox ? carsOverlap(car, inCarBox, 3) : circleHitsCar(car, player.x, player.z);
    if (!hit) return false;
    const effect = ramEffect(Boolean(inCarBox));
    if (effect.target === "car") {
      if (onRamCar) onRamCar(effect.damage, car);
    } else if (onRamPlayer) {
      onRamPlayer(effect.damage, car);
    }
    entry.ramCooldown = effect.cooldown;
    entry.rams += 1;
    entry.mode = "brake";
    entry.brakeTime = COP_RAM_BACKOFF;
    car.speed = -Math.abs(car.speed) * 0.25;
    return true;
  }

  function aliveCops() {
    let n = 0;
    for (const ped of police.cops()) if (!ped.dead) n += 1;
    return n;
  }

  function crewOut(entry) {
    const car = entry.car;
    entry.crewOut = true;
    entry.mode = "parked";
    car.speed = 0;
    const room = crewRoom(aliveCops());
    const spots = crewSpots(car, COP_CAR_CREW).slice(0, room);
    entry.crewSpawned = police.spawnAt ? police.spawnAt(spots) : 0;
  }

  function release(entry, recycle) {
    const at = entries.indexOf(entry);
    if (at >= 0) entries.splice(at, 1);
    if (recycle) traffic.removeCopCar(entry.car);
    else entry.car.cop = false;
  }

  // Off-screen, on a road cell the road map reaches, facing down the map.
  function spawn(radius) {
    if (!field || field.reached === 0) return null;
    const options = [];
    for (let tries = 0; tries < 160 && options.length < 12; tries += 1) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius + Math.random() * 280;
      const x = player.x + Math.cos(angle) * r;
      const z = player.z + Math.sin(angle) * r;
      const d = field.at(x, z);
      if (d < 0) continue;
      const step = field.next(x, z);
      if (!step) continue;
      options.push({ x: (Math.floor(x / ROAD_CELL) + 0.5) * ROAD_CELL, z: (Math.floor(z / ROAD_CELL) + 0.5) * ROAD_CELL, d, step });
    }
    if (options.length === 0) return null;
    // Shortest road trip first, so the car arrives soon.
    options.sort((a, b) => a.d - b.d);
    const choice = options[Math.floor(Math.random() * Math.min(3, options.length))];
    const car = traffic.addCopCar({
      x: choice.x,
      z: choice.z,
      y: traffic.roadHeight(choice.x, choice.z, 0.6),
      angle: headingOf(choice.step.x - choice.x, choice.step.z - choice.z),
      speed: COP_CAR_TOP_SPEED * 0.6,
    });
    if (!car) return null;
    const entry = {
      car,
      mode: "route",
      ramCooldown: 0,
      brakeTime: 0,
      stuck: 0,
      reverse: 0,
      blocked: 0,
      crewOut: false,
      crewSpawned: 0,
      rams: 0,
    };
    entries.push(entry);
    return entry;
  }

  function placeBlock(radius) {
    const spot = roadblockSpot(player.x, player.z, heading, isRoad);
    if (!spot) return false;
    const list = [];
    for (const at of spot.cars) {
      const car = traffic.addCopCar({ x: at.x, z: at.z, y: traffic.roadHeight(at.x, at.z, 0.6), angle: at.angle, speed: 0 });
      if (car) list.push(car);
    }
    if (list.length === 0) return false;
    // Re-space with the real model lengths, centred on the spot.
    const fx = -Math.sin(spot.heading);
    const fz = -Math.cos(spot.heading);
    const rx = -fz;
    const rz = fx;
    const total = list.reduce((sum, car) => sum + car.h + 4, -4);
    let off = -total / 2;
    for (const car of list) {
      off += car.h / 2;
      car.x = spot.x + rx * off;
      car.z = spot.z + rz * off;
      off += car.h / 2 + 4;
      car.copBlock = true;
    }
    block = { x: spot.x, z: spot.z, heading: spot.heading, cars: list, radius };
    return true;
  }

  function removeBlock() {
    if (!block) return;
    for (const car of block.cars) {
      if (car.cop) traffic.removeCopCar(car);
    }
    block = null;
  }

  function clear() {
    while (entries.length) release(entries[entries.length - 1], true);
    removeBlock();
    spawnWait = 0;
    blockWait = 0;
  }

  let lastRadius = 0;

  function update(dt, halfW, halfH) {
    const radius = spawnRadius(halfW, halfH);
    lastRadius = radius;
    const stars = Math.min(5, Math.floor(wanted.level || 0));
    const want = copCarsFor(stars, cap);
    const inCarBox = playerBox();
    // Player heading: the car's facing, or the way the player last moved.
    if (inCarBox) heading = inCarBox.angle;
    else if (Math.hypot(player.x - lastX, player.z - lastZ) > 0.5) heading = headingOf(player.x - lastX, player.z - lastZ);
    lastX = player.x;
    lastZ = player.z;

    // Cars the player took or wrecked go back to normal traffic rules.
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const car = entries[i].car;
      if (car.held || car.wrecked) release(entries[i], false);
    }
    if (block) {
      block.cars = block.cars.filter((car) => {
        if (car.held || car.wrecked) {
          car.cop = false;
          return false;
        }
        return true;
      });
    }

    let active = 0;
    for (const e of entries) if (e.mode !== "leave" && !e.leaveParked) active += 1;
    // Fewer stars than cars: the farthest extra ones drive off.
    if (active > want) {
      const going = entries.filter((e) => e.mode !== "leave" && !e.leaveParked)
        .sort((a, b) => distToPlayer(b.car) - distToPlayer(a.car));
      for (let i = 0; i < active - want; i += 1) {
        const e = going[i];
        if (e.mode === "parked") e.leaveParked = true;
        else e.mode = "leave";
      }
      active = want;
    }
    if (active > 0 || want > 0) refreshField(dt);
    spawnWait = Math.max(0, spawnWait - dt);
    if (active < want && spawnWait === 0 && !player.dead) {
      if (spawn(radius)) spawnWait = COP_CAR_SPAWN_GAP;
      else spawnWait = 0.5;
    }

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const car = entry.car;
      entry.ramCooldown = stepCooldown(entry.ramCooldown, dt);
      const dist = distToPlayer(car);
      if (entry.mode === "leave" || entry.leaveParked) {
        if (dist > radius) {
          release(entry, true);
          continue;
        }
        if (entry.mode === "leave") steer(entry, dt, true);
        continue;
      }
      if (entry.mode === "parked") {
        car.speed = 0;
        if (dist > radius * 1.25) release(entry, true);
        continue;
      }
      if (dist > radius * COP_LOST_FACTOR) {
        release(entry, true);
        continue;
      }
      if (entry.mode === "brake") {
        stepBrake(entry, dt);
        if (entry.brakeTime <= 0) {
          if (!inCarBox && crewShouldExit(dist, car.speed, entry.crewOut)) crewOut(entry);
          else entry.mode = "direct";
        }
        continue;
      }
      if (entry.mode === "route" && dist < COP_DIRECT_RANGE) entry.mode = "direct";
      else if (entry.mode === "direct" && dist > COP_ROUTE_RANGE) entry.mode = "route";
      steer(entry, dt, false);
      if (player.dead) continue;
      if (tryRam(entry, inCarBox)) continue;
      // Stopped near the player (blocked, or the player stands still in a car):
      // the crew gets out.
      if (Math.abs(car.speed) < COP_EXIT_STOP_SPEED) entry.stuck += dt;
      else entry.stuck = 0;
      if (entry.stuck >= COP_STUCK_TIME && crewShouldExit(distToPlayer(car), car.speed, entry.crewOut)) crewOut(entry);
    }

    // Roadblock: one at a time, from ROADBLOCK_MIN_STARS.
    blockWait = Math.max(0, blockWait - dt);
    if (block && roadblockGone(block, player.x, player.z, heading, radius)) {
      removeBlock();
      blockWait = ROADBLOCK_COOLDOWN;
    }
    if (!block && blockWait === 0 && stars >= ROADBLOCK_MIN_STARS && !player.dead) {
      if (!placeBlock(radius)) blockWait = 1;
    }
  }

  return {
    update,
    clear,
    get cars() {
      return entries.map((e) => e.car);
    },
    get entries() {
      return entries;
    },
    get roadblock() {
      return block;
    },
    get cap() {
      return cap;
    },
    // For the headless check: the road map and each car's road distance.
    debug() {
      return {
        radius: Math.round(lastRadius),
        reached: field ? field.reached : 0,
        playerCell: field ? field.at(player.x, player.z) : -1,
        cars: entries.map((e) => (field ? field.at(e.car.x, e.car.z) : -1)),
      };
    },
  };
}
