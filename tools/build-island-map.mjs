// Builds island-map.json and data/island.json from city-grid-roads.svg.
//   node tools/build-island-map.mjs /path/to/city-grid-roads.svg

import { readFileSync, writeFileSync } from "node:fs";
import { planBuiltLanes } from "../js/built-lanes.js";
import { STOP_TURN } from "../js/road-sockets.js";

const SVG_PATH = process.argv[2] || "/tmp/island-v2/island-map-inputs/city-grid-roads.svg";
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
const TURN = { E: 0, W: 2, N: 1, S: 3 };
const OPP = { E: "W", W: "E", N: "S", S: "N" };
// STOP_TURN comes from js/road-sockets.js. The stop line is model +X, so the
// key is the side the junction is on: {E:0, N:1, W:2, S:3}.

const key = (x, y) => `${x},${y}`;
const round3 = (n) => Math.round(n * 1000) / 1000;

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
    [shapes(svg, "#e6d3a3"), "p", null],
    [shapes(svg, "#ece5db"), "l", null],
    [shapes(svg, "#a9d9fe"), "~", null],
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

function wetPieces(ground) {
  const wet = new Set();
  for (let gy = 0; gy < GY; gy += 1) {
    for (let gx = 0; gx < GX; gx += 1) {
      if (ground[4 * gy + 2]?.[4 * gx + 2] === "~") wet.add(key(gx, gy));
    }
  }
  return wet;
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

function addFlow(flow, x, y, dir) {
  if (x < 0 || y < 0 || x >= GX || y >= GY) return;
  const id = key(x, y);
  let list = flow.get(id);
  if (!list) {
    list = [];
    flow.set(id, list);
  }
  if (!list.includes(dir)) list.push(dir);
}

function buildFlows() {
  const flow = new Map();
  for (const line of LINES) {
    const alt = line.fixed + line.side;
    const altDir = OPP[line.primary];
    if (line.axis === "h") {
      for (let x = line.a; x <= line.b; x += 1) {
        addFlow(flow, x, line.fixed, line.primary);
        addFlow(flow, x, alt, altDir);
      }
    } else {
      for (let y = line.a; y <= line.b; y += 1) {
        addFlow(flow, line.fixed, y, line.primary);
        addFlow(flow, line.fixed + line.side, y, altDir);
      }
    }
  }
  return flow;
}

function road(file, gx, gy, turn, extra = {}) {
  const piece = {
    kit: "roads",
    file,
    x: extra.x != null ? round3(extra.x) : 4 * gx + 2,
    z: extra.z != null ? round3(extra.z) : 4 * gy + 2,
    turn,
    scale: 1,
    mirror: extra.mirror === true,
  };
  if (extra.oneWay) piece.oneWay = extra.oneWay;
  return piece;
}

function shiftFor(turn, mirror) {
  let x = mirror ? 0.4 : -0.4;
  let z = 0;
  if (turn === 1) {
    const next = x;
    x = z;
    z = -next;
  } else if (turn === 2) {
    x = -x;
    z = -z;
  } else if (turn === 3) {
    const next = x;
    x = -z;
    z = next;
  }
  return { dx: -x * 4, dz: -z * 4 };
}

function runs(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last && value === last[last.length - 1] + 1) last.push(value);
    else out.push([value]);
  }
  return out;
}

function crossTurn(dirs) {
  const has = new Set(dirs);
  if (has.has("E") && has.has("S")) return 0;
  if (has.has("E") && has.has("N")) return 1;
  if (has.has("W") && has.has("N")) return 2;
  if (has.has("W") && has.has("S")) return 3;
  return 0;
}

function bendTurn(dirs) {
  const has = new Set(dirs);
  if (has.has("W") && has.has("S")) return 0;
  if (has.has("E") && has.has("S")) return 1;
  if (has.has("E") && has.has("N")) return 2;
  if (has.has("W") && has.has("N")) return 3;
  return 0;
}

function worldOf(point, piece) {
  const size = 192;
  let x = (piece.mirror ? -size : size) * point.x;
  const y = size * point.y + 0.35;
  let z = size * point.z;
  const turn = ((piece.turn % 4) + 4) % 4;
  if (turn === 1) {
    const next = x;
    x = z;
    z = -next;
  } else if (turn === 2) {
    x = -x;
    z = -z;
  } else if (turn === 3) {
    const next = x;
    x = -z;
    z = next;
  }
  return { x: (piece.x + 0.5) * 48 + x, y, z: (piece.z + 0.5) * 48 + z };
}

