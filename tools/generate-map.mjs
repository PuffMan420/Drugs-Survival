// Builds data/city.json: one fixed city, same every time.
// The districts, river, and coast are written out below so they can be edited.
// This is an original plan with a GTA 2 kind of feel (street grid, coast, docks,
// parks, tall center, houses, warehouses). It is not a trace of Rockstar's map.
//
//   node tools/generate-map.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 200;
const ROWS = 200;

const MAINS_X = [22, 62, 102, 142, 174];
const MAINS_Z = [22, 62, 102, 142, 174];
const MAIN_W = 4;

const ROAD = new Set(["H", "V", "+", "h", "v", "X"]);
const WALK = new Set(["H", "V", "+", "h", "v", "X", "s", "g", "p", "l", "c", "d", "b"]);

const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("~"));

function inBounds(x, z) {
  return x >= 0 && z >= 0 && x < COLS && z < ROWS;
}

function fill(x0, z0, x1, z1, ch, allow = null) {
  for (let z = z0; z < z1; z += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!inBounds(x, z)) continue;
      if (allow && !allow.has(grid[z][x])) continue;
      grid[z][x] = ch;
    }
  }
}

function hash(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

function paintRoad(x0, z0, x1, z1, major, horizontal, force) {
  for (let z = z0; z < z1; z += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!inBounds(x, z)) continue;
      const cur = grid[z][x];
      if (!force && cur === "~") continue;
      if (cur === "d") continue;
      const next = major ? (horizontal ? "H" : "V") : (horizontal ? "h" : "v");
      if (!ROAD.has(cur)) {
        grid[z][x] = next;
        continue;
      }
      if (cur === next || cur === "+" || cur === "X") continue;
      const curMajor = cur === "H" || cur === "V" || cur === "+";
      grid[z][x] = major || curMajor ? "+" : "X";
    }
  }
}

function localStarts(mains) {
  const starts = [];
  for (let i = 0; i < mains.length - 1; i += 1) {
    const gapStart = mains[i] + MAIN_W;
    const gapEnd = mains[i + 1];
    for (let p = gapStart + 8; p + 2 <= gapEnd - 4; p += 12) starts.push(p);
  }
  return starts;
}

// Land, then an original coastline: north-west cove, south-west lagoon, east inlet.
fill(6, 4, 194, 188, "l");
fill(6, 4, 20, 18, "~");
fill(6, 164, 36, 200, "~");
fill(182, 96, 200, 130, "~");

// River from the north edge, a bend, then a south channel into a harbor.
fill(78, 0, 86, 74, "~");
fill(78, 68, 124, 76, "~");
fill(116, 68, 124, 158, "~");
fill(68, 154, 140, 170, "~");
fill(98, 170, 116, 200, "~");

// Arterial roads. Bridges are the only roads allowed to cross water.
for (const x of MAINS_X) {
  paintRoad(x, 0, x + MAIN_W, ROWS, true, false, false);
}
for (const z of MAINS_Z) {
  paintRoad(0, z, COLS, z + MAIN_W, true, true, false);
}
const bridges = [
  [78, 22, 86, 26],
  [78, 62, 86, 66],
  [102, 68, 106, 76],
  [116, 102, 124, 106],
  [116, 142, 124, 146],
  [102, 154, 106, 170],
  [98, 174, 116, 178],
  [182, 102, 200, 106],
  [6, 174, 36, 178],
];
for (const [x0, z0, x1, z1] of bridges) {
  const horizontal = x1 - x0 > z1 - z0;
  paintRoad(x0, z0, x1, z1, true, horizontal, true);
}

for (const x of localStarts(MAINS_X)) {
  paintRoad(x, 0, x + 2, ROWS, false, false, false);
}
for (const z of localStarts(MAINS_Z)) {
  paintRoad(0, z, COLS, z + 2, false, true, false);
}

