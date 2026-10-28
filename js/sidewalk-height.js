// Foot height for people on foot. Kenney road pieces are scaled uniformly, so
// the curb in the mesh is a real step. Cars stay on the asphalt. A walker
// whose feet are over the raised lip stands on that lip's top, read from the
// mesh, and eases up across a short run at the curb edge.

import { TILE } from "./constants.js";
import { KITS } from "./kenney-city-catalog.js";

// Same origin the road batches use when they place a piece.
const PIECE_Y = 0.2;
const MODULE = 4;
// The curb wall is vertical, so the mesh gives the rise and no run. The step
// spreads that rise across three times its height, which stays on the curb
// instead of ramping the whole sidewalk.
const STEP_RUN = 3;
const CELL = 240;

const ROAD_URL = new Map();
for (const kit of KITS) {
  if (kit.id !== "roads") continue;
  for (const item of kit.files) {
    if (item.file && item.url) ROAD_URL.set(item.file, item.url);
  }
}

function smoothstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function modelOf(piece, wx, wz) {
  const scale = piece.scale ?? 1;
  const dx = (wx / TILE - (piece.x + 0.5)) / (MODULE * scale);
  const dz = (wz / TILE - (piece.z + 0.5)) / (MODULE * scale);
  const turn = ((piece.turn % 4) + 4) % 4;
  let lx;
  let lz;
  if (turn === 0) {
    lx = dx;
    lz = dz;
  } else if (turn === 1) {
    lx = -dz;
    lz = dx;
  } else if (turn === 2) {
    lx = -dx;
    lz = -dz;
  } else {
    lx = dz;
    lz = -dx;
  }
  if (piece.mirror) lx = -lx;
  return { lx, lz, size: MODULE * TILE * scale };
}

function quant(n) {
  return Math.round(n * 10000);
}

function vertexKey(x, y, z) {
  return `${quant(x)},${quant(y)},${quant(z)}`;
}

function edgeKey(ax, ay, az, bx, by, bz) {
  const a = vertexKey(ax, ay, az);
  const b = vertexKey(bx, by, bz);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

function planeY(tri, px, pz) {
  const ax = tri.ax;
  const az = tri.az;
  const v0x = tri.cx - ax;
  const v0z = tri.cz - az;
  const v1x = tri.bx - ax;
  const v1z = tri.bz - az;
  const v2x = px - ax;
  const v2z = pz - az;
  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const den = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(den) < 1e-12) return tri.avgY;
  const u = (dot11 * dot02 - dot01 * dot12) / den;
  const v = (dot00 * dot12 - dot01 * dot02) / den;
  return (1 - u - v) * tri.ay + v * tri.by + u * tri.cy;
}

function contains(px, pz, tri) {
  const ax = tri.ax;
  const az = tri.az;
  const v0x = tri.cx - ax;
  const v0z = tri.cz - az;
  const v1x = tri.bx - ax;
  const v1z = tri.bz - az;
  const v2x = px - ax;
  const v2z = pz - az;
  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const den = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(den) < 1e-12) return null;
  const u = (dot11 * dot02 - dot01 * dot12) / den;
  const v = (dot00 * dot12 - dot01 * dot02) / den;
  if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) return null;
  return (1 - u - v) * tri.ay + v * tri.by + u * tri.cy;
}

