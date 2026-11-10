// Temporary look at one low-income block just north of the start.
// The buildings are added for this view only. They are not written into the island.
// The old four-model sample row is not shown.

import { Box3, Group, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";

const PERSON = (71 / 3) * 1.15 * 1.1 * 1.1 * 1.05;
const METER = ((71 * 1.1) / 4.6 + PERSON / 1.75) / 2;
const MODULE = 4 * TILE;
const SETBACK = 1.8 * METER;
const ALLEY = 4 * METER;
const GAP = 3 * METER;
const SQUARE = 14 * METER;
const GROUND_Y = 0.2;

const CONCRETE = "City/old_concrete_building_pack__lowpoly.glb";
const WORN = "City/abadoned_building__lowpoly.glb";
const APARTMENT = "City Single Mesh Corrected/conjunto_habitacional_kpd___villa_carmen_quilpue.glb";

function prepare(root, anisotropy) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
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

function extract(scene, prefix) {
  scene.updateMatrixWorld(true);
  const group = new Group();
  group.name = prefix;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.name.startsWith(`${prefix}_`)) return;
    group.add(meshWorld(obj));
  });
  return group;
}

function wrapScene(scene, name) {
  scene.updateMatrixWorld(true);
  const group = new Group();
  group.name = name;
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
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
  holder.name = group.name;
  holder.add(group);
  holder.scale.setScalar(METER);
  return holder;
}

function roadCenter(tile) {
  return (tile + 0.5) * TILE;
}

function pin(holder, yaw, face) {
  holder.rotation.y = yaw;
  holder.position.set(0, 0, 0);
  holder.updateMatrixWorld(true);
  const box = new Box3().setFromObject(holder);
  const dx = face.west != null ? face.west - box.min.x : face.east - box.max.x;
  const dz = face.south != null ? face.south - box.max.z : face.north - box.min.z;
  holder.position.set(dx, GROUND_Y - box.min.y, dz);
  holder.updateMatrixWorld(true);
  return new Box3().setFromObject(holder);
}

function round(value) {
  return Math.round(value);
}

export async function showBlockPreview(scene, renderer) {
  const loader = new GLTFLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const [concreteFile, wornFile, apartmentFile] = await Promise.all([
    loader.loadAsync(new URL(`../${CONCRETE}`, import.meta.url).href),
    loader.loadAsync(new URL(`../${WORN}`, import.meta.url).href),
    loader.loadAsync(new URL(`../${APARTMENT}`, import.meta.url).href),
  ]);

  const models = {
    worn: plant(wrapScene(wornFile.scene, "worn")),
    one: plant(extract(concreteFile.scene, "building_1")),
    four: plant(extract(concreteFile.scene, "building_4")),
    five: plant(extract(concreteFile.scene, "building_5")),
    apartment: plant(wrapScene(apartmentFile.scene, "apartment")),
  };
  for (const model of Object.values(models)) prepare(model, anisotropy);

  const innerWest = roadCenter(82) + MODULE / 2 + SETBACK;
  const innerEast = roadCenter(98) - MODULE / 2 - SETBACK;
  const innerNorth = roadCenter(170) + MODULE / 2 + SETBACK;
  const innerSouth = roadCenter(202) - MODULE / 2 - SETBACK;

  const root = new Group();
  root.name = "block-preview";

  // The window side is local +X. Yaw turns that side toward the street.
  const wornBox = pin(models.worn, 0, { west: innerWest, south: innerSouth });
  const oneBox = pin(models.one, Math.PI, { west: innerWest, south: wornBox.min.z - ALLEY });
  const fourBox = pin(models.four, 0, { east: innerEast, south: innerSouth - SQUARE });
  const fiveBox = pin(models.five, 0, { east: innerEast, south: fourBox.min.z - GAP });
  const apartmentBox = pin(models.apartment, 0, { west: innerWest, north: innerNorth });

  for (const model of Object.values(models)) root.add(model);
  scene.add(root);

  const placed = [wornBox, oneBox, fourBox, fiveBox, apartmentBox].map((box, index) => {
    const name = ["worn", "building 1", "building 4", "building 5", "apartment"][index];
    return {
      name,
      minX: round(box.min.x),
      maxX: round(box.max.x),
      minZ: round(box.min.z),
      maxZ: round(box.max.z),
      minY: Math.round(box.min.y * 10) / 10,
      wide: round((box.max.x - box.min.x) / METER),
      deep: round((box.max.z - box.min.z) / METER),
      tall: round((box.max.y - box.min.y) / METER),
    };
  });

  window.blockPreviewReport = {
    inner: {
      west: round(innerWest),
      east: round(innerEast),
      north: round(innerNorth),
      south: round(innerSouth),
    },
    placed,
  };
  console.info("Low-income block preview", window.blockPreviewReport);
}
