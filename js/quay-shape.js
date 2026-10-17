// Shoreline for the concrete quay. Soft banks become long runs and diagonals.
// Bridge mouths stay open, and the bank wall continues straight under the deck.

const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8", "A", "E", "a", "e"]);
const SOFT = new Set(["s", "c", "g", "q", "l", "p"]);
const EPS = 1.75;

const DIRS = {
  w: { dx: -1, dz: 0, nx: 1, nz: 0 },
  e: { dx: 1, dz: 0, nx: -1, nz: 0 },
  n: { dx: 0, dz: -1, nx: 0, nz: 1 },
  s: { dx: 0, dz: 1, nx: 0, nz: -1 },
};

function makeEdge(tx, tz, dir, cell) {
  const land = DIRS[dir];
  let ax;
  let az;
  let bx;
  let bz;
  if (dir === "w") {
    ax = tx;
    az = tz;
    bx = tx;
    bz = tz + 1;
  } else if (dir === "e") {
    ax = tx + 1;
    az = tz + 1;
    bx = tx + 1;
    bz = tz;
  } else if (dir === "n") {
    ax = tx + 1;
    az = tz;
    bx = tx;
    bz = tz;
  } else {
    ax = tx;
    az = tz + 1;
    bx = tx + 1;
    bz = tz + 1;
  }
  return {
    ax, az, bx, bz, tx, tz, dir, cell,
    nx: land.nx, nz: land.nz,
    soft: SOFT.has(cell),
  };
}

function key(x, z) {
  return `${x},${z}`;
}

function linkChains(edges) {
  const byStart = new Map();
  for (const edge of edges) {
    const start = key(edge.ax, edge.az);
    if (!byStart.has(start)) byStart.set(start, []);
    byStart.get(start).push(edge);
  }
  const used = new Set();
  const incoming = new Map();
  for (const edge of edges) {
    const end = key(edge.bx, edge.bz);
    if (!incoming.has(end)) incoming.set(end, []);
    incoming.get(end).push(edge);
  }
  const pick = (list) => list.find((edge) => !used.has(edge));
  const chains = [];
  for (const seed of edges) {
    if (used.has(seed)) continue;
    let start = seed;
    const rewound = new Set();
    while (!rewound.has(start)) {
      rewound.add(start);
      const prev = pick(incoming.get(key(start.ax, start.az)) || []);
      if (!prev || prev === start) break;
      if (prev === seed) break;
      start = prev;
    }
    const chain = [];
    let edge = start;
    while (edge && !used.has(edge)) {
      used.add(edge);
      chain.push(edge);
      edge = pick(byStart.get(key(edge.bx, edge.bz)) || []);
    }
    if (chain.length > 0) chains.push(chain);
  }
  return chains;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function simplify(points, epsilon) {
  if (points.length <= 2) return points.slice();
  let far = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    if (points[i].pin) continue;
    const d = distToSeg(points[i].x, points[i].z, points[0].x, points[0].z, points[points.length - 1].x, points[points.length - 1].z);
    if (d > far) {
      far = d;
      index = i;
    }
  }
  const pinned = points.findIndex((point, i) => i > 0 && i < points.length - 1 && point.pin);
  if (pinned > 0) {
    return simplify(points.slice(0, pinned + 1), epsilon).slice(0, -1).concat(simplify(points.slice(pinned), epsilon));
  }
  if (far <= epsilon) return [points[0], points[points.length - 1]];
  return simplify(points.slice(0, index + 1), epsilon).slice(0, -1).concat(simplify(points.slice(index), epsilon));
}

function chamfer(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const point = points[i];
    const next = points[i + 1];
    const abx = point.x - prev.x;
    const abz = point.z - prev.z;
    const bcx = next.x - point.x;
    const bcz = next.z - point.z;
    const lab = Math.hypot(abx, abz);
    const lbc = Math.hypot(bcx, bcz);
    const dot = lab > 0 && lbc > 0 ? (abx * bcx + abz * bcz) / (lab * lbc) : 1;
    const axis = (Math.abs(abx) < 0.01 || Math.abs(abz) < 0.01) && (Math.abs(bcx) < 0.01 || Math.abs(bcz) < 0.01);
    if (point.pin || !point.soft || !prev.soft || !next.soft || !axis || dot > 0.2 || lab < 1.4 || lbc < 1.4) {
      out.push(point);
      continue;
    }
    const cut = Math.min(1.15, lab * 0.35, lbc * 0.35);
    out.push({
      x: point.x - (abx / lab) * cut,
      z: point.z - (abz / lab) * cut,
      soft: true,
      pin: false,
    });
    out.push({
      x: point.x + (bcx / lbc) * cut,
      z: point.z + (bcz / lbc) * cut,
      soft: true,
      pin: false,
    });
  }
  out.push(points[points.length - 1]);
  return out;
}