function offsetPoint(pts, index) {
  const lateral = 28.8;
  const a = pts[Math.max(0, index - 1)];
  const b = pts[Math.min(pts.length - 1, index + 1)];
  let tx = b.x - a.x;
  let tz = b.z - a.z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  const p = pts[index];
  return { x: p.x - tz * lateral, y: p.y, z: p.z + tx * lateral };
}

function linkAudit(pieces, plan, wet) {
  const starts = plan.lanes.map((lane) => lane[0]);
  function nearest(point) {
    let best = Infinity;
    for (const start of starts) {
      if (Math.abs(point.y - start.y) > 10) continue;
      const dist = Math.hypot(point.x - start.x, point.z - start.z);
      if (dist < best) best = dist;
    }
    return best;
  }
  let exitJoined = 0;
  let exitOpen = 0;
  const branch = [
    [[-0.4, -0.5], [0.1, -0.5]],
    [[-0.4, 0.5], [0.1, 0.5]],
  ];
  for (const piece of pieces) {
    if (piece.file !== "road-split-2.glb") continue;
    for (const [a, b] of branch) {
      const world = [a, b].map(([x, z]) => worldOf({ x, y: 0.01, z }, piece));
      const end = offsetPoint(world, world.length - 1);
      const dist = nearest(end);
      if (dist < 18) exitJoined += 1;
      else exitOpen += 1;
    }
  }
  let rampFar = 0;
  for (const piece of pieces) {
    if (piece.file !== "road-slant-high-4.glb" && piece.file !== "bridge-water.glb") continue;
    const along = piece.file === "bridge-water.glb"
      ? [[0, -1], [0, 1]]
      : [[-0.5, 0], [0.5, 0]];
    const y = piece.file === "bridge-water.glb" ? 0.51 : 0.01;
    const y2 = piece.file === "bridge-water.glb" ? 0.51 : 0.51;
    const world = [
      worldOf({ x: along[0][0], y, z: along[0][1] }, piece),
      worldOf({ x: along[1][0], y: y2, z: along[1][1] }, piece),
    ];
    const end = offsetPoint(piece.oneWay === "back" ? [world[1], world[0]] : world, 1);
    if (nearest(end) > 18) rampFar += 1;
  }
  const waterKeys = new Set();
  let dupWater = 0;
  let wetStraight = 0;
  for (const piece of pieces) {
    if (piece.file === "bridge-water.glb") {
      const id = `${piece.x},${piece.z}`;
      if (waterKeys.has(id)) dupWater += 1;
      waterKeys.add(id);
    }
    if (piece.file !== "road-straight-7.glb" && piece.file !== "road-straight-stop.glb") continue;
    const gx = Math.round((piece.x - 2) / 4);
    const gy = Math.round((piece.z - 2) / 4);
    if (piece.x === 4 * gx + 2 && piece.z === 4 * gy + 2 && wet.has(`${gx},${gy}`)) wetStraight += 1;
  }
  let eastHops = 0;
  const east = pieces.find((piece) => piece.file === "road-straight-7.glb" && piece.x === 4 * 22 + 2 && piece.z === 4 * 12 + 2 && piece.oneWay === true);
  if (east) {
    const start = offsetPoint([
      worldOf({ x: -0.5, y: 0.01, z: 0 }, east),
      worldOf({ x: 0.5, y: 0.01, z: 0 }, east),
    ], 0);
    let idx = -1;
    let best = 1;
    for (let i = 0; i < starts.length; i += 1) {
      const dist = Math.hypot(starts[i].x - start.x, starts[i].z - start.z);
      if (dist < best) {
        best = dist;
        idx = i;
      }
    }
    const seen = new Set();
    while (idx >= 0 && !seen.has(idx) && eastHops < 80) {
      seen.add(idx);
      idx = plan.next[idx];
      if (idx >= 0) eastHops += 1;
    }
  }
  return { exitJoined, exitOpen, rampFar, dupWater, wetStraight, eastHops };
}

function goesOn(flow, x, y, dir) {
  const [dx, dy] = STEP[dir];
  const next = flow.get(key(x + dx, y + dy));
  return next ? next.includes(dir) : false;
}

