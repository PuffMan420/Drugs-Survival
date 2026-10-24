import {
  FrontSide,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  LoadingManager,
  MeshLambertMaterial,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { pushOutOfCars } from "./car-push.js";
import { createSim, headingAngle, planCars, settleParked } from "./routes.js";

// Kenney Car Kit models (CC0), from https://kenney.nl/assets/car-kit.
// The old sprite names stay, so spawn weights and the rare set do not move.
// w and h are the cropped sprite sizes the routes and the push test already use.
// file is the Kenney Car Kit model that sits closest to that sprite.
const CARS = [
  { name: "ambulance", file: "ambulance", w: 38, h: 68 },
  { name: "blue_sedan", file: "sedan", w: 37, h: 71 },
  { name: "box_truck", file: "truck", w: 38, h: 70 },
  { name: "delivery_van", file: "delivery", w: 36, h: 68 },
  { name: "fire_truck", file: "firetruck", w: 41, h: 79 },
  { name: "garbage_truck", file: "garbage-truck", w: 38, h: 68 },
  { name: "green_hatch", file: "hatchback-sports", w: 35, h: 65 },
  { name: "icecream_van", file: "van", w: 40, h: 68 },
  { name: "junker", file: "sedan", w: 36, h: 67 },
  { name: "limo", file: "suv-luxury", w: 35, h: 79 },
  { name: "muscle_orange", file: "sedan-sports", w: 35, h: 68 },
  { name: "pickup", file: "truck", w: 36, h: 66 },
  { name: "pink_retro", file: "hatchback-sports", w: 37, h: 69 },
  { name: "police", file: "police", w: 35, h: 69 },
  { name: "purple_lowrider", file: "sedan", w: 33, h: 70 },
  { name: "red_coupe", file: "sedan-sports", w: 35, h: 68 },
  { name: "school_bus", file: "van", w: 37, h: 70 },
  { name: "supercar", file: "sedan-sports", w: 39, h: 68 },
  { name: "swat_van", file: "suv", w: 40, h: 77 },
  { name: "taco_truck", file: "delivery", w: 44, h: 70 },
  { name: "taxi", file: "taxi", w: 36, h: 69 },
];

const RARE = new Set(["police", "ambulance", "fire_truck"]);
const BUCKET = 96;
// Tires sit just above the road.
const GROUND_Y = 0.6;
// The mesh is drawn 10% past the footprint w and h. Routes and the push test keep those.
const DRAW_SCALE = 1.1;

function bakeGeometry(scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
    parts.push(geometry);
  });
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!merged) throw new Error("The car model could not be combined.");
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const cx = (box.max.x + box.min.x) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  merged.translate(-cx, -box.min.y, -cz);
  // Kenney cars face +Z. A heading of 0 drives toward -Z, same as the sprites.
  merged.rotateY(Math.PI);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function disposeModel(scene) {
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
  });
}

