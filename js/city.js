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
import { classifyMarkings, ROAD_COLS, ROAD_ROWS, WALK_COLS, WALK_ROWS } from "./markings.js";
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
  const road = makeMaterial(textures.road, { side: DoubleSide });
  const walk = makeMaterial(textures.walk, { side: DoubleSide });
  const curb = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, ...flat });
  const shadow = new MeshBasicMaterial({
    map: textures.shadow,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    ...flat,
  });
  return { ground, walls, roof, road, walk, curb, shadow };
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

function addGroundQuad(buf, x0, z0, x1, z1, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const y = 0;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  buf.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
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

const CURB_TOP = [0.34, 0.36, 0.28];
const CURB_SIDE = [0.16, 0.18, 0.14];

function addShadowQuad(buf, x0, z0, x1, z1, east) {
  const y = 1.5;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  // South strip: dark on the north edge. East strip: dark on the west edge.
  if (east) buf.uv.push(0, 1, 0, 0, 1, 0, 1, 1);
  else buf.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addCurb(buf, x0, z0, x1, z1, outward) {
  const y0 = 0.5;
  const y1 = 5;
  addQuad(buf, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], CURB_TOP);
  if (outward === "s") addQuad(buf, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], CURB_SIDE);
  else if (outward === "n") addQuad(buf, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], CURB_SIDE);
  else if (outward === "e") addQuad(buf, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], CURB_SIDE);
  else addQuad(buf, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], CURB_SIDE);
}

function isCurbNeighbor(cell) {
  return cell === "H" || cell === "V" || cell === "+" || cell === "h" || cell === "v"
    || cell === "X" || cell === "A" || cell === "E" || cell === "a" || cell === "e" || cell === "n"
    || cell === "1" || cell === "2" || cell === "4" || cell === "5" || cell === "6" || cell === "8";
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

function buildChunk(map, cx, cz, materials, markings) {
  const x1 = Math.min(map.cols, cx + CHUNK);
  const z1 = Math.min(map.rows, cz + CHUNK);
  const groundBufs = new Map();
  const wallBufs = new Map();
  const roofBuf = { pos: [], uv: [], idx: [], col: [] };
  const roadBuf = { pos: [], uv: [], idx: [] };
  const walkBuf = { pos: [], uv: [], idx: [] };
  const curbBuf = { pos: [], uv: [], idx: [], col: [] };
  const shadowBuf = { pos: [], uv: [], idx: [] };
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
      const i = z * map.cols + x;
      const roadPat = markings.pattern[i];
      const walkPat = markings.walk[i];
      if (roadPat >= 0) {
        const col = roadPat % ROAD_COLS;
        const rowIndex = Math.floor(roadPat / ROAD_COLS);
        const [u0, v0, u1, v1] = cellUV(col, rowIndex, ROAD_COLS, ROAD_ROWS);
        addGroundQuad(roadBuf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, u0, v0, u1, v1);
        continue;
      }
      if (walkPat >= 0) {
        const col = walkPat % WALK_COLS;
        const rowIndex = Math.floor(walkPat / WALK_COLS);
        const [u0, v0, u1, v1] = cellUV(col, rowIndex, WALK_COLS, WALK_ROWS);
        addGroundQuad(walkBuf, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, u0, v0, u1, v1);
        if (isCurbNeighbor(at(x, z - 1))) addCurb(curbBuf, x * TILE, z * TILE, (x + 1) * TILE, z * TILE + 6, "n");
        if (isCurbNeighbor(at(x, z + 1))) addCurb(curbBuf, x * TILE, (z + 1) * TILE - 6, (x + 1) * TILE, (z + 1) * TILE, "s");
        if (isCurbNeighbor(at(x - 1, z))) addCurb(curbBuf, x * TILE, z * TILE, x * TILE + 6, (z + 1) * TILE, "w");
        if (isCurbNeighbor(at(x + 1, z))) addCurb(curbBuf, (x + 1) * TILE - 6, z * TILE, (x + 1) * TILE, (z + 1) * TILE, "e");
        continue;
      }
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
    const reach = TILE * Math.min(3.4, 1.7 + Math.max(building.w, building.d) * 0.16);
    const bx = building.x * TILE;
    const bz = building.z * TILE;
    const bw = building.w * TILE;
    const bd = building.d * TILE;
    addShadowQuad(shadowBuf, bx, bz + bd - 4, bx + bw + reach, bz + bd + reach, false);
    addShadowQuad(shadowBuf, bx + bw - 4, bz, bx + bw + reach, bz + bd, true);
    minX = Math.min(minX, bx);
    maxX = Math.max(maxX, bx + bw + reach);
    minZ = Math.min(minZ, bz);
    maxZ = Math.max(maxZ, bz + bd + reach);
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
  addMesh(roadBuf, materials.road);
  addMesh(walkBuf, materials.walk);
  addMesh(curbBuf, materials.curb, true);
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
  if (shadowBuf.idx.length > 0) {
    const mesh = new Mesh(geometryFrom(shadowBuf, false), materials.shadow);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 2;
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
  const textures = await createTextures();
  const materials = createMaterials(textures);
  const markings = classifyMarkings(map);
  const chunks = [];
  for (let cz = 0; cz < map.rows; cz += CHUNK) {
    for (let cx = 0; cx < map.cols; cx += CHUNK) {
      const chunk = buildChunk(map, cx, cz, materials, markings);
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
  const minX = camX - GROUND_W / 2 - margin;
  const maxX = camX + GROUND_W / 2 + margin;
  const minZ = camZ - GROUND_H / 2 - margin;
  const maxZ = camZ + GROUND_H / 2 + margin + southMargin;
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