function maskOf(cells, x, y) {
  const dirs = [];
  if (cells.has(key(x, y - 1))) dirs.push("N");
  if (cells.has(key(x + 1, y))) dirs.push("E");
  if (cells.has(key(x, y + 1))) dirs.push("S");
  if (cells.has(key(x - 1, y))) dirs.push("W");
  return dirs;
}

function whitePiece(dirs) {
  const mask = ["N", "E", "S", "W"].filter((dir) => dirs.includes(dir)).join("");
  if (mask === "NESW") return { file: "road-crossroad-3.glb", turn: 0 };
  if (mask.length === 3) {
    return { file: "road-intersection-3.glb", turn: { ESW: 0, NES: 1, NEW: 2, NSW: 3 }[mask] };
  }
  if (mask === "EW") return { file: "road-straight-7.glb", turn: 0 };
  if (mask === "NS") return { file: "road-straight-7.glb", turn: 1 };
  if (mask.length === 2) {
    return { file: "road-bend-3.glb", turn: { SW: 0, ES: 1, NE: 2, NW: 3 }[mask] };
  }
  if (dirs[0] === "N" || dirs[0] === "S") return { file: "road-straight-7.glb", turn: 1 };
  return { file: "road-straight-7.glb", turn: 0 };
}

function bridgeWater(x, y, axis, dir) {
  const vertical = axis === "v";
  const turn = vertical ? (dir === "N" ? 2 : 0) : (dir === "W" ? 3 : 1);
  return road("bridge-water.glb", x, y, turn, {
    oneWay: dir ? true : false,
    x: vertical ? 4 * x + 2 : 4 * x + 4,
    z: vertical ? 4 * y + 4 : 4 * y + 2,
  });
}

function ramp(gx, gy, dir, climb, twoWay) {
  // High end of the slant is model +X. Climbing drives that way. A descent
  // points +X back at the bridge and keeps only the reversed lane.
  const face = climb ? dir : OPP[dir];
  const oneWay = twoWay ? false : (climb ? true : "back");
  return road("road-slant-high-4.glb", gx, gy, TURN[face], { oneWay });
}

