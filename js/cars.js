import {
  DynamicDrawUsage,
  Float32BufferAttribute,
  FrontSide,
  InstancedBufferAttribute,
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
// Job and service liveries stay on the colours built into the model.
const SERVICE = new Set([
  "ambulance",
  "box_truck",
  "delivery_van",
  "fire_truck",
  "garbage_truck",
  "icecream_van",
  "police",
  "school_bus",
  "swat_van",
  "taco_truck",
  "taxi",
]);
const BUCKET = 96;
// Tires sit just above the road.
const GROUND_Y = 0.6;
// The mesh is drawn 10% past the footprint w and h. Routes and the push test keep those.
const DRAW_SCALE = 1.1;
// colormap.png is 16 columns by 4 rows. Each colour is a flat column beside a
// gradient column (lighter at the top of the row, darkest at the bottom).
// The model UVs already sit on the gradient column. A shell vertex is repainted
// down that column so the roof is the light end and the lower body is darker.
// The sample starts a step below the pale tip, so the body reads slightly darker.
// The dark grey bumper, sill, and underbody stay on the UVs built into the model.
const COLUMNS = 16;
const ROWS = 4;
const GRADIENT_INSET = 0.008;
const GRADIENT_SPAN = 1 / ROWS - GRADIENT_INSET * 2;
const BODY_DARKEN = 0.05;
const GREY_TRIM = new Set([5 + 2 * COLUMNS, 7 + 2 * COLUMNS]);
// Every painted swatch except the empty black block on the top row.
const BODY_COLOURS = [];
for (let row = 0; row < ROWS; row += 1) {
  for (let pair = 0; pair < 8; pair += 1) {
    if (row === 0 && pair >= 3) continue;
    BODY_COLOURS.push({
      u: (pair * 2 + 1.5) / COLUMNS,
      v: row / ROWS,
    });
  }
}

function cellCol(u) {
  return Math.min(COLUMNS - 1, Math.max(0, Math.floor(u * COLUMNS + 1e-4)));
}

function cellRow(v) {
  return Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS + 1e-4)));
}

function isWheel(obj) {
  return obj.name.startsWith("wheel") || (obj.parent && obj.parent.name.startsWith("wheel"));
}

function colourIndex(salt) {
  let h = Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h >>> 0) % BODY_COLOURS.length;
}

