// Builds data/city.json: one fixed downtown, the same every time.
//
//   node tools/generate-map.mjs
//
// The plan is a squared island city:
//   water, a quay, then a 4-lane ring road (two lanes each way and a median)
//   three avenues each way, wider than the local streets and tied into the ring
//   local streets on an even grid so every road ends at another road
//   a canal crossed by bridges, and a south harbor the ring bridges
//   high-rises in the middle, apartments around them, parks on purpose

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const N = 260;
const COLS = N;
const ROWS = N;
const TILE = 48;

const RING_W = 5;
const RING_A = 8;
const RING_B = N - RING_A - RING_W;
const ROAD_LO = RING_A;
const ROAD_HI = N - 1 - RING_A;
const PARCEL = 16;
const LOCAL = 2;
const ROAD_COUNT = 12;
const ARTERIALS = new Set([2, 6, 10]);

const CANAL_Z0 = 178;
const CANAL_Z1 = 185;
const HARBOR_X0 = 104;
const HARBOR_X1 = 155;
const HARBOR_QUAY_Z0 = 230;
const HARBOR_QUAY_Z1 = 231;
const HARBOR_Z = 232;

const ROAD = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "+", "h", "v", "X", "A", "E", "a", "e"]);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const ROOFS = {
  tower: ["#6e6256", "#5d666e", "#7a6a52", "#4c5550"],
  glass: ["#8ea4b0", "#6d838f", "#9bb0bc", "#5e727e"],
  mid: ["#6a5a48", "#596168", "#6e6858"],
  brick: ["#6a4038", "#7a4038", "#5a342c", "#8a5040"],
};

const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("l"));
const hClass = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
const vClass = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
const hOff = Array.from({ length: ROWS }, () => new Int8Array(COLS).fill(-1));
const vOff = Array.from({ length: ROWS }, () => new Int8Array(COLS).fill(-1));
const buildings = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inBounds(x, z) {
  return x >= 0 && z >= 0 && x < COLS && z < ROWS;
}

function isRingX(x) {
  return (x >= RING_A && x < RING_A + RING_W) || (x >= RING_B && x < RING_B + RING_W);
}

function isRingZ(z) {
  return (z >= RING_A && z < RING_A + RING_W) || (z >= RING_B && z < RING_B + RING_W);
}

function roadStart(index) {
  // Inner sidewalk is tile 13, then a 16-tile block, so the first street is 30.
  // Streets repeat every 18 tiles (2 of road + 16 of block). Avenues borrow one tile each side.
  return 30 + index * (LOCAL + PARCEL);
}

function paintWaterFrame() {
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (x < 5 || z < 5 || x >= N - 5 || z >= N - 5) grid[z][x] = "~";
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const quay = (x >= 5 && x <= 6) || (x >= N - 7 && x <= N - 6) || (z >= 5 && z <= 6) || (z >= N - 7 && z <= N - 6);
      if (quay && grid[z][x] !== "~") grid[z][x] = "c";
    }
  }
}

function paintH(z, width, classId) {
  for (let offset = 0; offset < width; offset += 1) {
    const zz = z + offset;
    for (let x = ROAD_LO; x <= ROAD_HI; x += 1) {
      hClass[zz][x] = classId;
      hOff[zz][x] = offset;
    }
  }
}

function paintV(x, width, classId) {
  for (let offset = 0; offset < width; offset += 1) {
    const xx = x + offset;
    for (let z = ROAD_LO; z <= ROAD_HI; z += 1) {
      vClass[z][xx] = classId;
      vOff[z][xx] = offset;
    }
  }
}

function paintRoads() {
  paintH(RING_A, RING_W, 3);
  paintH(RING_B, RING_W, 3);
  paintV(RING_A, RING_W, 3);
  paintV(RING_B, RING_W, 3);
  for (let i = 0; i < ROAD_COUNT; i += 1) {
    const start = roadStart(i);
    if (ARTERIALS.has(i)) {
      paintH(start - 1, 4, 2);
      paintV(start - 1, 4, 2);
    } else {
      paintH(start, LOCAL, 1);
      paintV(start, LOCAL, 1);
    }
  }
}

function hCode(classId, offset) {
  if (classId === 3) {
    if (offset === 0) return "1";
    if (offset === 2) return "4";
    if (offset === 4) return "2";
    return "+";
  }
  if (classId === 2) {
    if (offset === 0) return "1";
    if (offset === 1) return "3";
    if (offset === 3) return "2";
    return "+";
  }
  return offset === 0 ? "h" : "X";
}

