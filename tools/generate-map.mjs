// Builds data/city.json: one fixed downtown, the same every time.
// Edit the lists near the top (spines, diagonals, river, harbor, skyline seeds)
// and run:
//
//   node tools/generate-map.mjs
//
// The plan is original. It borrows the feel of a GTA 2 downtown — bent streets,
// diagonals, alleys, plazas, a coast — and is not a trace of that map.
// Roads are a little wider than the first pass, dead ends get joined, and a
// 4-lane ring follows the coast.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 260;
const ROWS = 260;

// Bent avenues. Each leg is either straight or exactly 45 degrees so the
// yellow lines meet. Spacing and direction change on purpose.
const AVENUES = [
  { width: 3, pts: [[18, 46], [96, 46], [146, 96], [200, 96], [236, 60]] },
  { width: 3, pts: [[36, 22], [36, 78], [78, 120], [78, 168], [44, 202], [44, 242]] },
  { width: 3, pts: [[168, 20], [168, 64], [128, 104], [188, 164], [188, 210], [150, 248]] },
  { width: 3, pts: [[230, 28], [176, 28], [136, 68], [196, 128], [240, 128]] },
  { width: 3, pts: [[20, 128], [70, 128], [118, 176], [178, 176], [214, 140], [248, 140]] },
  { width: 3, pts: [[24, 24], [24, 86], [64, 126], [24, 166], [24, 214]] },
  { width: 3, pts: [[100, 210], [150, 210], [190, 170], [236, 170]] },
];

// 45-degree avenues. dx/dz are each -1 or 1.
const DIAGONALS = [
  { x: 42, z: 196, len: 108, dx: 1, dz: -1, width: 5, major: true },
  { x: 214, z: 184, len: 86, dx: -1, dz: -1, width: 5, major: true },
  { x: 154, z: 34, len: 46, dx: -1, dz: 1, width: 3, major: false },
  { x: 58, z: 52, len: 40, dx: 1, dz: 1, width: 3, major: false },
  { x: 168, z: 96, len: 44, dx: 1, dz: 1, width: 3, major: false },
  { x: 96, z: 156, len: 32, dx: 1, dz: -1, width: 3, major: false },
];

const RIVER = [
  [78, 0],
  [92, 34],
  [60, 76],
  [86, 116],
  [54, 154],
  [98, 188],
  [136, 216],
];

const SEEDS = [
  [118, 96, 18],
  [148, 72, 17],
  [98, 126, 16],
  [178, 118, 15],
  [66, 64, 14],
  [206, 86, 16],
  [128, 156, 13],
];

const LANDMARKS = [
  [118, 96, 5, 4, 18, "glass", "#8ea4b0"],
  [148, 72, 4, 6, 17, "tower", "#6e6256"],
  [98, 126, 6, 3, 16, "tower", "#5c656c"],
  [178, 118, 3, 7, 16, "glass", "#7f96a4"],
  [66, 64, 4, 5, 15, "brick", "#6a4038"],
  [206, 86, 5, 5, 17, "tower", "#4c5550"],
  [128, 156, 7, 3, 14, "brick", "#7a4038"],
];

const ROOFS = {
  tower: ["#6e6256", "#5d666e", "#7a6a52", "#4c5550"],
  glass: ["#8ea4b0", "#6d838f", "#9bb0bc", "#5e727e"],
  mid: ["#6a5a48", "#596168", "#6e6858"],
  brick: ["#6a4038", "#7a4038", "#5a342c", "#8a5040"],
  shed: ["#4a4e50", "#6a4030", "#3e4450", "#5a5348"],
};

const MAJOR = new Set(["H", "V", "+", "A", "E", "1", "2", "4", "5", "6", "8"]);
const ROAD = new Set(["H", "V", "+", "h", "v", "X", "A", "E", "a", "e", "n", "1", "2", "4", "5", "6", "8"]);

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("~"));
const buildings = [];

function hash(x, z) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

function inBounds(x, z) {
  return x >= 0 && z >= 0 && x < COLS && z < ROWS;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smooth(x, z) {
  const g = 10;
  const x0 = Math.floor(x / g);
  const z0 = Math.floor(z / g);
  const tx = (x - x0 * g) / g;
  const tz = (z - z0 * g) / g;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const v = (ix, iz) => (hash(ix, iz) % 1000) / 1000;
  const a = v(x0, z0);
  const b = v(x0 + 1, z0);
  const c = v(x0, z0 + 1);
  const d = v(x0 + 1, z0 + 1);
  return a * (1 - sx) * (1 - sz) + b * sx * (1 - sz) + c * (1 - sx) * sz + d * sx * sz;
}

function ellipse(x, z, cx, cz, rx, ry) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / ry;
  return dx * dx + dz * dz;
}

function distToSeg(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / len2, 0, 1);
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

function distToRiver(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    best = Math.min(best, distToSeg(x, z, RIVER[i], RIVER[i + 1]));
  }
  return best;
}

function isIsland(x, z) {
  return ellipse(x, z, 176, 224, 12, 8) < 1;
}

function isWaterFeature(x, z) {
  if (distToRiver(x, z) < 3.3 + smooth(x + 40, z) * 1.3) return true;
  const harbor = ellipse(x, z, 168, 228, 58, 34);
  if (harbor < 0.72) return true;
  if (harbor < 1 && smooth(x + 80, z + 20) > 0.38) return true;
  if (z > 228 && x > 150 && x < 188) return true;
  if (ellipse(x, z, 116, 210, 30, 14) < 0.92) return true;
  if (ellipse(x, z, 26, 238, 38, 28) < 0.86) return true;
  if (z > 244 && x < 52) return true;
  if (ellipse(x, z, 6, 34, 34, 24) < 0.82) return true;
  if (ellipse(x, z, 270, 116, 42, 28) < 0.84) return true;
  return false;
}