// Parks sit between arterials and wipe the local streets inside them.
const parks = [
  [30, 108, 58, 140],
  [32, 36, 48, 50],
  [156, 38, 172, 52],
  [122, 42, 136, 54],
];
for (const [x0, z0, x1, z1] of parks) {
  fill(x0, z0, x1, z1, "g", new Set(["l", "h", "v", "X", "s"]));
}
function path(x0, z0, x1, z1) {
  fill(x0, z0, x1, z1, "p", new Set(["g"]));
}
path(30, 122, 58, 126);
path(42, 108, 46, 140);
path(32, 42, 48, 44);
path(156, 44, 172, 46);
path(122, 46, 136, 50);
path(128, 42, 130, 54);
// Small pool in the downtown green.
fill(126, 46, 132, 50, "~", new Set(["p", "g"]));

for (let z = 0; z < ROWS; z += 1) {
  for (let x = 0; x < COLS; x += 1) {
    const cell = grid[z][x];
    if (cell !== "l" && cell !== "g") continue;
    let besideRoad = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (inBounds(nx, nz) && ROAD.has(grid[nz][nx])) besideRoad = true;
    }
    if (besideRoad) grid[z][x] = "s";
  }
}

for (let z = 0; z < ROWS; z += 1) {
  for (let x = 0; x < COLS; x += 1) {
    const cell = grid[z][x];
    if (cell !== "s" && cell !== "l") continue;
    if (z < 146 && x >= 28 && x < 180) continue;
    let shore = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (inBounds(nx, nz) && grid[nz][nx] === "~") shore = true;
    }
    if (shore) grid[z][x] = "c";
  }
}

function tryPier(x, z, dx, dz, length, width) {
  const cells = [];
  const px = dz !== 0 ? 1 : 0;
  const pz = dx !== 0 ? 1 : 0;
  for (let i = 0; i < length; i += 1) {
    for (let w = 0; w < width; w += 1) {
      const xx = x + dx * i + px * (w - 1);
      const zz = z + dz * i + pz * (w - 1);
      if (!inBounds(xx, zz) || grid[zz][xx] !== "~") return;
      cells.push([xx, zz]);
    }
  }
  for (const [xx, zz] of cells) grid[zz][xx] = "d";
}

for (let x = 12; x < COLS - 4; x += 18) {
  for (let z = 0; z < ROWS - 1; z += 1) {
    if (WALK.has(grid[z][x]) && grid[z + 1][x] === "~") {
      tryPier(x, z + 1, 0, 1, 9, 3);
      break;
    }
  }
  for (let z = ROWS - 1; z > 0; z -= 1) {
    if (WALK.has(grid[z][x]) && grid[z - 1][x] === "~") {
      tryPier(x, z - 1, 0, -1, 9, 3);
      break;
    }
  }
}
for (let z = 12; z < ROWS - 4; z += 18) {
  for (let x = 0; x < COLS - 1; x += 1) {
    if (WALK.has(grid[z][x]) && grid[z][x + 1] === "~") {
      tryPier(x + 1, z, 1, 0, 9, 3);
      break;
    }
  }
  for (let x = COLS - 1; x > 0; x -= 1) {
    if (WALK.has(grid[z][x]) && grid[z][x - 1] === "~") {
      tryPier(x - 1, z, -1, 0, 9, 3);
      break;
    }
  }
}

const ROOFS = {
  tower: ["#6e6256", "#5d666e", "#7a6a52", "#4c5550"],
  mid: ["#6a5a48", "#596168", "#6e6858"],
  house: ["#8d4e3c", "#6e5438", "#8a7a58", "#4e5c48", "#7a4038"],
  shed: ["#4a4e50", "#6a4030", "#3e4450", "#5a5348"],
};

const buildings = [];

function canPlace(x, z, w, d) {
  if (w < 1 || d < 1) return false;
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (!inBounds(xx, zz) || grid[zz][xx] !== "l") return false;
    }
  }
  return true;
}

