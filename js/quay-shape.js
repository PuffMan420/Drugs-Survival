// Waterfront outline for the concrete quay. Banks become straight runs and 45° runs
// so the corner sheets can close every bend. Bridge decks cover the whole channel,
// and the quay stops at each abutment.

const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8", "A", "E", "a", "e"]);
const SOFT = new Set(["s", "c", "g", "q", "l", "p"]);

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

// A 45° stair sits 0.71 off the run. A square corner steps a full tile off it,
// so the run must stop there and leave the bend to a corner sheet.
const FIT_TOL = 0.8;

const OCT = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function unitOct(oct) {
  const len = Math.hypot(oct[0], oct[1]);
  return [oct[0] / len, oct[1] / len];
}

const OCT_UNIT = OCT.map(unitOct);

function chainPoints(chain) {
  const points = [{
    x: chain[0].ax,
    z: chain[0].az,
    soft: chain[0].soft,
    dock: chain[0].cell === "d",
    nx: chain[0].nx,
    nz: chain[0].nz,
  }];
  for (const edge of chain) {
    points.push({
      x: edge.bx,
      z: edge.bz,
      soft: edge.soft,
      dock: edge.cell === "d",
      nx: edge.nx,
      nz: edge.nz,
    });
  }
  return points;
}

function sameKind(a, b) {
  return a.soft === b.soft && a.dock === b.dock;
}

// Follow the tile bank with only straight and 45° runs, staying within FIT_TOL.
function octoPoints(points) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    const origin = out[out.length - 1];
    let bestJ = i;
    let bestDir = null;
    let bestAlong = 0;
    for (const [ux, uz] of OCT_UNIT) {
      let j = i;
      let along = 0;
      while (j + 1 < points.length) {
        const next = points[j + 1];
        if (!sameKind(points[i + 1], next)) break;
        const dx = next.x - origin.x;
        const dz = next.z - origin.z;
        const proj = dx * ux + dz * uz;
        const off = Math.hypot(dx - ux * proj, dz - uz * proj);
        if (proj < along - 0.05 || off > FIT_TOL) break;
        j += 1;
        along = proj;
      }
      if (j > bestJ || (j === bestJ && along > bestAlong + 0.01)) {
        bestJ = j;
        bestDir = [ux, uz];
        bestAlong = along;
      }
    }
    if (!bestDir || bestAlong < 0.2) {
      const next = points[Math.min(i + 1, points.length - 1)];
      out.push(next);
      i = Math.min(i + 1, points.length - 1);
      if (i >= points.length - 1) break;
      continue;
    }
    out.push({
      x: origin.x + bestDir[0] * bestAlong,
      z: origin.z + bestDir[1] * bestAlong,
      soft: points[i + 1].soft,
      dock: points[i + 1].dock,
      from: i,
      to: bestJ,
    });
    i = bestJ;
  }
  return out;
}

function landNormal(ux, uz, nx, nz) {
  const px = -uz;
  const pz = ux;
  return nx * px + nz * pz >= 0 ? [px, pz] : [-px, -pz];
}

function chainToSegments(chain) {
  const points = chainPoints(chain);
  const fitted = octoPoints(points);
  const segments = [];
  for (let i = 0; i < fitted.length - 1; i += 1) {
    const a = fitted[i];
    const b = fitted[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const from = a.to ?? 0;
    const to = b.to ?? (b.from != null ? b.from : points.length - 1);
    let nx = 0;
    let nz = 0;
    const start = Math.max(1, Math.min(from, to) + 1);
    const end = Math.max(start, Math.max(from, to));
    for (let p = start; p <= end && p < points.length; p += 1) {
      nx += points[p].nx;
      nz += points[p].nz;
    }
    if (nx === 0 && nz === 0) {
      nx = points[Math.min(end, points.length - 1)].nx;
      nz = points[Math.min(end, points.length - 1)].nz;
    }
    const [lnx, lnz] = landNormal(dx / len, dz / len, nx, nz);
    segments.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      nx: lnx,
      nz: lnz,
      soft: Boolean(b.soft) && !b.dock,
      dock: Boolean(b.dock),
    });
  }
  return mergeRuns(segments);
}

function mergeRuns(segments) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...seg });
      continue;
    }
    const joined = Math.hypot(prev.bx - seg.ax, prev.bz - seg.az) < 0.08;
    const pdx = prev.bx - prev.ax;
    const pdz = prev.bz - prev.az;
    const sdx = seg.bx - seg.ax;
    const sdz = seg.bz - seg.az;
    const pl = Math.hypot(pdx, pdz) || 1;
    const sl = Math.hypot(sdx, sdz) || 1;
    const dot = (pdx / pl) * (sdx / sl) + (pdz / pl) * (sdz / sl);
    const sameSide = prev.nx * seg.nx + prev.nz * seg.nz > 0.9;
    if (joined && dot > 0.98 && sameSide && prev.soft === seg.soft && prev.dock === seg.dock) {
      prev.bx = seg.bx;
      prev.bz = seg.bz;
      continue;
    }
    out.push({ ...seg });
  }
  return out;
}



const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The three painted bridges. The span is measured from the channel; these seeds
// only pick which crossing gets which deck.
const BRIDGE_SEEDS = [
  { style: "Stone", axis: "x", x: 62, z: 78 },
  { style: "Steel", axis: "x", x: 76, z: 128 },
  { style: "Plain", axis: "z", x: 80, z: 175 },
];

function cellAt(ground, cols, rows, x, z) {
  if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
  return ground[z][x];
}

function writeCell(ground, x, z, code) {
  const row = ground[z];
  ground[z] = row.slice(0, x) + code + row.slice(x + 1);
}