// Upward faces that drop, across a wall, onto a lower upward face are the
// sidewalk. The shared top edge of that wall is the curb. Coplanar neighbours
// of those faces are the rest of the same lip.
export function sidewalkMesh(buffer) {
  const geometry = readGlbTriangles(buffer);
  if (!geometry) return emptySurface();
  const tris = geometry.map((verts) => {
    const [a, b, c] = verts;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return {
      ax: a[0], ay: a[1], az: a[2],
      bx: b[0], by: b[1], bz: b[2],
      cx: c[0], cy: c[1], cz: c[2],
      ny: ny / len,
      avgY: (a[1] + b[1] + c[1]) / 3,
      verts,
      sidewalk: false,
    };
  });
  const edgeMap = new Map();
  for (const tri of tris) {
    const corners = [
      [tri.ax, tri.ay, tri.az],
      [tri.bx, tri.by, tri.bz],
      [tri.cx, tri.cy, tri.cz],
    ];
    tri.edges = [];
    for (let i = 0; i < 3; i += 1) {
      const p = corners[i];
      const q = corners[(i + 1) % 3];
      const key = edgeKey(p[0], p[1], p[2], q[0], q[1], q[2]);
      tri.edges.push(key);
      let list = edgeMap.get(key);
      if (!list) {
        list = [];
        edgeMap.set(key, list);
      }
      list.push(tri);
    }
  }
  const upward = tris.filter((tri) => tri.ny > 0.5);
  const atVertex = new Map();
  for (const tri of upward) {
    for (const vert of tri.verts) {
      const key = vertexKey(vert[0], vert[1], vert[2]);
      let list = atVertex.get(key);
      if (!list) {
        list = [];
        atVertex.set(key, list);
      }
      list.push(tri);
    }
  }
  const lips = [];
  for (const tri of upward) {
    for (const key of tri.edges) {
      for (const other of edgeMap.get(key)) {
        if (other === tri || other.ny > 0.5) continue;
        // A sloped lip's lowest vertex can sit under the far end of the curb,
        // so the drop is measured against the lip's own plane, not its min Y.
        const lower = other.verts.filter((vert) => planeY(tri, vert[0], vert[2]) - vert[1] > 1e-4);
        if (lower.length === 0) continue;
        let landed = false;
        for (const vert of lower) {
          const hits = atVertex.get(vertexKey(vert[0], vert[1], vert[2]));
          if (!hits) continue;
          if (hits.some((face) => face !== tri && planeY(face, vert[0], vert[2]) < planeY(tri, vert[0], vert[2]) - 1e-4)) {
            landed = true;
          }
        }
        if (!landed) continue;
        tri.sidewalk = true;
        const [a, b] = key.split("|");
        const pa = a.split(",").map(Number);
        const pb = b.split(",").map(Number);
        const drops = lower.map((vert) => planeY(tri, vert[0], vert[2]) - vert[1]).filter((drop) => drop > 1e-4);
        const rise = drops.reduce((sum, drop) => sum + drop, 0) / drops.length;
        if (rise > 1e-5) {
          lips.push({
            ax: pa[0] / 10000,
            az: pa[2] / 10000,
            bx: pb[0] / 10000,
            bz: pb[2] / 10000,
            rise,
          });
        }
      }
    }
  }
  const queue = upward.filter((tri) => tri.sidewalk);
  for (let i = 0; i < queue.length; i += 1) {
    const tri = queue[i];
    for (const key of tri.edges) {
      for (const other of edgeMap.get(key)) {
        // The curb itself is vertical, so it is not an upward neighbour.
        // A sloped lip is several upward faces that share edges.
        if (other.ny <= 0.5 || other.sidewalk) continue;
        other.sidewalk = true;
        queue.push(other);
      }
    }
  }
  const tops = upward.filter((tri) => tri.sidewalk);
  let radius = 0;
  for (const tri of tops) {
    radius = Math.max(radius, Math.hypot(tri.ax, tri.az), Math.hypot(tri.bx, tri.bz), Math.hypot(tri.cx, tri.cz));
  }
  return { tris: tops, lips, radius };
}

function emptySurface() {
  return { tris: [], lips: [], radius: 0 };
}

// Model-space sample. y is the lip top under the point, dist is the distance
// to the curb edge, rise is that curb's height.
export function sampleSidewalk(surface, lx, lz) {
  if (!surface || surface.tris.length === 0) return null;
  let y = null;
  for (const tri of surface.tris) {
    const at = contains(lx, lz, tri);
    if (at == null) continue;
    if (y == null || at > y) y = at;
  }
  if (y == null) return null;
  let dist = Infinity;
  let rise = 0;
  for (const lip of surface.lips) {
    const along = distToSeg(lx, lz, lip.ax, lip.az, lip.bx, lip.bz);
    if (along < dist) {
      dist = along;
      rise = lip.rise;
    }
  }
  if (!Number.isFinite(dist)) return { y, dist: Infinity, rise: 0 };
  return { y, dist, rise };
}

// World foot height on one placed piece, or null when the point is not on
// that piece's sidewalk.
export function feetOnPiece(piece, surface, wx, wz, streetY) {
  const { lx, lz, size } = modelOf(piece, wx, wz);
  const hit = sampleSidewalk(surface, lx, lz);
  if (!hit) return null;
  const high = PIECE_Y + hit.y * size;
  if (!(hit.rise > 0)) return high;
  const low = high - hit.rise * size;
  const blend = hit.rise * STEP_RUN;
  const street = streetY == null ? 0.6 : streetY;
  if (hit.dist >= blend) return high;
  const base = street >= low && street <= high ? street : low;
  return base + (high - base) * smoothstep(hit.dist / blend);
}

function readGlbTriangles(buffer) {
  let bytes;
  if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
  else bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const view = new DataView(copy.buffer);
  if (copy.byteLength < 20) return null;
  if (view.getUint32(0, true) !== 0x46546c67) return null;
  const jsonLen = view.getUint32(12, true);
  const jsonStart = 20;
  if (jsonStart + jsonLen + 8 > copy.byteLength) return null;
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(copy.subarray(jsonStart, jsonStart + jsonLen)));
  } catch {
    return null;
  }
  const binHeader = jsonStart + jsonLen;
  const binLen = view.getUint32(binHeader, true);
  const binStart = binHeader + 8;
  const bin = copy.subarray(binStart, binStart + binLen);
  const binView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const meshes = json.meshes || [];
  const tris = [];
  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      if (prim.mode != null && prim.mode !== 4) continue;
      const positions = attributeVec3(json, binView, prim.attributes && prim.attributes.POSITION);
      if (!positions) continue;
      const indices = prim.indices == null
        ? positions.map((_, index) => index)
        : attributeIndices(json, binView, prim.indices);
      if (!indices) continue;
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = positions[indices[i]];
        const b = positions[indices[i + 1]];
        const c = positions[indices[i + 2]];
        if (!a || !b || !c) continue;
        tris.push([a, b, c]);
      }
    }
  }
  return tris.length > 0 ? tris : null;
}

