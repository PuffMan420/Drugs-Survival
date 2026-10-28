// Full island from city-grid-roads.svg, placed from the connection table.
// White streets and 4-lane carriageways use the original pieces, turned and
// moved only. White-to-yellow joins, Y-splits and 4-lane crossings stay open.
// A canal with land on both sides gets bridge-water plus the slant ramps.
// Wet roads that run into the sea are left clear.
//   node tools/build-island-map.mjs path/to/city-grid-roads.svg
// The SVG is not in this repo. The path is required.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STOP_TURN, checkRoads, pieceCells, placePiece } from "../js/road-sockets.js";

const U = 16;
const GX = 126;
const GY = 70;
const COLS = 504;
const ROWS = 280;

const LINES = [
  { axis: "h", fixed: 12, a: 20, b: 118, side: -1, primary: "E" },
  { axis: "h", fixed: 32, a: 13, b: 118, side: 1, primary: "W" },
  { axis: "h", fixed: 64, a: 13, b: 118, side: -1, primary: "E" },
  { axis: "v", fixed: 13, a: 8, b: 64, side: 1, primary: "N" },
  { axis: "v", fixed: 118, a: 12, b: 64, side: -1, primary: "S" },
  { axis: "v", fixed: 60, a: 12, b: 64, side: 1, primary: "N" },
  { axis: "v", fixed: 98, a: 32, b: 64, side: -1, primary: "S" },
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
      if (sx > 1280 && sx < 1472 && sy > 192 && sy < 512 && glyph === "l") glyph = "g";
      ground[r][c] = glyph;
    }
  }
  return ground;
}

function glyphAt(ground, gx, gy) {
  return ground[4 * gy + 2]?.[4 * gx + 2] || "~";
}

function land(glyph) {
  return glyph === "l" || glyph === "g";
}

export function yellowCells() {
  const cells = new Map();
  LINES.forEach((line, index) => {
    const altDir = OPP[line.primary];
    const mark = (x, y, dir) => {
      if (x < 0 || y < 0 || x >= GX || y >= GY) return;
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

function whiteCells(svg) {
  const cells = new Set();
  const re = /<polyline points="([^"]*)"[^>]*stroke="#ffffff"/g;
  let match = re.exec(svg);
  while (match) {
    const pts = parsePoints(match[1]).map(([x, y]) => [Math.round(x / U), Math.round(y / U)]);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s += 1) {
        const x = n ? x0 + Math.round(((x1 - x0) * s) / n) : x0;
        const y = n ? y0 + Math.round(((y1 - y0) * s) / n) : y0;
        if (x >= 0 && y >= 0 && x < GX && y < GY) cells.add(key(x, y));
      }
    }
    match = re.exec(svg);
  }
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

function wayOf(dir, authored) {
  if (!dir) return false;
  return dir === authored ? true : "back";
}

// bridge-water turn 0 runs north to south. Turn 3 runs east to west.
function placeDeck(pieces, axis, x, y, dir) {
  if (axis === "v") {
    pieces.push(placePiece("bridge-water.glb", x, y, 0, { oneWay: wayOf(dir, "S") }));
    return;
  }
  pieces.push(placePiece("bridge-water.glb", x, y, 3, { oneWay: wayOf(dir, "W") }));
}

function placeRamp(pieces, axis, end, x, y, dir) {
  if (axis === "v") {
    const climb = end === "south" ? "N" : "S";
    const turn = end === "north" ? 3 : 1;
    pieces.push(placePiece("road-slant-high-4.glb", x, y, turn, { oneWay: wayOf(dir, climb) }));
    return;
  }
  const climb = end === "west" ? "E" : "W";
  const turn = end === "west" ? 0 : 2;
  pieces.push(placePiece("road-slant-high-4.glb", x, y, turn, { oneWay: wayOf(dir, climb) }));
}

function bridgeRuns(pieces, claimed, skipped, axis, dir, cells, bank) {
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const span = run;
    run = [];
    if (span.some((cell) => cell.cross)) {
      skipped.push(span.map((cell) => key(cell.x, cell.y)));
      return;
    }
    const first = span[0];
    const last = span[span.length - 1];
    const before = cells.find((cell) => cell.t === first.t - 1);
    const after = cells.find((cell) => cell.t === last.t + 1);
    if (!before || !after || !bank(before) || !bank(after)) {
      skipped.push(span.map((cell) => key(cell.x, cell.y)));
      return;
    }
    const cover = [...span];
    let rampBefore = before;
    let rampAfter = after;
    if (cover.length % 2 === 1) {
      const further = cells.find((cell) => cell.t === after.t + 1);
      if (!further || !bank(further)) {
        skipped.push(span.map((cell) => key(cell.x, cell.y)));
        return;
      }
      cover.push(after);
      rampAfter = further;
    }
    for (let i = 0; i < cover.length; i += 2) {
      const northOrWest = cover[i];
      const southOrEast = cover[i + 1];
      if (axis === "v") placeDeck(pieces, axis, northOrWest.x, northOrWest.y, dir);
      else placeDeck(pieces, axis, southOrEast.x, southOrEast.y, dir);
    }
    if (axis === "v") {
      placeRamp(pieces, axis, "north", rampBefore.x, rampBefore.y, dir);
      placeRamp(pieces, axis, "south", rampAfter.x, rampAfter.y, dir);
    } else {
      placeRamp(pieces, axis, "west", rampBefore.x, rampBefore.y, dir);
      placeRamp(pieces, axis, "east", rampAfter.x, rampAfter.y, dir);
    }
    for (const cell of cover) claimed.add(key(cell.x, cell.y));
    claimed.add(key(rampBefore.x, rampBefore.y));
    claimed.add(key(rampAfter.x, rampAfter.y));
  };
  for (const cell of cells) {
    if (claimed.has(key(cell.x, cell.y))) {
      flush();
      continue;
    }
    if (cell.glyph === "~") run.push(cell);
    else flush();
  }
  flush();
}

