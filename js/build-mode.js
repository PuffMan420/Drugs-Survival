import {
  Box3,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Plane,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AO_SKIP_LAYER, TILE } from "./constants.js";
import { KITS } from "./kenney-city-catalog.js";
import { roadKey, roadRecord } from "./kenney-roads.js";

// One Kenney unit is the same 4-tile module as the road pieces already on
// the west bank. Scale is uniform so a building keeps the height in the file.
// The suburban kit asks for nearest filtering; draw it with linear filtering
// and leave the file alone.
const UNIT = 4 * TILE;
const GROUND_Y = 0.2;
const MAP_URL = "./west-map.json";
const STORAGE_KEY = "west-map";
const SCALE_STEP = 0.25;
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;
const VIEW_MIN = 0.5;
const VIEW_MAX = 3;

const catalog = new Map();
for (const kit of KITS) {
  for (const item of kit.files) catalog.set(`${kit.id}/${item.file}`, item);
}

// Registered while this module loads, before main.js binds walking keys.
// On window, capture and bubble listeners share one target, so this has to
// run first and stop the event. S stays free so it can walk south.
// Swedish layout: the + key grows the piece and 0 shrinks it.
function brushScale(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (event.key === "+" || event.code === "NumpadAdd") return 1;
  if (event.key === "0") return -1;
  return 0;
}

const keys = {
  enabled: () => false,
  onB: () => {},
  onR: () => {},
  onP: () => {},
  onX: () => {},
  onF: () => {},
  onScale: () => {},
};
let searchInput = null;
let leftShift = false;
window.addEventListener("keydown", (event) => {
  if (event.code === "ShiftLeft") leftShift = true;
  // Keys typed into the piece search must not walk, save, rotate, resize, or mirror.
  if (searchInput && event.target === searchInput) return;
  if (event.repeat) return;
  if (event.code === "KeyB") {
    event.preventDefault();
    event.stopImmediatePropagation();
    keys.onB();
    return;
  }
  if (!keys.enabled()) return;
  const direction = brushScale(event);
  if (event.code !== "KeyR" && event.code !== "KeyP" && event.code !== "KeyX" && event.code !== "KeyF" && direction === 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "KeyR") keys.onR();
  else if (event.code === "KeyP") keys.onP();
  else if (event.code === "KeyX") keys.onX();
  else if (event.code === "KeyF") keys.onF();
  else keys.onScale(direction);
}, true);
window.addEventListener("keyup", (event) => {
  if (event.code === "ShiftLeft") leftShift = false;
}, true);
window.addEventListener("blur", () => {
  leftShift = false;
});

function modelUrl(path) {
  return new URL(`../${path}`, import.meta.url).href;
}

const textureLoader = new TextureLoader();
const skinTextures = new Map();

function loadSkinTexture(url, wrap = ClampToEdgeWrapping) {
  if (!url) return Promise.resolve(null);
  const key = `${wrap}:${url}`;
  const cached = skinTextures.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = textureLoader.loadAsync(modelUrl(url)).then((texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = true;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    skinTextures.set(key, texture);
    return texture;
  });
  skinTextures.set(key, pending);
  return pending;
}

// road-straight skins keep the original mesh. Its UVs point into the Kenney
// atlas, so a full road PNG is projected across the top: u runs from the
// mesh bounding box along X (0 at min X, 1 at max X), so a 1-long piece and
// a half piece both span the whole texture. Width stays along Z. flipY is
// true, so v = 0 is the bottom of the image and the curb bands (top and
// bottom 10%) land on 0.4 <= |z| <= 0.5. Faces whose normal runs along Z
// are the curb walls; they sweep that same band instead of holding one
// texture row. The mesh is cloned first so the shared road-straight
// geometry stays untouched.
function paintStraightSkin(root, texture) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    let geometry = obj.geometry.clone();
    if (!geometry.getAttribute("normal")) {
      geometry = geometry.toNonIndexed();
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    const minX = geometry.boundingBox.min.x;
    const maxX = geometry.boundingBox.max.x;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    if (position && uv) {
      for (let i = 0; i < position.count; i += 1) {
        uv.setXY(i, (position.getX(i) - minX) / (maxX - minX), position.getZ(i) + 0.5);
        if (normal && Math.abs(normal.getZ(i)) > 0.5) {
          const y = position.getY(i);
          const z = position.getZ(i);
          const d = (0.02 - y) * 5; // 0..0.1 across the curb band
          const outer = Math.abs(Math.abs(z) - 0.5) < 1e-3;
          const edge = outer ? d : 0.1 - d;
          uv.setY(i, z < 0 ? edge : 1 - edge);
        }
      }
      uv.needsUpdate = true;
    }
    obj.geometry = geometry;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.map = texture;
      if (copy.color) copy.color.set(0xffffff);
      copy.needsUpdate = true;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

// road-bend skins keep the Kenney quarter bend. The arc is a unit quarter
// disc centred at (x, z) = (-0.5, 0.5): u runs along the arc and v runs
// with the radius, so a straight-road PNG wraps the curve. flipY is true.
// Curb walls are the faces whose normal runs along the radius; they sweep
// the same 10% band as a straight skin. The mesh is cloned first so the
// shared road-bend geometry stays untouched.
function paintBendSkin(root, texture) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    let geometry = obj.geometry.clone();
    if (!geometry.getAttribute("normal")) {
      geometry = geometry.toNonIndexed();
      geometry.computeVertexNormals();
    }
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    if (position && uv) {
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const dx = x + 0.5;
        const dz = 0.5 - z;
        const r = Math.hypot(dx, dz);
        uv.setXY(i, Math.atan2(dz, dx) / (Math.PI / 2), r);
        if (normal && r > 0) {
          // dz is (0.5 - z), so the mesh z component of the outward radius flips.
          const along = Math.abs(normal.getX(i) * dx + normal.getZ(i) * (z - 0.5)) / r;
          if (along > 0.5) {
            const d = (0.02 - y) * 5;
            const outer = r < 1e-3 || Math.abs(r - 1) < 1e-3;
            const edge = outer ? d : 0.1 - d;
            uv.setY(i, r < 0.5 ? edge : 1 - edge);
          }
        }
      }
      uv.needsUpdate = true;
    }
    obj.geometry = geometry;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.map = texture;
      if (copy.color) copy.color.set(0xffffff);
      copy.needsUpdate = true;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