function paintLand() {
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (isIsland(x, z)) {
        grid[z][x] = "l";
        continue;
      }
      if (isWaterFeature(x, z)) continue;
      const n = smooth(x, z);
      const margin = 7 + n * 16;
      if (x < margin || z < margin || COLS - 1 - x < margin || ROWS - 1 - z < margin) continue;
      grid[z][x] = "l";
    }
  }
}

function paintCell(x, z, code, force) {
  if (!inBounds(x, z)) return;
  const cur = grid[z][x];
  if (cur === "d") return;
  if (cur === "~" && !force) return;
  if (!ROAD.has(cur)) {
    grid[z][x] = code;
    return;
  }
  if (cur === code) return;
  const plain = cur === "+" || cur === "X";
  const nextPlain = code === "+" || code === "X";
  if (plain && !nextPlain) {
    grid[z][x] = code;
    return;
  }
  if (nextPlain) return;
  const curMajor = MAJOR.has(cur);
  const nextMajor = MAJOR.has(code);
  grid[z][x] = curMajor || nextMajor ? "+" : "X";
}

function stepCode(sx, sz, major) {
  if (sx !== 0 && sz !== 0) {
    const slash = sx * sz < 0;
    return major ? (slash ? "A" : "E") : (slash ? "a" : "e");
  }
  if (sx !== 0) return major ? "H" : "h";
  return major ? "V" : "v";
}

function rasterSegment(x0, z0, x1, z1) {
  const cells = [];
  const dx = x1 - x0;
  const dz = z1 - z0;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  let px = x0;
  let pz = z0;
  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(x0 + (dx * i) / steps);
    const z = Math.round(z0 + (dz * i) / steps);
    const sx = Math.sign(x - px);
    const sz = Math.sign(z - pz);
    if (sx !== 0 || sz !== 0) cells.push({ x, z, sx, sz });
    px = x;
    pz = z;
  }
  return cells;
}

function strokePolyline(pts, width, major, bridgeLimit = 11) {
  const line = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    if (x0 !== x1 && z0 !== z1) {
      line.push(...rasterSegment(x0, z0, x1, z0));
      line.push(...rasterSegment(x1, z0, x1, z1));
    } else {
      line.push(...rasterSegment(x0, z0, x1, z1));
    }
  }
  if (line.length === 0) return;
  const water = line.map((cell) => inBounds(cell.x, cell.z) && grid[cell.z][cell.x] === "~");
  const force = water.map(() => false);
  let i = 0;
  while (i < line.length) {
    if (!water[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && water[j]) j += 1;
    const beforeLand = i > 0 && !water[i - 1];
    const afterLand = j < line.length && !water[j];
    if (beforeLand && afterLand && j - i <= bridgeLimit) {
      for (let k = i; k < j; k += 1) force[k] = true;
    }
    i = j;
  }
  const start = -Math.floor(width / 2);
  const shoulder = major ? "+" : "X";
  for (let k = 0; k < line.length; k += 1) {
    const cell = line[k];
    const px = cell.sx !== 0 && cell.sz !== 0 ? -cell.sz : (cell.sx !== 0 ? 0 : 1);
    const pz = cell.sx !== 0 && cell.sz !== 0 ? cell.sx : (cell.sx !== 0 ? 1 : 0);
    for (let o = 0; o < width; o += 1) {
      const off = start + o;
      if (off === 0) continue;
      paintCell(cell.x + px * off, cell.z + pz * off, shoulder, force[k]);
    }
    const prev = line[k - 1];
    const turn = !prev || prev.sx !== cell.sx || prev.sz !== cell.sz;
    if (!turn) continue;
    const r = Math.floor((width - 1) / 2);
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        paintCell(cell.x + dx, cell.z + dz, shoulder, force[k]);
      }
    }
  }
  for (let k = 0; k < line.length; k += 1) {
    const cell = line[k];
    paintCell(cell.x, cell.z, stepCode(cell.sx, cell.sz, major), force[k]);
    // A diagonal step only touches the next tile at a corner. Fill the elbow
    // so the road shares an edge and you can actually walk along it.
    if (cell.sx === 0 || cell.sz === 0) continue;
    const px = -cell.sz;
    const pz = cell.sx;
    const elbow = major ? "+" : "X";
    for (let o = 0; o < width; o += 1) {
      const off = start + o;
      paintCell(cell.x - cell.sx + px * off, cell.z + pz * off, elbow, force[k]);
    }
  }
}

function paintAvenues() {
  for (const avenue of AVENUES) strokePolyline(avenue.pts, avenue.width, true);
}

function paintDiagonals() {
  // Stair-step diagonals read as a wide asphalt blob. Run the same span as
  // two straight streets that meet at a corner.
  for (const diag of DIAGONALS) {
    const x2 = diag.x + diag.dx * diag.len;
    const z2 = diag.z + diag.dz * diag.len;
    strokePolyline(
      [[diag.x, diag.z], [x2, diag.z], [x2, z2]],
      3,
      diag.major,
    );
  }
}

