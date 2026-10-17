// Road paint and sidewalk mix for the fixed downtown. Tile codes stay as they are.
// H/V/h/v/A/E/a/e are the center of a road. + and X are the extra lanes, and also
// the cell where two different roads meet.

export const ROAD_COLS = 8;
export const ROAD_ROWS = 3;
export const WALK_COLS = 3;
export const WALK_ROWS = 2;

export const PAT = {
  ASPHALT: 0,
  DASH_H: 1,
  DASH_V: 2,
  DASH_A: 3,
  DASH_E: 4,
  ZEBRA_H: 5,
  ZEBRA_V: 6,
  ZEBRA_A: 7,
  ZEBRA_E: 8,
  SLOW_H: 9,
  SLOW_V: 10,
  ARROW_E: 11,
  ARROW_W: 12,
  ARROW_N: 13,
  ARROW_S: 14,
  TURN_E_L: 15,
  TURN_E_R: 16,
  TURN_W_L: 17,
  TURN_W_R: 18,
  TURN_N_L: 19,
  TURN_N_R: 20,
  TURN_S_L: 21,
  TURN_S_R: 22,
};

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

function dashFor(cell) {
  if (CENTER_H.has(cell)) return PAT.DASH_H;
  if (CENTER_V.has(cell)) return PAT.DASH_V;
  if (CENTER_A.has(cell)) return PAT.DASH_A;
  if (CENTER_E.has(cell)) return PAT.DASH_E;
  return PAT.ASPHALT;
}

function straightArrow(tdx, tdz) {
  if (tdx > 0 && tdz === 0) return PAT.ARROW_E;
  if (tdx < 0 && tdz === 0) return PAT.ARROW_W;
  if (tdx === 0 && tdz < 0) return PAT.ARROW_N;
  if (tdx === 0 && tdz > 0) return PAT.ARROW_S;
  return -1;
}

function turnArrow(tdx, tdz, left) {
  if (tdx > 0 && tdz === 0) return left ? PAT.TURN_E_L : PAT.TURN_E_R;
  if (tdx < 0 && tdz === 0) return left ? PAT.TURN_W_L : PAT.TURN_W_R;
  if (tdx === 0 && tdz < 0) return left ? PAT.TURN_N_L : PAT.TURN_N_R;
  if (tdx === 0 && tdz > 0) return left ? PAT.TURN_S_L : PAT.TURN_S_R;
  return -1;
}