// These Kenney meshes are one flat junction. A skin projects the PNG across
// the piece: E is half the width, the bounding box max X. Curb walls sample
// a point shifted back along the horizontal normal by the curb band, so the
// wall shows the same edge of the picture as the top. flipY and clamp-to-edge
// come from the skin texture loader. Geometry and materials are cloned first.
const PLANAR_MESH = new Set([
  "road-bend-square.glb",
  "road-crossing.glb",
  "road-crossroad.glb",
  "road-crossroad-path.glb",
  "road-curve.glb",
  "road-curve-intersection.glb",
  "road-intersection.glb",
  "road-intersection-path.glb",
  "road-roundabout.glb",
]);

function paintPlanarSkin(root, texture) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    let geometry = obj.geometry.clone();
    if (!geometry.getAttribute("normal")) {
      geometry = geometry.toNonIndexed();
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    const extent = geometry.boundingBox.max.x;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    if (position && uv && extent > 0) {
      const span = extent * 2;
      for (let i = 0; i < position.count; i += 1) {
        let x = position.getX(i);
        let z = position.getZ(i);
        if (normal && Math.abs(normal.getY(i)) < 0.5) {
          const nx = normal.getX(i);
          const nz = normal.getZ(i);
          const horizontal = Math.hypot(nx, nz);
          if (horizontal > 0) {
            const d = Math.max(0, (0.02 - position.getY(i)) * 5);
            x -= (nx / horizontal) * d;
            z -= (nz / horizontal) * d;
          }
        }
        uv.setXY(i, (x + extent) / span, (extent - z) / span);
      }
      uv.needsUpdate = true;
    }
    obj.geometry = geometry;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.map = texture;
      if (copy.color) copy.color.set(0xffffff);
      copy.needsUpdate = true;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

// road-slant-high skins keep the Kenney ramp and parent the matching barrier
// at the same origin. Length runs along X: the deck rises from y=0 at x=-0.5
// to about y=0.52 at x=0.5, and the width runs along Z. Top faces take the
// straight-road texture. Outer side walls take sideTexture, and when
// sideTextureB is set the negative-Z wall uses that fourth material with a
// flipped u. Inward curb faces sit near |z|≈0.4; they stay on the top texture.
// The back wall, bottom, and any other face take backTexture, with u flipped
// so text reads the right way. barrierTexture, when set, wraps the barrier
// instead of sampling the road's curb band. Geometry and materials are cloned
// first so the shared Kenney files stay untouched.
function rampFaceKind(nx, ny, nz) {
  if (ny > 0.3) return 0;
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (az >= ax && az >= ay) return 1;
  return 2;
}

function triangleNormal(position, i0, i1, i2) {
  const ax = position.getX(i0);
  const ay = position.getY(i0);
  const az = position.getZ(i0);
  const abx = position.getX(i1) - ax;
  const aby = position.getY(i1) - ay;
  const abz = position.getZ(i1) - az;
  const acx = position.getX(i2) - ax;
  const acy = position.getY(i2) - ay;
  const acz = position.getZ(i2) - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return {
    nx: nx / len,
    ny: ny / len,
    nz: nz / len,
    cx: (ax + position.getX(i1) + position.getX(i2)) / 3,
    cy: (ay + position.getY(i1) + position.getY(i2)) / 3,
    cz: (az + position.getZ(i1) + position.getZ(i2)) / 3,
  };
}

function paintRampMesh(mesh, maps) {
  if (!mesh || !mesh.geometry || !maps || !maps.length) return;
  let geometry = mesh.geometry.clone();
  if (!geometry.getAttribute("normal")) {
    geometry = geometry.toNonIndexed();
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  const minX = geometry.boundingBox.min.x;
  const maxX = geometry.boundingBox.max.x;
  const spanX = maxX - minX || 1;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  if (!position || !normal) return;
  const triCount = (index ? index.count : position.count) / 3;
  const triMat = new Uint8Array(triCount);
  const vertexMode = new Uint8Array(position.count);
  vertexMode.fill(255);
  const sideB = maps.length > 3 && maps[3];

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    let kind = rampFaceKind(normal.getX(i0), normal.getY(i0), normal.getZ(i0));
    const kind1 = rampFaceKind(normal.getX(i1), normal.getY(i1), normal.getZ(i1));
    const kind2 = rampFaceKind(normal.getX(i2), normal.getY(i2), normal.getZ(i2));
    const face = triangleNormal(position, i0, i1, i2);
    if (kind !== kind1 || kind !== kind2) kind = rampFaceKind(face.nx, face.ny, face.nz);
    // Inward curb faces are kind 1 by normal but sit inside the outer wall.
    // They sample the top texture. Negative-Z outer walls can take sideTextureB.
    let mat = kind;
    let mode = kind;
    if (kind === 1 && Math.abs(face.cz) < 0.45) {
      mat = 0;
      mode = 4;
    } else if (kind === 1 && sideB && face.nz < 0) {
      mat = 3;
      mode = 3;
    }
    triMat[t] = mat;
    vertexMode[i0] = mode;
    vertexMode[i1] = mode;
    vertexMode[i2] = mode;
  }

  if (uv) {
    for (let i = 0; i < position.count; i += 1) {
      const mode = vertexMode[i];
      if (mode === 255) continue;
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (mode === 0) uv.setXY(i, (x - minX) / spanX, z + 0.5);
      else if (mode === 1) uv.setXY(i, x + 0.5, y);
      else if (mode === 2) uv.setXY(i, 0.5 - z, y);
      else if (mode === 3) uv.setXY(i, 0.5 - x, y);
      else uv.setXY(i, (x - minX) / spanX, (z > 0 ? 0.95 : 0.05) + 0.03 * y);
    }
    uv.needsUpdate = true;
  }

  const slots = maps.length;
  const order = Array.from({ length: slots }, () => []);
  for (let t = 0; t < triCount; t += 1) {
    const slot = triMat[t];
    if (slot < slots) order[slot].push(t);
  }
  if (index) {
    const src = index.array;
    const next = new src.constructor(src.length);
    let cursor = 0;
    for (let kind = 0; kind < slots; kind += 1) {
      for (const t of order[kind]) {
        next[cursor] = src[t * 3];
        next[cursor + 1] = src[t * 3 + 1];
        next[cursor + 2] = src[t * 3 + 2];
        cursor += 3;
      }
    }
    index.array.set(next);
    index.needsUpdate = true;
  } else {
    const copies = Object.keys(geometry.attributes).map((name) => {
      const attr = geometry.getAttribute(name);
      return {
        attr,
        itemSize: attr.itemSize,
        src: attr.array,
        next: new attr.array.constructor(attr.array.length),
      };
    });
    let cursor = 0;
    for (let kind = 0; kind < slots; kind += 1) {
      for (const t of order[kind]) {
        for (let v = 0; v < 3; v += 1) {
          const from = t * 3 + v;
          for (const copy of copies) {
            const dst = cursor * copy.itemSize;
            const srcAt = from * copy.itemSize;
            for (let k = 0; k < copy.itemSize; k += 1) copy.next[dst + k] = copy.src[srcAt + k];
          }
          cursor += 1;
        }
      }
    }
    for (const copy of copies) {
      copy.attr.array.set(copy.next);
      copy.attr.needsUpdate = true;
    }
  }

  geometry.clearGroups();
  let start = 0;
  for (let kind = 0; kind < slots; kind += 1) {
    const count = order[kind].length * 3;
    if (count === 0) continue;
    geometry.addGroup(start, count, kind);
    start += count;
  }

  mesh.geometry = geometry;
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!source || !source.clone) return;
  mesh.material = maps.map((map) => {
    const copy = source.clone();
    copy.map = map || null;
    if (copy.color) copy.color.set(0xffffff);
    copy.needsUpdate = true;
    return copy;
  });
}

