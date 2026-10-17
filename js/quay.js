import {
  CanvasTexture,
  DoubleSide,
  MeshBasicMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { CHUNK, TILE } from "./constants.js";
import { buildQuayPlan } from "./quay-shape.js";

export const WATER_Y = -58;
const LIP = 10;
const COPING = 60;
const SLOPE = 52;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url.href;
  });
}

function makeMap(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return new MeshBasicMaterial({ map: texture, side: DoubleSide, toneMapped: false });
}

export async function createQuayMaterials() {
  const image = await loadImage(new URL("../assets/textures/ground/sidewalk_concrete.webp", import.meta.url));
  const coping = document.createElement("canvas");
  coping.width = 256;
  coping.height = 256;
  const copingCtx = coping.getContext("2d");
  copingCtx.imageSmoothingEnabled = true;
  copingCtx.drawImage(image, 80, 80, 700, 700, 0, 0, 256, 256);
  copingCtx.fillStyle = "rgba(62, 66, 60, 0.16)";
  copingCtx.fillRect(0, 0, 256, 256);

  const wall = document.createElement("canvas");
  wall.width = 256;
  wall.height = 128;
  const wallCtx = wall.getContext("2d");
  wallCtx.imageSmoothingEnabled = true;
  wallCtx.drawImage(image, 40, 180, 760, 420, 0, 0, 256, 128);
  wallCtx.fillStyle = "rgba(38, 42, 40, 0.42)";
  wallCtx.fillRect(0, 0, 256, 128);
  wallCtx.fillStyle = "rgba(24, 28, 27, 0.38)";
  for (let y = 8; y < 128; y += 18) wallCtx.fillRect(0, y, 256, 3);
  const shade = wallCtx.createLinearGradient(0, 0, 0, 128);
  shade.addColorStop(0, "rgba(20, 22, 20, 0.05)");
  shade.addColorStop(0.72, "rgba(18, 24, 26, 0.18)");
  shade.addColorStop(1, "rgba(10, 28, 30, 0.62)");
  wallCtx.fillStyle = shade;
  wallCtx.fillRect(0, 0, 256, 128);
  return { coping: makeMap(coping), wall: makeMap(wall) };
}

export function quayPlan(map) {
  if (!map.quayPlan) map.quayPlan = buildQuayPlan(map);
  return map.quayPlan;
}

function pushQuad(buf, corners, uvs) {
  const base = buf.pos.length / 3;
  for (let i = 0; i < 4; i += 1) {
    buf.pos.push(corners[i][0], corners[i][1], corners[i][2]);
    buf.uv.push(uvs[i][0], uvs[i][1]);
  }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function piecesOf(segment) {
  const len = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
  const count = Math.max(1, Math.ceil(len));
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    pieces.push({
      ax: segment.ax + (segment.bx - segment.ax) * t0,
      az: segment.az + (segment.bz - segment.az) * t0,
      bx: segment.ax + (segment.bx - segment.ax) * t1,
      bz: segment.az + (segment.bz - segment.az) * t1,
      nx: segment.nx,
      nz: segment.nz,
      soft: segment.soft,
      u0: t0 * len,
      u1: t1 * len,
    });
  }
  return pieces;
}

export function appendQuay(plan, cx, cz, copingBuf, wallBuf, waterBuf) {
  const x1 = cx + CHUNK;
  const z1 = cz + CHUNK;
  const owns = (x, z) => x >= cx && x < x1 && z >= cz && z < z1;
  for (const segment of plan.segments) {
    for (const piece of piecesOf(segment)) {
      const midX = (piece.ax + piece.bx) / 2;
      const midZ = (piece.az + piece.bz) / 2;
      if (!owns(Math.floor(midX), Math.floor(midZ))) continue;
      const ax = piece.ax * TILE;
      const az = piece.az * TILE;
      const bx = piece.bx * TILE;
      const bz = piece.bz * TILE;
      const top = piece.soft ? LIP : 0;
      const u0 = piece.u0 * TILE / 96;
      const u1 = piece.u1 * TILE / 96;
      const wx = -piece.nx * SLOPE;
      const wz = -piece.nz * SLOPE;
      pushQuad(wallBuf, [
        [ax, top, az],
        [bx, top, bz],
        [bx + wx, WATER_Y, bz + wz],
        [ax + wx, WATER_Y, az + wz],
      ], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      if (!piece.soft) continue;
      const ox = piece.nx * COPING;
      const oz = piece.nz * COPING;
      pushQuad(copingBuf, [
        [ax, LIP, az],
        [bx, LIP, bz],
        [bx + ox, LIP, bz + oz],
        [ax + ox, LIP, az + oz],
      ], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
  }
  for (const cell of plan.water) {
    if (!owns(cell.x, cell.z)) continue;
    const x0 = cell.x * TILE;
    const z0 = cell.z * TILE;
    pushQuad(waterBuf, [
      [x0, WATER_Y, z0],
      [x0 + TILE, WATER_Y, z0],
      [x0 + TILE, WATER_Y, z0 + TILE],
      [x0, WATER_Y, z0 + TILE],
    ], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  }
}
