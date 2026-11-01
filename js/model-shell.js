// Invisible boxes fitted to the drawn cars and buildings. Ragdoll limbs
// hit these and stay outside. The boxes are not on the driving layers, so
// the chassis and the traffic stand-ins keep their own collision.

import { TILE } from "./constants.js";
import { CAR_DRAW_SCALE } from "./car-strike.js";

// Same placement as the instanced pieces in road-batch.js.
const PIECE_UNIT = 4 * TILE;
const PIECE_GROUND_Y = 0.2;
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

const boundsByFile = new Map();

export function isBuildingFile(file) {
  return typeof file === "string" && file.includes("building");
}

export function setModelBounds(kit, file, box) {
  if (!kit || !file) return;
  const key = `${kit}/${file}`;
  if (!box) {
    boundsByFile.delete(key);
    return;
  }
  boundsByFile.set(key, box);
}

export function clearModelBounds() {
  boundsByFile.clear();
}

function roundKey(n) {
  return Math.round(n * 100) / 100;
}

// One oriented box for a placed building or house. Bounds are the model's
// own box, in the file's units, before the piece scale.
export function buildingShell(piece) {
  if (!piece || !isBuildingFile(piece.file)) return null;
  const box = piece.bounds || boundsByFile.get(`${piece.kit}/${piece.file}`);
  if (!box) return null;
  const minX = box.minX;
  const minY = box.minY;
  const minZ = box.minZ;
  const maxX = box.maxX;
  const maxY = box.maxY;
  const maxZ = box.maxZ;
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;
  const pieceScale = piece.scale > 0 ? piece.scale : 1;
  const scale = PIECE_UNIT * pieceScale;
  const sx = piece.mirror ? -scale : scale;
  const lx = ((minX + maxX) / 2) * sx;
  const ly = ((minY + maxY) / 2) * scale;
  const lz = ((minZ + maxZ) / 2) * scale;
  const hx = Math.abs(maxX - minX) * 0.5 * scale;
  const hy = Math.abs(maxY - minY) * 0.5 * scale;
  const hz = Math.abs(maxZ - minZ) * 0.5 * scale;
  if (hx < 0.05 || hy < 0.05 || hz < 0.05) return null;
  const turns = ((Math.round(piece.turn || 0) % 4) + 4) % 4;
  const ox = lx * COS[turns] + lz * SIN[turns];
  const oz = -lx * SIN[turns] + lz * COS[turns];
  const x = (piece.x + 0.5) * TILE + ox;
  const y = PIECE_GROUND_Y + ly;
  const z = (piece.z + 0.5) * TILE + oz;
  const yaw = turns * Math.PI / 2;
  return {
    x,
    y,
    z,
    hx,
    hy,
    hz,
    yaw,
    key: [
      piece.kit,
      piece.file,
      roundKey(x),
      roundKey(y),
      roundKey(z),
      roundKey(hx),
      roundKey(hy),
      roundKey(hz),
      turns,
      piece.mirror ? 1 : 0,
    ].join("|"),
  };
}

export function buildingShells(pieces) {
  const shells = [];
  if (!pieces) return shells;
  for (const piece of pieces) {
    const shell = buildingShell(piece);
    if (shell) shells.push(shell);
  }
  return shells;
}

// The box the mesh is drawn in. w and h are the footprint; bodyH and
// bodyLift are the baked model height and its centre above the tyres.
export function carShell(car) {
  const w = car && car.w > 0 ? car.w : 36;
  const h = car && car.h > 0 ? car.h : 70;
  const hx = Math.max(0.25, w * CAR_DRAW_SCALE * 0.5);
  const hz = Math.max(0.25, h * CAR_DRAW_SCALE * 0.5);
  const bodyH = car && car.bodyH > 0 ? car.bodyH : h * 0.62;
  const hy = Math.max(0.25, bodyH * 0.5);
  const lift = car && car.bodyH > 0 && Number.isFinite(car.bodyLift) ? car.bodyLift : hy;
  return { hx, hy, hz, lift };
}