function paintBarrierCurb(root, texture) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geometry = obj.geometry.clone();
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    if (position && uv) {
      for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const band = Math.min(1, Math.max(0, y / 0.6));
        uv.setXY(i, position.getX(i) + 0.5, 0.905 + 0.09 * band);
      }
      uv.needsUpdate = true;
    }
    obj.geometry = geometry;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.map = texture;
      if (copy.color) copy.color.set(0xffffff);
      copy.needsUpdate = true;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

function paintBarrierTexture(root, texture) {
  if (!root || !texture) return;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    let geometry = obj.geometry.clone();
    if (!geometry.getAttribute("normal")) {
      geometry = geometry.toNonIndexed();
      geometry.computeVertexNormals();
    }
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();
    if (position && uv) {
      const triCount = (index ? index.count : position.count) / 3;
      for (let t = 0; t < triCount; t += 1) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        const face = triangleNormal(position, i0, i1, i2);
        const ax = Math.abs(face.nx);
        const ay = Math.abs(face.ny);
        const az = Math.abs(face.nz);
        for (const i of [i0, i1, i2]) {
          const x = position.getX(i);
          const y = position.getY(i);
          const z = position.getZ(i);
          if (ay > 0.7) uv.setXY(i, x + 0.5, z + 0.5);
          else if (az >= ax) uv.setXY(i, x + 0.5, y * 1.5);
          else uv.setXY(i, z + 0.5, y * 1.5);
        }
      }
      uv.needsUpdate = true;
    }
    obj.geometry = geometry;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      if (!mat || !mat.clone) return mat;
      const copy = mat.clone();
      copy.map = texture;
      if (copy.color) copy.color.set(0xffffff);
      copy.needsUpdate = true;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

