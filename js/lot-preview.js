// Temporary look at sample building models. Open the game with ?building=1.
// The models are added for this view only. They are not written into the island layout.
// ?corrected=1 shows the repaired copies instead of the current single-mesh files.

import { Box3, Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PERSON = (71 / 3) * 1.15 * 1.1 * 1.1 * 1.05;
const METER = ((71 * 1.1) / 4.6 + PERSON / 1.75) / 2;

const CURRENT = [
  { file: "City Single Mesh/building-single-mesh.glb", tint: 0xff3344, east: 4, north: 6 },
  { file: "City Single Mesh/conjunto_habitacional_kpd___villa_carmen_quilpue-single-mesh.glb", tint: 0xffee22, east: -2, north: 3 },
  { file: "City Single Mesh/city_building-single-mesh.glb", tint: 0x3388ff, east: -8, north: -36 },
  { file: "City Single Mesh/loft_18_mini_office_v.environment-single-mesh.glb", tint: 0x33cc66, east: -70, north: 6 },
];

const CORRECTED = [
  { file: "City Single Mesh Corrected/conjunto_habitacional_kpd___villa_carmen_quilpue.glb", east: 3, north: 8 },
  { file: "City/city_building.glb", east: -8, north: -36 },
  { file: "City/loft_18_mini_office_v.environment.glb", east: -70, north: 6 },
];

function previewFiles(search) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("corrected") === "1") return CORRECTED;
  return CURRENT;
}

export function lotPreviewEnabled(search) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("building") === "1";
}

function prepare(root, tint) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat) continue;
      mat.toneMapped = false;
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.metalness = 0;
      mat.roughness = 1;
      if (tint) {
        mat.map = null;
        mat.color.set(tint);
        if (mat.emissive) mat.emissive.set(tint);
      } else if (mat.emissive) {
        mat.emissive.set(0x000000);
      }
    }
  });
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// A stray triangle far from the building would drag the whole model off screen.
// Placement uses the cluster around the largest mesh. The file itself is unchanged.
function placementBounds(root) {
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const box = new Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    meshes.push(box);
  });
  if (!meshes.length) return new Box3().setFromObject(root);
  let biggest = meshes[0];
  let biggestSize = -1;
  for (const box of meshes) {
    const size = (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);
    if (size > biggestSize) {
      biggestSize = size;
      biggest = box;
    }
  }
  const placed = biggest.clone();
  const cx = (biggest.min.x + biggest.max.x) / 2;
  const cy = (biggest.min.y + biggest.max.y) / 2;
  const cz = (biggest.min.z + biggest.max.z) / 2;
  for (const box of meshes) {
    const mx = (box.min.x + box.max.x) / 2;
    const my = (box.min.y + box.max.y) / 2;
    const mz = (box.min.z + box.max.z) / 2;
    const distance = Math.hypot(mx - cx, my - cy, mz - cz);
    if (distance < 80) placed.union(box);
  }
  return placed;
}

async function loadModel(loader, entry, tint) {
  const gltf = await loader.loadAsync(new URL(`../${entry.file}`, import.meta.url).href);
  const clone = gltf.scene;
  prepare(clone, tint ? entry.tint : 0);
  const pivot = new Group();
  pivot.add(clone);
  const raw = placementBounds(pivot);
  pivot.position.set(
    -((raw.min.x + raw.max.x) / 2),
    -raw.min.y,
    -((raw.min.z + raw.max.z) / 2),
  );
  const preview = new Group();
  preview.name = "lot-preview";
  preview.add(pivot);
  preview.scale.setScalar(METER);
  const size = [raw.max.x - raw.min.x, raw.max.y - raw.min.y, raw.max.z - raw.min.z];
  return { file: entry.file, preview, size };
}

export async function showLotPreview(scene, renderer, player) {
  const placed = scene.getObjectByName("zone-buildings");
  const where = (placed?.children || []).map((child) => ({
    name: child.name,
    x: Math.round(child.position.x),
    z: Math.round(child.position.z),
  }));
  console.info("Lot buildings already in the scene", where.length, where);

  const loader = new GLTFLoader();
  const entries = previewFiles(window.location.search);
  const tint = new URLSearchParams(window.location.search).get("tint") === "1";
  const models = [];
  for (const entry of entries) models.push(await loadModel(loader, entry, tint));

  // West edge of each model, in metres east of the player.
  // South face, in metres north of the player.
  const reportModels = [];
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const spot = entries[i];
    const wide = model.size[0] * METER;
    const deep = model.size[2] * METER;
    const south = player.z - spot.north * METER;
    model.preview.position.set(
      player.x + spot.east * METER + wide / 2,
      0.2,
      south - deep / 2,
    );
    scene.add(model.preview);
    model.preview.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model.preview);
    reportModels.push({
      file: model.file,
      fileSize: model.size.map(round3),
      metres: model.size.map(round3),
      worldSize: [
        Math.round(box.max.x - box.min.x),
        Math.round(box.max.y - box.min.y),
        Math.round(box.max.z - box.min.z),
      ],
      center: [
        Math.round((box.min.x + box.max.x) / 2),
        Math.round((box.min.y + box.max.y) / 2),
        Math.round((box.min.z + box.max.z) / 2),
      ],
      player: [Math.round(player.x), Math.round(player.z)],
    });
  }

  window.lotPreviewReport = { placed: where, meter: round3(METER), models: reportModels };
  console.info("Lot preview beside the player", window.lotPreviewReport);
}