function waterfrontRoad() {
  const runs = [];
  let run = [];
  for (let x = 40; x < 230; x += 8) {
    let shore = null;
    for (let z = 168; z < 252; z += 1) {
      if (grid[z][x] === "~" && grid[z - 1][x] !== "~") {
        shore = z - 4;
        break;
      }
    }
    if (shore == null || shore < 24 || !inBounds(x, shore) || grid[shore][x] === "~") {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push([x, shore]);
  }
  if (run.length > 1) runs.push(run);
  for (const raw of runs) {
    const pts = [raw[0]];
    for (let i = 1; i < raw.length; i += 1) {
      const prev = pts[pts.length - 1];
      const [x, z] = raw[i];
      if (Math.abs(z - prev[1]) >= 3) {
        pts.push([x, prev[1]]);
        pts.push([x, z]);
      } else {
        pts.push([x, prev[1]]);
      }
    }
    strokePolyline(pts, 3, true);
  }
}

function connectIsland() {
  const x = 176;
  let z = 224;
  if (!inBounds(x, z) || grid[z][x] !== "l") return;
  while (z > 1 && grid[z - 1][x] === "l") z -= 1;
  const islandEdge = z;
  z -= 1;
  while (z > 1 && grid[z][x] === "~") z -= 1;
  if (grid[z][x] !== "~" && islandEdge - z > 1 && islandEdge - z <= 36) {
    strokePolyline([[x, z], [x, islandEdge + 2]], 3, true, 36);
  }
}

function harborBridge() {
  for (let z = 214; z <= 246; z += 2) {
    let x = 30;
    while (x < COLS - 10 && grid[z][x] !== "~") x += 1;
    const waterStart = x;
    while (x < COLS && grid[z][x] === "~") x += 1;
    const run = x - waterStart;
    if (run < 14 || run > 42 || waterStart < 30 || x >= COLS - 8) continue;
    if (grid[z][waterStart - 1] === "~" || grid[z][x] === "~") continue;
    strokePolyline([[waterStart - 8, z], [x + 7, z]], 3, true, run + 2);
    return;
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
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cz] = queue[i];
        cells.push([cx, cz]);
        for (const [dx, dz] of N4) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inBounds(nx, nz) || seen[nz][nx] || grid[nz][nx] !== "l") continue;
          seen[nz][nx] = 1;
          queue.push([nx, nz]);
        }
      }
      lots.push(cells);
    }
  }
  return lots;
}

function bboxOf(cells) {
  let minX = COLS;
  let maxX = 0;
  let minZ = ROWS;
  let maxZ = 0;
  for (const [x, z] of cells) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, w: maxX - minX + 1, h: maxZ - minZ + 1 };
}

function centroid(cells) {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of cells) {
    sx += x;
    sz += z;
  }
  return [Math.round(sx / cells.length), Math.round(sz / cells.length)];
}

function paintCut(cells, at, vertical, width, frac, alley) {
  const set = new Set(cells.map(([x, z]) => `${x},${z}`));
  const limit = vertical ? ROWS : COLS;
  const valid = [];
  for (let v = 0; v < limit; v += 1) {
    let ok = true;
    for (let w = 0; w < width && ok; w += 1) {
      const x = vertical ? at + w : v;
      const z = vertical ? v : at + w;
      if (!inBounds(x, z) || grid[z][x] !== "l" || !set.has(`${x},${z}`)) ok = false;
    }
    if (!ok) {
      valid.push(false);
      continue;
    }
    if (vertical) {
      const left = at - 1;
      const right = at + width;
      ok = inBounds(left, v) && grid[v][left] === "l" && inBounds(right, v) && grid[v][right] === "l";
    } else {
      const up = at - 1;
      const down = at + width;
      ok = inBounds(v, up) && grid[up][v] === "l" && inBounds(v, down) && grid[down][v] === "l";
    }
    valid.push(ok);
  }
  const runs = [];
  let run = [];
  for (let v = 0; v < valid.length; v += 1) {
    if (!valid[v]) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(v);
  }
  if (run.length) runs.push(run);
  const usable = runs.filter((item) => item.length >= (frac === 1 ? 6 : 8));
  if (usable.length === 0) return;
  const chosen = frac === 1 ? usable : [usable.reduce((a, b) => (b.length > a.length ? b : a))];
  for (const item of chosen) {
    const len = Math.max(4, Math.floor(item.length * frac));
    const slice = hash(at, item[0]) % 2 === 0 ? item.slice(0, len) : item.slice(item.length - len);
    for (const v of slice) {
      for (let w = 0; w < width; w += 1) {
        const x = vertical ? at + w : v;
        const z = vertical ? v : at + w;
        let code = "n";
        if (!alley) code = vertical ? (w === 0 ? "v" : "X") : (w === 0 ? "h" : "X");
        paintCell(x, z, code, false);
      }
    }
  }
}

function paintDiagonalAcross(cells) {
  const set = new Set(cells.map(([x, z]) => `${x},${z}`));
  const edges = [];
  for (const [x, z] of cells) {
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      const nz = z + dz;
      if (inBounds(nx, nz) && ROAD.has(grid[nz][nx])) {
        edges.push([x, z]);
        break;
      }
    }
  }
  if (edges.length < 3) return;
  const start = edges[hash(edges[0][0], edges[0][1] + edges.length) % edges.length];
  let best = [];
  let bestDir = [1, 1];
  for (const dir of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const path = [];
    let x = start[0];
    let z = start[1];
    while (path.length < 70 && set.has(`${x},${z}`) && grid[z][x] === "l") {
      path.push([x, z]);
      x += dir[0];
      z += dir[1];
    }
    if (path.length > best.length) {
      best = path;
      bestDir = dir;
    }
  }
  if (best.length < 8) return;
  const slash = bestDir[0] * bestDir[1] < 0;
  const code = slash ? "a" : "e";
  const px = -bestDir[1];
  const pz = bestDir[0];
  for (const [x, z] of best) {
    paintCell(x, z, code, false);
    if (inBounds(x + px, z + pz) && grid[z + pz][x + px] === "l") paintCell(x + px, z + pz, "X", false);
  }
}