async function paintRampSkin(root, texture, sideTexture, backTexture, barrierUrl, loader, extra) {
  if (!root || !texture || !sideTexture) return;
  const sideTextureB = extra && extra.sideTextureB ? extra.sideTextureB : null;
  const barrierTexture = extra && extra.barrierTexture ? extra.barrierTexture : null;
  const maps = [texture, sideTexture, backTexture];
  if (sideTextureB) maps.push(sideTextureB);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    paintRampMesh(obj, maps);
  });
  if (!barrierUrl || !loader) return;
  const barrier = await loader.loadAsync(modelUrl(barrierUrl));
  if (!barrier || !barrier.scene) return;
  if (barrierTexture) paintBarrierTexture(barrier.scene, barrierTexture);
  else paintBarrierCurb(barrier.scene, texture);
  root.add(barrier.scene);
}

// Bridge deck runs along Z near y=0.52. The lower road runs along X near y=0.
// Up faces above the deck line take the road texture with u along Z. Lower up
// faces take the same texture with u along X. Everything else takes sideTexture.
// The barrier is parented on the deck (bridge max Y) and is not rotated.
function paintBridgeMesh(mesh, maps) {
  if (!mesh || !mesh.geometry || !maps || maps.length < 2) return;
  let geometry = mesh.geometry.clone();
  if (!geometry.getAttribute("normal")) {
    geometry = geometry.toNonIndexed();
    geometry.computeVertexNormals();
  }
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  if (!position) return;
  const triCount = (index ? index.count : position.count) / 3;
  const triMat = new Uint8Array(triCount);
  const vertexMode = new Uint8Array(position.count);
  vertexMode.fill(255);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const face = triangleNormal(position, i0, i1, i2);
    let mat = 1;
    let mode = Math.abs(face.nz) >= Math.abs(face.nx) ? 2 : 3;
    if (face.ny > 0.7 && face.cy > 0.4) {
      mat = 0;
      mode = 0;
    } else if (face.ny > 0.7) {
      mat = 0;
      mode = 1;
    }
    triMat[t] = mat;
    vertexMode[i0] = mode;
    vertexMode[i1] = mode;
    vertexMode[i2] = mode;
  }

  if (uv) {
    for (let i = 0; i < position.count; i += 1) {
      const mode = vertexMode[i];
      if (mode === 255) continue;
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (mode === 0) uv.setXY(i, z + 0.5, x + 0.5);
      else if (mode === 1) uv.setXY(i, x + 0.5, z + 0.5);
      else if (mode === 2) uv.setXY(i, x + 0.5, y);
      else uv.setXY(i, z + 0.5, y);
    }
    uv.needsUpdate = true;
  }

  const slots = maps.length;
  const order = Array.from({ length: slots }, () => []);
  for (let t = 0; t < triCount; t += 1) {
    const slot = triMat[t];
    if (slot < slots) order[slot].push(t);
  }
  if (index) {
    const src = index.array;
    const next = new src.constructor(src.length);
    let cursor = 0;
    for (let kind = 0; kind < slots; kind += 1) {
      for (const t of order[kind]) {
        next[cursor] = src[t * 3];
        next[cursor + 1] = src[t * 3 + 1];
        next[cursor + 2] = src[t * 3 + 2];
        cursor += 3;
      }
    }
    index.array.set(next);
    index.needsUpdate = true;
  } else {
    const copies = Object.keys(geometry.attributes).map((name) => {
      const attr = geometry.getAttribute(name);
      return {
        attr,
        itemSize: attr.itemSize,
        src: attr.array,
        next: new attr.array.constructor(attr.array.length),
      };
    });
    let cursor = 0;
    for (let kind = 0; kind < slots; kind += 1) {
      for (const t of order[kind]) {
        for (let v = 0; v < 3; v += 1) {
          const from = t * 3 + v;
          for (const copy of copies) {
            const dst = cursor * copy.itemSize;
            const srcAt = from * copy.itemSize;
            for (let k = 0; k < copy.itemSize; k += 1) copy.next[dst + k] = copy.src[srcAt + k];
          }
          cursor += 1;
        }
      }
    }
    for (const copy of copies) {
      copy.attr.array.set(copy.next);
      copy.attr.needsUpdate = true;
    }
  }

  geometry.clearGroups();
  let start = 0;
  for (let kind = 0; kind < slots; kind += 1) {
    const count = order[kind].length * 3;
    if (count === 0) continue;
    geometry.addGroup(start, count, kind);
    start += count;
  }

  mesh.geometry = geometry;
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!source || !source.clone) return;
  mesh.material = maps.map((map) => {
    const copy = source.clone();
    copy.map = map || null;
    if (copy.color) copy.color.set(0xffffff);
    copy.needsUpdate = true;
    return copy;
  });
}