function chainToSegments(chain) {
  const points = [{
    x: chain[0].ax,
    z: chain[0].az,
    pin: true,
    soft: chain[0].soft,
  }];
  for (let i = 0; i < chain.length; i += 1) {
    const edge = chain[i];
    const prev = chain[i - 1];
    const next = chain[i + 1];
    const changes = (prev && prev.soft !== edge.soft) || (next && next.soft !== edge.soft);
    points.push({
      x: edge.bx,
      z: edge.bz,
      pin: i === chain.length - 1 || !edge.soft || changes,
      soft: edge.soft,
      nx: edge.nx,
      nz: edge.nz,
    });
  }
  const simplified = chamfer(simplify(points, EPS));
  const segments = [];
  for (let i = 0; i < simplified.length - 1; i += 1) {
    const a = simplified[i];
    const b = simplified[i + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.02) continue;
    // Land normal from the chain edges this chord replaces.
    let nx = 0;
    let nz = 0;
    let total = 0;
    for (const edge of chain) {
      const midX = (edge.ax + edge.bx) / 2;
      const midZ = (edge.az + edge.bz) / 2;
      if (distToSeg(midX, midZ, a.x, a.z, b.x, b.z) > EPS + 0.35) continue;
      nx += edge.nx;
      nz += edge.nz;
      total += 1;
    }
    if (total === 0) {
      nx = chain[0].nx;
      nz = chain[0].nz;
    }
    const len = Math.hypot(nx, nz) || 1;
    segments.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      nx: nx / len,
      nz: nz / len,
      soft: Boolean(a.soft && b.soft),
    });
  }
  return segments;
}

function walkGap(at, x, z, dx, dz, cols, rows) {
  let i = 1;
  while (i <= 4) {
    const xx = x + dx * i;
    const zz = z + dz * i;
    if (xx < 0 || zz < 0 || xx >= cols || zz >= rows) return 0;
    const cell = at(xx, zz);
    if (cell === "~") return i;
    if (!ROAD.has(cell)) return 0;
    i += 1;
  }
  return 0;
}

function findDeck(at, cols, rows) {
  const horizontal = [];
  const vertical = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!ROAD.has(at(x, z))) continue;
      const north = walkGap(at, x, z, 0, -1, cols, rows);
      const south = walkGap(at, x, z, 0, 1, cols, rows);
      const west = walkGap(at, x, z, -1, 0, cols, rows);
      const east = walkGap(at, x, z, 1, 0, cols, rows);
      if (north && south) horizontal.push({ x, z });
      else if (west && east) vertical.push({ x, z });
    }
  }
  return { horizontal, vertical };
}