function vCode(classId, offset) {
  if (classId === 3) {
    if (offset === 0) return "5";
    if (offset === 2) return "8";
    if (offset === 4) return "6";
    return "+";
  }
  if (classId === 2) {
    if (offset === 0) return "5";
    if (offset === 1) return "7";
    if (offset === 3) return "6";
    return "+";
  }
  return offset === 0 ? "v" : "X";
}

function resolveRoads() {
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const hc = hClass[z][x];
      const vc = vClass[z][x];
      if (!hc && !vc) continue;
      if (hc && vc) {
        grid[z][x] = hc >= 2 || vc >= 2 ? "+" : "X";
        continue;
      }
      if (hc) {
        const east = x + 1 < COLS && hClass[z][x + 1] && vClass[z][x + 1];
        const west = x > 0 && hClass[z][x - 1] && vClass[z][x - 1];
        const ringCorner = (east && isRingZ(z) && isRingX(x + 1)) || (west && isRingZ(z) && isRingX(x - 1));
        if (!ringCorner && east) grid[z][x] = "A";
        else if (!ringCorner && west) grid[z][x] = "E";
        else grid[z][x] = hCode(hc, hOff[z][x]);
        continue;
      }
      const south = z + 1 < ROWS && hClass[z + 1][x] && vClass[z + 1][x];
      const north = z > 0 && hClass[z - 1][x] && vClass[z - 1][x];
      const ringCorner = (south && isRingX(x) && isRingZ(z + 1)) || (north && isRingX(x) && isRingZ(z - 1));
      if (!ringCorner && south) grid[z][x] = "a";
      else if (!ringCorner && north) grid[z][x] = "e";
      else grid[z][x] = vCode(vc, vOff[z][x]);
    }
  }
}

function paintCanalAndHarbor() {
  for (let z = CANAL_Z0; z <= CANAL_Z1; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!ROAD.has(grid[z][x])) grid[z][x] = "~";
    }
  }
  for (let z = HARBOR_QUAY_Z0; z <= HARBOR_QUAY_Z1; z += 1) {
    for (let x = HARBOR_X0; x <= HARBOR_X1; x += 1) {
      if (!ROAD.has(grid[z][x])) grid[z][x] = "c";
    }
  }
  for (let z = HARBOR_Z; z < ROWS; z += 1) {
    for (let x = HARBOR_X0; x <= HARBOR_X1; x += 1) {
      if (!ROAD.has(grid[z][x])) grid[z][x] = "~";
    }
  }
}

function shoreAndSidewalk() {
  const next = grid.map((row) => row.slice());
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = grid[z][x];
      if (cell !== "l" && cell !== "s") continue;
      let water = false;
      let road = false;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz)) continue;
        if (grid[nz][nx] === "~") water = true;
        if (ROAD.has(grid[nz][nx])) road = true;
      }
      if (water) next[z][x] = "c";
      else if (road) next[z][x] = "s";
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) grid[z][x] = next[z][x];
  }
}

function floodLots() {
  const seen = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const lots = [];
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (seen[z][x] || grid[z][x] !== "l") continue;
      const cells = [];
      const queue = [[x, z]];
      seen[z][x] = 1;
      let minX = x;
      let maxX = x;
      let minZ = z;
      let maxZ = z;
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cz] = queue[i];
        cells.push([cx, cz]);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cz < minZ) minZ = cz;
        if (cz > maxZ) maxZ = cz;
        for (const [dx, dz] of N4) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inBounds(nx, nz) || seen[nz][nx] || grid[nz][nx] !== "l") continue;
          seen[nz][nx] = 1;
          queue.push([nx, nz]);
        }
      }
      lots.push({
        cells,
        minX,
        maxX,
        minZ,
        maxZ,
        w: maxX - minX + 1,
        h: maxZ - minZ + 1,
        cx: (minX + maxX) / 2,
        cz: (minZ + maxZ) / 2,
      });
    }
  }
  return lots;
}

function chooseUse(lot) {
  const { cx, cz } = lot;
  if (cx > 122 && cx < 136 && cz > 122 && cz < 136) return "plaza";
  if (cx > 140 && cx < 156 && cz > 122 && cz < 136) return "park";
  if (cx > 32 && cx < 48 && cz > 30 && cz < 48) return "park";
  if (cx > 193 && cx < 210 && cz > 30 && cz < 48) return "park";
  if (cx > 32 && cx < 48 && cz > 193 && cz < 210) return "park";
  if (cz > 212 && cz < 228 && cx > 100 && cx < 160) return "park";
  return "buildings";
}