function markBuilding(x, z, w, d) {
  for (let zz = z; zz < z + d; zz += 1) {
    for (let xx = x; xx < x + w; xx += 1) grid[zz][xx] = "b";
  }
}

function addBuilding(x, z, w, d, h, style, roof) {
  if (!canPlace(x, z, w, d)) return false;
  buildings.push({ x, z, w, d, h, style, roof });
  markBuilding(x, z, w, d);
  return true;
}

function placeArea(x0, z0, x1, z1, style) {
  for (let z = z0; z < z1; z += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!inBounds(x, z) || grid[z][x] !== "l") continue;
      const roll = hash(x, z);
      let w;
      let d;
      let height;
      if (style === "tower") {
        if (roll % 6 === 0) continue;
        w = 2 + (roll % 4);
        d = 2 + ((roll >>> 4) % 3);
        height = 6 + ((roll >>> 8) % 8);
      } else if (style === "mid") {
        if (roll % 4 === 0) continue;
        w = 2 + (roll % 3);
        d = 2 + ((roll >>> 4) % 3);
        height = 3 + ((roll >>> 8) % 4);
      } else if (style === "house") {
        if (roll % 4 !== 0) continue;
        w = 1 + (roll % 2);
        d = 1 + ((roll >>> 3) % 2);
        height = 1 + ((roll >>> 6) % 2);
      } else {
        if (roll % 3 !== 0) continue;
        w = 4 + (roll % 4);
        d = 3 + ((roll >>> 4) % 3);
        height = 1 + ((roll >>> 8) % 3);
      }
      while ((w > 1 || d > 1) && !canPlace(x, z, w, d)) {
        if (w >= d && w > 1) w -= 1;
        else if (d > 1) d -= 1;
        else break;
      }
      if (style === "tower" && (w < 2 || d < 2)) continue;
      if (style === "shed" && (w < 3 || d < 2)) continue;
      if (!canPlace(x, z, w, d)) continue;
      const roofs = ROOFS[style];
      addBuilding(x, z, w, d, height, style, roofs[roll % roofs.length]);
    }
  }
}

// A few fixed towers so downtown has a skyline.
addBuilding(108, 36, 4, 4, 16, "tower", "#5c656c");
addBuilding(128, 34, 3, 4, 15, "tower", "#6e6256");
addBuilding(96, 72, 4, 3, 14, "tower", "#7a6a52");

placeArea(88, 20, 156, 100, "tower");
placeArea(90, 108, 150, 146, "mid");
placeArea(16, 20, 86, 148, "house");
placeArea(150, 20, 182, 148, "house");
placeArea(16, 146, 184, 176, "shed");

function nearestWalk(x, z) {
  if (inBounds(x, z) && WALK.has(grid[z][x]) && grid[z][x] !== "b") return [x, z];
  for (let radius = 1; radius < 12; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = x + dx;
        const zz = z + dz;
        if (inBounds(xx, zz) && ROAD.has(grid[zz][xx])) return [xx, zz];
      }
    }
  }
  return [x, z];
}

const views = [
  ["Downtown", 104, 40],
  ["West houses", 44, 78],
  ["East houses", 162, 70],
  ["Warehouses", 52, 158],
  ["Central park", 44, 124],
  ["Harbor", 104, 166],
].map(([name, x, z]) => {
  const [sx, sz] = nearestWalk(x, z);
  return { name, x: sx, z: sz };
});

const spawn = { x: views[0].x, z: views[0].z };
buildings.sort((a, b) => a.z - b.z || a.x - b.x || a.style.localeCompare(b.style));

const counts = {};
for (const row of grid) {
  for (const cell of row) counts[cell] = (counts[cell] ?? 0) + 1;
}
const byStyle = {};
for (const building of buildings) byStyle[building.style] = (byStyle[building.style] ?? 0) + 1;

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
console.log("spawn", spawn);