function buildPieces(svg, ground) {
  const yellow = yellowCells();
  const drawn = whiteCells(svg);
  const pieces = [];
  const claimed = new Set();
  const skipped = [];
  const module = (x, y) => glyphAt(ground, x, y);

  for (const line of LINES) {
    const lanes = [
      { fixed: line.fixed, dir: line.primary },
      { fixed: line.fixed + line.side, dir: OPP[line.primary] },
    ];
    for (const lane of lanes) {
      const cells = [];
      if (line.axis === "h") {
        for (let x = line.a; x <= line.b; x += 1) {
          const info = yellow.get(key(x, lane.fixed));
          cells.push({
            t: x,
            x,
            y: lane.fixed,
            glyph: module(x, lane.fixed),
            cross: info ? info.lines.size > 1 : false,
          });
        }
      } else {
        for (let y = line.a; y <= line.b; y += 1) {
          const info = yellow.get(key(lane.fixed, y));
          cells.push({
            t: y,
            x: lane.fixed,
            y,
            glyph: module(lane.fixed, y),
            cross: info ? info.lines.size > 1 : false,
          });
        }
      }
      const bank = (cell) => land(cell.glyph) && !cell.cross;
      bridgeRuns(pieces, claimed, skipped, line.axis, lane.dir, cells, bank);
    }
  }

  const columns = new Map();
  const rows = new Map();
  for (const id of drawn) {
    if (yellow.has(id)) continue;
    const [x, y] = id.split(",").map(Number);
    if (!columns.has(x)) columns.set(x, []);
    columns.get(x).push(y);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  const along = (x, y, axis) => {
    const dirs = neighbors(drawn, x, y).filter((dir) => {
      const [dx, dy] = STEP[dir];
      return land(module(x + dx, y + dy)) && !yellow.has(key(x + dx, y + dy));
    });
    if (axis === "v") return dirs.every((dir) => dir === "N" || dir === "S");
    return dirs.every((dir) => dir === "E" || dir === "W");
  };
  for (const [x, ys] of columns) {
    const cells = [...ys].sort((a, b) => a - b).map((y) => ({
      t: y,
      x,
      y,
      glyph: module(x, y),
      cross: false,
    }));
    bridgeRuns(pieces, claimed, skipped, "v", null, cells, (cell) => land(cell.glyph) && along(cell.x, cell.y, "v"));
  }
  for (const [y, xs] of rows) {
    const cells = [...xs].sort((a, b) => a - b).map((x) => ({
      t: x,
      x,
      y,
      glyph: module(x, y),
      cross: false,
    }));
    bridgeRuns(pieces, claimed, skipped, "h", null, cells, (cell) => land(cell.glyph) && along(cell.x, cell.y, "h") && !claimed.has(key(cell.x, cell.y)));
  }

  const streets = new Set();
  let coastSkipped = 0;
  for (const id of drawn) {
    if (yellow.has(id) || claimed.has(id)) continue;
    const [x, y] = id.split(",").map(Number);
    if (!land(module(x, y))) {
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
  for (const id of streets) {
    const [x, y] = id.split(",").map(Number);
    const spec = whiteSpec(neighbors(streets, x, y), x, y, junctionAt);
    pieces.push(placePiece(spec.file, x, y, spec.turn));
  }

  let crossings = 0;
  for (const [id, cell] of yellow) {
    if (claimed.has(id)) continue;
    if (cell.lines.size > 1) {
      crossings += 1;
      continue;
    }
    const [x, y] = id.split(",").map(Number);
    if (!land(module(x, y))) {
      coastSkipped += 1;
      continue;
    }
    pieces.push(placePiece("road-straight-7.glb", x, y, STRAIGHT_TURN[cell.dirs[0]], { oneWay: true }));
  }

  return {
    pieces,
    yellow,
    coastSkipped,
    crossings,
    streets: streets.size,
    skippedCanals: skipped,
    bridges: pieces.filter((piece) => piece.file === "bridge-water.glb").length,
    ramps: pieces.filter((piece) => piece.file === "road-slant-high-4.glb").length,
  };
}

function allowed(error, yellow, ground) {
  const step = STEP[error.side];
  if (!step) return false;
  const nx = error.gx + step[0];
  const nz = error.gz + step[1];
  const outside = nx < 0 || nx >= GX || nz < 0 || nz >= GY;
  const thereYellow = yellow.has(key(nx, nz));
  const hereYellow = yellow.has(key(error.gx, error.gz));
  if (error.kind === "open") {
    if (outside || thereYellow) return true;
    const glyph = glyphAt(ground, nx, nz);
    if (glyph === "~" || glyph === "p") return true;
    // A straight keeps both mouths. The drawn road ends, so one mouth faces bare land.
    return (glyph === "l" || glyph === "g") && error.socket === "g";
  }
  if (error.kind === "mismatch") return hereYellow !== thereYellow;
  return false;
}

export function unexpectedErrors(pieces, yellow, ground) {
  return checkRoads(pieces).filter((error) => !allowed(error, yellow, ground));
}

// Park paint covers every land cell inside the park, including the streets.
// Trees grow on "g", so a road module stays plain land.
function keepRoadsClear(ground, pieces) {
  for (const piece of pieces) {
    const cells = pieceCells(piece);
    if (!cells) continue;
    for (const cell of cells) {
      const gx = cell.gx;
      const gy = cell.gz;
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) continue;
      for (let dz = 0; dz < 4; dz += 1) {
        const row = ground[gy * 4 + dz];
        if (!row) continue;
        for (let dx = 0; dx < 4; dx += 1) {
          const x = gx * 4 + dx;
          if (row[x] === "g") row[x] = "l";
        }
      }
    }
  }
}

// The source drawing is not stored in the repo, so the caller has to pass it.
export function resolveSvgPath(arg) {
  if (!arg) {
    throw new Error("Missing island SVG. Pass it: node tools/build-island-map.mjs <path/to/city-grid-roads.svg>");
  }
  if (!existsSync(arg)) {
    throw new Error(`Island SVG not found: ${arg}\nPass a real file: node tools/build-island-map.mjs <path/to/city-grid-roads.svg>`);
  }
  return arg;
}

function main() {
  const svg = readFileSync(resolveSvgPath(process.argv[2]), "utf8");
  const ground = paintGround(svg);
  const built = buildPieces(svg, ground);
  keepRoadsClear(ground, built.pieces);
  const errors = checkRoads(built.pieces);
  const unexpected = errors.filter((error) => !allowed(error, built.yellow, ground));
  const report = {
    pieces: built.pieces.length,
    streets: built.streets,
    crossingsLeftOpen: built.crossings,
    coastSkipped: built.coastSkipped,
    bridges: built.bridges,
    ramps: built.ramps,
    skippedCanals: built.skippedCanals.length,
    allowedOpen: errors.filter((error) => error.kind === "open").length,
    allowedMismatch: errors.filter((error) => error.kind === "mismatch").length,
    unexpected: unexpected.length,
  };
  console.log(JSON.stringify(report, null, 2));
  if (built.skippedCanals.length) {
    console.log("canals left open", built.skippedCanals.map((run) => run.join(" ")).join(" | "));
  }
  const map = {
    cols: COLS,
    rows: ROWS,
    tile: 48,
    island: true,
    spawn: { x: 4 * 24 + 2, z: 4 * 50 + 2 },
    views: [
      { name: "Northwest", x: 4 * 34 + 2, z: 4 * 16 + 2 },
      { name: "Northeast", x: 4 * 80 + 2, z: 4 * 22 + 2 },
      { name: "Southwest", x: 4 * 24 + 2, z: 4 * 50 + 2 },
      { name: "Southeast", x: 4 * 70 + 2, z: 4 * 54 + 2 },
      { name: "Canal", x: 4 * 13 + 4, z: 4 * 23 + 2 },
    ],
    buildings: [],
    ground: ground.map((row) => row.join("")),
  };
  writeFileSync(new URL("../island-map.json", import.meta.url), `${JSON.stringify({ pieces: built.pieces, removedRoads: [] }, null, 2)}\n`);
  writeFileSync(new URL("../data/island.json", import.meta.url), JSON.stringify(map));
  console.log("wrote island-map.json and data/island.json");
  if (unexpected.length) {
    console.log(unexpected.slice(0, 40).map((error) => `${error.kind} ${error.file} ${error.gx},${error.gz} ${error.side || ""}`).join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