// The pier whose end sits in the steel bridge channel is cleared so the deck
// can cross open water. Other piers stay.
function removeSteelPier(map) {
  const { cols, rows, ground } = map;
  const at = (x, z) => cellAt(ground, cols, rows, x, z);
  const seed = BRIDGE_SEEDS[1];
  const docks = [];
  for (let z = seed.z - 3; z <= seed.z + 3; z += 1) {
    for (let x = seed.x - 16; x <= seed.x + 16; x += 1) {
      if (!ROAD.has(at(x, z))) continue;
      for (const [dx, dz] of N4) {
        if (at(x + dx, z + dz) === "d") docks.push([x + dx, z + dz]);
      }
    }
  }
  const seen = new Set();
  const queue = docks.slice();
  const cleared = [];
  while (queue.length > 0) {
    const [x, z] = queue.pop();
    const id = `${x},${z}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (at(x, z) !== "d") continue;
    cleared.push([x, z]);
    for (const [dx, dz] of N4) queue.push([x + dx, z + dz]);
  }
  for (const [x, z] of cleared) writeCell(ground, x, z, "~");
  return cleared.length;
}

function measureBridge(at, cols, rows, seed) {
  if (seed.axis === "x") {
    let z0 = seed.z;
    while (z0 > 0 && ROAD.has(at(seed.x, z0 - 1))) z0 -= 1;
    let z1 = seed.z + 1;
    while (z1 < rows && ROAD.has(at(seed.x, z1))) z1 += 1;
    const wet = (x) => {
      if (x < 0 || x >= cols) return false;
      for (let z = z0; z < z1; z += 1) {
        if (!ROAD.has(at(x, z))) return false;
      }
      return at(x, z0 - 1) === "~" || at(x, z1) === "~";
    };
    let x0 = seed.x;
    while (wet(x0 - 1)) x0 -= 1;
    let x1 = seed.x;
    while (wet(x1)) x1 += 1;
    return { style: seed.style, axis: seed.axis, x0, x1, z0, z1 };
  }
  let x0 = seed.x;
  while (x0 > 0 && ROAD.has(at(x0 - 1, seed.z))) x0 -= 1;
  let x1 = seed.x + 1;
  while (x1 < cols && ROAD.has(at(x1, seed.z))) x1 += 1;
  const wet = (z) => {
    if (z < 0 || z >= rows) return false;
    for (let x = x0; x < x1; x += 1) {
      if (!ROAD.has(at(x, z))) return false;
    }
    return at(x0 - 1, z) === "~" || at(x1, z) === "~";
  };
  let z0 = seed.z;
  while (wet(z0 - 1)) z0 -= 1;
  let z1 = seed.z;
  while (wet(z1)) z1 += 1;
  return { style: seed.style, axis: seed.axis, x0, x1, z0, z1 };
}

function bridgeCoversEdge(bridge, x, z, dir) {
  if (bridge.axis === "x") {
    if (dir !== "n" && dir !== "s") return false;
    return x >= bridge.x0 && x < bridge.x1 && z >= bridge.z0 && z < bridge.z1;
  }
  if (dir !== "e" && dir !== "w") return false;
  return x >= bridge.x0 && x < bridge.x1 && z >= bridge.z0 && z < bridge.z1;
}

function mouthWalls(bridge) {
  if (bridge.axis === "x") {
    return [
      { ax: bridge.x0, az: bridge.z0, bx: bridge.x0, bz: bridge.z1, nx: -1, nz: 0, soft: false, dock: false },
      { ax: bridge.x1, az: bridge.z1, bx: bridge.x1, bz: bridge.z0, nx: 1, nz: 0, soft: false, dock: false },
    ];
  }
  return [
    { ax: bridge.x0, az: bridge.z0, bx: bridge.x1, bz: bridge.z0, nx: 0, nz: -1, soft: false, dock: false },
    { ax: bridge.x1, az: bridge.z1, bx: bridge.x0, bz: bridge.z1, nx: 0, nz: 1, soft: false, dock: false },
  ];
}

export function buildQuayPlan(map) {
  const cleared = removeSteelPier(map);
  const { cols, rows, ground } = map;
  const at = (x, z) => cellAt(ground, cols, rows, x, z);
  const bridges = BRIDGE_SEEDS.map((seed) => measureBridge(at, cols, rows, seed));
  const edges = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      if (cell === "~") continue;
      for (const dir of Object.keys(DIRS)) {
        const step = DIRS[dir];
        if (at(x + step.dx, z + step.dz) !== "~") continue;
        const onDeck = ROAD.has(cell) && bridges.some((bridge) => bridgeCoversEdge(bridge, x, z, dir));
        if (onDeck) continue;
        edges.push(makeEdge(x, z, dir, cell));
      }
    }
  }
  const chains = linkChains(edges);
  const segments = [];
  for (const chain of chains) segments.push(...chainToSegments(chain));
  const under = [];
  const water = [];
  for (const bridge of bridges) {
    under.push(...mouthWalls(bridge));
    for (let z = bridge.z0; z < bridge.z1; z += 1) {
      for (let x = bridge.x0; x < bridge.x1; x += 1) water.push({ x, z });
    }
  }
  const roads = new Set();
  for (let z = 0; z < rows; z += 1) {
    const row = ground[z];
    for (let x = 0; x < cols; x += 1) {
      if (ROAD.has(row[x])) roads.add(x + z * 1024);
    }
  }
  return {
    segments: segments.concat(under),
    water,
    edges: edges.length,
    bridges,
    clearedPiers: cleared,
    roads,
  };
}