function main() {
  const svg = readFileSync(SVG_PATH, "utf8");
  const ground = paintGround(svg);
  const wet = wetPieces(ground);
  const white = whiteCells(svg);
  const flow = buildFlows();
  const special = new Set();
  const pieces = [];

  function take(x, y) {
    special.add(key(x, y));
  }

  function addWater(axis, fixed, dir, a, b) {
    const values = [];
    for (let t = a; t <= b; t += 1) {
      const x = axis === "v" ? fixed : t;
      const y = axis === "v" ? t : fixed;
      if (wet.has(key(x, y))) values.push(t);
    }
    if (!values.length) return;
    const twoWay = !dir;
    const face = dir || (axis === "v" ? "S" : "E");
    for (const run of runs(values)) {
      const starts = [];
      for (let i = 0; i < run.length; i += 2) starts.push(run[i]);
      let lo = Infinity;
      let hi = -Infinity;
      for (const start of starts) {
        const covered = [start, start + 1];
        if (axis === "v") {
          pieces.push(bridgeWater(fixed, start, "v", dir));
          for (const cell of covered) take(fixed, cell);
        } else {
          pieces.push(bridgeWater(start, fixed, "h", dir));
          for (const cell of covered) take(cell, fixed);
        }
        lo = Math.min(lo, start);
        hi = Math.max(hi, start + 1);
      }
      const before = lo - 1;
      const after = hi + 1;
      const climbBefore = face === "S" || face === "E";
      if (axis === "v") {
        pieces.push(ramp(fixed, before, face, climbBefore, twoWay));
        pieces.push(ramp(fixed, after, face, !climbBefore, twoWay));
        take(fixed, before);
        take(fixed, after);
      } else {
        pieces.push(ramp(before, fixed, face, climbBefore, twoWay));
        pieces.push(ramp(after, fixed, face, !climbBefore, twoWay));
        take(before, fixed);
        take(after, fixed);
      }
    }
  }

  addWater("v", 13, "N", 8, 64);
  addWater("v", 14, "S", 8, 64);
  addWater("v", 34, null, 6, 40);
  addWater("h", 12, "E", 20, 118);
  addWater("h", 11, "W", 20, 118);

  const overs = [
    { x: 80, north: 11, south: 12 },
    { x: 92, north: 11, south: 12 },
    { x: 80, north: 32, south: 33 },
    { x: 92, north: 32, south: 33 },
  ];
  for (const site of overs) {
    pieces.push(road("road-bridge-2.glb", site.x, site.north, 2, { oneWay: "x" }));
    pieces.push(road("road-bridge-2.glb", site.x, site.south, 0, { oneWay: "x" }));
    pieces.push(road("road-slant-high-4.glb", site.x, site.north - 1, 3));
    pieces.push(road("road-slant-high-4.glb", site.x, site.south + 1, 1));
    take(site.x, site.north);
    take(site.x, site.south);
    take(site.x, site.north - 1);
    take(site.x, site.south + 1);
  }

  function onLand(x, y) {
    const glyph = ground[4 * y + 2]?.[4 * x + 2];
    return glyph === "l" || glyph === "g";
  }

  const yellowStraight = new Map();
  for (const [id, dirs] of flow) {
    if (special.has(id)) continue;
    const [x, y] = id.split(",").map(Number);
    // The beach and the sea stay clear. Water crossings were already bridged.
    if (!onLand(x, y)) continue;
    if (dirs.length >= 2) {
      const ending = dirs.every((dir) => !goesOn(flow, x, y, dir));
      pieces.push(ending
        ? road("road-bend-3.glb", x, y, bendTurn(dirs), { oneWay: true })
        : road("road-crossroad-3.glb", x, y, crossTurn(dirs), { oneWay: true }));
      take(x, y);
      continue;
    }
    const piece = road("road-straight-7.glb", x, y, TURN[dirs[0]], { oneWay: true });
    pieces.push(piece);
    yellowStraight.set(id, piece);
  }

  const usedPairs = new Set();
  for (const id of white) {
    if (flow.has(id)) continue;
    const [x, y] = id.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = x + dx;
      const jy = y + dy;
      const jid = key(jx, jy);
      const dirs = flow.get(jid);
      if (!dirs || dirs.length !== 1 || special.has(jid) || !yellowStraight.has(jid)) continue;
      const dir = dirs[0];
      const along = dir === "E" || dir === "W";
      if ((dx !== 0) === along) continue;
      const [sx, sy] = STEP[dir];
      let ox = jx + sx;
      let oy = jy + sy;
      if (!yellowStraight.has(key(ox, oy))) {
        ox = jx - sx;
        oy = jy - sy;
      }
      if (!yellowStraight.has(key(ox, oy)) || special.has(key(ox, oy))) continue;
      const pair = [jid, key(ox, oy)].sort().join("|");
      if (usedPairs.has(pair)) continue;
      usedPairs.add(pair);
      const turn = { E: 1, W: 3, N: 2, S: 0 }[dir];
      const towardWhite = OPP[dx > 0 ? "E" : dx < 0 ? "W" : dy > 0 ? "S" : "N"];
      const faces = { 0: "E", 1: "N", 2: "W", 3: "S" }[turn];
      const mirror = faces !== towardWhite;
      const shift = shiftFor(turn, mirror);
      const mx = ((4 * jx + 2) + (4 * ox + 2)) / 2 + shift.dx;
      const mz = ((4 * jy + 2) + (4 * oy + 2)) / 2 + shift.dz;
      pieces.push(road("road-split-2.glb", jx, jy, turn, { oneWay: true, mirror, x: mx, z: mz }));
      for (const cell of [jid, key(ox, oy)]) {
        const straight = yellowStraight.get(cell);
        const at = pieces.indexOf(straight);
        if (at >= 0) pieces.splice(at, 1);
        yellowStraight.delete(cell);
        special.add(cell);
      }
    }
  }

  for (const id of yellowStraight.keys()) {
    const [x, y] = id.split(",").map(Number);
    take(x, y);
  }

  const openWhite = new Set([...white].filter((id) => !special.has(id)));
  const placedWhite = [];
  for (const id of openWhite) {
    const [x, y] = id.split(",").map(Number);
    const dirs = maskOf(openWhite, x, y);
    const spec = whitePiece(dirs);
    placedWhite.push({ piece: road(spec.file, x, y, spec.turn), x, y, dirs });
  }
  for (const item of placedWhite) {
    if (item.piece.file !== "road-straight-7.glb") continue;
    if ((item.x + item.y) % 4 !== 1) continue;
    let toward = null;
    for (const dir of item.dirs) {
      const [dx, dy] = STEP[dir];
      const next = placedWhite.find((other) => other.x === item.x + dx && other.y === item.y + dy);
      if (!next) continue;
      if (next.piece.file !== "road-crossroad-3.glb" && next.piece.file !== "road-intersection-3.glb") continue;
      toward = dir;
      break;
    }
    if (!toward) continue;
    item.piece.file = "road-straight-stop.glb";
    item.piece.turn = STOP_TURN[toward];
    item.piece.mirror = false;
  }
  for (const item of placedWhite) pieces.push(item.piece);

  const plan = planBuiltLanes(pieces);
  const linked = plan.next.filter((next) => next >= 0).length;
  const gaps = linkAudit(pieces, plan, wet);
  const interior = [];
  for (const piece of pieces) {
    const gx = Math.round((piece.x - 2) / 4);
    const gy = Math.round((piece.z - 2) / 4);
    if (gx >= 81 && gx <= 91 && gy >= 13 && gy <= 31) interior.push({ gx, gy, file: piece.file });
  }
  const parkBad = interior.filter((piece) => piece.gy !== 22);
  const cross = (gx, gy) => pieces.some((piece) => piece.file === "road-crossroad-3.glb" && piece.x === 4 * gx + 2 && piece.z === 4 * gy + 2);
  const mirroredStop = pieces.some((piece) => piece.file === "road-straight-stop.glb" && piece.mirror);
  const report = {
    pieces: pieces.length,
    linked,
    lanes: plan.lanes.length,
    stops: pieces.filter((piece) => piece.file === "road-straight-stop.glb").length,
    splits: pieces.filter((piece) => piece.file === "road-split-2.glb").length,
    bridges: pieces.filter((piece) => piece.file === "road-bridge-2.glb").length,
    water: pieces.filter((piece) => piece.file === "bridge-water.glb").length,
    interior: interior.length,
    parkBad: parkBad.length,
    cross80: cross(80, 22),
    cross92: cross(92, 22),
    mirroredStop,
    ...gaps,
  };
  console.log(JSON.stringify(report, null, 2));
  if (parkBad.length || !report.cross80 || !report.cross92 || mirroredStop || report.stops < 1 || gaps.dupWater || gaps.wetStraight) {
    throw new Error("Island map failed its road checks.");
  }

  let spawn = { x: 4 * 100 + 2, z: 4 * 40 + 2 };
  if (ground[spawn.z]?.[spawn.x] !== "l") {
    outer: for (let gy = 36; gy < 48; gy += 1) {
      for (let gx = 70; gx < 100; gx += 1) {
        const x = 4 * gx + 2;
        const z = 4 * gy + 2;
        if (ground[z]?.[x] === "l") {
          spawn = { x, z };
          break outer;
        }
      }
    }
  }
  const map = {
    cols: COLS,
    rows: ROWS,
    tile: 48,
    island: true,
    spawn,
    views: [
      { name: "Park crossing", x: 4 * 80 + 2, z: 4 * 22 + 2 },
      { name: "Green overpass", x: 4 * 80 + 2, z: 4 * 12 + 2 },
      { name: "Water bridge", x: 4 * 34 + 2, z: 4 * 23 + 2 },
      { name: "East arterial", x: 4 * 100 + 2, z: 4 * 12 + 2 },
      { name: "South arterial", x: 4 * 70 + 2, z: 4 * 64 + 2 },
      { name: "West canal", x: 4 * 13 + 2, z: 4 * 40 + 2 },
      { name: "Mid grid", x: 4 * 60 + 2, z: 4 * 40 + 2 },
      { name: "North coast", x: 4 * 40 + 2, z: 4 * 8 + 2 },
      { name: "Harbor gap", x: 4 * 34 + 2, z: 4 * 18 + 2 },
    ],
    buildings: [],
    ground: ground.map((row) => row.join("")),
  };
  writeFileSync(new URL("../island-map.json", import.meta.url), `${JSON.stringify({ pieces, removedRoads: [] }, null, 2)}\n`);
  writeFileSync(new URL("../data/island.json", import.meta.url), `${JSON.stringify(map)}\n`);
  console.log("wrote island-map.json and data/island.json", spawn);
}

main();
