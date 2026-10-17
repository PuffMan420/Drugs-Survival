import {
  ClampToEdgeWrapping,
  DoubleSide,
  MeshBasicMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import { CHUNK, TILE } from "./constants.js";
import { buildQuayPlan } from "./quay-shape.js";
import { planQuayDraw } from "./quay-draw.js";

export const WATER_Y = -58;
const LIP = 10;
// Coping is rows 0-299 of the painted strip (60 units). Rows 180-299 are the
// outer 24 units, used if a full coping swallows a narrow canal.
const COPING_ROW = 0;
const COPING = (300 - COPING_ROW) / 5;
const COPING_V0 = COPING_ROW / 300;
const SLOPE = 52;
const REPEAT = 1440 / 5;
const DIAG = 384;
const DIAG_ALONG = DIAG * Math.SQRT2;
const CORNER = 960 / 5;
const DECK_ALONG = 480 / 5;
const DECK_ACROSS = 720 / 5;
const ABUT_ALONG = 240 / 5;
const SHADOW_ACROSS = 840 / 5;
const SHADOW_PAD = (SHADOW_ACROSS - DECK_ACROSS) / 2;
const SUN_SHIFT = 28;
const DECK_Y = 4;
const SHADOW_Y = 3;
const DECAL_Y = 12;
const CORNER_Y = 13;

const LAYERS = [
  "coping",
  "wall",
  "diag",
  "outer",
  "inner",
  "outer90",
  "inner90",
  "deckStone",
  "deckSteel",
  "deckPlain",
  "abutStone",
  "abutSteel",
  "abutPlain",
  "shadow",
];

export function emptyQuayBuffers() {
  const buffers = {};
  for (const name of LAYERS) buffers[name] = { pos: [], uv: [], idx: [] };
  return buffers;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url.href;
  });
}

function materialFrom(image, wrap, transparent = false) {
  const texture = new Texture(image);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.needsUpdate = true;
  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    toneMapped: false,
    alphaTest: transparent ? 0 : 0.4,
  });
  if (transparent) {
    material.transparent = true;
    material.depthWrite = false;
  }
  return material;
}

export async function createQuayMaterials() {
  const quay = (name) => new URL(`../assets/textures/quay/${name}.png`, import.meta.url);
  const bridge = (name) => new URL(`../assets/textures/bridges/${name}.png`, import.meta.url);
  const files = {
    coping: quay("quay_coping"),
    wall: quay("quay_wall"),
    diag: quay("quay_diag"),
    outer: quay("quay_corner_outer"),
    inner: quay("quay_corner_inner"),
    outer90: quay("quay_corner_outer90"),
    inner90: quay("quay_corner_inner90"),
    deckStone: bridge("bridge_deck_stone"),
    deckSteel: bridge("bridge_deck_steel"),
    deckPlain: bridge("bridge_deck_plain"),
    abutStone: bridge("bridge_abutment_stone"),
    abutSteel: bridge("bridge_abutment_steel"),
    abutPlain: bridge("bridge_abutment_plain"),
    shadow: bridge("bridge_shadow"),
  };
  const images = {};
  await Promise.all(Object.entries(files).map(async ([name, url]) => {
    images[name] = await loadImage(url);
  }));
  const repeat = RepeatWrapping;
  const clamp = ClampToEdgeWrapping;
  const materials = {
    coping: materialFrom(images.coping, repeat),
    wall: materialFrom(images.wall, repeat),
    diag: materialFrom(images.diag, repeat),
    outer: materialFrom(images.outer, clamp),
    inner: materialFrom(images.inner, clamp),
    outer90: materialFrom(images.outer90, clamp),
    inner90: materialFrom(images.inner90, clamp),
    deckStone: materialFrom(images.deckStone, repeat),
    deckSteel: materialFrom(images.deckSteel, repeat),
    deckPlain: materialFrom(images.deckPlain, repeat),
    abutStone: materialFrom(images.abutStone, clamp),
    abutSteel: materialFrom(images.abutSteel, clamp),
    abutPlain: materialFrom(images.abutPlain, clamp),
    shadow: materialFrom(images.shadow, repeat, true),
  };
  return materials;
}

