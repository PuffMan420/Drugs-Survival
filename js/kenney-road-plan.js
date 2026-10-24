// Which west-of-canal road tiles use a Kenney City Kit Roads piece.
// The river polyline matches tools/generate-map.mjs. A tile is west when its
// center sits on the west bank, clear of the channel.

const H_SEED = new Set(["H", "h", "1", "2", "4"]);
const V_SEED = new Set(["V", "v", "5", "6", "8"]);
const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"]);

const RIVER = [
  [78, 0],
  [92, 34],
  [60, 76],
  [86, 116],
  [54, 154],
  [98, 188],
  [136, 216],
];
// Water reaches about 3.3 tiles from the center, plus a little shore noise.
const BANK = 4.6;

const DIRS = [
  ["N", 0, -1],
  ["E", 1, 0],
  ["S", 0, 1],
  ["W", -1, 0],
];

function riverX(z) {
  if (z <= RIVER[0][1]) return RIVER[0][0];
  const last = RIVER[RIVER.length - 1];
  if (z >= last[1]) return last[0];
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    const [x0, z0] = RIVER[i];
    const [x1, z1] = RIVER[i + 1];
    if (z < z0 || z > z1) continue;
    const t = (z - z0) / (z1 - z0 || 1);
    return x0 + (x1 - x0) * t;
  }
  return last[0];
}

export function westOfCanal(x, z) {
  return x + 0.5 < riverX(z) - BANK;
}

function axisAt(at, x, z) {
  const cell = at(x, z);
  if (H_SEED.has(cell)) return "H";
  if (V_SEED.has(cell)) return "V";
  let seenH = false;
  let seenV = false;
  for (let dist = 1; dist <= 3; dist += 1) {
    for (const [, dx, dz] of DIRS) {
      let blocked = false;
      for (let step = 1; step < dist; step += 1) {
        if (!ROAD.has(at(x + dx * step, z + dz * step))) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const next = at(x + dx * dist, z + dz * dist);
      if (H_SEED.has(next)) seenH = true;
      if (V_SEED.has(next)) seenV = true;
    }
    if (seenH || seenV) break;
  }
  if (seenH && seenV) return "B";
  if (seenH) return "H";
  if (seenV) return "V";
  return "?";
}

function linked(at, x, z, dx, dz) {
  const nx = x + dx;
  const nz = z + dz;
  if (!ROAD.has(at(nx, nz))) return false;
  const axis = axisAt(at, x, z);
  const neighbor = axisAt(at, nx, nz);
  const along = dz === 0;
  if (axis === "H") return along || neighbor === "V" || neighbor === "B";
  if (axis === "V") return !along || neighbor === "H" || neighbor === "B";
  return true;
}

function maskAt(at, x, z) {
  let mask = "";
  for (const [name, dx, dz] of DIRS) {
    if (linked(at, x, z, dx, dz)) mask += name;
  }
  return mask;
}

// road-straight opens east and west. road-bend-square opens west and south.
// road-intersection opens east, west, and south. Quarter turns are CCW from above.
function classify(mask) {
  if (mask === "NESW") return { piece: "cross", turn: 0 };
  if (mask.length === 3) {
    const turn = { ESW: 0, NES: 1, NEW: 2, NSW: 3 }[mask];
    return { piece: "tee", turn: turn ?? 0 };
  }
  if (mask === "EW" || mask === "E" || mask === "W" || mask === "") {
    return { piece: "straight", turn: 0 };
  }
  if (mask === "NS" || mask === "N" || mask === "S") {
    return { piece: "straight", turn: 1 };
  }
  const turn = { SW: 0, ES: 1, NE: 2, NW: 3 }[mask];
  return { piece: "corner", turn: turn ?? 0 };
}

export function planKenneyRoads(map) {
  const { cols, rows, ground } = map;
  const piece = new Array(cols * rows);
  const turn = new Uint8Array(cols * rows);
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };
  let count = 0;
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!ROAD.has(at(x, z)) || !westOfCanal(x, z)) continue;
      const choice = classify(maskAt(at, x, z));
      const index = z * cols + x;
      piece[index] = choice.piece;
      turn[index] = choice.turn;
      count += 1;
    }
  }
  return {
    count,
    covers(x, z) {
      if (x < 0 || z < 0 || x >= cols || z >= rows) return false;
      return piece[z * cols + x] != null;
    },
    cell(x, z) {
      if (x < 0 || z < 0 || x >= cols || z >= rows) return null;
      const name = piece[z * cols + x];
      if (!name) return null;
      return { piece: name, turn: turn[z * cols + x] };
    },
  };
}
