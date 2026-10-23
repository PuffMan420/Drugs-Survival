import {
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  LoadingManager,
  MeshBasicMaterial,
  Object3D,
  SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { pushOutOfCars } from "./car-push.js";
import { createSim, headingAngle, planCars } from "./routes.js";

// Kenney Car Kit models (CC0), from https://kenney.nl/assets/car-kit.
// The old sprite names stay, so spawn weights and the rare set do not move.
// w and h are the cropped sprite sizes the routes and the push test already use.
// file is the Kenney Car Kit model that sits closest to that sprite.
const CARS = [
  { name: "ambulance", file: "ambulance", w: 38, h: 68, tint: 0x776a6b },
  { name: "blue_sedan", file: "sedan", w: 37, h: 71, tint: 0x31558a },
  { name: "box_truck", file: "truck", w: 38, h: 70, tint: 0x828280 },
  { name: "delivery_van", file: "delivery", w: 36, h: 68, tint: 0x7a502f },
  { name: "fire_truck", file: "firetruck", w: 41, h: 79, tint: 0x703836 },
  { name: "garbage_truck", file: "garbage-truck", w: 38, h: 68, tint: 0x4b5935 },
  { name: "green_hatch", file: "hatchback-sports", w: 35, h: 65, tint: 0x5c7641 },
  { name: "icecream_van", file: "van", w: 40, h: 68, tint: 0x8f8883 },
  { name: "junker", file: "sedan", w: 36, h: 67, tint: 0x59392a },
  { name: "limo", file: "suv-luxury", w: 35, h: 79, tint: 0x7b7978 },
  { name: "muscle_orange", file: "sedan-sports", w: 35, h: 68, tint: 0xa04821 },
  { name: "pickup", file: "truck", w: 36, h: 66, tint: 0x5b643c },
  { name: "pink_retro", file: "hatchback-sports", w: 37, h: 69, tint: 0xa7627b },
  { name: "police", file: "police", w: 35, h: 69, tint: 0x5f5e61 },
  { name: "purple_lowrider", file: "sedan", w: 33, h: 70, tint: 0x5b3d7f },
  { name: "red_coupe", file: "sedan-sports", w: 35, h: 68, tint: 0x8b2725 },
  { name: "school_bus", file: "van", w: 37, h: 70, tint: 0xb87d1f },
  { name: "supercar", file: "sedan-sports", w: 39, h: 68, tint: 0x7c7c7e },
  { name: "swat_van", file: "suv", w: 40, h: 77, tint: 0x37373b },
  { name: "taco_truck", file: "delivery", w: 44, h: 70, tint: 0x816341 },
  { name: "taxi", file: "taxi", w: 36, h: 69, tint: 0xad852a },
];

const RARE = new Set(["police", "ambulance", "fire_truck"]);
// These Kenney models already wear the right livery. Dust them, but do not
// repaint them with the sprite colour or the markings disappear.
const LIVERY = new Set(["police", "ambulance", "fire_truck", "taxi", "garbage_truck"]);
const BUCKET = 96;
// Tires sit just above the road. Depth is written on the old sprite plane so
// the building shadow, which lives at y = 10, still covers the whole car.
const GROUND_Y = 0.6;
const DEPTH_Y = 2.5;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The car texture failed to load: ${url}`));
    image.src = url;
  });
}

function dustyTexture(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const width = canvas.width;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const keep = 0.48;
    let rr = lum + (r - lum) * keep;
    let gg = lum + (g - lum) * keep;
    let bb = lum + (b - lum) * keep;
    rr *= 0.8;
    gg *= 0.75;
    bb *= 0.68;
    const pixel = i / 4;
    const x = pixel % width;
    const y = (pixel / width) | 0;
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    if ((n >>> 0) % 1000 < 70) {
      rr *= 0.72;
      gg *= 0.7;
      bb *= 0.66;
    }
    data[i] = rr;
    data[i + 1] = gg;
    data[i + 2] = bb;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  // glTF uvs already match a top-left image. CanvasTexture flips by default.
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function wornColor(hex) {
  const sr = ((hex >> 16) & 255) / 255;
  const sg = ((hex >> 8) & 255) / 255;
  const sb = (hex & 255) / 255;
  const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
  const keep = 0.62;
  let r = lum + (sr - lum) * keep;
  let g = lum + (sg - lum) * keep;
  let b = lum + (sb - lum) * keep;
  r = r * 0.78 + 0.08;
  g = g * 0.74 + 0.07;
  b = b * 0.68 + 0.05;
  const color = new Color();
  color.setRGB(Math.min(1, r), Math.min(1, g), Math.min(1, b), SRGBColorSpace);
  return color;
}

function compileCar(material, paint) {
  const paintMix = paint.toFixed(2);
  material.customProgramCacheKey = () => `dusty-car-${paintMix}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 flatPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        flatPos = instanceMatrix * flatPos;
      #endif
      flatPos.y = ${DEPTH_Y.toFixed(1)};
      vec4 flatClip = projectionMatrix * modelViewMatrix * flatPos;
      gl_Position.z = flatClip.z / flatClip.w * gl_Position.w;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        vec3 worn = sampledDiffuseColor.rgb;
        float shade = dot(worn, vec3(0.299, 0.587, 0.114));
        vec3 painted = diffuse * (0.42 + shade * 1.35);
        worn = mix(worn, painted, ${paintMix});
        diffuseColor = vec4(worn, diffuseColor.a);
      #endif`,
    );
  };
}

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
  const image = await loadImage(colormapUrl);
  const mapTexture = dustyTexture(image);

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
      tint: wornColor(car.tint),
      paint: LIVERY.has(car.name) ? 0 : 0.62,
      scaleX: car.w / width,
      scaleY: car.h / length,
      scaleZ: car.h / length,
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

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const parkedHere = parked.filter((car) => car.model === modelIndex);
    const capacity = parkedHere.length + 32;
    if (capacity === 0) continue;
    const material = new MeshBasicMaterial({
      map: mapTexture,
      toneMapped: false,
      side: DoubleSide,
      color: model.tint,
    });
    compileCar(material, model.paint);
    const mesh = new InstancedMesh(model.geometry, material, capacity);
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