export async function createTraffic(scene, map) {
  const colormapUrl = new URL("../assets/cars3d/colormap.png", import.meta.url).href;
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (url.includes("colormap.png") ? colormapUrl : url));
  const loader = new GLTFLoader(manager);
  const mapTexture = await new TextureLoader(manager).loadAsync(colormapUrl);
  // glTF uvs already match a top-left image. TextureLoader flips by default.
  mapTexture.flipY = false;
  mapTexture.colorSpace = SRGBColorSpace;
  mapTexture.magFilter = LinearFilter;
  mapTexture.minFilter = LinearMipmapLinearFilter;
  mapTexture.generateMipmaps = true;
  mapTexture.needsUpdate = true;

  const geometries = new Map();
  const files = [...new Set(CARS.map((car) => car.file))];
  await Promise.all(files.map(async (file) => {
    const url = new URL(`../assets/cars3d/${file}.glb`, import.meta.url).href;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      throw new Error(`The car model failed to load: ${file}.glb`);
    }
    geometries.set(file, bakeGeometry(gltf.scene));
    disposeModel(gltf.scene);
  }));

  const models = CARS.map((car) => {
    const geometry = geometries.get(car.file);
    const box = geometry.boundingBox;
    const width = Math.max(0.001, box.max.x - box.min.x);
    const length = Math.max(0.001, box.max.z - box.min.z);
    return {
      ...car,
      geometry,
      weight: RARE.has(car.name) ? 1 : 6,
      scaleX: car.w / width * DRAW_SCALE,
      scaleY: car.h / length * DRAW_SCALE,
      scaleZ: car.h / length * DRAW_SCALE,
    };
  });
  const weightTotal = models.reduce((sum, model) => sum + model.weight, 0);
  const pick = (hash) => {
    let cursor = hash % weightTotal;
    for (let index = 0; index < models.length; index += 1) {
      if (cursor < models[index].weight) return index;
      cursor -= models[index].weight;
    }
    return 0;
  };

  const plan = planCars(map);
  for (const car of plan.parked) {
    car.model = pick(car.hash);
    car.w = models[car.model].w;
    car.h = models[car.model].h;
    settleParked(car, map);
  }
  const parked = plan.parked;
  const sim = createSim(plan, models, pick);
  const dummy = new Object3D();
  const matrixAt = (x, z, angle, model) => {
    dummy.position.set(x, GROUND_Y, z);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(model.scaleX, model.scaleY, model.scaleZ);
    dummy.updateMatrix();
    return dummy.matrix;
  };

  const parkedBodies = [];
  const buckets = new Map();
  const groups = [];
  const material = new MeshLambertMaterial({
    map: mapTexture,
    color: 0xffffff,
    toneMapped: false,
    side: FrontSide,
  });

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const parkedHere = parked.filter((car) => car.model === modelIndex);
    const capacity = parkedHere.length + 32;
    if (capacity === 0) continue;
    const mesh = new InstancedMesh(model.geometry, material, capacity);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    scene.add(mesh);
    for (const car of parkedHere) {
      const body = {
        x: car.x,
        z: car.z,
        w: model.w,
        h: model.h,
        angle: headingAngle(car.hx, car.hz),
      };
      parkedBodies.push(body);
      const id = `${Math.floor(car.x / BUCKET)},${Math.floor(car.z / BUCKET)}`;
      let list = buckets.get(id);
      if (!list) {
        list = [];
        buckets.set(id, list);
      }
      list.push(body);
    }
    groups.push({ mesh, model, modelIndex, parked: parkedHere });
  }

  const inView = (x, z, camX, camZ) => x > camX - 560 && x < camX + 560 && z > camZ - 420 && z < camZ + 560;

  return {
    update(dt, camX, camZ, playerX, playerZ) {
      sim.step(dt, camX, camZ, playerX, playerZ);
      for (const group of groups) {
        let count = 0;
        for (const car of group.parked) {
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.z, headingAngle(car.hx, car.hz), group.model));
          count += 1;
        }
        for (const car of sim.drivers) {
          if (car.model !== group.modelIndex) continue;
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.z, car.angle, group.model));
          count += 1;
        }
        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = count > 0;
      }
    },
    lights(camX, camZ) {
      const out = [];
      const pushCar = (car) => {
        if (out.length >= 192) return;
        if (!inView(car.x, car.z, camX, camZ)) return;
        const fx = -Math.sin(car.angle);
        const fz = -Math.cos(car.angle);
        const rx = -fz;
        const rz = fx;
        const nose = car.h * 0.4;
        const tail = car.h * 0.38;
        const side = Math.min(12, car.w * 0.22);
        out.push({
          kind: "head",
          x: car.x + fx * nose + rx * side,
          z: car.z + fz * nose + rz * side,
        });
        out.push({
          kind: "head",
          x: car.x + fx * nose - rx * side,
          z: car.z + fz * nose - rz * side,
        });
        out.push({
          kind: "tail",
          x: car.x - fx * tail + rx * side,
          z: car.z - fz * tail + rz * side,
        });
        out.push({
          kind: "tail",
          x: car.x - fx * tail - rx * side,
          z: car.z - fz * tail - rz * side,
        });
      };
      for (const car of sim.drivers) pushCar(car);
      const parkedNear = [];
      for (const car of parkedBodies) {
        if (!inView(car.x, car.z, camX, camZ)) continue;
        const dx = car.x - camX;
        const dz = car.z - camZ;
        parkedNear.push({ car, dist: dx * dx + dz * dz });
      }
      parkedNear.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < parkedNear.length && i < 16; i += 1) pushCar(parkedNear[i].car);
      return out;
    },
    shove(x, z, radius, blocked) {
      const bodies = [];
      const ix = Math.floor(x / BUCKET);
      const iz = Math.floor(z / BUCKET);
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const list = buckets.get(`${ix + dx},${iz + dz}`);
          if (list) bodies.push(...list);
        }
      }
      for (const body of sim.drivers) {
        const ox = x - body.x;
        const oz = z - body.z;
        if (ox * ox + oz * oz > 280 * 280) continue;
        bodies.push(body);
      }
      return pushOutOfCars(x, z, bodies, radius, blocked);
    },
  };
}
