// Visual Y for city lots, yard stamps, and roads. Physics, sidewalk feet,
// car tires, and building shells still use ROAD_Y as the piece origin.
import { TILE } from "./constants.js";
import { groundSnapOffset } from "./ground-scale.js";

const UNIT = 4 * TILE;
export const ROAD_Y = 0.2;
// 24-bit depth precision at fog distance (6000-8000) is about 0.21-0.38.
// Keep this gap between city lots, yard stamps, and the underside of roads.
export const SURFACE_GAP = 0.5;
export const CITY_Y = ROAD_Y - SURFACE_GAP * 2;
export const GROUND_PIECE_Y = ROAD_Y - SURFACE_GAP;
// Extra overlapping yard stamps step up toward the road, still under ROAD_Y.
export const GROUND_STACK_STEP = 0.12;
const OVERLAP_AREA = 0.05;

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

export function isGroundRecord(record) {
  return Boolean(record && record.kit === "ground");
}

// Saved yard stamps often omit unit. Catalog unit is one tile; roads default
// to a 4-tile module. This matches addPiece + pieceMatrix after load.
function sizeInTiles(record) {
  const scale = record.scale > 0 ? record.scale : 1;
  if (isGroundRecord(record)) {
    const unit = record.unit > 0 ? record.unit : TILE;
    return (unit / TILE) * scale;
  }
  const unit = record.unit > 0 ? record.unit : UNIT;
  return (unit / TILE) * scale;
}

function footprint(record) {
  const half = sizeInTiles(record) / 2;
  const snap = isGroundRecord(record) ? groundSnapOffset(record.scale ?? 1) : 0;
  const x = Number(record.x) + 0.5 + snap;
  const z = Number(record.z) + 0.5 + snap;
  return { x0: x - half, z0: z - half, x1: x + half, z1: z + half };
}

export function groundsOverlap(a, b) {
  const left = footprint(a);
  const right = footprint(b);
  const ox = Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0);
  const oz = Math.min(left.z1, right.z1) - Math.max(left.z0, right.z0);
  return ox > 0 && oz > 0 && ox * oz > OVERLAP_AREA;
}

export function groundKey(record) {
  const yaw = Number.isFinite(Number(record?.yaw)) ? round3(record.yaw) : "";
  return [
    record.kit || "",
    record.file || "",
    round3(record.x),
    round3(record.z),
    round3(record.scale ?? 1),
    Number.isInteger(record.turn) ? record.turn : 0,
    record.mirror === true ? 1 : 0,
    yaw,
  ].join("|");
}

function compareGround(a, b) {
  const left = a.record;
  const right = b.record;
  return (left.z - right.z) || (left.x - right.x)
    || String(left.file).localeCompare(String(right.file))
    || ((left.scale ?? 1) - (right.scale ?? 1))
    || ((left.turn ?? 0) - (right.turn ?? 0))
    || ((left.mirror === true ? 1 : 0) - (right.mirror === true ? 1 : 0))
    || (a.index - b.index);
}

// Layer 0 is the base yard height. Exact duplicates get -1 and are not drawn.
// Overlapping stamps of different files get the next free layer, in a stable order.
export function assignGroundLayers(records) {
  const layers = new Map();
  const grounds = [];
  const seen = new Set();
  (records || []).forEach((record, index) => {
    if (!isGroundRecord(record)) return;
    const key = groundKey(record);
    if (seen.has(key)) {
      layers.set(record, -1);
      return;
    }
    seen.add(key);
    grounds.push({ record, index });
  });
  grounds.sort(compareGround);
  const ordered = grounds.map((entry) => entry.record);
  for (const record of ordered) {
    const used = new Set();
    for (const other of ordered) {
      if (other === record) break;
      if ((layers.get(other) ?? -1) < 0) continue;
      if (groundsOverlap(record, other)) used.add(layers.get(other));
    }
    let layer = 0;
    while (used.has(layer)) layer += 1;
    layers.set(record, layer);
  }
  return layers;
}

export function visualPieceY(record, records = []) {
  if (!isGroundRecord(record)) return ROAD_Y;
  const list = records.includes(record) ? records : [...records, record];
  const layers = assignGroundLayers(list);
  const layer = layers.get(record);
  if (layer == null || layer < 0) return null;
  return GROUND_PIECE_Y + layer * GROUND_STACK_STEP;
}
