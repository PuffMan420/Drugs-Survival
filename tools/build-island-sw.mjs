// Southwest quarter of city-grid-roads.svg: modules x 0–63, y 35–69.
// White streets and the 4-lane carriageways are placed from the connection
// table. A white street stops at a 4-lane instead of joining it. Roads that
// leave the quarter stay open. Those two cases are the only allowed errors.
//   node tools/build-island-sw.mjs [path/to/city-grid-roads.svg]

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STOP_TURN, checkRoads, placePiece } from "../js/road-sockets.js";

const SVG_PATH = process.argv[2] || "/tmp/island-v2/island-map-inputs/city-grid-roads.svg";
const X0 = 0;
const X1 = 63;
const Y0 = 35;
const Y1 = 69;
const COLS = 4 * (X1 + 1);
const ROWS = 4 * (Y1 + 1);

const LINES = [
  { axis: "h", fixed: 64, a: 13, b: 118, side: -1, primary: "E" },
  { axis: "v", fixed: 13, a: 8, b: 64, side: 1, primary: "N" },
  { axis: "v", fixed: 60, a: 12, b: 64, side: 1, primary: "N" },
];

const STEP = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
const OPP = { E: "W", W: "E", N: "S", S: "N" };
const STRAIGHT_TURN = { E: 0, W: 2, N: 1, S: 3 };
const BEND_TURN = { SW: 0, ES: 1, NE: 2, NW: 3 };
const TEE_TURN = { ESW: 0, NES: 1, NEW: 2, NSW: 3 };

const key = (x, y) => `${x},${y}`;

function parsePoints(text) {
  return text.trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
}

function pathPoints(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function shapes(svg, color) {
  const out = [];
  const re = /<(polygon|path)\b[^>]*>/g;
  let match = re.exec(svg);
  while (match) {
    const tag = match[0];
    if (tag.includes(`fill="${color}"`)) {
      const points = /points="([^"]*)"/.exec(tag);
      if (points) out.push(parsePoints(points[1]));
      const d = /\sd="([^"]*)"/.exec(tag);
      if (d) out.push(pathPoints(d[1]));
    }
    match = re.exec(svg);
  }
  return out.filter((poly) => poly.length > 2);
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const denom = yj - yi;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (denom || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function bbox(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function paintGround(svg) {
  const layers = [
    [shapes(svg, "#e6d3a3"), "p"],
    [shapes(svg, "#ece5db"), "l"],
    [shapes(svg, "#a9d9fe"), "~"],
  ].map(([polys, glyph]) => ({ polys: polys.map((poly) => ({ poly, box: bbox(poly) })), glyph }));
  const ground = Array.from({ length: ROWS }, () => Array(COLS).fill("~"));
  for (let r = 0; r < ROWS; r += 1) {
    const sy = (r - 2) * 4;
    for (let c = 0; c < COLS; c += 1) {
      const sx = (c - 2) * 4;
      let glyph = "~";
      for (const layer of layers) {
        for (const shape of layer.polys) {
          const box = shape.box;
          if (sx < box.minX || sx > box.maxX || sy < box.minY || sy > box.maxY) continue;
          if (pointInPoly(sx, sy, shape.poly)) glyph = layer.glyph;
        }
      }
      ground[r][c] = glyph;
    }
  }
  return ground;
}

function landAt(ground, gx, gy) {
  const glyph = ground[4 * gy + 2]?.[4 * gx + 2];
  return glyph === "l" || glyph === "g";
}

function inQuarter(x, y) {
  return x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
}

function whiteCells(svg) {
  const cells = new Set();
  const re = /<polyline points="([^"]*)"[^>]*stroke="#ffffff"/g;
  let match = re.exec(svg);
  while (match) {
    const pts = parsePoints(match[1]).map(([x, y]) => [Math.round(x / 16), Math.round(y / 16)]);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s += 1) {
        const x = n ? x0 + Math.round(((x1 - x0) * s) / n) : x0;
        const y = n ? y0 + Math.round(((y1 - y0) * s) / n) : y0;
        if (inQuarter(x, y)) cells.add(key(x, y));
      }
    }
    match = re.exec(svg);
  }
  return cells;
}

// id -> { dirs: string[], lines: number }. lines > 1 is a 4-lane crossing, left empty.
export function yellowCells() {
  const cells = new Map();
  LINES.forEach((line, index) => {
    const altDir = OPP[line.primary];
    const mark = (x, y, dir) => {
      if (!inQuarter(x, y)) return;
      const id = key(x, y);
      let cell = cells.get(id);
      if (!cell) {
        cell = { dirs: [], lines: new Set() };
        cells.set(id, cell);
      }
      cell.lines.add(index);
      if (!cell.dirs.includes(dir)) cell.dirs.push(dir);
    };
    if (line.axis === "h") {
      for (let x = line.a; x <= line.b; x += 1) {
        mark(x, line.fixed, line.primary);
        mark(x, line.fixed + line.side, altDir);
      }
    } else {
      for (let y = line.a; y <= line.b; y += 1) {
        mark(line.fixed, y, line.primary);
        mark(line.fixed + line.side, y, altDir);
      }
    }
  });
  return cells;
}

