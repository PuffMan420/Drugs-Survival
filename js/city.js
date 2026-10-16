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
import { CHUNK, PLAYER_SIZE, TILE, VIEW_H, VIEW_W } from "./constants.js";
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
  const roof = makeMaterial(textures.roof, { vertexColors: true });
  return { ground, walls, roof };
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

function addGroundQuad(buf, x0, z0, x1, z1) {
  const y = 0;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  buf.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

function buildChunk(map, cx, cz, materials) {
  const x1 = Math.min(map.cols, cx + CHUNK);
  const z1 = Math.min(map.rows, cz + CHUNK);
  const groundBufs = new Map();
  const wallBufs = new Map();
  const roofBuf = { pos: [], uv: [], idx: [], col: [] };
  let minX = cx * TILE;
  let maxX = x1 * TILE;
  let minZ = cz * TILE;
  let maxZ = z1 * TILE;

  for (let z = cz; z < z1; z += 1) {
    const row = map.ground[z];
    for (let x = cx; x < x1; x += 1) {
      const cell = row[x];
      const key = materials.ground[cell] ? cell : "l";
      let buf = groundBufs.get(key);
      if (!buf) {
        buf = { pos: [], uv: [], idx: [] };
        groundBufs.set(key, buf);
      }
      addGroundQuad(buf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE);
    }
  }

  for (const building of map.buildings) {
    if (building.x < cx || building.x >= x1 || building.z < cz || building.z >= z1) continue;
    const width = building.w * TILE;
    const depth = building.d * TILE;
    const height = building.h * TILE;
    const box = new BoxGeometry(width, height, depth);
    box.translate((building.x + building.w / 2) * TILE, height / 2, (building.z + building.d / 2) * TILE);
    const groups = box.groups;
    const style = materials.walls[building.style] ? building.style : "house";
    let walls = wallBufs.get(style);
    if (!walls) {
      walls = { pos: [], uv: [], idx: [] };
      wallBufs.set(style, walls);
    }
    // Box face order: +X, -X, +Y, -Y, +Z, -Z.
    appendFace(walls, box, groups[0], building.d, building.h);
    appendFace(walls, box, groups[1], building.d, building.h);
    appendFace(roofBuf, box, groups[2], building.w, building.d, hexRgb(building.roof));
    appendFace(walls, box, groups[4], building.w, building.h);
    appendFace(walls, box, groups[5], building.w, building.h);
    box.dispose();
    minX = Math.min(minX, building.x * TILE);
    maxX = Math.max(maxX, (building.x + building.w) * TILE);
    minZ = Math.min(minZ, building.z * TILE);
    maxZ = Math.max(maxZ, (building.z + building.d) * TILE);
  }

  const group = new Group();
  for (const [key, buf] of groundBufs) {
    if (buf.idx.length === 0) continue;
    const mesh = new Mesh(geometryFrom(buf, false), materials.ground[key]);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
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

export function buildCity(scene, map) {
  const materials = createMaterials(createTextures());
  const chunks = [];
  for (let cz = 0; cz < map.rows; cz += CHUNK) {
    for (let cx = 0; cx < map.cols; cx += CHUNK) {
      const chunk = buildChunk(map, cx, cz, materials);
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

export function updateChunks(chunks, camX, camZ) {
  const margin = TILE * 2;
  // Roofs lean north into the frame from just south of it.
  const southMargin = TILE * 5;
  const minX = camX - VIEW_W / 2 - margin;
  const maxX = camX + VIEW_W / 2 + margin;
  const minZ = camZ - VIEW_H / 2 - margin;
  const maxZ = camZ + VIEW_H / 2 + margin + southMargin;
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