async function paintBridgeSkin(root, texture, sideTexture, barrierUrl, barrierTexture, loader) {
  if (!root || !texture) return;
  const side = sideTexture || texture;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    paintBridgeMesh(obj, [texture, side]);
  });
  if (!barrierUrl || !loader) return;
  const barrier = await loader.loadAsync(modelUrl(barrierUrl));
  if (!barrier || !barrier.scene) return;
  if (barrierTexture) paintBarrierTexture(barrier.scene, barrierTexture);
  else paintBarrierCurb(barrier.scene, texture);
  const box = new Box3().setFromObject(root);
  if (!box.isEmpty() && Number.isFinite(box.max.y)) barrier.scene.position.y = box.max.y;
  root.add(barrier.scene);
}

function linearize(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
        const tex = mat[key];
        if (!tex) continue;
        tex.magFilter = LinearFilter;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
      }
    }
  });
}

function ghost(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.transparent = true;
      copy.opacity = 0.55;
      copy.depthWrite = false;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = false;
    obj.receiveShadow = false;
    // The preview is transparent. The occlusion pass would otherwise treat it as solid.
    obj.layers.set(AO_SKIP_LAYER);
  });
}

function disposeGhost(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) mat.dispose();
  });
  root.removeFromParent();
}

function layoutFrom(data) {
  return {
    pieces: Array.isArray(data?.pieces) ? data.pieces : [],
    removedRoads: Array.isArray(data?.removedRoads) ? data.removedRoads : [],
  };
}

function readStoredLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return layoutFrom(data);
  } catch {
    return null;
  }
}

