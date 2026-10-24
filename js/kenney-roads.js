import {
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  LoadingManager,
  MeshLambertMaterial,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";

// Kenney City Kit Roads (CC0), https://kenney.nl/assets/city-kit-roads.
// The files in "GLB format/" stay as shipped. A piece is 1 unit square and
// 0.02 units tall. X and Z scale to that road's full width. Height stays at 6
// (top at 0.12, under the tire line at 0.6 and the shadow sheet at 0.4).

const FILES = {
  straight: "road-straight.glb",
  corner: "road-bend-square.glb",
  tee: "road-intersection.glb",
  cross: "road-crossroad.glb",
};

const HEIGHT_SCALE = 6;

function bakeGeometry(scene) {
  let geometry = null;
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (!obj.isMesh || geometry) return;
    geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
  });
  if (!geometry) throw new Error("A Kenney road model has no mesh.");
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export async function createKenneyRoads() {
  const root = new URL("../GLB format/", import.meta.url);
  const colormapUrl = new URL("Textures/colormap.png", root).href;
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (url.includes("colormap.png") ? colormapUrl : url));
  const loader = new GLTFLoader(manager);
  const mapTexture = await new TextureLoader(manager).loadAsync(colormapUrl);
  mapTexture.flipY = false;
  mapTexture.colorSpace = SRGBColorSpace;
  mapTexture.magFilter = LinearFilter;
  mapTexture.minFilter = LinearMipmapLinearFilter;
  mapTexture.generateMipmaps = true;
  mapTexture.needsUpdate = true;

  const geometries = {};
  await Promise.all(Object.entries(FILES).map(async ([name, file]) => {
    let gltf;
    try {
      gltf = await loader.loadAsync(new URL(file, root).href);
    } catch {
      throw new Error(`The road model failed to load: ${file}`);
    }
    geometries[name] = bakeGeometry(gltf.scene);
  }));

  const material = new MeshLambertMaterial({
    map: mapTexture,
    color: 0xffffff,
    toneMapped: false,
    side: DoubleSide,
  });
  const dummy = new Object3D();
  return { geometries, material, dummy };
}

export function addKenneyRoads(scene, plan, kit) {
  const buckets = { straight: [], corner: [], tee: [], cross: [] };
  for (const item of plan.placements) buckets[item.piece].push(item);
  const group = new Group();
  for (const [name, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    const mesh = new InstancedMesh(kit.geometries[name], kit.material, list.length);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = name === "straight" ? 0 : 1;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const size = item.scale * TILE;
      kit.dummy.position.set(item.x * TILE, item.y, item.z * TILE);
      kit.dummy.rotation.set(0, item.turn * Math.PI / 2, 0);
      kit.dummy.scale.set(size, HEIGHT_SCALE, size);
      kit.dummy.updateMatrix();
      mesh.setMatrixAt(i, kit.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