function districtOf(cx, cz) {
  if (cx >= 104 && cx <= 173 && cz >= 104 && cz <= 173) return "core";
  if (cx >= 69 && cx <= 208 && cz >= 69 && cz <= 208) return "mid";
  return "outer";
}

function nearWater(x, z) {
  if (x <= 20 || z <= 20 || x >= 239 || z >= 239) return true;
  if (z >= 176 && z <= 192) return true;
  if (x >= 100 && x <= 160 && z >= 226) return true;
  return false;
}

function heightAt(cx, cz, district, corner) {
  const dist = Math.hypot(cx - 130, cz - 124);
  let height = district === "core" ? 17 - Math.floor(dist / 12) : district === "mid" ? 10 - Math.floor(dist / 30) : 6;
  if (corner) height += 2;
  if ((Math.floor(cx / 5) + Math.floor(cz / 5)) % 3 === 0) height += 1;
  const wet = nearWater(cx, cz);
  if (wet) height = Math.min(height, 5);
  const low = district === "core" && !wet ? 12 : 4;
  return clamp(Math.round(height), low, 18);
}

function styleFor(height, x, z) {
  if (height >= 14) return (Math.floor(x / 8) + Math.floor(z / 8)) % 2 === 0 ? "glass" : "tower";
  if (height >= 10) return Math.floor(x / 10) % 2 === 0 ? "tower" : "brick";
  if (height <= 5) return Math.floor(z / 8) % 2 === 0 ? "mid" : "brick";
  return Math.floor((x + z) / 9) % 2 === 0 ? "brick" : "mid";
}

function mark(x, z, w, d, code) {
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) grid[zz][xx] = code;
  }
}

function addBuilding(x, z, w, d, height, style, roof) {
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (!inBounds(xx, zz) || grid[zz][xx] !== "l") return false;
    }
  }
  buildings.push({ x, z, w, d, h: height, style, roof });
  mark(x, z, w, d, "b");
  return true;
}

function addBox(x, z, w, d, district, corner) {
  const cx = x + w / 2;
  const cz = z + d / 2;
  const height = heightAt(cx, cz, district, corner);
  const style = styleFor(height, x, z);
  const roofs = ROOFS[style];
  const roof = roofs[(x + z * 2) % roofs.length];
  if (!addBuilding(x, z, w, d, height, style, roof)) {
    throw new Error(`Could not place a ${w}x${d} building at ${x},${z}`);
  }
}

function cutLengths(total) {
  const pattern = [5, 4, 6, 4, 3];
  const parts = [];
  let left = total;
  let index = 0;
  while (left > 0) {
    if (left <= 7) {
      parts.push(left);
      break;
    }
    let width = pattern[index % pattern.length];
    index += 1;
    if (left - width < 3) width = left;
    parts.push(width);
    left -= width;
  }
  return parts;
}

function stripX(x, z, totalW, depth, district, corners) {
  const parts = cutLengths(totalW);
  let cursor = x;
  for (let i = 0; i < parts.length; i += 1) {
    const width = parts[i];
    const corner = corners && (i === 0 || i === parts.length - 1);
    addBox(cursor, z, width, depth, district, corner);
    cursor += width;
  }
}

function stripZ(x, z, width, totalD, district) {
  const parts = cutLengths(totalD);
  let cursor = z;
  for (const depth of parts) {
    addBox(x, cursor, width, depth, district, false);
    cursor += depth;
  }
}

function fillBlock(lot, district) {
  const { minX, minZ, maxX, maxZ, w, h } = lot;
  const short = Math.min(w, h);
  if (w < 2 || h < 2) {
    mark(minX, minZ, w, h, "q");
    return;
  }
  if (short <= 5) {
    if (w >= h) stripX(minX, minZ, w, h, district, true);
    else stripZ(minX, minZ, w, h, district);
    return;
  }
  const depth = Math.min(district === "core" ? 5 : 4, Math.floor((short - 2) / 2));
  stripX(minX, minZ, w, depth, district, true);
  stripX(minX, maxZ - depth + 1, w, depth, district, true);
  const midD = h - depth * 2;
  if (midD > 0) {
    stripZ(minX, minZ + depth, depth, midD, district);
    stripZ(maxX - depth + 1, minZ + depth, depth, midD, district);
  }
  const courtW = w - depth * 2;
  const courtD = h - depth * 2;
  if (courtW > 0 && courtD > 0) mark(minX + depth, minZ + depth, courtW, courtD, district === "core" ? "q" : "g");
}

function fillPark(lot) {
  mark(lot.minX, lot.minZ, lot.w, lot.h, "g");
  const cx = lot.minX + Math.floor(lot.w / 2);
  const cz = lot.minZ + Math.floor(lot.h / 2);
  for (let x = lot.minX; x <= lot.maxX; x += 1) grid[cz][x] = "p";
  for (let z = lot.minZ; z <= lot.maxZ; z += 1) grid[z][cx] = "p";
}