function carveLot(cells, mode) {
  const box = bboxOf(cells);
  const id = hash(box.minX, box.minZ);
  const long = Math.max(box.w, box.h);
  if (mode === "split" && long < 20) return;
  if (mode === "street" && long < 15) return;
  if (mode === "alley" && (long < 12 || cells.length < 80 || id % 3 === 0)) return;
  const vertical = mode === "street" ? id % 2 === 0 : box.w >= box.h;
  const span = vertical ? box.w : box.h;
  const min = vertical ? box.minX : box.minZ;
  const width = mode === "alley" ? 1 : 3;
  const lo = min + 5;
  const hi = min + span - 6 - width;
  if (hi <= lo) return;
  const at = lo + (id % (hi - lo));
  // The cut runs the whole block, so the street meets a road at both ends.
  paintCut(cells, at, vertical, width, 1, mode === "alley");
  if (mode === "split" && box.w >= 24 && box.h >= 24 && id % 2 === 0) {
    const span2 = vertical ? box.h : box.w;
    const min2 = vertical ? box.minZ : box.minX;
    const lo2 = min2 + 5;
    const hi2 = min2 + span2 - 8;
    if (hi2 > lo2) paintCut(cells, lo2 + ((id >>> 8) % (hi2 - lo2)), !vertical, 3, 1, false);
  }
}

function absorbSlivers() {
  for (const lot of floodLots()) {
    if (lot.length >= 12) continue;
    for (const [x, z] of lot) grid[z][x] = "s";
  }
}

function carvePasses() {
  for (let round = 0; round < 3; round += 1) {
    for (const lot of floodLots()) carveLot(lot, "split");
  }
  for (const lot of floodLots()) carveLot(lot, "street");
  for (const lot of floodLots()) carveLot(lot, "alley");
  absorbSlivers();
}

function chamferPark(cells) {
  const box = bboxOf(cells);
  for (const [x, z] of cells) {
    const corner = (x - box.minX) + (z - box.minZ) < 3
      || (box.maxX - x) + (z - box.minZ) < 3
      || (x - box.minX) + (box.maxZ - z) < 3
      || (box.maxX - x) + (box.maxZ - z) < 3;
    grid[z][x] = corner && cells.length > 80 ? "l" : "g";
  }
}

function placeParksAndPlazas() {
  const used = [];
  const remember = (cells) => {
    const [cx, cz] = centroid(cells);
    used.push([cx, cz]);
    return [cx, cz];
  };
  const far = (cx, cz) => used.every(([px, pz]) => Math.hypot(px - cx, pz - cz) >= 34);
  let parks = 0;
  for (const lot of floodLots()) {
    if (parks >= 11) break;
    if (lot.length < 60 || lot.length > 180) continue;
    const [cx, cz] = centroid(lot);
    if (!far(cx, cz) || hash(cx, cz) % 3 !== 0) continue;
    chamferPark(lot);
    remember(lot);
    parks += 1;
  }
  const remaining = floodLots();
  let civic = null;
  let civicDist = Infinity;
  for (const lot of remaining) {
    if (lot.length < 70 || lot.length > 260) continue;
    const [cx, cz] = centroid(lot);
    const dist = Math.hypot(cx - 186, cz - 78);
    if (dist < civicDist) {
      civicDist = dist;
      civic = lot;
    }
  }
  const plazas = [];
  if (civic) {
    plazas.push(civic);
    remember(civic);
  }
  for (const lot of remaining) {
    if (plazas.length >= 7) break;
    if (lot === civic) continue;
    if (lot.length < 48 || lot.length > 170) continue;
    const [cx, cz] = centroid(lot);
    if (!far(cx, cz) || hash(cx + 9, cz) % 4 !== 0) continue;
    plazas.push(lot);
    remember(lot);
  }
  for (const lot of plazas) {
    for (const [x, z] of lot) grid[z][x] = "q";
    const [cx, cz] = centroid(lot);
    if (lot === civic) {
      const mx = cx - 1;
      const mz = cz - 1;
      let open = true;
      for (let dz = 0; dz < 3 && open; dz += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          if (!inBounds(mx + dx, mz + dz) || grid[mz + dz][mx + dx] !== "q") open = false;
        }
      }
      if (open) {
        for (let dz = 0; dz < 3; dz += 1) {
          for (let dx = 0; dx < 3; dx += 1) grid[mz + dz][mx + dx] = "l";
        }
        addBuilding(mx, mz, 3, 3, 10, "tower", "#5c656c");
      }
    }
  }
}

function finishGround() {
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = grid[z][x];
      if (cell !== "l" && cell !== "g" && cell !== "q") continue;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (inBounds(nx, nz) && ROAD.has(grid[nz][nx])) {
          grid[z][x] = "s";
          break;
        }
      }
    }
  }
  for (let z = 1; z < ROWS - 1 && grid[z].includes("g"); z += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (grid[z][x] !== "g") continue;
      if (hash(x, z) % 11 !== 0) continue;
      if (grid[z][x - 1] === "g" && grid[z][x + 1] === "g") grid[z][x] = "p";
      else if (grid[z - 1][x] === "g" && grid[z + 1][x] === "g") grid[z][x] = "p";
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = grid[z][x];
      if (cell !== "s" && cell !== "l" && cell !== "q" && cell !== "g") continue;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (inBounds(nx, nz) && grid[nz][nx] === "~") {
          grid[z][x] = "c";
          break;
        }
      }
    }
  }
}

