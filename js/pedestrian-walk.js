import { LAND } from "./cells.js";

// Measured on the Kenney meshes at the tile centres a piece covers.
// Rows run from local z -0.5 (north) to +0.5 (south). Columns run west to east.
// S is the raised sidewalk. R is asphalt. C is the zebra on a crossing piece.
// "." is outside that mesh, so the ground tile shows through.
const MASKS = {
  straight: ["SSSSS", "RRRRR", "RRRRR", "RRRRR", "SSSSS"],
  crossing: ["SSSSS", "RRCRR", "RRCRR", "RRCRR", "SSSSS"],
  bend: ["S....", "RRS..", "RRRS.", "RRRR.", "SRRRS"],
  intersection: ["SSSSS", "RRRRR", "RRRRR", "RRRRR", "SRRRS"],
  crossroad: ["SRRRS", "RRRRR", "RRRRR", "RRRRR", "SRRRS"],
  ramp: ["RRRRR", "RRRRR", "RRRRR", "RRRRR", "RRRRR"],
};

const FILES = {
  "road-straight.glb": "straight",
  "road-straight-2.glb": "straight",
  "road-straight-3.glb": "straight",
  "road-straight-4.glb": "straight",
  "road-straight-5.glb": "straight",
  "road-straight-6.glb": "straight",
  "road-straight-7.glb": "straight",
  "road-straight-stop.glb": "straight",
  "road-bend.glb": "bend",
  "road-bend-2.glb": "bend",
  "road-bend-3.glb": "bend",
  "road-intersection.glb": "intersection",
  "road-intersection-2.glb": "intersection",
  "road-intersection-3.glb": "intersection",
  "road-crossroad.glb": "crossroad",
  "road-crossroad-2.glb": "crossroad",
  "road-crossroad-3.glb": "crossroad",
  "road-crossing.glb": "crossing",
  "road-crossing-2.glb": "crossing",
  "road-crossing-3.glb": "crossing",
  "road-slant-high.glb": "ramp",
  "road-slant-high-2.glb": "ramp",
  "road-slant-high-3.glb": "ramp",
  "road-slant-high-4.glb": "ramp",
};

// road-crossing-2 and road-crossing-3 paint the zebra in the same band:
// the middle fifth of the piece, across the lanes. That is the C column.
function kindAt(file, lx, lz) {
  if (file === "bridge-water.glb") {
    if (Math.abs(lx) <= 0.5 && Math.abs(lz) <= 1) return "R";
    return ".";
  }
  const name = FILES[file];
  const mask = name ? MASKS[name] : null;
  if (Math.abs(lx) > 0.51 || Math.abs(lz) > 0.51) return ".";
  if (!mask) {
    // An unlisted road piece is treated as asphalt across its square.
    return Math.abs(lx) <= 0.5 && Math.abs(lz) <= 0.5 ? "R" : ".";
  }
  const ix = Math.round(lx * 4 + 2);
  const iz = Math.round(lz * 4 + 2);
  if (ix < 0 || ix > 4 || iz < 0 || iz > 4) return ".";
  return mask[iz][ix];
}

// Piece placement matches build mode: the model origin sits on the cell
// centre, one module is 4 tiles, and a turn is +90° about Y before the mirror.
function localOf(piece, tx, tz) {
  const scale = piece.scale ?? 1;
  const dx = (tx - piece.x) / (4 * scale);
  const dz = (tz - piece.z) / (4 * scale);
  const turn = ((piece.turn % 4) + 4) % 4;
  let lx;
  let lz;
  if (turn === 0) {
    lx = dx;
    lz = dz;
  } else if (turn === 1) {
    lx = -dz;
    lz = dx;
  } else if (turn === 2) {
    lx = -dx;
    lz = -dz;
  } else {
    lx = dz;
    lz = -dx;
  }
  if (piece.mirror) lx = -lx;
  return { lx, lz };
}

function reachOf(piece) {
  const scale = piece.scale ?? 1;
  const tiles = piece.file === "bridge-water.glb" ? 4 : 2;
  return Math.ceil(tiles * scale);
}

// Land tiles, minus asphalt. A crossing piece keeps its zebra walkable.
export function walkableCells(map, pieces = []) {
  const { cols, rows, ground } = map;
  const blocked = new Set();
  const crossing = new Set();
  const key = (x, z) => x + z * cols;
  for (const piece of pieces) {
    if (!piece || !Number.isFinite(piece.x) || !Number.isFinite(piece.z)) continue;
    const reach = reachOf(piece);
    const x0 = Math.round(piece.x);
    const z0 = Math.round(piece.z);
    for (let dz = -reach; dz <= reach; dz += 1) {
      const z = z0 + dz;
      if (z < 0 || z >= rows) continue;
      for (let dx = -reach; dx <= reach; dx += 1) {
        const x = x0 + dx;
        if (x < 0 || x >= cols) continue;
        const { lx, lz } = localOf(piece, x, z);
        const kind = kindAt(piece.file, lx, lz);
        if (kind === "C") crossing.add(key(x, z));
        else if (kind === "R") blocked.add(key(x, z));
      }
    }
  }
  const list = [];
  for (let z = 0; z < rows; z += 1) {
    const row = ground[z];
    for (let x = 0; x < cols; x += 1) {
      if (!LAND.has(row[x])) continue;
      const id = key(x, z);
      if (blocked.has(id) && !crossing.has(id)) continue;
      list.push([x, z]);
    }
  }
  return list;
}