let plazaStand = null;

function fillPlaza(lot) {
  mark(lot.minX, lot.minZ, lot.w, lot.h, "q");
  const mx = lot.minX + Math.floor(lot.w / 2);
  const mz = lot.minZ + Math.floor(lot.h / 2);
  for (let x = lot.minX; x <= lot.maxX; x += 1) grid[mz][x] = "p";
  for (let z = lot.minZ; z <= lot.maxZ; z += 1) grid[z][mx] = "p";
  const fx = mx - 1;
  const fz = mz - 1;
  for (let dz = 0; dz < 2; dz += 1) {
    for (let dx = 0; dx < 2; dx += 1) grid[fz + dz][fx + dx] = "~";
  }
  plazaStand = [mx + 3, mz];
}

function tryPier(x, z, dx, dz, length, width) {
  const cells = [];
  const acrossX = dz !== 0 ? 1 : 0;
  const acrossZ = dx !== 0 ? 1 : 0;
  const half = Math.floor((width - 1) / 2);
  for (let i = 0; i < length; i += 1) {
    for (let w = 0; w < width; w += 1) {
      const xx = x + dx * i + acrossX * (w - half);
      const zz = z + dz * i + acrossZ * (w - half);
      if (!inBounds(xx, zz) || grid[zz][xx] !== "~") return false;
      cells.push([xx, zz]);
    }
  }
  const bx = x - dx;
  const bz = z - dz;
  if (!inBounds(bx, bz) || grid[bz][bx] === "~" || grid[bz][bx] === "b") return false;
  for (const [xx, zz] of cells) grid[zz][xx] = "d";
  return true;
}

function placePiers() {
  let count = 0;
  for (let x = 22; x <= 238; x += 18) {
    if (x >= HARBOR_X0 - 2 && x <= HARBOR_X1 + 2) continue;
    if (tryPier(x, N - 5, 0, 1, 4, 3)) count += 1;
  }
  for (const x of [110, 116, 126, 132, 146, 152]) {
    if (tryPier(x, HARBOR_Z, 0, 1, 5, 3)) count += 1;
  }
  for (const z of [238, 244]) {
    if (tryPier(HARBOR_X0, z, 1, 0, 4, 3)) count += 1;
    if (tryPier(HARBOR_X1, z, -1, 0, 4, 3)) count += 1;
  }
  for (const z of [40, 96, 210]) {
    if (tryPier(4, z, -1, 0, 4, 3)) count += 1;
    if (tryPier(N - 5, z, 1, 0, 4, 3)) count += 1;
  }
  return count;
}

function nearestWalk(x, z) {
  const walk = (cell) => cell !== "~" && cell !== "b";
  for (let radius = 0; radius < 8; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius !== 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const xx = x + dx;
        const zz = z + dz;
        if (inBounds(xx, zz) && walk(grid[zz][xx])) return [xx, zz];
      }
    }
  }
  throw new Error(`No walkable tile near ${x},${z}`);
}