function tryPier(x, z, dx, dz, length, width) {
  const cells = [];
  const px = dz !== 0 ? 1 : 0;
  const pz = dx !== 0 ? 1 : 0;
  for (let i = 0; i < length; i += 1) {
    for (let w = 0; w < width; w += 1) {
      const xx = x + dx * i + px * (w - Math.floor(width / 2));
      const zz = z + dz * i + pz * (w - Math.floor(width / 2));
      if (!inBounds(xx, zz) || grid[zz][xx] !== "~") return;
      cells.push([xx, zz]);
    }
  }
  for (const [xx, zz] of cells) grid[zz][xx] = "d";
}

function placePiers() {
  const taken = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  for (let z = 1; z < ROWS - 1; z += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (grid[z][x] === "~" || grid[z][x] === "d") continue;
      if (x % 16 !== 0 && z % 16 !== 0) continue;
      let dir = null;
      for (const [dx, dz] of N4) {
        if (grid[z + dz][x + dx] === "~") dir = [dx, dz];
      }
      if (!dir) continue;
      let crowded = false;
      for (let dz = -14; dz <= 14 && !crowded; dz += 1) {
        for (let dx = -14; dx <= 14; dx += 1) {
          const nx = x + dx;
          const nz = z + dz;
          if (inBounds(nx, nz) && taken[nz][nx]) crowded = true;
        }
      }
      if (crowded) continue;
      tryPier(x + dir[0], z + dir[1], dir[0], dir[1], 8, 3);
      taken[z][x] = 1;
    }
  }
}

function waterDistGrid() {
  const dist = Array.from({ length: ROWS }, () => new Int16Array(COLS).fill(999));
  const queue = [];
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (grid[z][x] !== "~") continue;
      dist[z][x] = 0;
      queue.push(x, z);
    }
  }
  for (let i = 0; i < queue.length; i += 2) {
    const x = queue[i];
    const z = queue[i + 1];
    const next = dist[z][x] + 1;
    if (next > 36) continue;
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(nx, nz) || dist[nz][nx] <= next) continue;
      dist[nz][nx] = next;
      queue.push(nx, nz);
    }
  }
  return dist;
}

function canPlace(x, z, w, d) {
  if (w < 2 || d < 2) return false;
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (!inBounds(xx, zz) || grid[zz][xx] !== "l") return false;
    }
  }
  return true;
}

function mark(x, z, w, d, code) {
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) grid[zz][xx] = code;
  }
}

function heightAt(x, z, waterDist) {
  let peak = 4;
  for (const [sx, sz, mag] of SEEDS) {
    peak = Math.max(peak, mag - Math.hypot(x - sx, z - sz) / 7);
  }
  let height = Math.round(peak + (hash(x, z) % 7) - 3);
  const shore = waterDist[z][x];
  if (shore < 12) height = Math.min(height, 4 + Math.floor(shore * 0.8));
  return clamp(height, 4, 18);
}

function styleFor(h, x, z, shore) {
  if (shore <= 2 && h <= 5 && hash(x, z) % 4 === 0) return "shed";
  if (h >= 12) return hash(x, z) % 3 === 0 ? "glass" : "tower";
  if (h >= 8) return hash(x, z) % 4 === 0 ? "brick" : "tower";
  if (h >= 6) return hash(x, z) % 2 === 0 ? "brick" : "mid";
  return hash(x, z) % 3 === 0 ? "brick" : "mid";
}

function addBuilding(x, z, w, d, h, style, roof) {
  if (!canPlace(x, z, w, d)) return false;
  const roofs = ROOFS[style] ?? ROOFS.tower;
  buildings.push({
    x,
    z,
    w,
    d,
    h,
    style,
    roof: roof ?? roofs[hash(x, z) % roofs.length],
  });
  mark(x, z, w, d, "b");
  return true;
}

function placeNear(x, z, w, d, h, style, roof) {
  for (let radius = 0; radius < 16; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius !== 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        if (addBuilding(x + dx, z + dz, w, d, h, style, roof)) return true;
      }
    }
  }
  return false;
}

function rot90(parts) {
  const out = parts.map((part) => ({
    dx: part.dz,
    dz: -(part.dx + part.w),
    w: part.d,
    d: part.w,
    yard: part.yard,
  }));
  const minX = Math.min(...out.map((part) => part.dx));
  const minZ = Math.min(...out.map((part) => part.dz));
  return out.map((part) => ({ ...part, dx: part.dx - minX, dz: part.dz - minZ }));
}

function rotate(parts, turns) {
  let out = parts;
  for (let i = 0; i < turns; i += 1) out = rot90(out);
  return out;
}

function makeRect(h) {
  let w = 2 + (h % 6);
  let d = 2 + ((h >>> 4) % 6);
  if (w === d) {
    if (w < 6) w += 1 + (h % 2);
    else d = Math.max(2, d - 2);
  }
  if ((h >>> 8) % 7 === 0) w = Math.min(8, w + 2);
  if ((h >>> 9) % 7 === 0) d = Math.min(8, d + 2);
  return [{ dx: 0, dz: 0, w, d, yard: false }];
}

function makeL(h) {
  const w = 4 + (h % 4);
  const d = 2 + ((h >>> 3) % 2);
  const ww = 2 + ((h >>> 5) % 2);
  const wd = 2 + ((h >>> 7) % 3);
  const right = (h & 1) === 0;
  return [
    { dx: 0, dz: 0, w, d, yard: false },
    { dx: right ? w - ww : 0, dz: d, w: ww, d: wd, yard: false },
  ];
}

