import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { TILE } from "./constants.js";

// Ted's street strips are 1280×720. Rows 0–103 sidewalk, 104–124 curb,
// 125–602 asphalt (478 px, yellow dashes in the middle), 603–622 curb,
// 623–719 sidewalk. One texel becomes one world unit.

const ASPHALT_ROW = 125;
const ASPHALT_PX = 478;
const STRIP_W = 1280;
const STRIP_H = 720;
const ZEBRA_U = 588 / STRIP_W;
const CENTER_X = 130;
const CENTER_Z = 130;

const H_SEED = new Set(["H", "h", "1", "2", "4"]);
const V_SEED = new Set(["V", "v", "5", "6", "8"]);
const RING = new Set(["1", "2", "4", "5", "6", "8"]);
const SHOULDER = new Set(["+", "X"]);
const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"]);
const WALK = new Set(["s", "n", "p", "c", "l"]);

const NAMES = {
  olive: ["plain", "oil", "patch", "dirty", "crosswalk"],
  concrete: ["plain", "oil", "patch", "dirty"],
  worn: ["plain", "oil", "patch", "dirty"],
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A ground texture failed to load."));
    image.src = url;
  });
}

function mix(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function pickVariant(h) {
  const roll = h % 10;
  if (roll < 7) return "plain";
  if (roll === 7) return "oil";
  if (roll === 8) return "patch";
  return "dirty";
}

function makeTexture(canvas, repeatT) {
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = repeatT ? RepeatWrapping : ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function scaledCanvas(image, sx, sy, sw, sh, dw, dh) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, dw);
  canvas.height = Math.max(1, dh);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function addQuad(buf, x0, z0, x1, z1, u0, v0, u1, v1) {
  const y = 0;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Vertical streets run the strip's length along Z and its width along X.
// U follows Z and V follows X, so the four corners are not a simple u(x), v(z) pair.
function addVerticalStrip(buf, x0, z0, x1, z1, u0, v0, u1, v1) {
  const y = 0;
  const base = buf.pos.length / 3;
  buf.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  buf.uv.push(u0, v0, u0, v1, u1, v1, u1, v0);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function texWidth(roadW) {
  return Math.max(1, Math.round((STRIP_W * roadW) / ASPHALT_PX));
}

export async function createGround(map, skipRoad = () => false) {
  const { cols, rows, ground } = map;
  const images = new Map();
  const jobs = [];
  for (const [zone, variants] of Object.entries(NAMES)) {
    for (const variant of variants) {
      const name = `street_${zone}_${variant}`;
      jobs.push(loadImage(new URL(`../assets/textures/ground/${name}.webp`, import.meta.url)).then((image) => {
        images.set(name, image);
      }));
    }
  }
  for (const name of ["sidewalk_olive", "sidewalk_concrete", "sidewalk_worn", "sidewalk_hex"]) {
    jobs.push(loadImage(new URL(`../assets/textures/ground/${name}.webp`, import.meta.url)).then((image) => {
      images.set(name, image);
    }));
  }
  await Promise.all(jobs);

  const materials = new Map();
  const textures = new Map();
  const materialFor = (key, canvas, repeatT) => {
    if (materials.has(key)) return key;
    const texture = makeTexture(canvas, repeatT);
    textures.set(key, texture);
    materials.set(key, new MeshBasicMaterial({
      map: texture,
      side: DoubleSide,
      toneMapped: false,
    }));
    return key;
  };

  const stripKey = (zone, variant, tiles) => {
    const key = `strip:${zone}:${variant}:${tiles}`;
    if (materials.has(key)) return key;
    const roadW = tiles * TILE;
    const image = images.get(`street_${zone}_${variant}`);
    const canvas = scaledCanvas(
      image,
      0,
      0,
      STRIP_W,
      STRIP_H,
      texWidth(roadW),
      Math.max(1, Math.round((STRIP_H * roadW) / ASPHALT_PX)),
    );
    return materialFor(key, canvas, false);
  };

  const asphaltKey = (zone, tiles) => {
    const key = `asphalt:${zone}:${tiles}`;
    if (materials.has(key)) return key;
    const roadW = tiles * TILE;
    const scale = roadW / ASPHALT_PX;
    const image = images.get(`street_${zone}_plain`);
    const canvas = scaledCanvas(image, 0, 200, 256, 80, Math.max(1, Math.round(256 * scale)), Math.max(1, Math.round(80 * scale)));
    return materialFor(key, canvas, true);
  };

  const walkKey = (zone, tiles) => {
    const key = `walk:${zone}:${tiles}`;
    if (materials.has(key)) return key;
    const roadW = tiles * TILE;
    const scale = roadW / ASPHALT_PX;
    const image = images.get(zone === "hex" ? "sidewalk_hex" : `sidewalk_${zone}`);
    const size = Math.max(1, Math.round(image.width * scale));
    const canvas = scaledCanvas(image, 0, 0, image.width, image.height, size, size);
    return materialFor(key, canvas, true);
  };

  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };

  const hBody = Array.from({ length: rows }, () => new Uint8Array(cols));
  const vBody = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      if (H_SEED.has(cell)) hBody[z][x] = 1;
      if (V_SEED.has(cell)) vBody[z][x] = 1;
    }
  }
  const spread = (body, seeds, vertical) => {
    for (let z = 0; z < rows; z += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (!seeds.has(at(x, z))) continue;
        for (const sign of [-1, 1]) {
          let step = 1;
          while (step < 6) {
            const xx = vertical ? x + sign * step : x;
            const zz = vertical ? z : z + sign * step;
            if (!SHOULDER.has(at(xx, zz))) break;
            body[zz][xx] = 1;
            step += 1;
          }
        }
      }
    }
  };
  spread(hBody, H_SEED, false);
  spread(vBody, V_SEED, true);

  const ringDist = Array.from({ length: rows }, () => new Int16Array(cols).fill(32767));
  const ringX = Array.from({ length: rows }, () => new Int16Array(cols));
  const ringZ = Array.from({ length: rows }, () => new Int16Array(cols));
  const queue = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!RING.has(at(x, z))) continue;
      ringDist[z][x] = 0;
      ringX[z][x] = x;
      ringZ[z][x] = z;
      queue.push(x, z);
    }
  }
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const z = queue[head + 1];
    const next = ringDist[z][x] + 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= cols || zz >= rows || ringDist[zz][xx] <= next) continue;
      ringDist[zz][xx] = next;
      ringX[zz][xx] = ringX[z][x];
      ringZ[zz][xx] = ringZ[z][x];
      queue.push(xx, zz);
    }
  }

  const zoneOf = (x, z, ringStreet) => {
    if (ringStreet) return "concrete";
    const rx = ringX[z][x];
    const rz = ringZ[z][x];
    const here = (x - CENTER_X) ** 2 + (z - CENTER_Z) ** 2;
    const gate = (rx - CENTER_X) ** 2 + (rz - CENTER_Z) ** 2;
    return here > gate ? "worn" : "olive";
  };

  const spanCache = new Map();
  const spanOf = (x, z, horizontal) => {
    const id = (z * cols + x) * 2 + (horizontal ? 1 : 0);
    const cached = spanCache.get(id);
    if (cached) return cached;
    const body = horizontal ? hBody : vBody;
    const other = horizontal ? vBody : hBody;
    let a = horizontal ? z : x;
    let b = a;
    const fixed = horizontal ? x : z;
    const inside = (t) => {
      const xx = horizontal ? fixed : t;
      const zz = horizontal ? t : fixed;
      return body[zz][xx] === 1;
    };
    while (inside(a - 1)) a -= 1;
    while (inside(b + 1)) b += 1;
    let crossing = false;
    let ringStreet = false;
    for (let t = a; t <= b; t += 1) {
      const xx = horizontal ? fixed : t;
      const zz = horizontal ? t : fixed;
      if (other[zz][xx]) crossing = true;
      if (RING.has(at(xx, zz))) ringStreet = true;
    }
    const tiles = Math.max(1, Math.min(6, b - a + 1));
    const value = {
      a,
      b,
      tiles,
      crossing,
      zone: zoneOf(x, z, ringStreet),
      texW: texWidth(tiles * TILE),
    };
    for (let t = a; t <= b; t += 1) {
      const xx = horizontal ? fixed : t;
      const zz = horizontal ? t : fixed;
      spanCache.set((zz * cols + xx) * 2 + (horizontal ? 1 : 0), value);
    }
    return value;
  };

  const variantMemo = new Map();
  const variantAt = (seed, chunk) => {
    const key = `${seed}:${chunk}`;
    const found = variantMemo.get(key);
    if (found) return found;
    let prev = "plain";
    let name = "plain";
    for (let i = 0; i <= chunk; i += 1) {
      let next = pickVariant(mix(seed, i + 1));
      if (next !== "plain" && next === prev) next = "plain";
      if (next !== "plain") prev = next;
      name = next;
      variantMemo.set(`${seed}:${i}`, name);
    }
    return name;
  };

  // A street cell is part of a junction when the crossing street touches this
  // cross-section, even if the other axis sits on the next tile.
  const touchesCrossing = (along, span, horizontal) => {
    if (horizontal) {
      for (let t = span.a - 1; t <= span.b + 1; t += 1) {
        if (t >= 0 && t < rows && vBody[t][along]) return true;
      }
      return false;
    }
    for (let t = span.a - 1; t <= span.b + 1; t += 1) {
      if (t >= 0 && t < cols && hBody[along][t]) return true;
    }
    return false;
  };

  const edgesOf = (x, z, horizontal) => {
    const edges = [];
    const body = horizontal ? hBody : vBody;
    const other = horizontal ? vBody : hBody;
    const span = spanOf(x, z, horizontal);
    const walk = (sign) => {
      let t = horizontal ? x : z;
      const fixed = horizontal ? z : x;
      let guard = 0;
      while (guard < cols) {
        t += sign;
        guard += 1;
        const xx = horizontal ? t : fixed;
        const zz = horizontal ? fixed : t;
        if (xx < 0 || zz < 0 || xx >= cols || zz >= rows) return;
        const onStreet = body[zz][xx] === 1;
        // The crossing street often sits on the next tile, not on this center cell.
        if (other[zz][xx] || (onStreet && touchesCrossing(t, span, horizontal))) {
          // The zebra belongs on the open street, past the plain junction fill.
          let resume = t - sign;
          let back = 0;
          while (back < 8) {
            const rx = horizontal ? resume : fixed;
            const rz = horizontal ? fixed : resume;
            if (rx < 0 || rz < 0 || rx >= cols || rz >= rows || body[rz][rx] !== 1) break;
            if (!touchesCrossing(resume, span, horizontal)) break;
            resume -= sign;
            back += 1;
          }
          const edge = sign > 0 ? (resume + 1) * TILE : resume * TILE;
          edges.push({ edge, sign });
          return;
        }
        if (!onStreet) return;
      }
    };
    walk(-1);
    walk(1);
    return edges;
  };

  const buffersOf = (buffers, key) => {
    let buf = buffers.get(key);
    if (!buf) {
      buf = { pos: [], uv: [], idx: [] };
      buffers.set(key, buf);
    }
    return buf;
  };

  const crossV = (world, north, roadW) => (ASPHALT_ROW + ((world - north) * ASPHALT_PX) / roadW) / STRIP_H;

  const paintStrip = (buffers, x0, z0, x1, z1, horizontal, span, north, sampleX, sampleZ) => {
    const { zone, tiles, texW } = span;
    const roadW = tiles * TILE;
    const seed = mix(horizontal ? span.a : span.a + cols, horizontal ? 1 : 2);
    const along0 = horizontal ? x0 : z0;
    const along1 = horizontal ? x1 : z1;
    const cross0 = horizontal ? z0 : x0;
    const cross1 = horizontal ? z1 : x1;
    const pieces = [];
    let cursor = along0;
    const near = edgesOf(sampleX, sampleZ, horizontal);
    const crosswalks = zone === "olive" ? near.filter((item) => {
      const lo = item.sign > 0 ? item.edge - texW : item.edge;
      const hi = item.sign > 0 ? item.edge : item.edge + texW;
      return hi > along0 && lo < along1;
    }) : [];
    while (cursor < along1 - 0.01) {
      let next = along1;
      let mode = "variant";
      let edge = 0;
      let sign = 1;
      for (const item of crosswalks) {
        const lo = item.sign > 0 ? item.edge - texW : item.edge;
        const hi = item.sign > 0 ? item.edge : item.edge + texW;
        if (cursor >= lo - 0.01 && cursor < hi - 0.01) {
          mode = "crosswalk";
          next = Math.min(next, hi);
          edge = item.edge;
          sign = item.sign;
          break;
        }
        if (lo > cursor && lo < next) next = lo;
      }
      if (mode === "variant") {
        const chunkEnd = (Math.floor(cursor / texW) + 1) * texW;
        next = Math.min(next, chunkEnd, along1);
      }
      if (next <= cursor + 0.001) next = along1;
      pieces.push({ a0: cursor, a1: Math.min(next, along1), mode, edge, sign });
      cursor = Math.min(next, along1);
    }
    for (const piece of pieces) {
      const variant = piece.mode === "crosswalk" ? "crosswalk" : variantAt(seed, Math.floor(piece.a0 / texW));
      const key = variant === "crosswalk" ? stripKey("olive", "crosswalk", tiles) : stripKey(zone, variant, tiles);
      const uOf = (along) => {
        if (piece.mode === "crosswalk") {
          const delta = piece.sign > 0 ? piece.edge - along : along - piece.edge;
          return delta / texW + ZEBRA_U;
        }
        return along / texW;
      };
      const v0 = crossV(cross0, north, roadW);
      const v1 = crossV(cross1, north, roadW);
      const buf = buffersOf(buffers, key);
      if (horizontal) addQuad(buf, piece.a0, cross0, piece.a1, cross1, uOf(piece.a0), v0, uOf(piece.a1), v1);
      else addVerticalStrip(buf, cross0, piece.a0, cross1, piece.a1, uOf(piece.a0), v0, uOf(piece.a1), v1);
    }
  };

  const paintRoad = (buffers, x, z) => {
    const horizontal = hBody[z][x] === 1;
    const vertical = vBody[z][x] === 1;
    if (!horizontal && !vertical) {
      const zone = zoneOf(x, z, RING.has(at(x, z)));
      const key = asphaltKey(zone, 2);
      const size = textures.get(key).image.width;
      const buf = buffersOf(buffers, key);
      const x0 = x * TILE;
      const z0 = z * TILE;
      addQuad(buf, x0, z0, x0 + TILE, z0 + TILE, x0 / size, z0 / size, (x0 + TILE) / size, (z0 + TILE) / size);
      return;
    }
    if (horizontal && vertical) {
      const spanH = spanOf(x, z, true);
      const zone = spanH.zone;
      const key = asphaltKey(zone, spanH.tiles);
      const size = textures.get(key).image.width;
      const buf = buffersOf(buffers, key);
      const x0 = x * TILE;
      const z0 = z * TILE;
      addQuad(buf, x0, z0, x0 + TILE, z0 + TILE, x0 / size, z0 / size, (x0 + TILE) / size, (z0 + TILE) / size);
      return;
    }
    const span = spanOf(x, z, horizontal);
    const along = horizontal ? x : z;
    if (span.crossing || touchesCrossing(along, span, horizontal) || span.tiles > 6) {
      const key = asphaltKey(span.zone, Math.min(span.tiles, 6));
      const size = textures.get(key).image.width;
      const buf = buffersOf(buffers, key);
      const x0 = x * TILE;
      const z0 = z * TILE;
      addQuad(buf, x0, z0, x0 + TILE, z0 + TILE, x0 / size, z0 / size, (x0 + TILE) / size, (z0 + TILE) / size);
      return;
    }
    const north = span.a * TILE;
    paintStrip(buffers, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, horizontal, span, north, x, z);
  };

  const bandFor = (x, z) => {
    let best = null;
    for (let dz = -3; dz <= 3; dz += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= cols || zz >= rows) continue;
        if (hBody[zz][xx] !== 1 && vBody[zz][xx] !== 1) continue;
        if (hBody[zz][xx] === 1 && vBody[zz][xx] === 1) continue;
        const horizontal = hBody[zz][xx] === 1;
        const span = spanOf(xx, zz, horizontal);
        if (span.crossing || touchesCrossing(horizontal ? xx : zz, span, horizontal)) continue;
        const roadW = span.tiles * TILE;
        const northExt = (ASPHALT_ROW * roadW) / ASPHALT_PX;
        const southExt = ((STRIP_H - (ASPHALT_ROW + ASPHALT_PX)) * roadW) / ASPHALT_PX;
        const cross0 = span.a * TILE - northExt;
        const cross1 = (span.b + 1) * TILE + southExt;
        const cell0 = horizontal ? z * TILE : x * TILE;
        const cell1 = cell0 + TILE;
        const overlap = Math.min(cross1, cell1) - Math.max(cross0, cell0);
        if (overlap <= 0) continue;
        if (!best || overlap > best.overlap) {
          best = { span, horizontal, north: span.a * TILE, cross0, cross1, overlap, sx: xx, sz: zz };
        }
      }
    }
    return best;
  };

  const paintWalk = (buffers, x, z, cell) => {
    const x0 = x * TILE;
    const z0 = z * TILE;
    const x1 = x0 + TILE;
    const z1 = z0 + TILE;
    if (cell === "l") {
      const zone = zoneOf(x, z, ringDist[z][x] <= 2);
      const key = asphaltKey(zone, 2);
      const size = textures.get(key).image.width;
      addQuad(buffersOf(buffers, key), x0, z0, x1, z1, x0 / size, z0 / size, x1 / size, z1 / size);
      return;
    }
    if (cell === "q") {
      const key = walkKey("hex", 2);
      const size = textures.get(key).image.width;
      addQuad(buffersOf(buffers, key), x0, z0, x1, z1, x0 / size, z0 / size, x1 / size, z1 / size);
      return;
    }
    const band = cell === "s" ? bandFor(x, z) : null;
    if (band) {
      const { span, horizontal, north, cross0, cross1, sx, sz } = band;
      if (touchesCrossing(horizontal ? x : z, span, horizontal)) {
        paintPlainWalk(buffers, x0, z0, x1, z1, span);
        return;
      }
      if (horizontal) {
        const zA = Math.max(z0, cross0);
        const zB = Math.min(z1, cross1);
        paintStrip(buffers, x0, zA, x1, zB, true, span, north, sx, sz);
        if (z0 < zA - 0.01) paintPlainWalk(buffers, x0, z0, x1, zA, span);
        if (zB < z1 - 0.01) paintPlainWalk(buffers, x0, zB, x1, z1, span);
      } else {
        const xA = Math.max(x0, cross0);
        const xB = Math.min(x1, cross1);
        paintStrip(buffers, xA, z0, xB, z1, false, span, north, sx, sz);
        if (x0 < xA - 0.01) paintPlainWalk(buffers, x0, z0, xA, z1, span);
        if (xB < x1 - 0.01) paintPlainWalk(buffers, xB, z0, x1, z1, span);
      }
      return;
    }
    const zone = zoneOf(x, z, ringDist[z][x] <= 2);
    paintPlainWalk(buffers, x0, z0, x1, z1, { zone, tiles: 2 });
  };

  function paintPlainWalk(buffers, x0, z0, x1, z1, span) {
    const key = walkKey(span.zone === "hex" ? "olive" : span.zone, span.tiles || 2);
    const size = textures.get(key).image.width;
    addQuad(buffersOf(buffers, key), x0, z0, x1, z1, x0 / size, z0 / size, x1 / size, z1 / size);
  }

  return {
    covers(x, z) {
      const cell = at(x, z);
      return ROAD.has(cell) || WALK.has(cell) || cell === "q";
    },
    paint(buffers, x, z) {
      const cell = at(x, z);
      if (ROAD.has(cell)) {
        const mode = skipRoad(x, z);
        if (mode === true || mode === "skip") return;
        if (mode === "walk") {
          const zone = zoneOf(x, z, ringDist[z][x] <= 2);
          paintPlainWalk(buffers, x * TILE, z * TILE, (x + 1) * TILE, (z + 1) * TILE, { zone, tiles: 2 });
          return;
        }
        paintRoad(buffers, x, z);
      } else paintWalk(buffers, x, z, cell);
    },
    material(key) {
      return materials.get(key);
    },
  };
}