function accessorView(json, binView, index) {
  const accessor = json.accessors[index];
  if (!accessor) return null;
  const bufferView = json.bufferViews[accessor.bufferView];
  if (!bufferView) return null;
  const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  return { accessor, start, stride: bufferView.byteStride || 0, view: binView };
}

function attributeVec3(json, binView, index) {
  if (index == null) return null;
  const packed = accessorView(json, binView, index);
  if (!packed || packed.accessor.componentType !== 5126 || packed.accessor.type !== "VEC3") return null;
  const stride = packed.stride || 12;
  const out = [];
  for (let i = 0; i < packed.accessor.count; i += 1) {
    const offset = packed.start + i * stride;
    if (offset + 12 > packed.view.byteLength) return null;
    out.push([
      packed.view.getFloat32(offset, true),
      packed.view.getFloat32(offset + 4, true),
      packed.view.getFloat32(offset + 8, true),
    ]);
  }
  return out;
}

function attributeIndices(json, binView, index) {
  const packed = accessorView(json, binView, index);
  if (!packed || packed.accessor.type !== "SCALAR") return null;
  const type = packed.accessor.componentType;
  const width = type === 5121 ? 1 : type === 5123 ? 2 : type === 5125 ? 4 : 0;
  if (!width) return null;
  const stride = packed.stride || width;
  const out = [];
  for (let i = 0; i < packed.accessor.count; i += 1) {
    const offset = packed.start + i * stride;
    if (offset + width > packed.view.byteLength) return null;
    if (type === 5121) out.push(packed.view.getUint8(offset));
    else if (type === 5123) out.push(packed.view.getUint16(offset, true));
    else out.push(packed.view.getUint32(offset, true));
  }
  return out;
}

export function createSidewalkIndex(fetchBuffer) {
  const byUrl = new Map();
  const byFile = new Map();
  let placed = [];
  let grid = new Map();
  let epoch = 0;
  let ready = Promise.resolve();

  function surfaceOf(file) {
    const stored = byFile.get(file);
    if (!stored || stored instanceof Promise) return null;
    return stored;
  }

  async function ensure(file) {
    if (byFile.has(file)) {
      const stored = byFile.get(file);
      return stored instanceof Promise ? stored : null;
    }
    const url = ROAD_URL.get(file);
    if (!url || typeof fetchBuffer !== "function") {
      byFile.set(file, null);
      return null;
    }
    if (!byUrl.has(url)) {
      byUrl.set(url, Promise.resolve(fetchBuffer(url)).then((buf) => {
        if (!buf) return null;
        return sidewalkMesh(buf);
      }).catch(() => null));
    }
    const pending = byUrl.get(url);
    byFile.set(file, pending);
    const surface = await pending;
    byFile.set(file, surface);
    return null;
  }

  function rebuild() {
    const next = new Map();
    for (const piece of placed) {
      const surface = surfaceOf(piece.file);
      if (!surface || surface.radius <= 0) continue;
      const scale = piece.scale ?? 1;
      const reach = surface.radius * MODULE * TILE * scale + 1;
      const cx = (piece.x + 0.5) * TILE;
      const cz = (piece.z + 0.5) * TILE;
      const x0 = Math.floor((cx - reach) / CELL);
      const x1 = Math.floor((cx + reach) / CELL);
      const z0 = Math.floor((cz - reach) / CELL);
      const z1 = Math.floor((cz + reach) / CELL);
      for (let z = z0; z <= z1; z += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const key = `${x},${z}`;
          let list = next.get(key);
          if (!list) {
            list = [];
            next.set(key, list);
          }
          list.push(piece);
        }
      }
    }
    grid = next;
  }

  function setPieces(list) {
    const roads = (Array.isArray(list) ? list : []).filter((piece) => piece && piece.kit === "roads" && piece.file);
    const token = epoch + 1;
    epoch = token;
    const job = Promise.all(roads.map((piece) => ensure(piece.file))).then(() => {
      if (token !== epoch) return;
      placed = roads;
      rebuild();
    });
    ready = job;
    return job;
  }

  function feetY(wx, wz, streetY) {
    const street = streetY == null ? 0.6 : streetY;
    const ix = Math.floor(wx / CELL);
    const iz = Math.floor(wz / CELL);
    const seen = new Set();
    let best = null;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = grid.get(`${ix + dx},${iz + dz}`);
        if (!list) continue;
        for (const piece of list) {
          if (seen.has(piece)) continue;
          seen.add(piece);
          const y = feetOnPiece(piece, surfaceOf(piece.file), wx, wz, street);
          if (y == null) continue;
          if (best == null || y > best) best = y;
        }
      }
    }
    return best == null ? street : best;
  }

  return {
    setPieces,
    feetY,
    get ready() {
      return ready;
    },
  };
}