function makeU(h) {
  const s = 6 + (h % 2);
  const t = 2;
  return [
    { dx: 0, dz: 0, w: s, d: t, yard: false },
    { dx: 0, dz: t, w: t, d: s - t, yard: false },
    { dx: s - t, dz: t, w: t, d: s - t, yard: false },
    { dx: t, dz: t, w: s - 2 * t, d: Math.max(2, s - 2 * t), yard: true },
  ];
}

function makeBar(h) {
  if ((h & 1) === 0) return [{ dx: 0, dz: 0, w: 2 + (h % 2), d: 5 + (h % 4), yard: false }];
  return [{ dx: 0, dz: 0, w: 5 + (h % 4), d: 2, yard: false }];
}

function makeStep(h) {
  return [
    { dx: 0, dz: 0, w: 3, d: 3, yard: false },
    { dx: 3, dz: 0, w: 3 + (h % 2), d: 2, yard: false },
    { dx: 0, dz: 3, w: 2, d: 2 + (h % 2), yard: false },
  ];
}

function addParts(parts, x, z, baseH, waterDist) {
  const rects = parts.map((part) => ({
    x: x + part.dx,
    z: z + part.dz,
    w: part.w,
    d: part.d,
    yard: part.yard,
  }));
  for (const rect of rects) {
    if (!canPlace(rect.x, rect.z, rect.w, rect.d)) return false;
  }
  for (const rect of rects) {
    if (rect.yard) {
      mark(rect.x, rect.z, rect.w, rect.d, "q");
      continue;
    }
    const h = clamp(baseH + ((hash(rect.x, rect.z) % 5) - 2), 4, 18);
    const shore = waterDist[Math.min(ROWS - 1, rect.z)][Math.min(COLS - 1, rect.x)];
    const style = styleFor(h, rect.x, rect.z, shore);
    addBuilding(rect.x, rect.z, rect.w, rect.d, h, style);
  }
  return true;
}

function shapeFor(h) {
  const kind = h % 10;
  if (kind <= 3) return makeRect(h);
  if (kind <= 6) return makeL(h);
  if (kind === 7) return makeU(h);
  if (kind === 8) return makeBar(h);
  return makeStep(h);
}

function packBuildings(waterDist) {
  const fallbacks = [[6, 3], [3, 6], [5, 2], [2, 5], [4, 3], [3, 4], [5, 4], [7, 2], [2, 7], [4, 2], [2, 4], [3, 3], [2, 3], [3, 2], [2, 2]];
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (grid[z][x] !== "l") continue;
      if (x > 0 && grid[z][x - 1] === "l") continue;
      if (z > 0 && grid[z - 1][x] === "l") continue;
      const h = hash(x, z);
      const baseH = heightAt(x, z, waterDist);
      const parts = shapeFor(h);
      let placed = false;
      for (let turn = 0; turn < 4 && !placed; turn += 1) {
        placed = addParts(rotate(parts, (h + turn) % 4), x, z, baseH, waterDist);
      }
      if (placed) continue;
      for (const [w, d] of fallbacks) {
        if (addParts([{ dx: 0, dz: 0, w, d, yard: false }], x, z, baseH, waterDist)) {
          placed = true;
          break;
        }
      }
      if (!placed) grid[z][x] = "q";
    }
  }
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (grid[z][x] === "l") grid[z][x] = "q";
    }
  }
}

function nearest(x, z, pred) {
  for (let radius = 0; radius < 28; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius !== 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const xx = x + dx;
        const zz = z + dz;
        if (inBounds(xx, zz) && pred(grid[zz][xx])) return [xx, zz];
      }
    }
  }
  return [clamp(x, 0, COLS - 1), clamp(z, 0, ROWS - 1)];
}

function onStreet(cell) {
  return ROAD.has(cell) || cell === "s" || cell === "q" || cell === "c" || cell === "d" || cell === "p";
}

