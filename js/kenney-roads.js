import {
  DoubleSide,
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
// The files in "GLB format/" stay as shipped. Each piece is 1 unit square,
// so the footprint scale is TILE. The models are only 0.02 units tall; scaling
// that by TILE would lift the curb into the cars, so height stays at 6
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

export function addKenneyChunk(group, plan, kit, cx, cz, x1, z1) {
  const buckets = { straight: [], corner: [], tee: [], cross: [] };
  for (let z = cz; z < z1; z += 1) {
    for (let x = cx; x < x1; x += 1) {
      const cell = plan.cell(x, z);
      if (!cell) continue;
      buckets[cell.piece].push({ x, z, turn: cell.turn });
    }
  }
  for (const [name, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    const mesh = new InstancedMesh(kit.geometries[name], kit.material, list.length);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    for (let i = 0; i < list.length; i += 1) {
      const cell = list[i];
      kit.dummy.position.set((cell.x + 0.5) * TILE, 0, (cell.z + 0.5) * TILE);
      kit.dummy.rotation.set(0, cell.turn * Math.PI / 2, 0);
      kit.dummy.scale.set(TILE, HEIGHT_SCALE, TILE);
      kit.dummy.updateMatrix();
      mesh.setMatrixAt(i, kit.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}
