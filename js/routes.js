// Lane paths and curb parking for the fixed downtown. Cars stay on road tiles.

const CENTER_H = new Set(["H", "h"]);
const CENTER_V = new Set(["V", "v"]);
const CENTER_A = new Set(["A", "a"]);
const CENTER_E = new Set(["E", "e"]);
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function tileHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function isCenter(cell) {
  return CENTER_H.has(cell) || CENTER_V.has(cell) || CENTER_A.has(cell) || CENTER_E.has(cell);
}

function isRoad(cell) {
  return isCenter(cell) || cell === "+" || cell === "X";
}

function familyOk(cell, dx, dz) {
  if (dx !== 0 && dz !== 0) return dx * dz < 0 ? CENTER_A.has(cell) : CENTER_E.has(cell);
  if (dx !== 0) return CENTER_H.has(cell);
  return CENTER_V.has(cell);
}

export function planCars(map) {
  const { cols, rows, ground, tile } = map;
  const span = tile || 48;
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };
  const key = (x, z) => x + z * cols;

  function stepCenter(x, z, dx, dz) {
    for (let step = 1; step <= 3; step += 1) {
      const nx = x + dx * step;
      const nz = z + dz * step;
      const cell = at(nx, nz);
      if (isCenter(cell) && familyOk(cell, dx, dz)) return [nx, nz];
      if (!isRoad(cell)) return null;
    }
    return null;
  }

  function linksOf(x, z) {
    const cell = at(x, z);
    const axes = CENTER_V.has(cell)
      ? [[0, 1], [0, -1]]
      : CENTER_A.has(cell)
        ? [[1, -1], [-1, 1]]
        : CENTER_E.has(cell)
          ? [[1, 1], [-1, -1]]
          : [[1, 0], [-1, 0]];
    const straight = [];
    for (const [dx, dz] of axes) {
      const hit = stepCenter(x, z, dx, dz);
      if (hit) straight.push(hit);
    }
    if (straight.length >= 2) return straight;
    const extra = [];
    for (const [dx, dz] of DIRS) {
      const hit = stepCenter(x, z, dx, dz);
      if (!hit) continue;
      if (straight.some((item) => item[0] === hit[0] && item[1] === hit[1])) continue;
      if (extra.some((item) => item[0] === hit[0] && item[1] === hit[1])) continue;
      extra.push(hit);
    }
    return [...straight, ...extra];
  }

  const seen = new Uint8Array(cols * rows);
  const routes = [];

  function walk(x, z, nx, nz) {
    const pts = [];
    let cx = x;
    let cz = z;
    let tx = nx;
    let tz = nz;
    while (tx != null && !seen[key(tx, tz)]) {
      seen[key(tx, tz)] = 1;
      pts.push([tx, tz]);
      const pdx = tx - cx;
      const pdz = tz - cz;
      cx = tx;
      cz = tz;
      const nexts = linksOf(cx, cz).filter(([ax, az]) => !seen[key(ax, az)]);
      if (nexts.length === 0) break;
      nexts.sort((a, b) => ((b[0] - cx) * pdx + (b[1] - cz) * pdz) - ((a[0] - cx) * pdx + (a[1] - cz) * pdz));
      const dot = (nexts[0][0] - cx) * pdx + (nexts[0][1] - cz) * pdz;
      if (dot < 0) break;
      tx = nexts[0][0];
      tz = nexts[0][1];
    }
    return pts;
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!isCenter(at(x, z)) || seen[key(x, z)]) continue;
      seen[key(x, z)] = 1;
      const opts = linksOf(x, z);
      if (opts.length === 0) continue;
      const forward = walk(x, z, opts[0][0], opts[0][1]);
      const back = linksOf(x, z).filter(([ax, az]) => !seen[key(ax, az)]);
      let backward = [];
      if (back.length > 0) {
        const fdx = forward.length ? forward[0][0] - x : 0;
        const fdz = forward.length ? forward[0][1] - z : 0;
        back.sort((a, b) => (a[0] - x) * fdx + (a[1] - z) * fdz - ((b[0] - x) * fdx + (b[1] - z) * fdz));
        backward = walk(x, z, back[0][0], back[0][1]);
      }
      const tiles = [...backward.reverse(), [x, z], ...forward];
      if (tiles.length >= 6) routes.push(tiles);
    }
  }

  function sideSpan(tx, tz, ax, az) {
    let n = 0;
    for (let i = 1; i <= 5; i += 1) {
      if (!isRoad(at(tx + ax * i, tz + az * i))) break;
      n = i;
    }
    return n;
  }

  function lanePoint(tiles, index, side) {
    const [tx, tz] = tiles[index];
    const prev = tiles[Math.max(0, index - 1)];
    const next = tiles[Math.min(tiles.length - 1, index + 1)];
    let hx = next[0] - prev[0];
    let hz = next[1] - prev[1];
    const len = Math.hypot(hx, hz) || 1;
    hx /= len;
    hz /= len;
    const rx = Math.sign(-hz);
    const rz = Math.sign(hx);
    const room = sideSpan(tx, tz, rx, rz);
    const edge = (room + 0.5) * span;
    const offset = Math.max(0, Math.min(span * 0.42, edge - 28));
    let x = (tx + 0.5) * span + rx * offset * side;
    let z = (tz + 0.5) * span + rz * offset * side;
    const cx = (tx + 0.5) * span;
    const cz = (tz + 0.5) * span;
    if (!isRoad(at(Math.floor(x / span), Math.floor(z / span)))) {
      x = cx;
      z = cz;
    }
    return { x, z, cx, cz };
  }

  function onRoadPoint(x, z) {
    return isRoad(at(Math.floor(x / span), Math.floor(z / span)));
  }

  function segmentOnRoad(a, b) {
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 16));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      if (!onRoadPoint(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  // A lane offset on a diagonal cuts the corner onto the sidewalk. Pull those
  // points back toward the tile center until the driven line stays on asphalt.
  function pullOntoRoad(points) {
    for (let pass = 0; pass < 4; pass += 1) {
      let pulled = false;
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (segmentOnRoad(a, b)) continue;
        a.x += (a.cx - a.x) * 0.5;
        a.z += (a.cz - a.z) * 0.5;
        b.x += (b.cx - b.x) * 0.5;
        b.z += (b.cz - b.z) * 0.5;
        pulled = true;
      }
      if (!pulled) return;
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      if (segmentOnRoad(a, b)) continue;
      a.x = a.cx;
      a.z = a.cz;
      b.x = b.cx;
      b.z = b.cz;
    }
  }

  const lanes = [];
  for (const tiles of routes) {
    for (const side of [1, -1]) {
      const points = tiles.map((_, index) => lanePoint(tiles, index, side));
      pullOntoRoad(points);
      let total = 0;
      const seg = [];
      for (let i = 0; i < points.length - 1; i += 1) {
        const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
        seg.push(len);
        total += len;
      }
      if (total < 280) continue;
      lanes.push({
        points,
        seg,
        total,
        gap: 260,
        start: tileHash(tiles[0][0], tiles[0][1] + side) % 260,
        seed: tiles[0][0] * side + tiles[0][1],
      });
    }
  }
  const movers = [];
  const slots = lanes.map((lane) => ({ lane, dist: lane.start }));
  while (movers.length < 72 && slots.some((slot) => slot.dist < slot.lane.total)) {
    for (const slot of slots) {
      if (movers.length >= 72 || slot.dist >= slot.lane.total) continue;
      movers.push({
        points: slot.lane.points,
        seg: slot.lane.seg,
        total: slot.lane.total,
        dist: slot.dist,
        hash: tileHash(Math.round(slot.dist), slot.lane.seed),
      });
      slot.dist += slot.lane.gap;
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
  const taken = new Set();
  for (let z = 1; z < rows - 1; z += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (parked.length >= 340) break;
      const cell = at(x, z);
      if (!isRoad(cell) || isCenter(cell)) continue;
      if (clear.has(key(x, z))) continue;
      if (tileHash(x, z) % 8 !== 0) continue;
      const sidewalk = DIRS.slice(0, 4).find(([dx, dz]) => at(x + dx, z + dz) === "s");
      if (!sidewalk) continue;
      let nearH = false;
      let nearV = false;
      let hx = 1;
      let hz = 0;
      let best = 99;
      for (let dz = -3; dz <= 3; dz += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const other = at(x + dx, z + dz);
          if (CENTER_H.has(other)) nearH = true;
          if (CENTER_V.has(other)) nearV = true;
          if (!isCenter(other)) continue;
          const dist = Math.abs(dx) + Math.abs(dz);
          if (dist < best) {
            best = dist;
            if (CENTER_V.has(other)) {
              hx = 0;
              hz = 1;
            } else if (CENTER_A.has(other)) {
              hx = 1;
              hz = -1;
            } else if (CENTER_E.has(other)) {
              hx = 1;
              hz = 1;
            } else {
              hx = 1;
              hz = 0;
            }
          }
        }
      }
      if (nearH && nearV) continue;
      const bucket = `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
      if (taken.has(bucket)) continue;
      taken.add(bucket);
      const [sdx, sdz] = sidewalk;
      const pull = span * 0.28;
      const flip = tileHash(z, x) % 2 === 0 ? 1 : -1;
      parked.push({
        x: (x + 0.5) * span + sdx * pull,
        z: (z + 0.5) * span + sdz * pull,
        hx: hx * flip,
        hz: hz * flip,
        hash: tileHash(x, z),
      });
    }
  }

  return { parked, movers };
}

export function headingAngle(hx, hz) {
  return Math.atan2(-hx, -hz);
}

export function poseAt(mover, extra) {
  let dist = mover.dist + (extra || 0);
  dist = ((dist % mover.total) + mover.total) % mover.total;
  let remain = dist;
  for (let i = 0; i < mover.seg.length; i += 1) {
    const len = mover.seg[i];
    if (remain <= len || i === mover.seg.length - 1) {
      const t = len > 0 ? Math.min(1, remain / len) : 0;
      const a = mover.points[i];
      const b = mover.points[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        hx: b.x - a.x,
        hz: b.z - a.z,
      };
    }
    remain -= len;
  }
  const last = mover.points[mover.points.length - 1];
  return { x: last.x, z: last.z, hx: 0, hz: -1 };
}