function neighbors(cells, x, y) {
  const dirs = [];
  for (const dir of ["N", "E", "S", "W"]) {
    const [dx, dy] = STEP[dir];
    if (cells.has(key(x + dx, y + dy))) dirs.push(dir);
  }
  return dirs;
}

function whiteSpec(dirs, x, y, junctionAt) {
  const mask = ["N", "E", "S", "W"].filter((dir) => dirs.includes(dir)).join("");
  if (mask === "NESW") return { file: "road-crossroad-3.glb", turn: 0 };
  if (mask.length === 3) return { file: "road-intersection-3.glb", turn: TEE_TURN[mask] };
  if (mask.length === 2 && BEND_TURN[mask] != null) return { file: "road-bend-3.glb", turn: BEND_TURN[mask] };
  const axis = dirs.some((dir) => dir === "N" || dir === "S") ? "NS" : "EW";
  let turn = axis === "NS" ? 1 : 0;
  let file = "road-straight-7.glb";
  if ((x + y) % 4 === 1) {
    const facing = dirs.find((dir) => junctionAt.has(key(x + STEP[dir][0], y + STEP[dir][1])));
    if (facing) {
      file = "road-straight-stop.glb";
      turn = STOP_TURN[facing];
    }
  }
  return { file, turn };
}

export function unexpectedErrors(pieces, yellow) {
  return checkRoads(pieces).filter((error) => !allowed(error, yellow));
}

function allowed(error, yellow) {
  const step = STEP[error.side];
  if (!step) return false;
  const nx = error.gx + step[0];
  const nz = error.gz + step[1];
  const outside = nx < X0 || nx > X1 || nz < Y0 || nz > Y1;
  const thereYellow = yellow.has(key(nx, nz));
  const hereYellow = yellow.has(key(error.gx, error.gz));
  if (error.kind === "open") return outside || thereYellow;
  if (error.kind === "mismatch") return hereYellow !== thereYellow;
  return false;
}

function buildPieces(svg, ground) {
  const yellow = yellowCells();
  const drawn = whiteCells(svg);
  const streets = new Set();
  let coastSkipped = 0;
  for (const id of drawn) {
    if (yellow.has(id)) continue;
    const [x, y] = id.split(",").map(Number);
    if (!landAt(ground, x, y)) {
      coastSkipped += 1;
      continue;
    }
    streets.add(id);
  }
  const junctionAt = new Set();
  for (const id of streets) {
    const [x, y] = id.split(",").map(Number);
    if (neighbors(streets, x, y).length >= 3) junctionAt.add(id);
  }
  const pieces = [];
  for (const id of streets) {
    const [x, y] = id.split(",").map(Number);
    const spec = whiteSpec(neighbors(streets, x, y), x, y, junctionAt);
    pieces.push(placePiece(spec.file, x, y, spec.turn));
  }
  let crossings = 0;
  for (const [id, cell] of yellow) {
    if (cell.lines.size > 1) {
      crossings += 1;
      continue;
    }
    const [x, y] = id.split(",").map(Number);
    if (!landAt(ground, x, y)) {
      coastSkipped += 1;
      continue;
    }
    const dir = cell.dirs[0];
    pieces.push(placePiece("road-straight-7.glb", x, y, STRAIGHT_TURN[dir], { oneWay: true }));
  }
  return { pieces, yellow, coastSkipped, crossings, streets: streets.size };
}

function main() {
  const svg = readFileSync(SVG_PATH, "utf8");
  const ground = paintGround(svg);
  const built = buildPieces(svg, ground);
  const errors = checkRoads(built.pieces);
  const unexpected = errors.filter((error) => !allowed(error, built.yellow));
  const opens = errors.filter((error) => error.kind === "open").length;
  const mismatches = errors.filter((error) => error.kind === "mismatch").length;
  console.log(JSON.stringify({
    pieces: built.pieces.length,
    streets: built.streets,
    crossingsLeftOpen: built.crossings,
    coastSkipped: built.coastSkipped,
    allowedOpen: opens,
    allowedMismatch: mismatches,
    unexpected: unexpected.length,
  }, null, 2));
  if (unexpected.length) {
    console.log(unexpected.slice(0, 40).map((error) => `${error.kind} ${error.file} ${error.gx},${error.gz} ${error.side || ""}`).join("\n"));
    process.exit(1);
  }
  const map = {
    cols: COLS,
    rows: ROWS,
    tile: 48,
    islandSw: true,
    spawn: { x: 4 * 24 + 2, z: 4 * 50 + 2 },
    views: [
      { name: "Crossing", x: 4 * 24 + 2, z: 4 * 50 + 2 },
      { name: "4-lane", x: 4 * 32 + 2, z: 4 * 63 + 4 },
      { name: "South coast", x: 4 * 40 + 2, z: 4 * 66 + 2 },
    ],
    buildings: [],
    ground: ground.map((row) => row.join("")),
  };
  writeFileSync(new URL("../island-sw-map.json", import.meta.url), `${JSON.stringify({ pieces: built.pieces, removedRoads: [] }, null, 2)}\n`);
  writeFileSync(new URL("../data/island-sw.json", import.meta.url), JSON.stringify(map));
  console.log(`wrote island-sw, cols ${COLS}, rows ${ROWS}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
