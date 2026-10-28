import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { CHUNK, GROUND_H, GROUND_W, PLAYER_SIZE, TILE } from "./constants.js";
import { clearBuildingsFromRoads, planKenneyRoads } from "./kenney-road-plan.js";
import { createTextures } from "./textures.js";

const flat = { toneMapped: false };
// Water sits below the ground. The old quay used this same height.
const WATER_Y = -58;

function makeMaterial(texture, extra = {}) {
  return new MeshBasicMaterial({ map: texture, side: FrontSide, ...flat, ...extra });
}

function createMaterials(textures) {
  const ground = {};
  for (const [key, texture] of Object.entries(textures.ground)) {
    ground[key] = makeMaterial(texture, { side: DoubleSide });
  }
  const tree = new MeshBasicMaterial({ vertexColors: true, side: FrontSide, ...flat });
  return { ground, tree };
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

function buildChunk(map, cx, cz, materials, plan) {
  const x1 = Math.min(map.cols, cx + CHUNK);
  const z1 = Math.min(map.rows, cz + CHUNK);
  const groundBufs = new Map();
  const treeBuf = { pos: [], uv: [], idx: [], col: [] };
  const minX = cx * TILE;
  const maxX = x1 * TILE;
  const minZ = cz * TILE;
  const maxZ = z1 * TILE;

  for (let z = cz; z < z1; z += 1) {
    const row = map.ground[z];
    for (let x = cx; x < x1; x += 1) {
      const cell = row[x];
      if (cell === "g" && mixHash(x, z) % 5 === 0 && !treeHitsRoad(x, z, plan)) addTree(treeBuf, x, z);
      const key = materials.ground[cell] ? cell : "l";
      let buf = groundBufs.get(key);
      if (!buf) {
        buf = { pos: [], uv: [], idx: [] };
        groundBufs.set(key, buf);
      }
      const groundY = cell === "~" ? WATER_Y : 0;
      addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, 0, 0, 1, 1, groundY);
    }
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
  if (treeBuf.idx.length > 0) {
    const mesh = new Mesh(geometryFrom(treeBuf, true), materials.tree);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
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

export async function buildCity(scene, map) {
  map.buildings = map.buildings || [];
  const kenneyPlan = planKenneyRoads(map);
  clearBuildingsFromRoads(map, kenneyPlan);
  const textures = await createTextures();
  const materials = createMaterials(textures);
  const chunks = [];
  for (let cz = 0; cz < map.rows; cz += CHUNK) {
    for (let cx = 0; cx < map.cols; cx += CHUNK) {
      const chunk = buildChunk(map, cx, cz, materials, kenneyPlan);
      scene.add(chunk.group);
      chunks.push(chunk);
    }
  }
  const playerMesh = makePlayer();
  scene.add(playerMesh);
  return {
    chunks,
    playerMesh,
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