export function classifyMarkings(map) {
  const { cols, rows, ground } = map;
  const n = cols * rows;
  const pattern = new Int16Array(n);
  pattern.fill(-1);
  const priority = new Uint8Array(n);
  const walk = new Int8Array(n);
  walk.fill(-1);

  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };

  const paint = (x, z, pat, pri) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return;
    if (!isRoad(at(x, z))) return;
    const i = z * cols + x;
    if (pri < priority[i]) return;
    pattern[i] = pat;
    priority[i] = pri;
  };

  const water = new Uint16Array(n);
  water.fill(65535);
  const qx = [];
  const qz = [];
  for (let z = 0; z < rows; z += 1) {
    const row = ground[z];
    for (let x = 0; x < cols; x += 1) {
      const cell = row[x];
      if (isRoad(cell)) {
        pattern[z * cols + x] = dashFor(cell);
        priority[z * cols + x] = 1;
      }
      if (cell === "~" || cell === "d") {
        water[z * cols + x] = 0;
        qx.push(x);
        qz.push(z);
      }
    }
  }

  for (let head = 0; head < qx.length; head += 1) {
    const x = qx[head];
    const z = qz[head];
    const base = water[z * cols + x];
    if (base >= 28) continue;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + DIRS[d][0];
      const nz = z + DIRS[d][1];
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const ni = nz * cols + nx;
      if (water[ni] <= base + 1) continue;
      water[ni] = base + 1;
      qx.push(nx);
      qz.push(nz);
    }
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (ground[z][x] !== "s") continue;
      const north = isRoad(at(x, z - 1));
      const south = isRoad(at(x, z + 1));
      const west = isRoad(at(x - 1, z));
      const east = isRoad(at(x + 1, z));
      let corner = 0;
      if (north && east && !south && !west) corner = 2;
      else if (north && west && !south && !east) corner = 3;
      else if (south && east && !north && !west) corner = 4;
      else if (south && west && !north && !east) corner = 5;
      walk[z * cols + x] = corner;
    }
  }

  function family(cell) {
    if (CENTER_H.has(cell)) return "h";
    if (CENTER_V.has(cell)) return "v";
    if (CENTER_A.has(cell)) return "a";
    if (CENTER_E.has(cell)) return "e";
    return "";
  }

  function alongDirs(cell) {
    if (CENTER_H.has(cell)) return [[1, 0], [-1, 0]];
    if (CENTER_V.has(cell)) return [[0, 1], [0, -1]];
    if (CENTER_A.has(cell)) return [[1, -1], [-1, 1]];
    return [[1, 1], [-1, -1]];
  }

  function perpOf(cell) {
    if (CENTER_H.has(cell)) return [0, 1];
    if (CENTER_V.has(cell)) return [1, 0];
    if (CENTER_A.has(cell)) return [1, 1];
    return [1, -1];
  }

  function zebraForCell(cell) {
    if (CENTER_H.has(cell)) return PAT.ZEBRA_H;
    if (CENTER_V.has(cell)) return PAT.ZEBRA_V;
    if (CENTER_A.has(cell)) return PAT.ZEBRA_A;
    return PAT.ZEBRA_E;
  }

  function bandWidth(x, z, px, pz) {
    if (!isRoad(at(x, z))) return 0;
    let count = 1;
    for (const sign of [-1, 1]) {
      for (let step = 1; step < 8; step += 1) {
        if (!isRoad(at(x + px * sign * step, z + pz * sign * step))) break;
        count += 1;
      }
    }
    return count;
  }

  function bandTiles(x, z, px, pz) {
    const tiles = [[x, z]];
    for (const sign of [-1, 1]) {
      for (let step = 1; step < 8; step += 1) {
        const nx = x + px * sign * step;
        const nz = z + pz * sign * step;
        if (!isRoad(at(nx, nz))) break;
        tiles.push([nx, nz]);
      }
    }
    return tiles;
  }

  function sameAhead(x, z, dx, dz, kind) {
    for (let step = 1; step <= 4; step += 1) {
      const next = at(x + dx * step, z + dz * step);
      if (family(next) === kind) return true;
      if (!isRoad(next)) return false;
    }
    return false;
  }

  function nearestOther(x, z, kind) {
    let best = null;
    for (let dz = -4; dz <= 4; dz += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const next = at(x + dx, z + dz);
        const kindNext = family(next);
        if (!kindNext || kindNext === kind) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        if (!best || dist < best.dist) best = { x: x + dx, z: z + dz, cell: next, dist };
      }
    }
    return best;
  }

  function paintBand(x, z, cell) {
    const [px, pz] = perpOf(cell);
    if (bandWidth(x, z, px, pz) > 6) return;
    for (const [tx, tz] of bandTiles(x, z, px, pz)) paint(tx, tz, zebraForCell(cell), 4);
  }

  let approaches = 0;
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      const kind = family(cell);
      if (!kind) continue;
      for (const [dx, dz] of alongDirs(cell)) {
        const nx = x + dx;
        const nz = z + dz;
        const next = at(nx, nz);
        if (family(next) === kind || !isRoad(next)) continue;
        const other = nearestOther(nx, nz, kind);
        if (sameAhead(x, z, dx, dz, kind) && !other) continue;
        approaches += 1;
        paintBand(x, z, cell);
        if (other && other.dist <= 4) paintBand(other.x, other.z, other.cell);

        const [lx, lz] = [dz, -dx];
        const arrow = straightArrow(dx, dz);
        const left = turnArrow(dx, dz, true);
        const right = turnArrow(dx, dz, false);
        const word = CENTER_V.has(cell) ? PAT.SLOW_V : PAT.SLOW_H;
        const back = (step) => {
          const bx = x - dx * step;
          const bz = z - dz * step;
          return family(at(bx, bz)) === kind ? [bx, bz] : null;
        };
        const arrowTile = back(2);
        if (arrowTile && arrow >= 0) {
          paint(arrowTile[0], arrowTile[1], arrow, 3);
          if (left >= 0) paint(arrowTile[0] + lx, arrowTile[1] + lz, left, 3);
          if (right >= 0) paint(arrowTile[0] - lx, arrowTile[1] - lz, right, 3);
        }
        const wordTile = back(4);
        if (wordTile) paint(wordTile[0], wordTile[1], word, 2);
        break;
      }
    }
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      if (!isCenter(cell)) continue;
      const i = z * cols + x;
      if (priority[i] > 1) continue;
      if (tileHash(x, z) % 41 !== 7) continue;
      const dx = CENTER_V.has(cell) ? 0 : CENTER_H.has(cell) ? 1 : 1;
      const dz = CENTER_V.has(cell) ? 1 : CENTER_A.has(cell) ? -1 : CENTER_E.has(cell) ? 1 : 0;
      let clear = true;
      for (let step = -2; step <= 2; step += 1) {
        if (step === 0) continue;
        const next = at(x + dx * step, z + dz * step);
        if (!isCenter(next) || dashFor(next) !== dashFor(cell)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const word = CENTER_V.has(cell) ? PAT.SLOW_V : PAT.SLOW_H;
      paint(x, z, word, 2);
    }
  }

  return { pattern, walk, cores: approaches };
}
