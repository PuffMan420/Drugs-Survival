// Lanes for roads placed in build mode.
// Each Kenney road piece is one module. A straight runs along model X, asphalt
// is the middle 0.6, and the right-hand lane sits 0.15 off the centerline.
// A bend or curve is a quarter circle between the west and south mouths.
// A bridge carries a deck along Z at the high end of a slant-high ramp, and a
// ground road along X passes under that deck. Turn, mirror, and scale match
// build mode: scale, then yaw, then the piece center.

import { TILE } from "./constants.js";
import { modelPolylines } from "./road-sockets.js";

const UNIT = 4 * TILE;
// Build mode sets the piece origin here. The tire sits just above the asphalt.
const PIECE_Y = 0.2;
const TIRE = 0.15;
const LANE = 0.15;
const Y_ROAD = 0.01;
const Y_DECK = 0.51;
const LINK_XZ = 18;
const LINK_Y = 10;
const CELL = 240;
const NEAR = 64;

const KIND = new Map([
  ["road-straight.glb", "x"],
  ["road-straight-2.glb", "x"],
  ["road-straight-3.glb", "x"],
  ["road-straight-4.glb", "x"],
  ["road-straight-5.glb", "x"],
  ["road-straight-6.glb", "x"],
  ["road-straight-7.glb", "x"],
  ["road-straight-stop.glb", "x"],
  ["road-crossing.glb", "x"],
  ["road-crossing-2.glb", "x"],
  ["road-crossing-3.glb", "x"],
  ["road-straight-half.glb", "half"],
  ["road-straight-half-2.glb", "half"],
  ["road-straight-half-3.glb", "half"],
  ["road-straight-half-4.glb", "half"],
  ["road-slant.glb", "slant"],
  ["road-slant-flat.glb", "slant"],
  ["road-slant-high.glb", "slant-high"],
  ["road-slant-high-2.glb", "slant-high"],
  ["road-slant-high-3.glb", "slant-high"],
  ["road-slant-high-4.glb", "slant-high"],
  ["road-slant-flat-high.glb", "slant-high"],
  ["road-bend.glb", "bend"],
  ["road-bend-2.glb", "bend"],
  ["road-bend-3.glb", "bend"],
  ["road-bend-square.glb", "bend"],
  ["road-bend-square-2.glb", "bend"],
  ["road-bend-square-3.glb", "bend"],
  ["road-bend-sidewalk.glb", "bend"],
  ["road-curve.glb", "curve"],
  ["road-curve-2.glb", "curve"],
  ["road-curve-3.glb", "curve"],
  ["road-curve-intersection-2.glb", "curve"],
  ["road-curve-intersection-3.glb", "curve"],
  ["road-bridge.glb", "bridge"],
  ["road-bridge-2.glb", "bridge"],
  ["bridge-water.glb", "water"],
  ["road-split-2.glb", "split"],
  ["road-crossroad.glb", "cross"],
  ["road-crossroad-2.glb", "cross"],
  ["road-crossroad-3.glb", "cross"],
  ["road-crossroad-line.glb", "cross"],
  ["road-crossroad-path.glb", "cross"],
  ["road-crossroad-path-2.glb", "cross"],
  ["road-crossroad-path-3.glb", "cross"],
  ["road-intersection.glb", "tee"],
  ["road-intersection-2.glb", "tee"],
  ["road-intersection-3.glb", "tee"],
  ["road-intersection-line.glb", "tee"],
  ["road-intersection-path.glb", "tee"],
  ["road-intersection-path-2.glb", "tee"],
  ["road-intersection-path-3.glb", "tee"],
  ["road-roundabout-2.glb", "round"],
  ["road-roundabout-3.glb", "round"],
]);

function line(x0, z0, x1, z1, y0, y1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      z: z0 + (z1 - z0) * t,
    });
  }
  return pts;
}

function arc(cx, cz, radius, a0, a1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push({
      x: cx + radius * Math.cos(a),
      y: Y_ROAD,
      z: cz + radius * Math.sin(a),
    });
  }
  return pts;
}

function polylines(file, y) {
  return modelPolylines(file).map((pts) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const seg = line(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, y, y, 4);
      if (i > 0) seg.shift();
      out.push(...seg);
    }
    return out;
  });
}