function pickViews() {
  let tallest = buildings[0];
  for (const building of buildings) {
    if (building.h > tallest.h || (building.h === tallest.h && building.w * building.d > tallest.w * tallest.d)) {
      tallest = building;
    }
  }
  const sky = nearest(tallest.x + Math.floor(tallest.w / 2), tallest.z + tallest.d, ROAD.has.bind(ROAD));
  let slant = null;
  let slantScore = -1;
  let alley = null;
  let alleyScore = -1;
  let harbor = null;
  let harborScore = -1;
  const diagonal = new Set(["A", "E", "a", "e"]);
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = grid[z][x];
      const inland = x > 48 && z > 48 && x < COLS - 48 && z < ROWS - 48;
      if (diagonal.has(cell) && inland) {
        const dist = Math.hypot(x - sky[0], z - sky[1]);
        let neighbors = 0;
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (inBounds(nx, nz) && diagonal.has(grid[nz][nx])) neighbors += 1;
        }
        if (neighbors >= 2 && dist > 48) {
          const score = neighbors * 40 - Math.abs(dist - 90);
          if (score > slantScore) {
            slantScore = score;
            slant = [x, z];
          }
        }
      }
      if (cell === "n" && inland) {
        let beside = false;
        for (const [dx, dz] of N4) {
          if (grid[z + dz][x + dx] === "n") beside = true;
        }
        if (beside) {
          const score = Math.hypot(x - sky[0], z - sky[1]);
          if (score > alleyScore) {
            alleyScore = score;
            alley = [x, z];
          }
        }
      }
      if ((cell === "d" || cell === "c") && z > 190 && z < 236 && x > 70 && x < 210) {
        let shore = 0;
        for (let dz = 1; dz <= 12; dz += 1) {
          if (z - dz < 0) break;
          if (grid[z - dz][x] !== "~") shore += 1;
        }
        let basin = 0;
        for (let dz = 1; dz <= 8; dz += 1) {
          if (z + dz >= ROWS) break;
          const below = grid[z + dz][x];
          if (below === "~" || below === "d") basin += 1;
        }
        if (basin < 4) continue;
        const score = shore + basin * 2;
        if (score > harborScore) {
          harborScore = score;
          harbor = [x, z];
        }
      }
    }
  }
  let plaza = null;
  let plazaSize = 0;
  const seen = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (seen[z][x] || grid[z][x] !== "q") continue;
      const queue = [[x, z]];
      seen[z][x] = 1;
      const cells = [];
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cz] = queue[i];
        cells.push([cx, cz]);
        for (const [dx, dz] of N4) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inBounds(nx, nz) || seen[nz][nx] || grid[nz][nx] !== "q") continue;
          seen[nz][nx] = 1;
          queue.push([nx, nz]);
        }
      }
      if (cells.length > plazaSize) {
        plazaSize = cells.length;
        plaza = centroid(cells);
      }
    }
  }
  let apartments = buildings[0];
  let apartmentScore = Infinity;
  for (const building of buildings) {
    if (building.h < 5 || building.h > 8) continue;
    if (building.style !== "mid" && building.style !== "brick") continue;
    const score = Math.hypot(building.x - 70, building.z - 168) + building.h;
    if (score < apartmentScore) {
      apartmentScore = score;
      apartments = building;
    }
  }
  const named = [
    ["Skyline", sky],
    ["Slant street", slant ?? nearest(120, 120, (cell) => cell === "A" || cell === "E" || cell === "H" || cell === "V")],
    ["Civic plaza", plaza ? nearest(plaza[0], plaza[1], (cell) => cell === "q" || cell === "s") : nearest(124, 104, onStreet)],
    ["Harbor", harbor ? nearest(harbor[0], harbor[1], (cell) => cell === "d" || cell === "c") : nearest(168, 220, onStreet)],
    ["Apartments", nearest(apartments.x, apartments.z + apartments.d, onStreet)],
    ["Alleys", alley ? nearest(alley[0], alley[1], (cell) => cell === "n" || cell === "s") : nearest(80, 150, onStreet)],
  ];
  return named.map(([name, point]) => ({ name, x: point[0], z: point[1] }));
}

const RING_INSET = 16;
const RING_BRIDGE = 28;
const H_LANE = ["1", "+", "4", "+", "2"];
const V_LANE = ["5", "+", "8", "+", "6"];

function landward(x, z, dx, dz) {
  for (let i = 0; i <= 100; i += 1) {
    const xx = x + dx * i;
    const zz = z + dz * i;
    if (!inBounds(xx, zz)) return null;
    if (grid[zz][xx] !== "~") return [xx, zz];
  }
  return null;
}

function paintRingCell(x, z, code, bridge) {
  if (!inBounds(x, z)) return;
  const cur = grid[z][x];
  if (cur === "d") return;
  if (cur === "~" && !bridge) return;
  if (ROAD.has(cur)) {
    if (cur !== code) grid[z][x] = "+";
    return;
  }
  grid[z][x] = code;
}

function stampRing(x, z, horizontal, bridge) {
  const codes = horizontal ? H_LANE : V_LANE;
  for (let i = 0; i < 5; i += 1) {
    const xx = horizontal ? x : x - 2 + i;
    const zz = horizontal ? z - 2 + i : z;
    paintRingCell(xx, zz, codes[i], bridge);
  }
}

function paintSegment(x0, z0, x1, z1, bridge) {
  const dx = Math.sign(x1 - x0);
  const dz = Math.sign(z1 - z0);
  let x = x0;
  let z = z0;
  while (true) {
    stampRing(x, z, dz === 0, bridge);
    if (x === x1 && z === z1) break;
    x += dx;
    z += dz;
  }
}

function ringSide(axis, fixed, from, to, inlandDx, inlandDz) {
  const step = to >= from ? 1 : -1;
  const sign = inlandDx + inlandDz;
  const points = [];
  for (let t = from; step > 0 ? t <= to : t >= to; t += step) {
    const x = axis === "h" ? t : fixed;
    const z = axis === "h" ? fixed : t;
    points.push({ x, z, water: inBounds(x, z) && grid[z][x] === "~", pulled: false, bridge: false });
  }
  let i = 0;
  while (i < points.length) {
    if (!points[i].water) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < points.length && points[j].water) j += 1;
    const bounded = i > 0 && j < points.length;
    if (bounded && j - i <= RING_BRIDGE) {
      for (let k = i; k < j; k += 1) points[k].bridge = true;
    } else {
      for (let k = i; k < j; k += 1) {
        const hit = landward(points[k].x, points[k].z, inlandDx, inlandDz);
        if (!hit) continue;
        points[k].x = hit[0] + inlandDx * 3;
        points[k].z = hit[1] + inlandDz * 3;
        points[k].water = false;
        points[k].pulled = true;
      }
    }
    i = j;
  }
  const cross = points.map((point) => (axis === "h" ? point.z : point.x));
  for (let k = 0; k < points.length; k += 1) {
    if (!points[k].pulled) continue;
    let value = cross[k];
    const a = Math.max(0, k - 7);
    const b = Math.min(points.length, k + 8);
    for (let t = a; t < b; t += 1) {
      if (!points[t].pulled) continue;
      value = sign > 0 ? Math.max(value, cross[t]) : Math.min(value, cross[t]);
    }
    if (axis === "h") points[k].z = value;
    else points[k].x = value;
  }
  return points;
}