export async function loadWestMap() {
  const stored = readStoredLayout();
  if (stored) return stored;
  let data = null;
  try {
    const response = await fetch(MAP_URL);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  return layoutFrom(data);
}

export async function createBuildMode({ scene, camera, canvas, map, saved = null, roads = null }) {
  const group = new Group();
  group.name = "west-build";
  scene.add(group);

  const loader = new GLTFLoader();
  const templates = new Map();
  const pieces = [];
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();

  let enabled = false;
  let turn = 0;
  let scale = 1;
  let mirror = false;
  let selection = null;
  let preview = null;
  let carrying = null;
  let selectToken = 0;
  let hover = null;
  let pointerAt = null;

  const panel = document.createElement("aside");
  panel.id = "build-panel";
  panel.hidden = true;
  const info = document.createElement("p");
  info.id = "build-info";
  info.textContent = "BUILD MODE\nClick = place\nShift + click = place many\nClick placed piece = move\nX = remove\nR = rotate\n+ / 0 = bigger / smaller\nF = mirror\nP = save\nWASD = walk\nSearch = type to find pieces\nMouse wheel = zoom";
  const search = document.createElement("input");
  search.id = "build-search";
  search.type = "search";
  search.placeholder = "Search pieces";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.setAttribute("aria-label", "Search pieces");
  searchInput = search;
  search.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  search.addEventListener("input", () => filterPieces());
  const list = document.createElement("div");
  list.id = "build-kits";
  panel.append(info, search, list);
  document.body.append(panel);

  const thumbs = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      img.src = img.dataset.src;
      thumbs.unobserve(img);
    }
  }, { root: list, rootMargin: "240px" });

  for (const kit of KITS) {
    const heading = document.createElement("h2");
    heading.textContent = kit.label;
    list.append(heading);
    for (const item of kit.files) {
      const name = item.file.replace(/\.glb$/, "");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.kit = kit.id;
      button.dataset.file = item.file;
      const thumb = document.createElement("img");
      thumb.alt = "";
      thumb.width = 48;
      thumb.height = 48;
      thumb.decoding = "async";
      const thumbUrl = item.sideTexture || item.texture;
      thumb.dataset.src = thumbUrl
        ? `./${thumbUrl}`
        : `./assets/previews/${kit.id}/${name}.png`;
      thumb.addEventListener("error", () => thumb.remove());
      button.append(thumb, document.createTextNode(name));
      button.addEventListener("click", () => {
        select(kit.id, item.file);
      });
      list.append(button);
    }
  }

  function revealThumbs() {
    if (panel.hidden) return;
    const view = list.getBoundingClientRect();
    if (view.width === 0 || view.height === 0) return;
    const margin = 240;
    const top = Math.max(view.top, 0) - margin;
    const bottom = Math.min(view.bottom, window.innerHeight) + margin;
    if (bottom <= top) return;
    for (const img of list.querySelectorAll("img:not([src])")) {
      if (img.parentElement?.hidden) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < top || rect.top > bottom) continue;
      img.src = img.dataset.src;
      thumbs.unobserve(img);
    }
  }

  function watchThumbs() {
    if (panel.hidden) return;
    for (const img of list.querySelectorAll("img:not([src])")) thumbs.observe(img);
    revealThumbs();
  }

  new ResizeObserver(revealThumbs).observe(list);
  list.addEventListener("scroll", () => requestAnimationFrame(revealThumbs), { passive: true });

  function filterPieces() {
    const query = search.value.trim().toLowerCase();
    let heading = null;
    let shown = 0;
    for (const child of list.children) {
      if (child.tagName === "H2") {
        if (heading) heading.hidden = shown === 0;
        heading = child;
        shown = 0;
        continue;
      }
      const match = query === "" || child.textContent.toLowerCase().includes(query);
      child.hidden = !match;
      if (match) shown += 1;
    }
    if (heading) heading.hidden = shown === 0;
    revealThumbs();
  }

  function status() {}

  function loadTemplate(kit, file) {
    const key = `${kit}/${file}`;
    const item = catalog.get(key);
    if (!item) return Promise.reject(new Error(`Unknown piece ${key}`));
    const cached = templates.get(key);
    if (cached?.isObject3D) return Promise.resolve(cached);
    if (cached) return cached;
    const pending = loader.loadAsync(modelUrl(item.url)).then(async (gltf) => {
      const scene = gltf.scene;
      if (item.skin === "bridge") {
        const [texture, sideTexture, barrierTexture] = await Promise.all([
          loadSkinTexture(item.texture),
          loadSkinTexture(item.sideTexture),
          loadSkinTexture(item.barrierTexture, RepeatWrapping),
        ]);
        await paintBridgeSkin(scene, texture, sideTexture, item.barrier, barrierTexture, loader);
      } else if (item.sideTexture) {
        const [texture, sideTexture, backTexture, sideTextureB, barrierTexture] = await Promise.all([
          loadSkinTexture(item.texture),
          loadSkinTexture(item.sideTexture),
          loadSkinTexture(item.backTexture),
          loadSkinTexture(item.sideTextureB),
          loadSkinTexture(item.barrierTexture, RepeatWrapping),
        ]);
        await paintRampSkin(scene, texture, sideTexture, backTexture, item.barrier, loader, {
          sideTextureB,
          barrierTexture,
        });
      } else if (item.texture) {
        const texture = await loadSkinTexture(item.texture);
        const mesh = item.url.slice(item.url.lastIndexOf("/") + 1);
        if (mesh === "road-bend.glb") paintBendSkin(scene, texture);
        else if (PLANAR_MESH.has(mesh)) paintPlanarSkin(scene, texture);
        else paintStraightSkin(scene, texture);
      }
      linearize(scene);
      templates.set(key, scene);
      return scene;
    }).catch((error) => {
      if (templates.get(key) === pending) templates.delete(key);
      throw error;
    });
    templates.set(key, pending);
    return pending;
  }

  function applyScale(root, pieceScale, flipped) {
    const size = UNIT * pieceScale;
    root.scale.set(flipped ? -size : size, size, size);
  }

  function wrapper(template, spec) {
    const root = new Group();
    root.add(template.clone(true));
    applyScale(root, spec.scale ?? 1, spec.mirror === true);
    root.position.set((spec.x + 0.5) * TILE, GROUND_Y, (spec.z + 0.5) * TILE);
    root.rotation.y = spec.turn * Math.PI / 2;
    return root;
  }

  function addPiece(spec, template) {
    if (!template?.isObject3D) return null;
    const record = {
      kit: spec.kit,
      file: spec.file,
      x: spec.x,
      z: spec.z,
      turn: spec.turn,
      scale: spec.scale ?? 1,
      mirror: spec.mirror === true,
    };
    const root = wrapper(template, record);
    root.userData.piece = record;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    group.add(root);
    pieces.push(record);
    return root;
  }

  function normalize(raw) {
    if (!raw || typeof raw.kit !== "string" || typeof raw.file !== "string") return null;
    if (!catalog.has(`${raw.kit}/${raw.file}`)) return null;
    if (!Number.isInteger(raw.x) || !Number.isInteger(raw.z) || !Number.isInteger(raw.turn)) return null;
    if (raw.x < 0 || raw.z < 0 || raw.x >= map.cols || raw.z >= map.rows) return null;
    const turnValue = ((raw.turn % 4) + 4) % 4;
    const scaleValue = raw.scale == null ? 1 : Number(raw.scale);
    if (!Number.isFinite(scaleValue) || scaleValue <= 0) return null;
    return {
      kit: raw.kit,
      file: raw.file,
      x: raw.x,
      z: raw.z,
      turn: turnValue,
      scale: Math.round(scaleValue * 1000) / 1000,
      mirror: raw.mirror === true,
    };
  }

  const layout = saved || await loadWestMap();
  const removedRoads = [];
  const removedKeys = new Set();
  for (const raw of layout.removedRoads) {
    const record = roadRecord(raw);
    if (!record) continue;
    const key = roadKey(record);
    if (removedKeys.has(key)) continue;
    removedKeys.add(key);
    removedRoads.push(record);
  }

  async function loadSaved() {
    for (const raw of layout.pieces) {
      const spec = normalize(raw);
      if (!spec) continue;
      let template = null;
      try {
        template = await loadTemplate(spec.kit, spec.file);
      } catch {
        continue;
      }
      addPiece(spec, template);
    }
  }

  function dropPreview() {
    if (!preview) return;
    disposeGhost(preview);
    preview = null;
  }

  function clearSelection() {
    selection = null;
    for (const button of list.querySelectorAll("button")) button.classList.remove("is-selected");
    selectToken += 1;
    dropPreview();
  }

  function rootFor(record) {
    for (const child of group.children) {
      if (child.userData.piece === record) return child;
    }
    return null;
  }

  function moveCarried(cell) {
    if (!carrying || !cell) return;
    carrying.record.x = cell.x;
    carrying.record.z = cell.z;
    carrying.root.position.set((cell.x + 0.5) * TILE, GROUND_Y, (cell.z + 0.5) * TILE);
  }

  function dropCarried(cell) {
    if (!carrying) return;
    moveCarried(cell);
    carrying = null;
  }

  function pickUp(record, cell) {
    const root = rootFor(record);
    if (!root) return;
    carrying = { record, root };
    if (preview) preview.visible = false;
    moveCarried(cell);
  }

  async function showPreview() {
    const token = selectToken;
    if (!enabled || !selection) {
      dropPreview();
      return;
    }
    const template = await loadTemplate(selection.kit, selection.file);
    if (token !== selectToken || !enabled || !selection) return;
    dropPreview();
    const spec = hover || { x: 0, z: 0, turn };
    preview = wrapper(template, { ...spec, turn, scale, mirror });
    ghost(preview);
    preview.visible = hover !== null;
    scene.add(preview);
  }

  function select(kit, file) {
    if (carrying) dropCarried(hover);
    selection = { kit, file };
    for (const button of list.querySelectorAll("button")) {
      button.classList.toggle("is-selected", button.dataset.kit === kit && button.dataset.file === file);
    }
    const selected = list.querySelector("button.is-selected");
    selected?.scrollIntoView({ block: "nearest" });
    selectToken += 1;
    status("Build mode.");
    showPreview().catch(() => {
      status("That model failed to load.");
    });
  }

  function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(ground, hit)) return null;
    const x = Math.floor(hit.x / TILE);
    const z = Math.floor(hit.z / TILE);
    if (x < 0 || z < 0 || x >= map.cols || z >= map.rows) return null;
    return { x, z };
  }

  function movePreview(cell) {
    hover = cell;
    if (carrying) moveCarried(cell);
    if (!preview) return;
    if (!cell || carrying) {
      preview.visible = false;
      return;
    }
    preview.visible = true;
    preview.position.set((cell.x + 0.5) * TILE, GROUND_Y, (cell.z + 0.5) * TILE);
    preview.rotation.y = turn * Math.PI / 2;
  }

  async function place(cell, keep) {
    if (!enabled || !selection || !cell) return;
    const chosen = selection;
    const placedTurn = turn;
    const placedScale = scale;
    const placedMirror = mirror;
    const token = selectToken;
    if (!keep) clearSelection();
    let template = null;
    try {
      template = await loadTemplate(chosen.kit, chosen.file);
    } catch {
      status("That model failed to load.");
      return;
    }
    if (!enabled) return;
    if (keep) {
      if (selectToken !== token || selection !== chosen) return;
    } else if (selectToken !== token + 1) return;
    addPiece({ ...chosen, x: cell.x, z: cell.z, turn: placedTurn, scale: placedScale, mirror: placedMirror }, template);
    status("Placed.");
  }

  function removeRecord(record) {
    const index = pieces.indexOf(record);
    if (index < 0) return false;
    pieces.splice(index, 1);
    if (carrying?.record === record) carrying = null;
    for (const child of [...group.children]) {
      if (child.userData.piece === record) child.removeFromParent();
    }
    status("Removed.");
    return true;
  }

  let removedAt = 0;
  const hiddenRoad = new Matrix4().makeTranslation(0, -1000, 0);

  function rememberRoad(record) {
    const savedRoad = roadRecord(record);
    if (!savedRoad) return;
    const key = roadKey(savedRoad);
    if (removedKeys.has(key)) return;
    removedKeys.add(key);
    removedRoads.push(savedRoad);
  }

  function pieceHit() {
    const hits = raycaster.intersectObjects(group.children, true);
    for (const item of hits) {
      let node = item.object;
      while (node && node !== group) {
        if (node.userData.piece) return { record: node.userData.piece, distance: item.distance };
        node = node.parent;
      }
    }
    return null;
  }

  function roadHit() {
    if (!roads) return null;
    const hits = raycaster.intersectObjects(roads.children, true);
    for (const item of hits) {
      const list = item.object.userData.pieces;
      const record = list?.[item.instanceId];
      if (!record || record.removed) continue;
      return { mesh: item.object, index: item.instanceId, record, distance: item.distance };
    }
    return null;
  }

  function removeAt(event) {
    const now = performance.now();
    if (now - removedAt < 80) return;
    removedAt = now;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const piece = pieceHit();
    const road = roadHit();
    if (piece && (!road || piece.distance <= road.distance)) {
      removeRecord(piece.record);
      return;
    }
    if (road) {
      road.record.removed = true;
      road.mesh.setMatrixAt(road.index, hiddenRoad);
      road.mesh.instanceMatrix.needsUpdate = true;
      rememberRoad(road.record);
      status("Removed road.");
      return;
    }
    const cell = cellAt(event);
    if (!cell) return;
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      if (pieces[i].x === cell.x && pieces[i].z === cell.z) {
        removeRecord(pieces[i]);
        return;
      }
    }
  }

  function download() {
    const body = `${JSON.stringify({ pieces, removedRoads }, null, 2)}\n`;
    try {
      localStorage.setItem(STORAGE_KEY, body);
    } catch {
      // The file download below still runs when storage is blocked.
    }
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "west-map.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status("Downloaded west-map.json.");
  }

  function setViewScale(next) {
    const current = Number.isFinite(next) && next > 0 ? next : 1;
    camera.userData.viewScale = Math.min(VIEW_MAX, Math.max(VIEW_MIN, current));
    camera.updateProjectionMatrix();
  }

  function wheelPixels(event) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  function setEnabled(next) {
    enabled = next;
    panel.hidden = !enabled;
    if (!enabled) {
      thumbs.disconnect();
      dropCarried(hover);
      dropPreview();
      hover = null;
      setViewScale(1);
      return;
    }
    status("Build mode.");
    watchThumbs();
    requestAnimationFrame(watchThumbs);
    if (selection) showPreview().catch(() => status("That model failed to load."));
  }

  function nextScale(current, direction) {
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((current + direction * SCALE_STEP) * 100) / 100));
  }

  function stepScale(direction) {
    if (carrying) {
      const record = carrying.record;
      const next = nextScale(record.scale ?? 1, direction);
      if (next === record.scale) return;
      record.scale = next;
      applyScale(carrying.root, record.scale, record.mirror === true);
      status(direction > 0 ? "Bigger." : "Smaller.");
      return;
    }
    const next = nextScale(scale, direction);
    if (next === scale) return;
    scale = next;
    if (preview) applyScale(preview, scale, mirror);
    status(direction > 0 ? "Bigger." : "Smaller.");
  }

  keys.enabled = () => enabled;
  keys.onB = () => setEnabled(!enabled);
  keys.onR = () => {
    if (carrying) {
      const record = carrying.record;
      record.turn = (record.turn + 1) % 4;
      carrying.root.rotation.y = record.turn * Math.PI / 2;
      status("Rotated.");
      return;
    }
    turn = (turn + 1) % 4;
    if (preview) preview.rotation.y = turn * Math.PI / 2;
    status("Rotated.");
  };
  keys.onF = () => {
    if (carrying) {
      const record = carrying.record;
      record.mirror = record.mirror !== true;
      applyScale(carrying.root, record.scale ?? 1, record.mirror);
      return;
    }
    mirror = !mirror;
    if (preview) applyScale(preview, scale, mirror);
  };
  keys.onP = () => download();
  keys.onX = () => {
    if (!pointerAt) return;
    removeAt(pointerAt);
  };
  keys.onScale = (direction) => stepScale(direction);

  canvas.addEventListener("pointermove", (event) => {
    pointerAt = { clientX: event.clientX, clientY: event.clientY };
    if (!enabled) return;
    movePreview(cellAt(event));
  });
  canvas.addEventListener("pointerleave", () => {
    pointerAt = null;
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled) return;
    if (event.button === 2) {
      event.preventDefault();
      removeAt(event);
      return;
    }
    if (event.button !== 0) return;
    const cell = cellAt(event);
    if (carrying) {
      dropCarried(cell);
      return;
    }
    if (!selection) {
      const piece = pieceHit();
      if (piece) {
        pickUp(piece.record, cell);
        return;
      }
    }
    place(cell, event.shiftKey && leftShift);
  });

  canvas.addEventListener("wheel", (event) => {
    if (!enabled) return;
    event.preventDefault();
    const current = camera.userData.viewScale > 0 ? camera.userData.viewScale : 1;
    setViewScale(current * Math.exp(wheelPixels(event) * 0.0015));
  }, { passive: false });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!enabled) return;
    removeAt(event);
  });

  await loadSaved();
  status(enabled ? "Build mode." : "Press B for build mode.");
  return { download, pieceCount: () => pieces.length, isOpen: () => enabled };
}
