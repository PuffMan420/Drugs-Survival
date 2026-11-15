// Blue zone, loaded from data/blue-zone.json.
// The model files stay as they are. This only places them.

import {
  Box3,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";
import { createGroundTemplate, GROUND_KIT } from "./ground-pieces.js";

const GROUND_Y = 0.2;
const LIST_KEYS = ["placements", "pieces", "records"];
const COLOR_MAPS = new Set(["map", "emissiveMap"]);

function repoUrl(file) {
  const path = String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return new URL(`../${path}`, import.meta.url).href;
}

function listRecords(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of LIST_KEYS) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  throw new Error("The blue zone file has no piece list.");
}

function kindOf(record) {
  return String(record?.kind || "").trim().toLowerCase();
}

function tileCoord(record, axis) {
  const direct = Number(record?.[axis]);
  if (Number.isFinite(direct)) return direct;
  const tile = record?.tile;
  if (tile && typeof tile === "object" && !Array.isArray(tile)) {
    const value = Number(tile[axis]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function worldScale(record) {
  const unit = Number(record?.unit);
  const scale = Number(record?.scale);
  return (Number.isFinite(unit) ? unit : 1) * (Number.isFinite(scale) ? scale : 1);
}

function fileName(file) {
  const path = String(file || "").replace(/\\/g, "/");
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

function groundTextureFile(record) {
  const skin = typeof record?.skin === "string" ? record.skin.trim() : "";
  if (skin) return skin;
  const file = String(record?.file || "").replace(/\\/g, "/").trim();
  if (!file) return "";
  const base = fileName(file);
  const hit = GROUND_KIT.files.find((item) => {
    return item.file === base || item.file === file || item.texture === file || item.url === file;
  });
  if (hit) return hit.texture;
  if (/\.(png|webp|jpe?g)$/i.test(file)) return file;
  return "";
}

function configureTexture(texture, anisotropy, { color = false } = {}) {
  if (!texture || texture.isTexture !== true) return;
  if (color) texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

function loadTexture(loader, file, anisotropy, { flipY, wrap }) {
  return loader.loadAsync(repoUrl(file)).then((texture) => {
    texture.flipY = flipY;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    configureTexture(texture, anisotropy, { color: true });
    return texture;
  });
}

function ownMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const source = obj.material;
    const list = Array.isArray(source) ? source : [source];
    const next = list.map((mat) => (mat && typeof mat.clone === "function" ? mat.clone() : mat));
    obj.material = Array.isArray(source) ? next : next[0];
  });
}

function cloneWithMap(material, map) {
  const copy = material.clone();
  copy.map = map;
  if (copy.color) copy.color.set(0xffffff);
  copy.needsUpdate = true;
  return copy;
}

// Same replacement as paintHouseAlbedo in build-mode.js. The picture goes on
// the wall and the window glass, and a boarded pane stays on the glass.
function paintHouseAlbedo(root, texture) {
  if (!root || !texture) return;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const source = obj.material;
    const list = Array.isArray(source) ? source : [source];
    let hit = false;
    const next = list.map((mat) => {
      if (!mat || typeof mat.clone !== "function") return mat;
      const name = mat.name || "";
      if (!name.startsWith("House_") && !name.startsWith("Glass_")) return mat;
      hit = true;
      return cloneWithMap(mat, texture);
    });
    if (hit) obj.material = Array.isArray(source) ? next : next[0];
  });
}

function applyTint(root, tint) {
  if (!tint || typeof tint !== "object") return;
  const r = Number(tint.r);
  const g = Number(tint.g);
  const b = Number(tint.b);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (mat?.color) mat.color.setRGB(r, g, b);
    }
  });
}

function prepare(root, anisotropy) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat) continue;
      mat.toneMapped = false;
      for (const key of ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
        const tex = mat[key];
        if (!tex) continue;
        configureTexture(tex, anisotropy, { color: COLOR_MAPS.has(key) });
      }
    }
  });
}

function seatedClone(source) {
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const box = new Box3().setFromObject(clone);
  if (box.isEmpty()) return null;
  clone.position.x -= (box.min.x + box.max.x) / 2;
  clone.position.y -= box.min.y;
  clone.position.z -= (box.min.z + box.max.z) / 2;
  return clone;
}

