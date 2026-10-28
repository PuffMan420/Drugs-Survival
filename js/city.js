import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
} from "three";
import { CHUNK, GROUND_H, GROUND_W, PLAYER_SIZE, TILE } from "./constants.js";
import { createGround } from "./ground.js";
import { clearBuildingsFromRoads, planKenneyRoads, westOfCanal } from "./kenney-road-plan.js";
import { appendQuay, createQuayMaterials, emptyQuayBuffers, PIER_Y, quayPlan, WATER_Y } from "./quay.js";
import { createTextures } from "./textures.js";

const flat = { toneMapped: false };

function hexRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function makeMaterial(texture, extra = {}) {
  return new MeshBasicMaterial({ map: texture, side: FrontSide, ...flat, ...extra });
}

function createMaterials(textures) {
  const ground = {};
  for (const [key, texture] of Object.entries(textures.ground)) {
    ground[key] = makeMaterial(texture, { side: DoubleSide });
  }
  const walls = {};
  for (const [key, texture] of Object.entries(textures.walls)) {
    walls[key] = makeMaterial(texture);
  }
  const roof = new MeshBasicMaterial({ vertexColors: true, side: FrontSide, ...flat });
  const road = makeMaterial(textures.road, { side: DoubleSide });
  const walk = makeMaterial(textures.walk, { side: DoubleSide });
  const curb = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, ...flat });
  const tree = new MeshBasicMaterial({ vertexColors: true, side: FrontSide, ...flat });
  const shadow = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: DoubleSide,
    vertexShader: `
      attribute float shade;
      varying float vShade;
      void main() {
        vShade = shade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vShade;
      void main() {
        gl_FragColor = vec4(0.04, 0.05, 0.035, vShade);
      }
    `,
  });
  return { ground, walls, roof, road, walk, curb, shadow, tree };
}

function geometryFrom(buf, withColor) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(buf.pos), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(buf.uv), 2));
  if (withColor) geometry.setAttribute("color", new BufferAttribute(new Float32Array(buf.col), 3));
  geometry.setIndex(buf.idx);
  geometry.computeBoundingSphere();
  return geometry;
}

function addGroundQuad(buf, x0, z0, x1, z1, u0 = 0, v0 = 0, u1 = 1, v1 = 1, y = 0) {
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  buf.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Pier art is 240 px along the pier (one tile, repeats) and 720 px across (three tiles).
// Edge boards sit on the two outer rows of that width.
function pierFrames(map) {
  if (map.pierFrames) return map.pierFrames;
  const { cols, rows, ground } = map;
  const frames = new Map();
  const seen = new Uint8Array(cols * rows);
  const at = (x, z) => (x < 0 || z < 0 || x >= cols || z >= rows ? "" : ground[z][x]);
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const start = x + z * cols;
      if (at(x, z) !== "d" || seen[start]) continue;
      const cells = [];
      const queue = [[x, z]];
      seen[start] = 1;
      while (queue.length > 0) {
        const [cx, cz] = queue.pop();
        cells.push([cx, cz]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          const id = nx + nz * cols;
          if (at(nx, nz) !== "d" || seen[id]) continue;
          seen[id] = 1;
          queue.push([nx, nz]);
        }
      }
      let minX = cols;
      let maxX = 0;
      let minZ = rows;
      let maxZ = 0;
      for (const [cx, cz] of cells) {
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minZ = Math.min(minZ, cz);
        maxZ = Math.max(maxZ, cz);
      }
      const spanX = maxX - minX + 1;
      const spanZ = maxZ - minZ + 1;
      const alongX = spanX >= spanZ;
      for (const [cx, cz] of cells) {
        if (alongX) {
          const i = cz - minZ;
          frames.set(cx + cz * cols, {
            alongX: true,
            u0: 0,
            u1: 1,
            v0: (i + 1) / spanZ,
            v1: i / spanZ,
          });
        } else {
          const i = cx - minX;
          frames.set(cx + cz * cols, {
            alongX: false,
            vWest: i / spanX,
            vEast: (i + 1) / spanX,
          });
        }
      }
    }
  }
  map.pierFrames = frames;
  return frames;
}