export function quayPlan(map) {
  if (!map.quayPlan) {
    const traced = buildQuayPlan(map);
    map.quayPlan = { ...traced, draw: planQuayDraw(traced.segments) };
  }
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

function ownsTile(cx, cz, x, z) {
  return x >= cx && x < cx + CHUNK && z >= cz && z < cz + CHUNK;
}

function appendStraight(draw, cx, cz, bufs) {
  for (const segment of draw.strips) {
    for (const piece of piecesOf(segment)) {
      const midX = (piece.ax + piece.bx) / 2;
      const midZ = (piece.az + piece.bz) / 2;
      if (!ownsTile(cx, cz, Math.floor(midX), Math.floor(midZ))) continue;
      const ax = piece.ax * TILE;
      const az = piece.az * TILE;
      const bx = piece.bx * TILE;
      const bz = piece.bz * TILE;
      const top = piece.soft ? LIP : 0;
      const u0 = piece.u0 * TILE / REPEAT;
      const u1 = piece.u1 * TILE / REPEAT;
      const wx = -piece.nx * SLOPE;
      const wz = -piece.nz * SLOPE;
      pushQuad(bufs.wall, [
        [ax, top, az],
        [bx, top, bz],
        [bx + wx, WATER_Y, bz + wz],
        [ax + wx, WATER_Y, az + wz],
      ], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      if (!piece.soft) continue;
      const ox = piece.nx * COPING;
      const oz = piece.nz * COPING;
      pushQuad(bufs.coping, [
        [ax + ox, LIP, az + oz],
        [bx + ox, LIP, bz + oz],
        [bx, LIP, bz],
        [ax, LIP, az],
      ], [[u0, COPING_V0], [u1, COPING_V0], [u1, 1], [u0, 1]]);
    }
  }
}

function appendDiag(draw, cx, cz, bufs) {
  for (const segment of draw.diags) {
    const lenTiles = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
    const sDirX = (segment.bx - segment.ax) / lenTiles;
    const sDirZ = (segment.bz - segment.az) / lenTiles;
    for (const piece of piecesOf(segment)) {
      const midX = (piece.ax + piece.bx) / 2;
      const midZ = (piece.az + piece.bz) / 2;
      if (!ownsTile(cx, cz, Math.floor(midX), Math.floor(midZ))) continue;
      const s0 = piece.u0 * TILE;
      const s1 = piece.u1 * TILE;
      const point = (s, w) => {
        const along = s;
        return [
          segment.ax * TILE + sDirX * along + segment.nx * w,
          DECAL_Y,
          segment.az * TILE + sDirZ * along + segment.nz * w,
        ];
      };
      const uv = (s, w) => [(s - w) / DIAG_ALONG, 1 - (s + w) / DIAG_ALONG];
      pushQuad(bufs.diag, [
        point(s0, COPING),
        point(s1, COPING),
        point(s1, -SLOPE),
        point(s0, -SLOPE),
      ], [uv(s0, COPING), uv(s1, COPING), uv(s1, -SLOPE), uv(s0, -SLOPE)]);
    }
  }
}

function appendCorners(draw, cx, cz, bufs) {
  const half = CORNER / 2;
  for (const corner of draw.corners) {
    if (!ownsTile(cx, cz, Math.floor(corner.x), Math.floor(corner.z))) continue;
    const cxw = corner.x * TILE;
    const czw = corner.z * TILE;
    const ux = corner.uDir[0] * half;
    const uz = corner.uDir[1] * half;
    const vx = corner.vDir[0] * half;
    const vz = corner.vDir[1] * half;
    const buf = bufs[corner.kind];
    if (!buf) continue;
    pushQuad(buf, [
      [cxw - ux - vx, CORNER_Y, czw - uz - vz],
      [cxw + ux - vx, CORNER_Y, czw + uz - vz],
      [cxw + ux + vx, CORNER_Y, czw + uz + vz],
      [cxw - ux + vx, CORNER_Y, czw - uz + vz],
    ], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
}

// Deck art is 96 units along the span and 144 across. Abutments are 48 deep,
// land side at image x = 0, mirrored on the far bank. The shadow is one deck
// repeat wide and a little wider than the deck, shifted southeast.
const BRIDGES = [
  { style: "Stone", axis: "x", x0: 59, x1: 65, z0: 77, z1: 80 },
  { style: "Steel", axis: "x", x0: 74, x1: 78, z0: 127, z1: 130 },
  { style: "Plain", axis: "z", x0: 79, x1: 82, z0: 172, z1: 178 },
];

function spanPieces(a0, a1) {
  const pieces = [];
  for (let a = a0; a < a1; a += DECK_ALONG) {
    pieces.push([a, Math.min(a + DECK_ALONG, a1)]);
  }
  return pieces;
}

function appendBridges(cx, cz, bufs) {
  for (const bridge of BRIDGES) {
    const deck = bufs[`deck${bridge.style}`];
    const abut = bufs[`abut${bridge.style}`];
    if (bridge.axis === "x") {
      const z0 = bridge.z0 * TILE;
      const z1 = bridge.z1 * TILE;
      const x0 = bridge.x0 * TILE;
      const x1 = bridge.x1 * TILE;
      for (const [a, b] of spanPieces(x0, x1)) {
        if (!ownsTile(cx, cz, Math.floor(((a + b) / 2) / TILE), bridge.z0)) continue;
        const u1 = (b - a) / DECK_ALONG;
        pushQuad(deck, [
          [a, DECK_Y, z0],
          [b, DECK_Y, z0],
          [b, DECK_Y, z1],
          [a, DECK_Y, z1],
        ], [[0, 0], [u1, 0], [u1, 1], [0, 1]]);
        pushQuad(bufs.shadow, [
          [a + SUN_SHIFT, SHADOW_Y, z0 - SHADOW_PAD + SUN_SHIFT],
          [b + SUN_SHIFT, SHADOW_Y, z0 - SHADOW_PAD + SUN_SHIFT],
          [b + SUN_SHIFT, SHADOW_Y, z1 + SHADOW_PAD + SUN_SHIFT],
          [a + SUN_SHIFT, SHADOW_Y, z1 + SHADOW_PAD + SUN_SHIFT],
        ], [[0, 0], [u1, 0], [u1, 1], [0, 1]]);
      }
      appendAbutmentX(abut, cx, cz, x0 - ABUT_ALONG, x0, z0, z1, bridge.z0, false);
      appendAbutmentX(abut, cx, cz, x1, x1 + ABUT_ALONG, z0, z1, bridge.z0, true);
    } else {
      const x0 = bridge.x0 * TILE;
      const x1 = bridge.x1 * TILE;
      const z0 = bridge.z0 * TILE;
      const z1 = bridge.z1 * TILE;
      for (const [a, b] of spanPieces(z0, z1)) {
        if (!ownsTile(cx, cz, bridge.x0, Math.floor(((a + b) / 2) / TILE))) continue;
        const u1 = (b - a) / DECK_ALONG;
        pushQuad(deck, [
          [x0, DECK_Y, a],
          [x1, DECK_Y, a],
          [x1, DECK_Y, b],
          [x0, DECK_Y, b],
        ], [[0, 0], [0, 1], [u1, 1], [u1, 0]]);
        pushQuad(bufs.shadow, [
          [x0 - SHADOW_PAD + SUN_SHIFT, SHADOW_Y, a + SUN_SHIFT],
          [x1 + SHADOW_PAD + SUN_SHIFT, SHADOW_Y, a + SUN_SHIFT],
          [x1 + SHADOW_PAD + SUN_SHIFT, SHADOW_Y, b + SUN_SHIFT],
          [x0 - SHADOW_PAD + SUN_SHIFT, SHADOW_Y, b + SUN_SHIFT],
        ], [[0, 0], [0, 1], [u1, 1], [u1, 0]]);
      }
      appendAbutmentZ(abut, cx, cz, x0, x1, z0 - ABUT_ALONG, z0, bridge.x0, false);
      appendAbutmentZ(abut, cx, cz, x0, x1, z1, z1 + ABUT_ALONG, bridge.x0, true);
    }
  }
}

function appendAbutmentX(buf, cx, cz, x0, x1, z0, z1, zTile, mirror) {
  if (!ownsTile(cx, cz, Math.floor(((x0 + x1) / 2) / TILE), zTile)) return;
  // Land side of the picture is image x = 0. The mirrored end keeps that on the outer bank.
  const westU = mirror ? 1 : 0;
  const eastU = mirror ? 0 : 1;
  pushQuad(buf, [
    [x0, DECK_Y, z0],
    [x1, DECK_Y, z0],
    [x1, DECK_Y, z1],
    [x0, DECK_Y, z1],
  ], [[westU, 0], [eastU, 0], [eastU, 1], [westU, 1]]);
}

function appendAbutmentZ(buf, cx, cz, x0, x1, z0, z1, xTile, mirror) {
  if (!ownsTile(cx, cz, xTile, Math.floor(((z0 + z1) / 2) / TILE))) return;
  const northU = mirror ? 1 : 0;
  const southU = mirror ? 0 : 1;
  pushQuad(buf, [
    [x0, DECK_Y, z0],
    [x1, DECK_Y, z0],
    [x1, DECK_Y, z1],
    [x0, DECK_Y, z1],
  ], [[northU, 0], [northU, 1], [southU, 1], [southU, 0]]);
}

export function appendQuay(plan, cx, cz, bufs, waterBuf) {
  appendStraight(plan.draw, cx, cz, bufs);
  appendDiag(plan.draw, cx, cz, bufs);
  appendCorners(plan.draw, cx, cz, bufs);
  appendBridges(cx, cz, bufs);
  for (const cell of plan.water) {
    if (!ownsTile(cx, cz, cell.x, cell.z)) continue;
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