function centerlines(kind) {
  if (kind === "x") return [line(-0.5, 0, 0.5, 0, Y_ROAD, Y_ROAD, 4)];
  if (kind === "half") return [line(-0.25, 0, 0.25, 0, Y_ROAD, Y_ROAD, 2)];
  if (kind === "slant") return [line(-0.5, 0, 0.5, 0, Y_ROAD, 0.26, 8)];
  if (kind === "slant-high") return [line(-0.5, 0, 0.5, 0, Y_ROAD, Y_DECK, 8)];
  if (kind === "bend") return [arc(-0.5, 0.5, 0.5, -Math.PI / 2, 0, 12)];
  if (kind === "curve") return [arc(-1, 1, 1.5, -Math.PI / 2, 0, 16)];
  if (kind === "round") {
    const radius = 0.95;
    const ring = [];
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      ring.push({ x: radius * Math.cos(angle), y: Y_ROAD, z: radius * Math.sin(angle) });
    }
    return [
      ring,
      line(0, radius, 0, 1.5, Y_ROAD, Y_ROAD, 2),
      line(0, -1.5, 0, -radius, Y_ROAD, Y_ROAD, 2),
      line(-1.5, 0, -radius, 0, Y_ROAD, Y_ROAD, 2),
      line(radius, 0, 1.5, 0, Y_ROAD, Y_ROAD, 2),
    ];
  }
  if (kind === "bridge") {
    return [
      line(-0.5, 0, 0.5, 0, Y_ROAD, Y_ROAD, 4),
      line(0, -0.5, 0, 0.5, Y_DECK, Y_DECK, 4),
    ];
  }
  // Water bridge: deck only, two modules along Z, centered on the piece origin.
  if (kind === "water") return [line(0, -1, 0, 1, Y_DECK, Y_DECK, 6)];
  // Split openings come from the connection table. The through road is the
  // north module. The south mouth merges into it, then the through road continues.
  if (kind === "split") return polylines("road-split-2.glb", Y_ROAD);
  if (kind === "cross") {
    return [
      line(-0.5, 0, 0.5, 0, Y_ROAD, Y_ROAD, 4),
      line(0, -0.5, 0, 0.5, Y_ROAD, Y_ROAD, 4),
    ];
  }
  if (kind === "tee") {
    return [
      line(-0.5, 0, 0.5, 0, Y_ROAD, Y_ROAD, 4),
      line(0, 0, 0, 0.5, Y_ROAD, Y_ROAD, 3),
    ];
  }
  return [];
}

function worldPoint(point, piece, size) {
  let x = (piece.mirror ? -size : size) * point.x;
  const y = size * point.y;
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
  return {
    x: (piece.x + 0.5) * TILE + x,
    y: PIECE_Y + y + TIRE,
    z: (piece.z + 0.5) * TILE + z,
  };
}

// Right of the travel direction, after mirror and turn, so the lane stays
// on the right-hand side of the piece as it was placed.
function offsetLane(pts, lateral) {
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    out.push({
      x: pts[i].x - tz * lateral,
      y: pts[i].y,
      z: pts[i].z + tx * lateral,
    });
  }
  return out;
}

function closestPoint(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return {
    dist: Math.hypot(a.x + dx * t - x, a.z + dz * t - z),
    y: a.y + (b.y - a.y) * t,
  };
}

function distToSeg(x, z, a, b) {
  return closestPoint(x, z, a, b).dist;
}

function pieceReady(piece) {
  if (!piece || piece.kit !== "roads") return null;
  const kind = KIND.get(piece.file);
  if (!kind) return null;
  if (!Number.isFinite(piece.x) || !Number.isFinite(piece.z)) return null;
  const turn = Number(piece.turn);
  if (!Number.isInteger(turn)) return null;
  const scale = piece.scale == null ? 1 : Number(piece.scale);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const oneWay = piece.oneWay === true || piece.oneWay === "x" || piece.oneWay === "z" || piece.oneWay === "back"
    ? piece.oneWay
    : false;
  return {
    kind,
    size: UNIT * scale,
    placed: {
      ...piece,
      mirror: piece.mirror === true,
      turn: ((turn % 4) + 4) % 4,
      oneWay,
    },
  };
}

function axisOf(raw) {
  const a = raw[0];
  const b = raw[raw.length - 1];
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
}

// oneWay true keeps the authored direction. "x" / "z" keep that model axis
// one-way and still emit the other axis both ways (a bridge underpass).
// "back" keeps only the reverse, for a ramp the car drives down.
function pushLane(lanes, world, lateral, oneWay, axis) {
  if (oneWay === "back") {
    lanes.push(offsetLane([...world].reverse(), lateral));
    return;
  }
  lanes.push(offsetLane(world, lateral));
  if (oneWay === true) return;
  if (oneWay === "x" && axis === "x") return;
  if (oneWay === "z" && axis === "z") return;
  lanes.push(offsetLane([...world].reverse(), lateral));
}