function addPierAlongZ(buf, x, z, vWest, vEast) {
  const x0 = x * TILE;
  const z0 = z * TILE;
  const x1 = x0 + TILE;
  const z1 = z0 + TILE;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, PIER_Y, z0, x1, PIER_Y, z0, x1, PIER_Y, z1, x0, PIER_Y, z1);
  buf.uv.push(0, vWest, 0, vEast, 1, vEast, 1, vWest);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function cellUV(col, row, cols, rows) {
  const insetU = 0.5 / (cols * 48);
  const insetV = 0.5 / (rows * 48);
  return [
    col / cols + insetU,
    1 - (row + 1) / rows + insetV,
    (col + 1) / cols - insetU,
    1 - row / rows - insetV,
  ];
}

function addQuad(buf, pts, color) {
  const base = buf.pos.length / 3;
  for (const p of pts) {
    buf.pos.push(p[0], p[1], p[2]);
    buf.uv.push(0, 0);
    buf.col.push(color[0], color[1], color[2]);
  }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const CURB_TOP = [0.78, 0.74, 0.58];
const CURB_SIDE = [0.32, 0.3, 0.22];

// One sun, from the northwest. Shadows fall southeast and scale with height.
// The sheet sits just above the road and below the tires (cars start at y = 0.6).
const SUN_X = 0.46;
const SUN_Z = 0.67;
const SHADOW_Y = 0.4;
const SHADOW_FEATHER = 34;
const SHADOW_MAX = TILE * 5;

function addShadowVert(buf, x, z, shade) {
  buf.pos.push(x, SHADOW_Y, z);
  buf.shade.push(shade);
}

function addShadowTri(buf, ax, az, aa, bx, bz, ba, cx, cz, ca) {
  const base = buf.pos.length / 3;
  addShadowVert(buf, ax, az, aa);
  addShadowVert(buf, bx, bz, ba);
  addShadowVert(buf, cx, cz, ca);
  buf.idx.push(base, base + 1, base + 2);
}

function addBuildingShadow(buf, x0, z0, x1, z1, height) {
  const cast = Math.min(Math.max(height, TILE * 0.8), SHADOW_MAX);
  const sx = cast * SUN_X;
  const sz = cast * SUN_Z;
  const spanX = Math.max(1, x1 - x0);
  const spanZ = Math.max(1, z1 - z0);
  const insetX = Math.min(spanX * 0.25, 20);
  const insetZ = Math.min(spanZ * 0.25, 20);
  const f = SHADOW_FEATHER;
  const dark = 0.74;
  // Dark along the sunlit walls. Every outer vertex is clear, so the silhouette fades
  // instead of cutting a hard diagonal stair.
  const Q0 = [x0 + insetX, z1, dark];
  const Q1 = [x1, z1, dark];
  const Q2 = [x1, z0 + insetZ, dark];
  const P0 = [x0 - f, z1, 0];
  const P1 = [x0 - f * 0.35, z1 + sz + f, 0];
  const P2 = [x1 + sx + f, z1 + sz + f, 0];
  const P3 = [x1 + sx + f, z0 - f * 0.35, 0];
  const P4 = [x1, z0 - f, 0];
  addShadowTri(buf, ...P0, ...P1, ...Q0);
  addShadowTri(buf, ...P1, ...P2, ...Q0);
  addShadowTri(buf, ...P2, ...Q0, ...Q1);
  addShadowTri(buf, ...P2, ...Q1, ...P3);
  addShadowTri(buf, ...P3, ...Q1, ...Q2);
  addShadowTri(buf, ...P3, ...Q2, ...P4);
  return { sx: sx + f, sz: sz + f };
}

function addCurb(buf, x0, z0, x1, z1, outward) {
  const y0 = 0.5;
  const y1 = 8;
  const inset = 8;
  if (outward === "s") {
    addQuad(buf, [[x0, y1, z1 - inset], [x1, y1, z1 - inset], [x1, y1, z1], [x0, y1, z1]], CURB_TOP);
    addQuad(buf, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], CURB_SIDE);
  } else if (outward === "n") {
    addQuad(buf, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z0 + inset], [x0, y1, z0 + inset]], CURB_TOP);
    addQuad(buf, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], CURB_SIDE);
  } else if (outward === "e") {
    addQuad(buf, [[x1 - inset, y1, z0], [x1, y1, z0], [x1, y1, z1], [x1 - inset, y1, z1]], CURB_TOP);
    addQuad(buf, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], CURB_SIDE);
  } else {
    addQuad(buf, [[x0, y1, z0], [x0 + inset, y1, z0], [x0 + inset, y1, z1], [x0, y1, z1]], CURB_TOP);
    addQuad(buf, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], CURB_SIDE);
  }
}

