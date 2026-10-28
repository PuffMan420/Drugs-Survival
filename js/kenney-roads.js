// Identity for one placed Kenney road. Build mode saves and reloads these
// records. The island does not build the old west-bank road meshes.

const ROAD_PIECES = new Set(["straight", "corner", "tee", "cross"]);

function roundTile(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(3));
}

// Identity for one west-bank piece. x and z are tile centers, rounded so a
// saved removal still matches the plan the next time the page loads.
export function roadRecord(item) {
  if (!item || !ROAD_PIECES.has(item.piece)) return null;
  const turn = Number(item.turn);
  if (!Number.isInteger(turn)) return null;
  const x = roundTile(item.x);
  const z = roundTile(item.z);
  if (x == null || z == null) return null;
  return { piece: item.piece, turn: ((turn % 4) + 4) % 4, x, z };
}

export function roadKey(item) {
  const record = roadRecord(item);
  if (!record) return null;
  return `${record.piece}:${record.turn}:${record.x}:${record.z}`;
}

// Build mode reads and writes this shape. removedRoads stays in the file
// even though the island has no old west-bank road meshes to click.
export function layoutFrom(data) {
  return {
    pieces: Array.isArray(data?.pieces) ? data.pieces : [],
    removedRoads: Array.isArray(data?.removedRoads) ? data.removedRoads : [],
  };
}