function linkNext(lanes) {
  const next = new Array(lanes.length).fill(-1);
  const buckets = new Map();
  for (let j = 0; j < lanes.length; j += 1) {
    const start = lanes[j][0];
    const key = `${Math.floor(start.x / LINK_XZ)},${Math.floor(start.z / LINK_XZ)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(j);
  }
  const pairs = [];
  for (let i = 0; i < lanes.length; i += 1) {
    const end = lanes[i][lanes[i].length - 1];
    const cx = Math.floor(end.x / LINK_XZ);
    const cz = Math.floor(end.z / LINK_XZ);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = buckets.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n += 1) {
          const j = bucket[n];
          if (i === j) continue;
          const start = lanes[j][0];
          if (Math.abs(end.y - start.y) > LINK_Y) continue;
          const dist = Math.hypot(end.x - start.x, end.z - start.z);
          if (dist < LINK_XZ) pairs.push({ i, j, dist });
        }
      }
    }
  }
  pairs.sort((a, b) => a.dist - b.dist || a.i - b.i || a.j - b.j);
  const usedIn = new Array(lanes.length).fill(false);
  const usedOut = new Array(lanes.length).fill(false);
  for (const pair of pairs) {
    if (usedOut[pair.i] || usedIn[pair.j]) continue;
    next[pair.i] = pair.j;
    usedOut[pair.i] = true;
    usedIn[pair.j] = true;
  }
  return next;
}

function extendEnds(pts, extra) {
  if (pts.length < 2 || extra <= 0) return pts;
  const first = pts[0];
  const second = pts[1];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return [stepOut(second, first, extra), ...pts, stepOut(prev, last, extra)];
}

function stepOut(from, to, extra) {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  let dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  return { x: to.x + dx * extra, y: to.y + dy * extra, z: to.z + dz * extra };
}

// Driving surfaces for placed roads. Each strip is the asphalt centerline in
// world space, wide enough for both lanes. The deck and the underpass are
// separate strips, so a bridge does not fill the gap under it.
export function builtRoadStrips(pieces) {
  const strips = [];
  const list = Array.isArray(pieces) ? pieces : [];
  for (const piece of list) {
    const ready = pieceReady(piece);
    if (!ready) continue;
    for (const raw of centerlines(ready.kind)) {
      const pts = raw.map((point) => worldPoint(point, ready.placed, ready.size));
      if (pts.length < 2) continue;
      strips.push({ pts: extendEnds(pts, 8), half: 0.36 * ready.size });
    }
  }
  return strips;
}

export function planBuiltLanes(pieces) {
  const lanes = [];
  const grid = new Map();
  const list = Array.isArray(pieces) ? pieces : [];
  for (const piece of list) {
    const ready = pieceReady(piece);
    if (!ready) continue;
    const lateral = LANE * ready.size;
    for (const raw of centerlines(ready.kind)) {
      const world = raw.map((point) => worldPoint(point, ready.placed, ready.size));
      pushLane(lanes, world, lateral, ready.placed.oneWay, axisOf(raw));
    }
  }

  const next = linkNext(lanes);

  for (const lane of lanes) {
    for (let i = 0; i < lane.length - 1; i += 1) {
      const a = lane[i];
      const b = lane[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / CELL);
      const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z) / CELL);
      const z1 = Math.floor(Math.max(a.z, b.z) / CELL);
      for (let z = z0; z <= z1; z += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const key = `${x},${z}`;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(a, b);
        }
      }
    }
  }

  function heightAt(x, z, y) {
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    const prefer = y == null ? 0 : y;
    let best = null;
    let bestScore = Infinity;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = grid.get(`${ix + dx},${iz + dz}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 2) {
          const hit = closestPoint(x, z, bucket[i], bucket[i + 1]);
          if (hit.dist > 48) continue;
          const score = hit.dist + Math.abs(hit.y - prefer) * 0.2;
          if (score < bestScore) {
            bestScore = score;
            best = hit.y;
          }
        }
      }
    }
    return best;
  }

  return {
    lanes,
    next,
    heightAt,
    near(x, z) {
      const ix = Math.floor(x / CELL);
      const iz = Math.floor(z / CELL);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = grid.get(`${ix + dx},${iz + dz}`);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 2) {
            if (distToSeg(x, z, bucket[i], bucket[i + 1]) <= NEAR) return true;
          }
        }
      }
      return false;
    },
  };
}