export function buildQuayPlan(map) {
  const { cols, rows, ground } = map;
  const at = (x, z) => {
    if (z < 0 || x < 0 || z >= rows || x >= cols) return "~";
    return ground[z][x];
  };
  const { horizontal, vertical } = findDeck(at, cols, rows);
  const edges = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      if (cell === "~") continue;
      for (const dir of Object.keys(DIRS)) {
        const step = DIRS[dir];
        if (at(x + step.dx, z + step.dz) !== "~") continue;
        const alongBridge = ROAD.has(cell) && (
          ((dir === "n" || dir === "s") && horizontal.some((item) => Math.abs(item.z - z) <= 1 && Math.abs(item.x - x) <= 3))
          || ((dir === "w" || dir === "e") && vertical.some((item) => Math.abs(item.x - x) <= 1 && Math.abs(item.z - z) <= 3))
        );
        if (alongBridge) continue;
        edges.push(makeEdge(x, z, dir, cell));
      }
    }
  }
  const chains = linkChains(edges);
  const segments = [];
  for (const chain of chains) segments.push(...chainToSegments(chain));

  const under = [];
  const pointsOf = (zLine, xMin, xMax) => {
    const found = [];
    for (const segment of segments) {
      for (const point of [[segment.ax, segment.az], [segment.bx, segment.bz]]) {
        if (Math.abs(point[1] - zLine) < 0.08 && point[0] >= xMin && point[0] <= xMax) found.push(point);
      }
    }
    return found;
  };
  const joinBanks = (north, south, landX) => {
    if (north.length === 0 || south.length === 0) return;
    north.sort((a, b) => a[0] - b[0]);
    south.sort((a, b) => a[0] - b[0]);
    const a = landX < 0 ? north[0] : north[north.length - 1];
    const b = landX < 0 ? south[0] : south[south.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) return;
    under.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], nx: landX, nz: 0, soft: false });
  };
  const byRow = new Map();
  for (const cell of horizontal) {
    if (!byRow.has(cell.z)) byRow.set(cell.z, []);
    byRow.get(cell.z).push(cell.x);
  }
  const rowKeys = [...byRow.keys()].sort((a, b) => a - b);
  let r = 0;
  while (r < rowKeys.length) {
    let s = r;
    while (s + 1 < rowKeys.length && rowKeys[s + 1] <= rowKeys[s] + 1) s += 1;
    const rowsIn = rowKeys.slice(r, s + 1);
    const xs = rowsIn.flatMap((z) => byRow.get(z));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const zTop = rowsIn[0];
    const zBot = rowsIn[rowsIn.length - 1] + 1;
    joinBanks(pointsOf(zTop, x0 - 4, x0 + 1), pointsOf(zBot, x0 - 4, x0 + 1), -1);
    joinBanks(pointsOf(zTop, x1, x1 + 5), pointsOf(zBot, x1, x1 + 5), 1);
    for (const z of rowsIn) {
      for (const x of byRow.get(z)) under.push({ water: true, x, z });
    }
    r = s + 1;
  }
  const byCol = new Map();
  for (const cell of vertical) {
    if (!byCol.has(cell.x)) byCol.set(cell.x, []);
    byCol.get(cell.x).push(cell.z);
  }
  const colKeys = [...byCol.keys()].sort((a, b) => a - b);
  let c = 0;
  while (c < colKeys.length) {
    let s = c;
    while (s + 1 < colKeys.length && colKeys[s + 1] <= colKeys[s] + 1) s += 1;
    const colsIn = colKeys.slice(c, s + 1);
    const zs = colsIn.flatMap((x) => byCol.get(x));
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const xWest = colsIn[0];
    const xEast = colsIn[colsIn.length - 1] + 1;
    const onX = (xLine, zMin, zMax) => {
      const found = [];
      for (const segment of segments) {
        for (const point of [[segment.ax, segment.az], [segment.bx, segment.bz]]) {
          if (Math.abs(point[0] - xLine) < 0.08 && point[1] >= zMin && point[1] <= zMax) found.push(point);
        }
      }
      return found;
    };
    const northPts = onX(xWest, z0 - 4, z0 + 1).concat(onX(xEast, z0 - 4, z0 + 1));
    const southPts = onX(xWest, z1, z1 + 5).concat(onX(xEast, z1, z1 + 5));
    if (northPts.length && southPts.length) {
      northPts.sort((a, b) => a[1] - b[1]);
      southPts.sort((a, b) => a[1] - b[1]);
      under.push({ ax: northPts[0][0], az: northPts[0][1], bx: southPts[0][0], bz: southPts[0][1], nx: 0, nz: -1, soft: false });
      under.push({ ax: southPts[southPts.length - 1][0], az: southPts[southPts.length - 1][1], bx: northPts[northPts.length - 1][0], bz: northPts[northPts.length - 1][1], nx: 0, nz: 1, soft: false });
    }
    for (const x of colsIn) {
      for (const z of byCol.get(x)) under.push({ water: true, x, z });
    }
    c = s + 1;
  }

  return {
    segments: segments.concat(under.filter((item) => !item.water)),
    water: under.filter((item) => item.water),
    edges: edges.length,
  };
}