function isCurbNeighbor(cell) {
  return cell === "H" || cell === "V" || cell === "+" || cell === "h" || cell === "v"
    || cell === "X" || cell === "A" || cell === "E" || cell === "a" || cell === "e" || cell === "n"
    || cell === "1" || cell === "2" || cell === "4" || cell === "5" || cell === "6" || cell === "8";
}

function roofHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function addRoofPad(buf, x0, z0, x1, z1, y, color) {
  addQuad(buf, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], color);
}

function addRoofBox(buf, x0, z0, x1, z1, y0, y1, top, side) {
  addRoofPad(buf, x0, z0, x1, z1, y1, top);
  addQuad(buf, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], side);
  addQuad(buf, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], side);
  addQuad(buf, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], side);
  addQuad(buf, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side);
}

// The northeast tile of this block is the corner that hangs over the straight
// water wall. The block keeps every other tile.
function quayNotch(building) {
  return building.x === 69 && building.z === 173 && building.w === 2
    && building.d === 5 && building.h === 4 && building.style === "mid";
}

function addNotchLedge(buf, building) {
  const x0 = building.x * TILE;
  const z0 = building.z * TILE;
  const xW = x0 + TILE;
  const x1 = x0 + building.w * TILE;
  const zN = z0 + TILE;
  const z1 = z0 + building.d * TILE;
  const y = building.h * TILE;
  const y1 = y + 12;
  const lip = 8;
  const ledge = [0.82, 0.78, 0.66];
  const side = [0.48, 0.45, 0.36];
  addRoofPad(buf, x0, z0, xW, z0 + lip, y1, ledge);
  addRoofPad(buf, xW - lip, z0 + lip, xW, zN + lip, y1, ledge);
  addRoofPad(buf, xW, zN, x1, zN + lip, y1, ledge);
  addRoofPad(buf, x1 - lip, zN + lip, x1, z1 - lip, y1, ledge);
  addRoofPad(buf, x0, z1 - lip, x1, z1, y1, ledge);
  addRoofPad(buf, x0, z0 + lip, x0 + lip, z1 - lip, y1, ledge);
  addQuad(buf, [[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], side);
  addQuad(buf, [[x1, y, zN], [x1, y, z1], [x1, y1, z1], [x1, y1, zN]], side);
  addQuad(buf, [[xW, y, z0], [xW, y, zN], [xW, y1, zN], [xW, y1, z0]], side);
}

function addRoofDetails(buf, building, withLedge = true) {
  const x0 = building.x * TILE;
  const z0 = building.z * TILE;
  const x1 = x0 + building.w * TILE;
  const z1 = z0 + building.d * TILE;
  const y = building.h * TILE;
  const ledge = [0.82, 0.78, 0.66];
  const ledgeSide = [0.48, 0.45, 0.36];
  const lip = 8;
  if (withLedge && x1 - x0 > lip * 2 && z1 - z0 > lip * 2) {
    const y1 = y + 12;
    addRoofPad(buf, x0, z1 - lip, x1, z1, y1, ledge);
    addRoofPad(buf, x0, z0, x1, z0 + lip, y1, ledge);
    addRoofPad(buf, x0, z0 + lip, x0 + lip, z1 - lip, y1, ledge);
    addRoofPad(buf, x1 - lip, z0 + lip, x1, z1 - lip, y1, ledge);
    addQuad(buf, [[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], ledgeSide);
    addQuad(buf, [[x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0]], ledgeSide);
  }
  if (building.w < 2 || building.d < 2) return;
  const h = roofHash(building.x, building.z);
  const count = 1 + (h % 2);
  const grey = [0.9, 0.91, 0.93];
  const dark = [0.28, 0.3, 0.32];
  for (let n = 0; n < count; n += 1) {
    const spanX = x1 - x0 - 28;
    const spanZ = z1 - z0 - 28;
    const ax = x0 + 14 + ((h >>> (n * 5)) % Math.max(1, spanX - 28));
    const az = z0 + 14 + ((h >>> (8 + n * 4)) % Math.max(1, spanZ - 20));
    const aw = 32 + (n === 0 ? 14 : 0);
    const ad = 20;
    addRoofBox(buf, ax, az, Math.min(x1 - 14, ax + aw), Math.min(z1 - 14, az + ad), y, y + 18, grey, dark);
  }
  const vx = x0 + 14 + ((h >>> 18) % Math.max(1, x1 - x0 - 24));
  const vz = z0 + lip + 6;
  addRoofBox(buf, vx, vz, vx + 6, Math.min(z1 - lip - 4, vz + 22), y, y + 8, dark, dark);
}

function appendFace(buf, box, group, scaleU, scaleV, color) {
  const index = box.index.array;
  const pos = box.attributes.position.array;
  const uv = box.attributes.uv.array;
  for (let i = group.start; i < group.start + group.count; i += 1) {
    const vi = index[i];
    if (i % 3 === 0) buf.base = buf.pos.length / 3;
    buf.pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
    buf.uv.push(uv[vi * 2] * scaleU, uv[vi * 2 + 1] * scaleV);
    if (color) buf.col.push(color[0], color[1], color[2]);
    if (i % 3 === 2) buf.idx.push(buf.base, buf.base + 1, buf.base + 2);
  }
}

function mixHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function addColoredBox(buf, x0, y0, z0, x1, y1, z1, color) {
  const faces = [
    [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1],
    [x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0],
    [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0],
    [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1],
    [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0],
  ];
  for (const face of faces) {
    const base = buf.pos.length / 3;
    for (let i = 0; i < 12; i += 3) {
      buf.pos.push(face[i], face[i + 1], face[i + 2]);
      buf.uv.push(0, 0);
      buf.col.push(color[0], color[1], color[2]);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function treeHitsRoad(x, z, plan) {
  if (!plan) return false;
  const h = mixHash(x, z);
  const ox = ((h % 5) - 2) * 4;
  const oz = (((h >>> 4) % 5) - 2) * 4;
  const canopy = 22 + (h % 3) * 4;
  const cx = (x * TILE + TILE / 2 + ox) / TILE;
  const cz = (z * TILE + TILE / 2 + oz) / TILE;
  const reach = canopy / 2 / TILE;
  for (const piece of plan.placements) {
    const half = piece.scale / 2;
    const overlapX = Math.min(cx + reach, piece.x + half) - Math.max(cx - reach, piece.x - half);
    const overlapZ = Math.min(cz + reach, piece.z + half) - Math.max(cz - reach, piece.z - half);
    if (overlapX > 0 && overlapZ > 0) return true;
  }
  return false;
}

function addTree(buf, x, z) {
  const h = mixHash(x, z);
  const ox = ((h % 5) - 2) * 4;
  const oz = (((h >>> 4) % 5) - 2) * 4;
  const cx = x * TILE + TILE / 2 + ox;
  const cz = z * TILE + TILE / 2 + oz;
  const trunkH = 12 + (h % 3) * 2;
  const canopy = 22 + (h % 3) * 4;
  const greens = [
    [0.16, 0.4, 0.22],
    [0.22, 0.46, 0.26],
    [0.13, 0.34, 0.18],
  ];
  addColoredBox(buf, cx - 3, 0, cz - 3, cx + 3, trunkH, cz + 3, [0.38, 0.24, 0.13]);
  const gy = trunkH - 2;
  addColoredBox(buf, cx - canopy / 2, gy, cz - canopy / 2, cx + canopy / 2, gy + canopy * 0.55, cz + canopy / 2, greens[h % 3]);
}

function buildChunk(map, cx, cz, materials, ground, quay, plan) {
  const x1 = Math.min(map.cols, cx + CHUNK);
  const z1 = Math.min(map.rows, cz + CHUNK);
  const groundBufs = new Map();
  const wallBufs = new Map();
  const roofBuf = { pos: [], uv: [], idx: [], col: [] };
  const surfaceBufs = new Map();
  const shadowBuf = { pos: [], shade: [], idx: [] };
  const treeBuf = { pos: [], uv: [], idx: [], col: [] };
  let minX = cx * TILE;
  let maxX = x1 * TILE;
  let minZ = cz * TILE;
  let maxZ = z1 * TILE;

  const at = (x, z) => {
    if (z < 0 || x < 0 || z >= map.rows || x >= map.cols) return "~";
    return map.ground[z][x];
  };

  for (let z = cz; z < z1; z += 1) {
    const row = map.ground[z];
    for (let x = cx; x < x1; x += 1) {
      const cell = row[x];
      // West of the canal is empty ground, plus water and the pier decks.
      // Quay walls are drawn separately. Roads are not.
      if (!map.island && westOfCanal(x, z) && cell !== "~" && cell !== "d") {
        let buf = groundBufs.get("y");
        if (!buf) {
          buf = { pos: [], uv: [], idx: [] };
          groundBufs.set("y", buf);
        }
        const u0 = (x * TILE) / 128;
        const u1 = ((x + 1) * TILE) / 128;
        const vAtZ0 = (z * TILE) / 128;
        const vAtZ1 = ((z + 1) * TILE) / 128;
        addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, u0, vAtZ1, u1, vAtZ0, 0);
        continue;
      }
      if (cell === "g" && mixHash(x, z) % 5 === 0 && !treeHitsRoad(x, z, plan)) addTree(treeBuf, x, z);
      if (ground.covers(x, z)) {
        ground.paint(surfaceBufs, x, z);
        continue;
      }
      const key = materials.ground[cell] ? cell : "l";
      let buf = groundBufs.get(key);
      if (!buf) {
        buf = { pos: [], uv: [], idx: [] };
        groundBufs.set(key, buf);
      }
      if (cell === "d") {
        const frame = pierFrames(map).get(x + z * map.cols);
        if (frame && !frame.alongX) addPierAlongZ(buf, x, z, frame.vWest, frame.vEast);
        else if (frame) {
          addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, frame.u0, frame.v0, frame.u1, frame.v1, PIER_Y);
        } else {
          addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, 0, 0, 1, 1, PIER_Y);
        }
        continue;
      }
      const groundY = cell === "~" ? WATER_Y : 0;
      if (cell === "y") {
        // addGroundQuad applies v1 at z0 and v0 at z1. Match world z to texture v.
        const u0 = (x * TILE) / 128;
        const u1 = ((x + 1) * TILE) / 128;
        const vAtZ0 = (z * TILE) / 128;
        const vAtZ1 = ((z + 1) * TILE) / 128;
        addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, u0, vAtZ1, u1, vAtZ0, groundY);
      } else {
        addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, 0, 0, 1, 1, groundY);
      }
    }
  }

  const quayBufs = emptyQuayBuffers();
  let waterBuf = groundBufs.get("~");
  if (!waterBuf) {
    waterBuf = { pos: [], uv: [], idx: [] };
    groundBufs.set("~", waterBuf);
  }
  appendQuay(quay, cx, cz, quayBufs, waterBuf);

  for (const building of map.buildings) {
    if (building.x < cx || building.x >= x1 || building.z < cz || building.z >= z1) continue;
    const notch = quayNotch(building);
    // The stub overlaps the main block by two units so the shared face stays shut.
    const parts = notch
      ? [
        { ...building, w: 1, d: 1 + 2 / TILE },
        { ...building, z: building.z + 1, d: building.d - 1 },
      ]
      : [building];
    const style = materials.walls[building.style] ? building.style : "house";
    let walls = wallBufs.get(style);
    if (!walls) {
      walls = { pos: [], uv: [], idx: [] };
      wallBufs.set(style, walls);
    }
    let height = 0;
    for (const part of parts) {
      const width = part.w * TILE;
      const depth = part.d * TILE;
      height = part.h * TILE;
      const box = new BoxGeometry(width, height, depth);
      box.translate((part.x + part.w / 2) * TILE, height / 2, (part.z + part.d / 2) * TILE);
      const groups = box.groups;
      // Facade art is two floors tall, so it repeats once per two tiles. Shed stripes stay one tile tall.
      const vScale = style === "shed" ? part.h : part.h * 0.5;
      // Box face order: +X, -X, +Y, -Y, +Z, -Z.
      appendFace(walls, box, groups[0], part.d, vScale);
      appendFace(walls, box, groups[1], part.d, vScale);
      appendFace(roofBuf, box, groups[2], 1, 1, hexRgb(part.roof));
      appendFace(walls, box, groups[4], part.w, vScale);
      appendFace(walls, box, groups[5], part.w, vScale);
      box.dispose();
    }
    if (notch) addNotchLedge(roofBuf, building);
    addRoofDetails(roofBuf, building, !notch);
    const bx = building.x * TILE;
    const bz = building.z * TILE;
    const bw = building.w * TILE;
    const bd = building.d * TILE;
    const cast = notch
      ? addBuildingShadow(shadowBuf, bx, bz + TILE, bx + bw, bz + bd, height)
      : addBuildingShadow(shadowBuf, bx, bz, bx + bw, bz + bd, height);
    if (notch) addBuildingShadow(shadowBuf, bx, bz, bx + TILE, bz + TILE, height);
    minX = Math.min(minX, bx);
    maxX = Math.max(maxX, bx + bw + cast.sx + SHADOW_FEATHER);
    minZ = Math.min(minZ, bz);
    maxZ = Math.max(maxZ, bz + bd + cast.sz + SHADOW_FEATHER);
  }

  const group = new Group();
  const addMesh = (buf, material, withColor = false) => {
    if (buf.idx.length === 0) return;
    const mesh = new Mesh(geometryFrom(buf, withColor), material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  for (const [key, buf] of groundBufs) addMesh(buf, materials.ground[key]);
  for (const [key, buf] of Object.entries(quayBufs)) {
    if (buf.idx.length === 0) continue;
    const mesh = new Mesh(geometryFrom(buf, false), materials.quay[key]);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    if (key === "shadow") mesh.renderOrder = 2;
    group.add(mesh);
  }
  for (const [key, buf] of surfaceBufs) addMesh(buf, ground.material(key));
  for (const [key, buf] of wallBufs) {
    if (buf.idx.length === 0) continue;
    const mesh = new Mesh(geometryFrom(buf, false), materials.walls[key]);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  if (roofBuf.idx.length > 0) {
    const mesh = new Mesh(geometryFrom(roofBuf, true), materials.roof);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  if (treeBuf.idx.length > 0) {
    const mesh = new Mesh(geometryFrom(treeBuf, true), materials.tree);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  if (shadowBuf.idx.length > 0) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(shadowBuf.pos), 3));
    geometry.setAttribute("shade", new BufferAttribute(new Float32Array(shadowBuf.shade), 1));
    geometry.setIndex(shadowBuf.idx);
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, materials.shadow);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  group.updateMatrix();
  return { group, minX, maxX, minZ, maxZ };
}

function makePlayer() {
  const geometry = new BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  const side = new MeshBasicMaterial({ color: 0xe0a000, ...flat });
  const top = new MeshBasicMaterial({ color: 0xffe14a, ...flat });
  const mesh = new Mesh(geometry, [side, side, top, side, side, side]);
  mesh.position.y = PLAYER_SIZE / 2;
  return mesh;
}

const EMPTY_QUAY = {
  docks: [],
  roads: new Set(),
  water: [],
  bridges: [],
  draw: { strips: [], diags: [], corners: [], wallCorners: [], cornerFit: [true] },
};

export async function buildCity(scene, map, _removedRoadKeys) {
  // The west bank keeps its ground, water, piers, and quay. Houses are not built there.
  map.buildings = (map.buildings || []).filter((building) => {
    const cx = building.x + building.w / 2;
    const cz = building.z + building.d / 2;
    return !westOfCanal(cx, cz);
  });
  const kenneyPlan = planKenneyRoads(map);
  clearBuildingsFromRoads(map, kenneyPlan);
  const textures = await createTextures();
  const materials = createMaterials(textures);
  materials.quay = await createQuayMaterials();
  const ground = await createGround(map, (x, z) => kenneyPlan.roadPaint(x, z));
  const quay = map.island ? EMPTY_QUAY : quayPlan(map);
  const chunks = [];
  for (let cz = 0; cz < map.rows; cz += CHUNK) {
    for (let cx = 0; cx < map.cols; cx += CHUNK) {
      const chunk = buildChunk(map, cx, cz, materials, ground, quay, kenneyPlan);
      scene.add(chunk.group);
      chunks.push(chunk);
    }
  }
  // No road meshes west of the canal. The empty group is what build mode raycasts.
  const roads = new Group();
  roads.name = "kenney-roads";
  scene.add(roads);
  const playerMesh = makePlayer();
  scene.add(playerMesh);
  return {
    chunks,
    playerMesh,
    roads,
    mapW: map.cols * TILE,
    mapH: map.rows * TILE,
  };
}

export function updateChunks(chunks, camX, camZ, viewScale = 1) {
  const margin = TILE * 2;
  // Roofs lean north into the frame from just south of it.
  const southMargin = TILE * 5;
  const view = viewScale > 0 ? viewScale : 1;
  const minX = camX - (GROUND_W / 2) * view - margin;
  const maxX = camX + (GROUND_W / 2) * view + margin;
  const minZ = camZ - (GROUND_H / 2) * view - margin;
  const maxZ = camZ + (GROUND_H / 2) * view + margin + southMargin;
  let shown = 0;
  for (const chunk of chunks) {
    const visible = chunk.maxX >= minX && chunk.minX <= maxX && chunk.maxZ >= minZ && chunk.minZ <= maxZ;
    chunk.group.visible = visible;
    if (visible) shown += 1;
  }
  return shown;
}

export function tileAt(map, x, z) {
  const tx = Math.floor(x / TILE);
  const tz = Math.floor(z / TILE);
  if (tz < 0 || tx < 0 || tz >= map.rows || tx >= map.cols) return "~";
  return map.ground[tz][tx];
}

export function tileCenter(tileX, tileZ) {
  return { x: (tileX + 0.5) * TILE, z: (tileZ + 0.5) * TILE };
}
