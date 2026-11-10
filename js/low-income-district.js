// Low-income district, loaded from data/low-income-district.json.
// Original model files stay as they are. This only places them.

import { Box3, Group, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";

const PERSON = (71 / 3) * 1.15 * 1.1 * 1.1 * 1.05;
const METER = ((71 * 1.1) / 4.6 + PERSON / 1.75) / 2;
const GROUND_Y = 0.2;

function sanitize(name) {
  return String(name || "").replace(/\s/g, "_").replace(/\./g, "");
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
        if (key === "map" || key === "emissiveMap") tex.colorSpace = SRGBColorSpace;
        tex.magFilter = LinearFilter;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
      }
    }
  });
}

function meshWorld(obj) {
  const clone = obj.clone(true);
  clone.matrix.copy(obj.matrixWorld);
  clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
  clone.matrixAutoUpdate = true;
  return clone;
}

function matches(obj, prefix) {
  if (!prefix) return true;
  let current = obj;
  while (current) {
    if (sanitize(current.name).startsWith(prefix)) return true;
    current = current.parent;
  }
  return false;
}

function extract(scene, prefix) {
  scene.updateMatrixWorld(true);
  const group = new Group();
  scene.traverse((obj) => {
    if (!obj.isMesh || !matches(obj, prefix)) return;
    group.add(meshWorld(obj));
  });
  return group;
}

function plant(group) {
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(group);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const child of group.children) {
    child.position.x -= cx;
    child.position.z -= cz;
    child.position.y -= box.min.y;
  }
  const holder = new Group();
  holder.add(group);
  holder.scale.setScalar(METER);
  return holder;
}

export async function placeLowIncomeDistrict(scene, map, renderer) {
  const status = document.getElementById("fps");
  if (status) status.textContent = "Loading district…";
  const response = await fetch("./data/low-income-district.json");
  if (!response.ok) throw new Error("The low-income district failed to load.");
  const data = await response.json();
  const loader = new GLTFLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const files = [...new Set(data.models.map((model) => model.file))];
  const loaded = new Map();
  for (const file of files) {
    const gltf = await loader.loadAsync(new URL(`../${file}`, import.meta.url).href);
    loaded.set(file, gltf.scene);
  }

  const templates = new Map();
  for (const model of data.models) {
    const source = loaded.get(model.file);
    const holder = plant(extract(source, model.prefix));
    prepare(holder, anisotropy);
    holder.name = model.id;
    templates.set(model.id, holder);
  }

  const root = new Group();
  root.name = "low-income-district";
  const buildings = Array.isArray(map.buildings) ? map.buildings.slice() : [];
  let placed = 0;
  for (const spot of data.placements) {
    const template = templates.get(spot.id);
    if (!template || template.children.length === 0) continue;
    const child = template.children[0];
    if (child.children.length === 0 && !child.isMesh) continue;
    const clone = template.clone(true);
    clone.rotation.y = spot.yaw;
    clone.position.set(spot.x, GROUND_Y, spot.z);
    clone.updateMatrixWorld(true);
    const box = new Box3().setFromObject(clone);
    if (box.isEmpty()) continue;
    root.add(clone);
    buildings.push({
      x: box.min.x / TILE,
      z: box.min.z / TILE,
      w: (box.max.x - box.min.x) / TILE,
      d: (box.max.z - box.min.z) / TILE,
      h: (box.max.y - box.min.y) / TILE,
      style: "house",
    });
    placed += 1;
  }
  scene.add(root);
  map.buildings = buildings;
  window.lowIncomeReport = { placed, files: files.length };
  console.info("Low-income district", window.lowIncomeReport);
}
