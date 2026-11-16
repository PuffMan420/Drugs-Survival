// Prefabs: a group of build-mode pieces saved once and stamped many times.
// Pure math and storage format only (no three.js), so tests/prefabs.test.mjs
// runs it in node. build-mode.js owns the clicks, ghost and saving.
//
// Positions are in tiles (one tile is 48 world units), the same x/z build
// mode stores for each piece. A prefab keeps each piece's offset from the
// box's low corner, so a 3 x 2 box has offsets 0..2 by 0..1.

export const PREFAB_STORE_KEY = "drugs-survival-prefabs";
export const PREFAB_FORMAT = 1;

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

// Box from two picked cells, in either order. Inclusive on both ends.
export function boxFrom(a, b) {
  const x0 = Math.min(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const x1 = Math.max(a.x, b.x);
  const z1 = Math.max(a.z, b.z);
  return { x0, z0, x1, z1, w: x1 - x0 + 1, d: z1 - z0 + 1 };
}

// Copy the pieces whose cell lies in the box. Returns null if none.
export function capturePrefab(name, records, box) {
  const pieces = [];
  for (const record of records) {
    const cx = Math.round(record.x);
    const cz = Math.round(record.z);
    if (cx < box.x0 || cx > box.x1 || cz < box.z0 || cz > box.z1) continue;
    const piece = {
      kit: record.kit,
      file: record.file,
      dx: round3(record.x - box.x0),
      dz: round3(record.z - box.z0),
      turn: ((record.turn % 4) + 4) % 4,
      scale: round3(record.scale ?? 1),
      mirror: record.mirror === true,
    };
    if (Number.isFinite(record.yaw)) piece.yaw = round3(record.yaw);
    if (record.oneWay != null) piece.oneWay = record.oneWay;
    pieces.push(piece);
  }
  if (pieces.length === 0) return null;
  return { name: String(name || "Prefab"), w: box.w, d: box.d, pieces };
}

// One quarter turn matches build mode's R (rotation.y += 90°): world
// (x, z) -> (z, -x). Re-anchored so the box keeps its low corner at 0, 0.
export function rotatePiece(piece, w) {
  const out = {
    ...piece,
    dx: round3(piece.dz),
    dz: round3(w - 1 - piece.dx),
    turn: (piece.turn + 1) % 4,
  };
  if (Number.isFinite(piece.yaw)) out.yaw = round3(piece.yaw + Math.PI / 2);
  return out;
}

// The prefab turned by quarters (0..3). Width and depth swap on odd turns.
export function rotatePrefab(prefab, quarters) {
  const q = ((quarters % 4) + 4) % 4;
  let pieces = prefab.pieces;
  let w = prefab.w;
  let d = prefab.d;
  for (let i = 0; i < q; i += 1) {
    const width = w;
    pieces = pieces.map((piece) => rotatePiece(piece, width));
    [w, d] = [d, w];
  }
  return { ...prefab, w, d, pieces };
}

// Low corner so the cursor cell sits in the middle of the (turned) box.
export function anchorFor(cell, w, d) {
  return { x: cell.x - Math.floor((w - 1) / 2), z: cell.z - Math.floor((d - 1) / 2) };
}

// Ordinary piece specs at the anchor, ready for build mode's addPiece.
export function stampSpecs(prefab, quarters, anchor) {
  const turned = rotatePrefab(prefab, quarters);
  return turned.pieces.map((piece) => {
    const spec = {
      kit: piece.kit,
      file: piece.file,
      x: round3(anchor.x + piece.dx),
      z: round3(anchor.z + piece.dz),
      turn: piece.turn,
      scale: piece.scale ?? 1,
      mirror: piece.mirror === true,
    };
    if (Number.isFinite(piece.yaw)) spec.yaw = piece.yaw;
    if (piece.oneWay != null) spec.oneWay = piece.oneWay;
    return spec;
  });
}

// Keep only well-formed prefabs (used for localStorage and imported files).
export function cleanPrefabs(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.prefabs) ? raw.prefabs : [];
  const out = [];
  for (const item of list) {
    if (!item || !Array.isArray(item.pieces)) continue;
    const w = Number(item.w);
    const d = Number(item.d);
    if (!(w >= 1) || !(d >= 1)) continue;
    const pieces = item.pieces.filter((p) => p
      && typeof p.kit === "string"
      && typeof p.file === "string"
      && Number.isFinite(p.dx)
      && Number.isFinite(p.dz)
      && Number.isInteger(p.turn));
    if (pieces.length === 0) continue;
    out.push({ name: String(item.name || "Prefab"), w, d, pieces });
  }
  return out;
}

export function prefabFile(prefabs) {
  return { format: PREFAB_FORMAT, prefabs };
}