function bakeGeometry(scene) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  const stats = new Map();
  for (const obj of meshes) {
    if (isWheel(obj)) continue;
    const uv = obj.geometry.getAttribute("uv");
    const normal = obj.geometry.getAttribute("normal");
    for (let i = 0; i < uv.count; i += 1) {
      const key = cellCol(uv.getX(i)) + cellRow(uv.getY(i)) * COLUMNS;
      const entry = stats.get(key);
      const ny = normal ? normal.getY(i) : 0;
      if (entry) {
        entry.n += 1;
        entry.ny += ny;
      } else {
        stats.set(key, { n: 1, ny });
      }
    }
  }
  // Large panels that do not face the road. Glass, lamps, and the underside stay put.
  const shell = new Set();
  for (const [key, entry] of stats) {
    if (entry.n >= 100 && entry.ny / entry.n > -0.15) shell.add(key);
  }
  const parts = [];
  for (const obj of meshes) {
    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
    const uv = geometry.getAttribute("uv");
    const paint = new Float32Array(uv.count);
    const shellMask = new Float32Array(uv.count);
    const cell = new Float32Array(uv.count * 2);
    const wheel = isWheel(obj);
    for (let i = 0; i < uv.count; i += 1) {
      const col = cellCol(uv.getX(i));
      const row = cellRow(uv.getY(i));
      const gradCol = col % 2 === 0 ? col + 1 : col;
      cell[i * 2] = (gradCol + 0.5) / COLUMNS;
      cell[i * 2 + 1] = row / ROWS;
      if (wheel) continue;
      paint[i] = 1;
      if (shell.has(col + row * COLUMNS)) shellMask[i] = 1;
    }
    geometry.setAttribute("aPaint", new Float32BufferAttribute(paint, 1));
    geometry.setAttribute("aShell", new Float32BufferAttribute(shellMask, 1));
    geometry.setAttribute("aCell", new Float32BufferAttribute(cell, 2));
    parts.push(geometry);
  }
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
  const paintAttr = merged.getAttribute("aPaint");
  const shellAttr = merged.getAttribute("aShell");
  const cellAttr = merged.getAttribute("aCell");
  const position = merged.getAttribute("position");
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < paintAttr.count; i += 1) {
    if (paintAttr.getX(i) < 0.5) continue;
    const y = position.getY(i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const span = Math.max(0.001, yMax - yMin);
  const paintT = new Float32Array(paintAttr.count);
  for (let i = 0; i < paintAttr.count; i += 1) {
    if (paintAttr.getX(i) < 0.5) continue;
    const col = Math.round(cellAttr.getX(i) * COLUMNS - 0.5);
    const row = Math.round(cellAttr.getY(i) * ROWS);
    if (GREY_TRIM.has(col + row * COLUMNS)) {
      paintAttr.setX(i, 0);
      shellAttr.setX(i, 0);
      continue;
    }
    paintT[i] = (position.getY(i) - yMin) / span;
  }
  merged.setAttribute("aPaintT", new Float32BufferAttribute(paintT, 1));
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

export async function createTraffic(scene, map, pieces = []) {
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

  const plan = planCars(map, pieces);
  for (const car of plan.parked) {
    car.model = pick(car.hash);
    car.w = models[car.model].w;
    car.h = models[car.model].h;
    car.y = GROUND_Y;
    car.angle = headingAngle(car.hx, car.hz);
    settleParked(car, map);
  }
  const parked = plan.parked;
  const sim = createSim(plan, models, pick);
  const dummy = new Object3D();
  const matrixAt = (x, y, z, angle, model, quat) => {
    dummy.position.set(x, y, z);
    if (quat) dummy.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    else dummy.rotation.set(0, angle, 0);
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
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <uv_pars_vertex>",
        `#include <uv_pars_vertex>
        attribute float aPaint;
        attribute float aShell;
        attribute float aPaintT;
        attribute vec2 aCell;
        attribute vec2 aBodyCell;
        attribute float aRecolor;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        if (aPaint > 0.5) {
          vec2 cell = aCell;
          if (aShell > 0.5 && aRecolor > 0.5) cell = aBodyCell;
          vMapUv = vec2(cell.x, cell.y + ${(GRADIENT_INSET + BODY_DARKEN).toFixed(3)} + (1.0 - aPaintT) * ${(GRADIENT_SPAN - BODY_DARKEN).toFixed(3)});
        }`,
      );
  };
  material.customProgramCacheKey = () => "car-body-gradient-2";

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const parkedHere = parked.filter((car) => car.model === modelIndex);
    const capacity = parkedHere.length + 32;
    if (capacity === 0) continue;
    const geometry = model.geometry.clone();
    const bodyCell = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    const recolor = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    bodyCell.setUsage(DynamicDrawUsage);
    recolor.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aBodyCell", bodyCell);
    geometry.setAttribute("aRecolor", recolor);
    const mesh = new InstancedMesh(geometry, material, capacity);
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
        y: car.y,
        w: model.w,
        h: model.h,
        angle: car.angle,
        src: car,
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
    groups.push({
      mesh,
      model,
      modelIndex,
      parked: parkedHere,
      bodyCell,
      recolor,
    });
  }

  const inView = (x, z, camX, camZ) => x > camX - 560 && x < camX + 560 && z > camZ - 420 && z < camZ + 560;

  function syncParked() {
    for (const body of parkedBodies) {
      const car = body.src;
      body.x = car.x;
      body.z = car.z;
      body.y = car.y;
      body.angle = car.angle;
    }
  }

  return {
    cars() {
      return parked.concat(sim.drivers);
    },
    roadHeight(x, z, y) {
      return plan.heightAt ? plan.heightAt(x, z, y) : null;
    },
    update(dt, camX, camZ, playerX, playerZ) {
      sim.step(dt, camX, camZ, playerX, playerZ);
      syncParked();
      for (const group of groups) {
        let count = 0;
        const civilian = !SERVICE.has(group.model.name);
        const stamp = (salt) => {
          group.recolor.setX(count, civilian ? 1 : 0);
          if (civilian) {
            const cell = BODY_COLOURS[colourIndex(salt)];
            group.bodyCell.setXY(count, cell.u, cell.v);
          }
        };
        for (const car of group.parked) {
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.y == null ? GROUND_Y : car.y, car.z, car.angle, group.model, car.quat));
          stamp(car.hash);
          count += 1;
        }
        for (const car of sim.drivers) {
          if (car.model !== group.modelIndex) continue;
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.y == null ? GROUND_Y : car.y, car.z, car.angle, group.model, car.quat));
          stamp(car.id);
          count += 1;
        }
        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = count > 0;
        group.bodyCell.needsUpdate = count > 0;
        group.recolor.needsUpdate = count > 0;
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
        const y = car.y == null ? 4.2 : car.y + 3.6;
        out.push({
          kind: "head",
          y,
          x: car.x + fx * nose + rx * side,
          z: car.z + fz * nose + rz * side,
        });
        out.push({
          kind: "head",
          y,
          x: car.x + fx * nose - rx * side,
          z: car.z + fz * nose - rz * side,
        });
        out.push({
          kind: "tail",
          y,
          x: car.x - fx * tail + rx * side,
          z: car.z - fz * tail + rz * side,
        });
        out.push({
          kind: "tail",
          y,
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
      syncParked();
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
        if (body.y != null && Math.abs(body.y - GROUND_Y) > 36) continue;
        const ox = x - body.x;
        const oz = z - body.z;
        if (ox * ox + oz * oz > 280 * 280) continue;
        bodies.push(body);
      }
      return pushOutOfCars(x, z, bodies, radius, blocked);
    },
  };
}
