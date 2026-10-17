import {
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { createSim, headingAngle, planCars } from "./routes.js";

const FILES = [
  "ambulance",
  "blue_sedan",
  "box_truck",
  "delivery_van",
  "fire_truck",
  "garbage_truck",
  "green_hatch",
  "icecream_van",
  "junker",
  "limo",
  "muscle_orange",
  "pickup",
  "pink_retro",
  "police",
  "purple_lowrider",
  "red_coupe",
  "school_bus",
  "supercar",
  "swat_van",
  "taco_truck",
  "taxi",
];

const RARE = new Set(["police", "ambulance", "fire_truck"]);
const BUCKET = 96;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The car sprite failed to load: ${url}`));
    image.src = url;
  });
}

function downscale(image) {
  const src = document.createElement("canvas");
  src.width = image.width;
  src.height = image.height;
  const srcCtx = src.getContext("2d", { willReadFrequently: true });
  srcCtx.imageSmoothingEnabled = false;
  srcCtx.drawImage(image, 0, 0);
  const pixels = srcCtx.getImageData(0, 0, src.width, src.height);
  const raw = pixels.data;
  let minX = src.width;
  let minY = src.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      if (raw[(y * src.width + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);
  const tw = Math.max(8, Math.round(cropW / 3));
  const th = Math.max(12, Math.round(cropH / 3));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(tw, th);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const sx = minX + Math.min(cropW - 1, Math.floor((x * cropW) / tw));
      const sy = minY + Math.min(cropH - 1, Math.floor((y * cropH) / th));
      const from = (sy * src.width + sx) * 4;
      const to = (y * tw + x) * 4;
      out.data[to] = raw[from];
      out.data[to + 1] = raw[from + 1];
      out.data[to + 2] = raw[from + 2];
      out.data[to + 3] = raw[from + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, w: tw, h: th };
}

function textureOf(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function createTraffic(scene, map) {
  const models = [];
  for (const name of FILES) {
    const image = await loadImage(new URL(`../assets/cars/${name}.png`, import.meta.url));
    const scaled = downscale(image);
    models.push({
      name,
      w: scaled.w,
      h: scaled.h,
      texture: textureOf(scaled.canvas),
      weight: RARE.has(name) ? 1 : 6,
    });
  }
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
  const geometries = new Map();
  const geometryFor = (w, h) => {
    const id = `${w}x${h}`;
    if (!geometries.has(id)) {
      const geometry = new PlaneGeometry(w, h);
      geometry.rotateX(-Math.PI / 2);
      geometries.set(id, geometry);
    }
    return geometries.get(id);
  };
  const dummy = new Object3D();
  const matrixAt = (x, z, angle) => {
    dummy.position.set(x, 2.5, z);
    dummy.rotation.set(0, angle, 0);
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
    const mesh = new InstancedMesh(
      geometryFor(model.w, model.h),
      new MeshBasicMaterial({
        map: model.texture,
        alphaTest: 0.45,
        toneMapped: false,
        side: DoubleSide,
      }),
      capacity,
    );
    mesh.frustumCulled = false;
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
    groups.push({ mesh, modelIndex, parked: parkedHere });
  }

  const inView = (x, z, camX, camZ) => x > camX - 560 && x < camX + 560 && z > camZ - 420 && z < camZ + 560;

  return {
    update(dt, camX, camZ, playerX, playerZ) {
      sim.step(dt, camX, camZ, playerX, playerZ);
      for (const group of groups) {
        let count = 0;
        for (const car of group.parked) {
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.z, headingAngle(car.hx, car.hz)));
          count += 1;
        }
        for (const car of sim.drivers) {
          if (car.model !== group.modelIndex) continue;
          if (!inView(car.x, car.z, camX, camZ)) continue;
          group.mesh.setMatrixAt(count, matrixAt(car.x, car.z, car.angle));
          count += 1;
        }
        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = count > 0;
      }
    },
    blocks(x, z) {
      const ix = Math.floor(x / BUCKET);
      const iz = Math.floor(z / BUCKET);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const list = buckets.get(`${ix + dx},${iz + dz}`);
          if (!list) continue;
          for (const body of list) {
            const ox = x - body.x;
            const oz = z - body.z;
            const c = Math.cos(body.angle);
            const s = Math.sin(body.angle);
            const lx = ox * c - oz * s;
            const lz = ox * s + oz * c;
            if (Math.abs(lx) < body.w / 2 + 14 && Math.abs(lz) < body.h / 2 + 14) return true;
          }
        }
      }
      for (const body of sim.drivers) {
        const ox = x - body.x;
        const oz = z - body.z;
        if (ox * ox + oz * oz > 160 * 160) continue;
        const c = Math.cos(body.angle);
        const s = Math.sin(body.angle);
        const lx = ox * c - oz * s;
        const lz = ox * s + oz * c;
        if (Math.abs(lx) < body.w / 2 + 14 && Math.abs(lz) < body.h / 2 + 14) return true;
      }
      return false;
    },
  };
}
