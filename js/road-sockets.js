// One connection table for every road piece the island uses.
// Measured at turn 0 with mirror off. A module is 4 cells. The model origin
// is the centre of cell (x, z). Sides: E=+X, W=−X, N=−Z, S=+Z.
// g = ground road, h = high deck (0.52). One turn is +90° about Y, so
// E→N→W→S. Mirror flips model X and swaps E with W before the turn.
//
// road-split-2 is the original 1×2 Y. The two wide mouths sit on module
// centres. The single narrow mouth is centred on the shared edge, half a
// module (2 cells) off either row. A road that meets it is placed on that
// half-module line. bridge-water is a 1×2 deck along Z, high at both ends.

export const MODULE = 4;

// Keyed by the side the junction is on. The stop line is the model +X end.
export const STOP_TURN = { E: 0, N: 1, W: 2, S: 3 };

const ROTATE = { E: "N", N: "W", W: "S", S: "E" };
const OPPOSITE = { E: "W", W: "E", N: "S", S: "N" };
const STEP = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };

const ROADS = {
  "road-straight-7.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { E: "g", W: "g" } }],
  },
  "road-straight-stop.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { E: "g", W: "g" } }],
    stopLine: "E",
  },
  "road-bend-3.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { W: "g", S: "g" } }],
  },
  "road-intersection-3.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { E: "g", W: "g", S: "g" } }],
  },
  "road-crossroad-3.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { N: "g", E: "g", S: "g", W: "g" } }],
  },
  "road-slant-high-4.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { W: "g", E: "h" } }],
  },
  "road-bridge-2.glb": {
    cells: [{ dx: 0, dz: 0, sockets: { E: "g", W: "g", N: "h", S: "h" } }],
  },
  "road-split-2.glb": {
    cells: [
      { dx: 0, dz: -0.5, sockets: { W: "g" } },
      { dx: 0, dz: 0.5, sockets: { W: "g" } },
      // Narrow mouth. It occupies no module; it only meets a road whose centre
      // is on the half-module line between the two wide rows.
      { dx: 0, dz: 0, sockets: { E: "g" } },
    ],
    lines: [
      [[-0.5, -0.5], [0, -0.2], [0.5, 0]],
      [[-0.5, 0.5], [0, 0.2], [0.5, 0]],
    ],
  },
  "bridge-water.glb": {
    cells: [
      { dx: 0, dz: -0.5, sockets: { N: "h" } },
      { dx: 0, dz: 0.5, sockets: { S: "h" } },
    ],
    lines: [[[0, -1], [0, 1]]],
  },
};

function turnOf(turn) {
  return ((turn % 4) + 4) % 4;
}

function rotateDelta(dx, dz, turn) {
  const t = turnOf(turn);
  if (t === 1) return [dz, -dx];
  if (t === 2) return [-dx, -dz];
  if (t === 3) return [-dz, dx];
  return [dx, dz];
}

function mirrorSockets(sockets) {
  const out = {};
  for (const [side, value] of Object.entries(sockets)) {
    const flipped = side === "E" ? "W" : side === "W" ? "E" : side;
    out[flipped] = value;
  }
  return out;
}

function rotateSockets(sockets, turn) {
  let out = sockets;
  for (let i = 0; i < turnOf(turn); i += 1) {
    const next = {};
    for (const [side, value] of Object.entries(out)) next[ROTATE[side]] = value;
    out = next;
  }
  return out;
}

export function roadSpec(file) {
  return ROADS[file] || null;
}

// (gx, gz) is the module where the piece's first cell lands after turn and mirror.
export function placePiece(file, gx, gz, turn = 0, extra = {}) {
  const spec = ROADS[file];
  if (!spec) throw new Error(`No connection for ${file}`);
  const mirror = extra.mirror === true;
  const anchor = spec.cells[0];
  const adx = mirror ? -anchor.dx : anchor.dx;
  const [rdx, rdz] = rotateDelta(adx, anchor.dz, turn);
  const cx = gx - rdx;
  const cz = gz - rdz;
  return {
    kit: "roads",
    file,
    x: MODULE * cx + 2,
    z: MODULE * cz + 2,
    turn: turnOf(turn),
    scale: 1,
    mirror,
    ...extra,
    x: MODULE * cx + 2,
    z: MODULE * cz + 2,
    turn: turnOf(turn),
    mirror,
  };
}

export function pieceCells(piece) {
  const spec = ROADS[piece.file];
  if (!spec) return null;
  const mirror = piece.mirror === true;
  const cx = (piece.x - 2) / MODULE;
  const cz = (piece.z - 2) / MODULE;
  return spec.cells.map((cell) => {
    const dx = mirror ? -cell.dx : cell.dx;
    const [rdx, rdz] = rotateDelta(dx, cell.dz, piece.turn);
    const sockets = rotateSockets(mirror ? mirrorSockets(cell.sockets) : cell.sockets, piece.turn);
    return {
      gx: cx + rdx,
      gz: cz + rdz,
      sockets,
      file: piece.file,
    };
  });
}

export function modelPolylines(file) {
  const spec = ROADS[file];
  if (!spec?.lines) return null;
  return spec.lines.map((line) => line.map(([x, z]) => ({ x, z })));
}

function snapHalf(value) {
  return Math.round(value * 2) / 2;
}

function onHalfGrid(value) {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-6;
}

// Every socket must meet the neighbour's opposite socket. Open ends, mismatches,
// overlaps and off-grid cells are edge errors.
export function checkRoads(pieces) {
  const errors = [];
  const cells = new Map();
  for (const piece of pieces) {
    const covered = pieceCells(piece);
    if (!covered) {
      errors.push({ kind: "unknown", file: piece.file });
      continue;
    }
    for (const cell of covered) {
      if (!onHalfGrid(cell.gx) || !onHalfGrid(cell.gz)) {
        errors.push({ kind: "offgrid", file: piece.file, x: piece.x, z: piece.z, gx: cell.gx, gz: cell.gz });
        continue;
      }
      const gx = snapHalf(cell.gx);
      const gz = snapHalf(cell.gz);
      const key = `${gx},${gz}`;
      if (cells.has(key)) errors.push({ kind: "overlap", file: piece.file, gx, gz, other: cells.get(key).file });
      cells.set(key, { ...cell, gx, gz });
    }
  }
  for (const cell of cells.values()) {
    for (const [side, socket] of Object.entries(cell.sockets)) {
      const [dgx, dgz] = STEP[side];
      const neighbor = cells.get(`${cell.gx + dgx},${cell.gz + dgz}`);
      if (!neighbor) {
        errors.push({ kind: "open", file: cell.file, gx: cell.gx, gz: cell.gz, side, socket });
        continue;
      }
      if (neighbor.sockets[OPPOSITE[side]] !== socket) {
        errors.push({
          kind: "mismatch",
          file: cell.file,
          gx: cell.gx,
          gz: cell.gz,
          side,
          socket,
          other: neighbor.file,
          got: neighbor.sockets[OPPOSITE[side]] || "-",
        });
      }
    }
  }
  return errors;
}