function validate(piers) {
  const problems = [];
  let dead = 0;
  let roads = 0;
  const seen = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  let components = 0;
  const counts = {};
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = grid[z][x];
      counts[cell] = (counts[cell] ?? 0) + 1;
      if (cell === "l") problems.push(`leftover lot at ${x},${z}`);
      if (!ROAD.has(cell)) continue;
      roads += 1;
      let degree = 0;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (inBounds(nx, nz) && ROAD.has(grid[nz][nx])) degree += 1;
      }
      if (degree < 2) dead += 1;
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (seen[z][x] || !ROAD.has(grid[z][x])) continue;
      components += 1;
      const queue = [[x, z]];
      seen[z][x] = 1;
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cz] = queue[i];
        for (const [dx, dz] of N4) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inBounds(nx, nz) || seen[nz][nx] || !ROAD.has(grid[nz][nx])) continue;
          seen[nz][nx] = 1;
          queue.push([nx, nz]);
        }
      }
    }
  }
  if (dead !== 0) problems.push(`${dead} dead-end road tiles`);
  if (components !== 1) problems.push(`${components} road networks`);
  const covered = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  for (const building of buildings) {
    if (building.w < 2 || building.d < 2) problems.push(`thin building ${building.x},${building.z}`);
    for (let z = building.z; z < building.z + building.d; z += 1) {
      for (let x = building.x; x < building.x + building.w; x += 1) {
        if (!inBounds(x, z) || grid[z][x] !== "b") problems.push(`building off footprint ${x},${z}`);
        if (covered[z][x]) problems.push(`overlap ${x},${z}`);
        covered[z][x] = 1;
      }
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (grid[z][x] === "b" && !covered[z][x]) problems.push(`bare footprint ${x},${z}`);
    }
  }
  // Player is 32px. A tile center is safe when the whole square stays on walkable ground.
  function blockedAt(px, pz) {
    const inset = 16 - 0.01;
    for (const [sx, sz] of [[px - inset, pz - inset], [px + inset, pz - inset], [px - inset, pz + inset], [px + inset, pz + inset]]) {
      const tx = Math.floor(sx / TILE);
      const tz = Math.floor(sz / TILE);
      if (!inBounds(tx, tz)) return true;
      const cell = grid[tz][tx];
      if (cell === "~" || cell === "b") return true;
    }
    return false;
  }
  let stuckSidewalks = 0;
  let openBuildings = 0;
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = (x + 0.5) * TILE;
      const pz = (z + 0.5) * TILE;
      if (grid[z][x] === "s" && blockedAt(px, pz)) stuckSidewalks += 1;
      if (grid[z][x] === "b" && !blockedAt(px, pz)) openBuildings += 1;
    }
  }
  if (stuckSidewalks) problems.push(`${stuckSidewalks} sidewalks block the player`);
  if (openBuildings) problems.push(`${openBuildings} building tiles can be walked`);
  if ((counts["4"] ?? 0) < 300 || (counts["8"] ?? 0) < 300) problems.push("ring median is missing");
  if ((counts["3"] ?? 0) < 200) problems.push("avenue center lines are missing");
  if (buildings.length < 800) problems.push(`only ${buildings.length} buildings`);
  if (!plazaStand) problems.push("civic plaza is missing");
  if (piers < 8) problems.push(`only ${piers} piers`);
  return { problems: problems.slice(0, 12), counts, roads, dead, components };
}

paintWaterFrame();
paintRoads();
resolveRoads();
paintCanalAndHarbor();
shoreAndSidewalk();

let parks = 0;
let plazas = 0;
let oddLots = 0;
for (const lot of floodLots()) {
  const rectangular = lot.cells.length === lot.w * lot.h;
  if (!rectangular) {
    oddLots += 1;
    for (const [x, z] of lot.cells) grid[z][x] = "q";
    continue;
  }
  const use = chooseUse(lot);
  if (use === "park") {
    fillPark(lot);
    parks += 1;
  } else if (use === "plaza") {
    fillPlaza(lot);
    plazas += 1;
  } else {
    fillBlock(lot, districtOf(lot.cx, lot.cz));
  }
}

const piers = placePiers();
const report = validate(piers);
if (report.problems.length) {
  console.error(report.problems.join("\n"));
  process.exit(1);
}

const views = [
  ["Skyline", nearestWalk(138, 160)],
  ["Main avenue", nearestWalk(96, 137)],
  ["Civic plaza", nearestWalk(plazaStand[0], plazaStand[1])],
  ["Harbor", nearestWalk(128, 250)],
  ["Apartments", nearestWalk(90, 84)],
  ["Canal", nearestWalk(138, 181)],
].map(([name, point]) => ({ name, x: point[0], z: point[1] }));

const spawn = { x: views[0].x, z: views[0].z };
buildings.sort((a, b) => a.z - b.z || a.x - b.x || a.h - b.h);

const byStyle = {};
const heights = {};
for (const building of buildings) {
  byStyle[building.style] = (byStyle[building.style] ?? 0) + 1;
  heights[building.h] = (heights[building.h] ?? 0) + 1;
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "city.json");
const groundLines = grid.map((row) => `    "${row.join("")}"`).join(",\n");
const buildingLines = buildings.map((building) => `    ${JSON.stringify(building)}`).join(",\n");
const viewText = JSON.stringify(views, null, 2).replace(/\n/g, "\n  ");
writeFileSync(out, `{
  "cols": ${COLS},
  "rows": ${ROWS},
  "tile": ${TILE},
  "spawn": ${JSON.stringify(spawn)},
  "views": ${viewText},
  "ground": [
${groundLines}
  ],
  "buildings": [
${buildingLines}
  ]
}
`);
console.log(`wrote ${out}`);
console.log("tiles", report.counts);
console.log("roads", report.roads, "components", report.components, "dead", report.dead);
console.log("buildings", buildings.length, byStyle);
console.log("heights", heights);
console.log("parks", parks, "plazas", plazas, "oddLots", oddLots, "piers", piers);
console.log("views", views);