function pose(content, record) {
  const x = tileCoord(record, "x");
  const z = tileCoord(record, "z");
  if (x == null || z == null) return null;
  const holder = new Group();
  holder.name = fileName(record.file) || kindOf(record) || "blue-piece";
  holder.add(content);
  holder.scale.setScalar(worldScale(record));
  const yaw = Number(record.yaw);
  holder.rotation.y = Number.isFinite(yaw) ? yaw : 0;
  holder.position.set((x + 0.5) * TILE, GROUND_Y, (z + 0.5) * TILE);
  const lot = record.lot ?? record.lotId;
  if (lot != null && lot !== "") holder.userData.lot = lot;
  holder.userData.kind = kindOf(record);
  return holder;
}

function placeModel(record, models, skins, anisotropy) {
  const source = models.get(record.file);
  if (!source) return null;
  const seated = seatedClone(source);
  if (!seated) return null;
  ownMaterials(seated);
  const skin = typeof record.skin === "string" ? skins.get(record.skin) : null;
  if (skin) paintHouseAlbedo(seated, skin);
  applyTint(seated, record.tint);
  prepare(seated, anisotropy);
  return pose(seated, record);
}

function placeGround(record, grounds) {
  const template = grounds.get(groundTextureFile(record));
  if (!template) return null;
  const clone = template.clone(true);
  if (record.tint) ownMaterials(clone);
  applyTint(clone, record.tint);
  return pose(clone, record);
}

function rememberHouse(map, holder) {
  holder.updateMatrixWorld(true);
  const box = new Box3().setFromObject(holder);
  if (box.isEmpty()) return false;
  map.buildings.push({
    x: box.min.x / TILE,
    z: box.min.z / TILE,
    w: Math.max(0.01, (box.max.x - box.min.x) / TILE),
    d: Math.max(0.01, (box.max.z - box.min.z) / TILE),
    h: Math.max(0.01, (box.max.y - box.min.y) / TILE),
    style: "blue",
  });
  return true;
}

export async function placeBlueZone(scene, map, renderer) {
  const status = document.getElementById("fps");
  if (status) status.textContent = "Loading blue zone…";
  const response = await fetch("./data/blue-zone.json");
  if (!response.ok) throw new Error("The blue zone failed to load.");
  const records = listRecords(await response.json());
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const loader = new GLTFLoader();
  const textureLoader = new TextureLoader();
  const modelFiles = new Set();
  const skinFiles = new Set();
  const groundFiles = new Set();

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    if (kindOf(record) === "ground") {
      const texture = groundTextureFile(record);
      if (texture) groundFiles.add(texture);
      continue;
    }
    if (typeof record.file === "string" && record.file) modelFiles.add(record.file);
    if (typeof record.skin === "string" && record.skin) skinFiles.add(record.skin);
  }

  const models = new Map();
  await Promise.all([...modelFiles].map(async (file) => {
    try {
      const gltf = await loader.loadAsync(repoUrl(file));
      models.set(file, gltf.scene);
    } catch (error) {
      throw new Error(`The blue zone model failed to load: ${file}`, { cause: error });
    }
  }));

  const skins = new Map();
  await Promise.all([...skinFiles].map(async (file) => {
    try {
      const texture = await loadTexture(textureLoader, file, anisotropy, {
        flipY: true,
        wrap: ClampToEdgeWrapping,
      });
      skins.set(file, texture);
    } catch (error) {
      throw new Error(`The blue zone skin failed to load: ${file}`, { cause: error });
    }
  }));

  const grounds = new Map();
  await Promise.all([...groundFiles].map(async (file) => {
    try {
      const texture = await loadTexture(textureLoader, file, anisotropy, {
        flipY: true,
        wrap: RepeatWrapping,
      });
      grounds.set(file, createGroundTemplate(texture));
    } catch (error) {
      throw new Error(`The blue zone ground failed to load: ${file}`, { cause: error });
    }
  }));

  const root = new Group();
  root.name = "blue-zone";
  if (!Array.isArray(map.buildings)) map.buildings = [];
  let placed = 0;
  let houses = 0;
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const holder = kindOf(record) === "ground"
      ? placeGround(record, grounds)
      : placeModel(record, models, skins, anisotropy);
    if (!holder) {
      console.warn("Blue zone skipped a piece", record.file || record.skin, kindOf(record));
      continue;
    }
    root.add(holder);
    placed += 1;
    if (kindOf(record) === "building" && rememberHouse(map, holder)) houses += 1;
  }
  scene.add(root);
  window.blueZoneReport = { placed, houses, files: modelFiles.size };
  console.info("Blue zone", window.blueZoneReport);
}