function paintRing() {
  const left = RING_INSET;
  const right = COLS - 1 - RING_INSET;
  const bottom = ROWS - 1 - RING_INSET;
  const sides = [
    ringSide("h", left, left, right, 0, 1),
    ringSide("v", right, left + 1, bottom, -1, 0),
    ringSide("h", bottom, right - 1, left, 0, -1),
    ringSide("v", left, bottom - 1, left + 1, 1, 0),
  ];
  const points = sides.flat();
  if (points.length === 0) return;
  points.push(points[0]);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const bridge = a.bridge && b.bridge;
    if (a.x !== b.x) paintSegment(a.x, a.z, b.x, a.z, bridge);
    if (a.z !== b.z) paintSegment(b.x, a.z, b.x, b.z, bridge);
  }
}

function roadLabels() {
  const id = Array.from({ length: ROWS }, () => new Int32Array(COLS));
  const size = [0];
  let count = 0;
  for (let z = 0; z < ROWS; z += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (id[z][x] || !ROAD.has(grid[z][x])) continue;
      count += 1;
      const queue = [[x, z]];
      id[z][x] = count;
      let n = 0;
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cz] = queue[i];
        n += 1;
        for (const [dx, dz] of N4) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inBounds(nx, nz) || id[nz][nx] || !ROAD.has(grid[nz][nx])) continue;
          id[nz][nx] = count;
          queue.push([nx, nz]);
        }
      }
      size[count] = n;
    }
  }
  let largest = 1;
  for (let i = 1; i < size.length; i += 1) if (size[i] > size[largest]) largest = i;
  return { id, count, largest, size };
}

function connectLooseRoads() {
  for (let pass = 0; pass < 400; pass += 1) {
    const labels = roadLabels();
    if (labels.count <= 1) return;
    const dist = Array.from({ length: ROWS }, () => new Int16Array(COLS).fill(-1));
    const prev = Array.from({ length: ROWS }, () => new Int16Array(COLS * 2).fill(-1));
    const queue = [];
    for (let z = 0; z < ROWS; z += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (labels.id[z][x] !== labels.largest) continue;
        dist[z][x] = 0;
        queue.push(x, z);
      }
    }
    let hit = null;
    for (let i = 0; i < queue.length && !hit; i += 2) {
      const x = queue[i];
      const z = queue[i + 1];
      if (dist[z][x] > 30) continue;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz) || dist[nz][nx] !== -1) continue;
        const there = labels.id[nz][nx];
        if (there && there !== labels.largest) {
          hit = [nx, nz, x, z];
          break;
        }
        if (there || grid[nz][nx] === "d" || grid[nz][nx] === "~") continue;
        dist[nz][nx] = dist[z][x] + 1;
        prev[nz][nx * 2] = x;
        prev[nz][nx * 2 + 1] = z;
        queue.push(nx, nz);
      }
    }
    if (!hit) {
      const labelsNow = labels;
      for (let z = 0; z < ROWS; z += 1) {
        for (let x = 0; x < COLS; x += 1) {
          const id = labelsNow.id[z][x];
          if (!id || id === labelsNow.largest || labelsNow.size[id] > 8) continue;
          grid[z][x] = "l";
        }
      }
      return;
    }
    let x = hit[2];
    let z = hit[3];
    while (dist[z][x] > 0) {
      for (const [dx, dz] of [[0, 0], ...N4]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz) || ROAD.has(grid[nz][nx]) || grid[nz][nx] === "d" || grid[nz][nx] === "~") continue;
        paintCell(nx, nz, "+", false);
      }
      const px = prev[z][x * 2];
      const pz = prev[z][x * 2 + 1];
      x = px;
      z = pz;
    }
  }
}

paintLand();
paintAvenues();
paintDiagonals();
waterfrontRoad();
connectIsland();
harborBridge();
paintRing();
carvePasses();
connectLooseRoads();
placeParksAndPlazas();
finishGround();
placePiers();
const waterDist = waterDistGrid();
for (const [x, z, w, d, h, style, roof] of LANDMARKS) placeNear(x, z, w, d, h, style, roof);
packBuildings(waterDist);

const views = pickViews();
const spawn = { x: views[0].x, z: views[0].z };
buildings.sort((a, b) => a.z - b.z || a.x - b.x || a.h - b.h);

const counts = {};
for (const row of grid) {
  for (const cell of row) counts[cell] = (counts[cell] ?? 0) + 1;
}
const byStyle = {};
const heights = {};
const footprints = new Set();
for (const building of buildings) {
  byStyle[building.style] = (byStyle[building.style] ?? 0) + 1;
  heights[building.h] = (heights[building.h] ?? 0) + 1;
  footprints.add(`${building.w}x${building.d}`);
}

const body = {
  cols: COLS,
  rows: ROWS,
  tile: 48,
  spawn,
  views,
  ground: grid.map((row) => row.join("")),
  buildings,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "city.json");
const groundLines = body.ground.map((row) => `    "${row}"`).join(",\n");
const buildingLines = body.buildings.map((building) => `    ${JSON.stringify(building)}`).join(",\n");
const viewText = JSON.stringify(body.views, null, 2).replace(/\n/g, "\n  ");
writeFileSync(out, `{
  "cols": ${body.cols},
  "rows": ${body.rows},
  "tile": ${body.tile},
  "spawn": ${JSON.stringify(body.spawn)},
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
console.log("tiles", counts);
console.log("buildings", buildings.length, byStyle);
console.log("heights", heights);
console.log("footprints", footprints.size, [...footprints].sort().join(" "));
console.log("views", views);
