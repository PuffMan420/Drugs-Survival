import {
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LoadingManager,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Uint32BufferAttribute,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { isBulkyCar } from "./car-kind.js";
import { rockVertexColors } from "./bed-rocks.js";
import { foldHeadlightGeometry } from "./headlights.js";
import { pushOutOfCars } from "./car-push.js";
import { createSim, headingAngle, planCars, settleParked } from "./routes.js";
import { signalNow } from "./signals.js";

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
// Job and service liveries stay on the colours baked into the weathered model.
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
// Sports bodies only have an L2 bake. Every other file has L2 and L3.
const SPORTS = new Set(["hatchback-sports", "sedan-sports"]);
const BUCKET = 96;
// Tires sit just above the road.
const GROUND_Y = 0.6;
// The mesh is drawn 10% past the footprint w and h. Routes and the push test keep those.
const DRAW_SCALE = 1.1;
// colormap.png gradient columns, sampled at the old mid-body UV
// (row start + 0.058 + 0.5 * 0.184). Civilians swap the baked paint hue for one
// of these, then the roof-to-sill shade below still runs pale to bright.
// Jobs keep the baked hue and only get that shade.
const PALETTE_RGB = [
  [145, 181, 232],
  [121, 82, 202],
  [197, 119, 235],
  [148, 89, 65],
  [217, 154, 115],
  [247, 211, 170],
  [54, 159, 118],
  [255, 173, 67],
  [255, 131, 68],
  [226, 94, 73],
  [93, 110, 199],
  [203, 167, 147],
  [74, 74, 92],
  [60, 60, 66],
  [112, 114, 135],
  [69, 71, 85],
  [149, 156, 187],
  [214, 214, 229],
  [202, 118, 82],
  [227, 243, 255],
  [255, 210, 46],
  [226, 72, 62],
  [74, 102, 202],
  [74, 158, 141],
  [153, 139, 230],
  [220, 165, 62],
  [226, 126, 153],
];
const PALETTE = PALETTE_RGB.map(([r, g, b]) => new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace));
const WHITE = new Color(0xffffff);
// Mean luma of the old gradient tip versus its mid, and the dark end versus its mid.
const PAINT_DARK = 0.88;
const PAINT_PALE = 1.12;
// Original colormap cells, in the V-flipped space the weather bake classified.
// glTF v=0 is the top of the sheet; Blender's row is 3 - that row.
const CELL_GLASS = 1;
const CELL_HEAD = 3;
const CELL_TAIL = 5;
const CELL_SIREN = 7;
const CELL_TYRE = 5 + 16;
const CELL_TRIM = 7 + 16;
const CELL_SMALL = 13 + 16;

function isWheel(obj) {
  return obj.name.startsWith("wheel") || (obj.parent && obj.parent.name.startsWith("wheel"));
}

function colourIndex(salt) {
  let h = Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h >>> 0) % PALETTE.length;
}

function wearLevel(file, salt) {
  if (SPORTS.has(file)) return 2;
  return ((salt | 0) & 1) === 0 ? 2 : 3;
}

function levelsFor(file) {
  return SPORTS.has(file) ? [2] : [2, 3];
}

function srgbToLinear(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function triangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(nx, ny, nz);
}

function triKey(position, i0, i1, i2) {
  const q = (index) => [
    Math.round(position.getX(index) * 1000),
    Math.round(position.getY(index) * 1000),
    Math.round(position.getZ(index) * 1000),
  ].join(",");
  const pts = [q(i0), q(i1), q(i2)];
  pts.sort();
  return pts.join("|");
}

function cornerIndex(index, tri, corner) {
  return index ? index.getX(tri * 3 + corner) : tri * 3 + corner;
}

function triCountOf(geometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  return index ? index.count / 3 : position.count / 3;
}

function worldGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  return geometry;
}

// Paint faces come from the original GLB's colormap UVs. The weathered file
// has a new unwrap, so each triangle is matched by its vertex positions.
function faceCatalog(scene) {
  scene.updateMatrixWorld(true);
  const prepared = [];
  scene.traverse((obj) => {
    if (!obj.isMesh || isWheel(obj)) return;
    prepared.push({ name: obj.name, geometry: worldGeometry(obj) });
  });
  let zMin = Infinity;
  let zMax = -Infinity;
  const area = new Map();
  for (const part of prepared) {
    const { geometry } = part;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const z0 = position.getZ(i0);
      const z1 = position.getZ(i1);
      const z2 = position.getZ(i2);
      if (z0 < zMin) zMin = z0;
      if (z1 < zMin) zMin = z1;
      if (z2 < zMin) zMin = z2;
      if (z0 > zMax) zMax = z0;
      if (z1 > zMax) zMax = z1;
      if (z2 > zMax) zMax = z2;
      const col = Math.min(15, Math.max(0, Math.floor(((uv.getX(i0) % 1) + 1) % 1 * 16)));
      const rawRow = Math.min(3, Math.max(0, Math.floor(((uv.getY(i0) % 1) + 1) % 1 * 4)));
      const cell = col + (3 - rawRow) * 16;
      const size = triangleArea(
        position.getX(i0), position.getY(i0), z0,
        position.getX(i1), position.getY(i1), z1,
        position.getX(i2), position.getY(i2), z2,
      );
      area.set(cell, (area.get(cell) || 0) + size);
    }
  }
  const catalog = new Map();
  for (const part of prepared) {
    const { geometry } = part;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const keys = new Map();
    const tris = triCountOf(geometry);
    for (let tri = 0; tri < tris; tri += 1) {
      const i0 = cornerIndex(index, tri, 0);
      const i1 = cornerIndex(index, tri, 1);
      const i2 = cornerIndex(index, tri, 2);
      const col = Math.min(15, Math.max(0, Math.floor(((uv.getX(i0) % 1) + 1) % 1 * 16)));
      const rawRow = Math.min(3, Math.max(0, Math.floor(((uv.getY(i0) % 1) + 1) % 1 * 4)));
      const cell = col + (3 - rawRow) * 16;
      let cat = 0;
      if (cell === CELL_GLASS) cat = 1;
      else if (cell === CELL_HEAD) cat = 2;
      else if (cell === CELL_TAIL) cat = 3;
      else if (cell === CELL_SIREN) cat = 7;
      else if (cell === CELL_TYRE) cat = 6;
      else if (cell === CELL_TRIM) cat = 5;
      else if (cell === CELL_SMALL && (area.get(cell) || 0) < 1) cat = 5;
      if (cat === 5) {
        let maxAbsX = 0;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const indexOf of [i0, i1, i2]) {
          const x = position.getX(indexOf);
          maxAbsX = Math.max(maxAbsX, Math.abs(x));
          sx += x;
          sy += position.getY(indexOf);
          sz += position.getZ(indexOf);
        }
        const nearEnd = Math.abs(sz / 3 - zMin) < 0.08 || Math.abs(sz / 3 - zMax) < 0.08;
        if (maxAbsX < 0.22 && nearEnd && sy / 3 < 0.5) cat = 4;
      }
      keys.set(triKey(position, i0, i1, i2), cat);
    }
    catalog.set(part.name, keys);
    geometry.dispose();
  }
  return catalog;
}

function applyPaintMask(geometry, keys, label) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const count = position.count;
  const blocked = new Uint8Array(count);
  const marked = new Uint8Array(count);
  const tris = triCountOf(geometry);
  let misses = 0;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = cornerIndex(index, tri, 0);
    const i1 = cornerIndex(index, tri, 1);
    const i2 = cornerIndex(index, tri, 2);
    const cat = keys ? keys.get(triKey(position, i0, i1, i2)) : undefined;
    const paintTri = cat === 0;
    if (cat == null) misses += 1;
    for (const indexOf of [i0, i1, i2]) {
      if (paintTri) marked[indexOf] = 1;
      else blocked[indexOf] = 1;
    }
  }
  if (misses > 0) console.warn(`Car paint mask missed ${misses} triangles on ${label}`);
  const paint = new Float32Array(count);
  let any = false;
  for (let i = 0; i < count; i += 1) {
    if (marked[i] && !blocked[i]) {
      paint[i] = 1;
      any = true;
    }
  }
  if (any) geometry.setAttribute("aPaint", new Float32BufferAttribute(paint, 1));
  return any;
}

function averagePaintLuma(material, geometry) {
  const texture = material && material.map;
  const image = texture && texture.image;
  if (!image || !image.width || !image.height) return 0.2;
  const width = image.width;
  const height = image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const uv = geometry.getAttribute("uv");
  const paint = geometry.getAttribute("aPaint");
  const index = geometry.getIndex();
  const tris = triCountOf(geometry);
  let sum = 0;
  let n = 0;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = cornerIndex(index, tri, 0);
    const i1 = cornerIndex(index, tri, 1);
    const i2 = cornerIndex(index, tri, 2);
    if (paint.getX(i0) < 0.5 || paint.getX(i1) < 0.5 || paint.getX(i2) < 0.5) continue;
    const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3;
    const v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
    const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * height)));
    const pixel = (y * width + x) * 4;
    const luma = srgbToLinear(pixels[pixel]) * 0.2126
      + srgbToLinear(pixels[pixel + 1]) * 0.7152
      + srgbToLinear(pixels[pixel + 2]) * 0.0722;
    sum += luma;
    n += 1;
  }
  return n > 0 ? sum / n : 0.2;
}

// One material per baked mesh. Instances share it. The hue lives on instanceColor
// and aRecolor, so a different tint does not clone the material or its textures.
function installPaintShader(material, baseLum) {
  if (!material || !material.isMeshStandardMaterial || material.userData.paintShader) return;
  material.userData.paintShader = true;
  material.toneMapped = false;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    MeshStandardMaterial.prototype.onBeforeCompile.call(this, shader, renderer);
    shader.uniforms.uPaintBase = { value: baseLum };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <uv_pars_vertex>",
        `#include <uv_pars_vertex>
        attribute float aPaint;
        attribute float aPaintT;
        attribute float aRecolor;
        varying float vPaint;
        varying float vPaintT;
        varying float vRecolor;
        varying vec3 vTint;`,
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        vPaint = aPaint;
        vPaintT = aPaintT;
        vRecolor = aRecolor;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3(1.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <uv_pars_fragment>",
        `#include <uv_pars_fragment>
        varying float vPaint;
        varying float vPaintT;
        varying float vRecolor;
        varying vec3 vTint;
        uniform float uPaintBase;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float carShade = mix(${PAINT_DARK.toFixed(2)}, ${PAINT_PALE.toFixed(2)}, clamp(vPaintT, 0.0, 1.0));
        float carLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float carWear = carLum / max(uPaintBase, 0.045);
        vec3 carRespray = vTint * carWear * carShade;
        vec3 carKept = diffuseColor.rgb * carShade;
        vec3 carPainted = mix(carKept, carRespray, clamp(vRecolor, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, carPainted, step(0.5, vPaint));`,
      );
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    const prior = MeshStandardMaterial.prototype.customProgramCacheKey.call(this);
    return `${prior}|car-paint-1`;
  };
}

// Rocks in the truck bed share one grey sheet. A vertex colour per lump
// darkens that sheet, and each lump gets a different grey. The body is a
// different mesh, so its paint stays put.
function shadeBedRocks(geometry, material) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index || !position || !material) return;
  const packed = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    packed[i * 3] = position.getX(i);
    packed[i * 3 + 1] = position.getY(i);
    packed[i * 3 + 2] = position.getZ(i);
  }
  geometry.setAttribute(
    "color",
    new Float32BufferAttribute(rockVertexColors(packed, index.array), 3),
  );
  material.vertexColors = true;
}

function bakeLevel(scene, catalog) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geometry = worldGeometry(obj);
    const wheel = isWheel(obj);
    const paintable = !wheel && applyPaintMask(geometry, catalog.get(obj.name), obj.name);
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (material) material.toneMapped = false;
    if (obj.name === "trash") shadeBedRocks(geometry, material);
    if (paintable) installPaintShader(material, averagePaintLuma(material, geometry));
    parts.push({ name: obj.name, geometry, material, paintable });
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (box.min.x < minX) minX = box.min.x;
    if (box.max.x > maxX) maxX = box.max.x;
    if (box.min.y < minY) minY = box.min.y;
    if (box.min.z < minZ) minZ = box.min.z;
    if (box.max.z > maxZ) maxZ = box.max.z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  // Measured before the headlight fold so a lamp that reaches the nose
  // corner cannot change how big the car is drawn.
  const width = Math.max(0.001, maxX - minX);
  const length = Math.max(0.001, maxZ - minZ);
  for (const part of parts) {
    foldBakedHeadlights(part.geometry, catalog && catalog.get(part.name));
    part.geometry.translate(-cx, -minY, -cz);
    // Kenney cars face +Z. A heading of 0 drives toward -Z, same as the sprites.
    part.geometry.rotateY(Math.PI);
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const part of parts) {
    if (!part.paintable) continue;
    const position = part.geometry.getAttribute("position");
    const paint = part.geometry.getAttribute("aPaint");
    for (let i = 0; i < paint.count; i += 1) {
      if (paint.getX(i) < 0.5) continue;
      const y = position.getY(i);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  const span = Math.max(0.001, yMax - yMin);
  for (const part of parts) {
    if (!part.paintable) continue;
    const position = part.geometry.getAttribute("position");
    const paint = part.geometry.getAttribute("aPaint");
    const paintT = new Float32Array(paint.count);
    for (let i = 0; i < paint.count; i += 1) {
      if (paint.getX(i) < 0.5) continue;
      paintT[i] = (position.getY(i) - yMin) / span;
    }
    part.geometry.setAttribute("aPaintT", new Float32BufferAttribute(paintT, 1));
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  for (const part of parts) {
    if (part.paintable) continue;
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return { parts, width, length };
}

// Headlight quads are exclusive vertices on the baked body. Folding them
// after the paint mask (which matches on the original positions) and after
// the bounds above keeps the body colour and the car footprint put.
function foldBakedHeadlights(geometry, keys) {
  if (!keys) return;
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!index || !position || !normal || !uv) return;
  const tris = index.count / 3;
  const cats = new Array(tris);
  let any = false;
  for (let tri = 0; tri < tris; tri += 1) {
    const i0 = index.getX(tri * 3);
    const i1 = index.getX(tri * 3 + 1);
    const i2 = index.getX(tri * 3 + 2);
    const cat = keys.get(triKey(position, i0, i1, i2));
    cats[tri] = cat == null ? -1 : cat;
    if (cat === 2) any = true;
  }
  if (!any) return;
  const paintAttr = geometry.getAttribute("aPaint");
  const folded = foldHeadlightGeometry({
    positions: position.array.slice(0, position.count * 3),
    normals: normal.array.slice(0, normal.count * 3),
    uvs: uv.array.slice(0, uv.count * 2),
    indices: index.array.slice(0, index.count),
    cats,
    paint: paintAttr ? paintAttr.array.slice(0, paintAttr.count) : null,
  });
  geometry.setAttribute("position", new Float32BufferAttribute(folded.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(folded.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(folded.uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(folded.indices, 1));
  if (folded.paint) {
    geometry.setAttribute("aPaint", new Float32BufferAttribute(folded.paint, 1));
  }
}

function disposeModel(scene) {
  const textures = new Set();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of ["map", "roughnessMap", "metalnessMap", "emissiveMap", "normalMap", "aoMap"]) {
        if (material[key]) textures.add(material[key]);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

function releaseGeometries(scene) {
  scene.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
}

async function loadScene(loader, url, label) {
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch {
    throw new Error(`The car model failed to load: ${label}`);
  }
}

export async function createTraffic(scene, map, pieces = []) {
  const colormapUrl = new URL("../assets/cars3d/colormap.png", import.meta.url).href;
  const maskManager = new LoadingManager();
  // The original GLBs still point at the shared sheet. Their UVs classify paint.
  maskManager.setURLModifier((url) => (url.includes("colormap.png") ? colormapUrl : url));
  const maskLoader = new GLTFLoader(maskManager);
  const loader = new GLTFLoader();
  const files = [...new Set(CARS.map((car) => car.file))];
  const baked = new Map();
  await Promise.all(files.map(async (file) => {
    const maskScene = await loadScene(
      maskLoader,
      new URL(`../assets/cars3d/${file}.glb`, import.meta.url).href,
      `${file}.glb`,
    );
    const catalog = faceCatalog(maskScene);
    const levels = {};
    let measured = null;
    for (const level of levelsFor(file)) {
      const weathered = await loadScene(
        loader,
        new URL(`../assets/cars3d/weathered/${file}-L${level}.glb`, import.meta.url).href,
        `${file}-L${level}.glb`,
      );
      const built = bakeLevel(weathered, catalog);
      levels[level] = built.parts;
      if (level === 2) measured = built;
      releaseGeometries(weathered);
    }
    disposeModel(maskScene);
    baked.set(file, {
      width: measured.width,
      length: measured.length,
      levels,
    });
  }));

  const models = CARS.map((car) => {
    const file = baked.get(car.file);
    return {
      ...car,
      bulky: isBulkyCar(car),
      weight: RARE.has(car.name) ? 1 : 6,
      scaleX: car.w / file.width * DRAW_SCALE,
      scaleY: car.h / file.length * DRAW_SCALE,
      scaleZ: car.h / file.length * DRAW_SCALE,
      levels: file.levels,
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
    car.bulky = !!models[car.model].bulky;
    car.y = GROUND_Y;
    car.angle = headingAngle(car.hx, car.hz);
    car.level = wearLevel(models[car.model].file, car.hash);
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
  for (const car of parked) {
    const model = models[car.model];
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

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    for (const level of levelsFor(model.file)) {
      const parkedHere = parked.filter((car) => car.model === modelIndex && car.level === level);
      const capacity = parkedHere.length + 32;
      const partDraws = [];
      for (const part of model.levels[level]) {
        const geometry = part.geometry.clone();
        let recolor = null;
        if (part.paintable) {
          recolor = new InstancedBufferAttribute(new Float32Array(capacity), 1);
          recolor.setUsage(DynamicDrawUsage);
          geometry.setAttribute("aRecolor", recolor);
        }
        const mesh = new InstancedMesh(geometry, part.material, capacity);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        mesh.matrixAutoUpdate = false;
        mesh.count = 0;
        if (part.paintable) {
          mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        }
        scene.add(mesh);
        partDraws.push({ mesh, recolor, paintable: part.paintable });
      }
      groups.push({
        parts: partDraws,
        model,
        modelIndex,
        level,
        parked: parkedHere,
      });
    }
  }

  const inView = (x, z, camX, camZ) => x > camX - 560 && x < camX + 560 && z > camZ - 420 && z < camZ + 560;
  const groupAt = models.map(() => [0, 0, 0, 0]);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    groupAt[group.modelIndex][group.level] = index + 1;
  }
  const driversByGroup = groups.map(() => []);
  const listed = [];
  const LIGHT_CAP = 192;
  const lightPool = Array.from({ length: LIGHT_CAP }, () => ({ kind: "head", x: 0, y: 0, z: 0 }));
  const lightList = [];
  const nearPool = parkedBodies.map(() => ({ car: null, dist: 0 }));
  const nearList = [];

  function byDist(a, b) {
    return a.dist - b.dist;
  }

  function syncParked() {
    for (const body of parkedBodies) {
      const car = body.src;
      body.x = car.x;
      body.z = car.z;
      body.y = car.y;
      body.angle = car.angle;
    }
  }

  function placeCar(group, car, salt, count) {
    const matrix = matrixAt(
      car.x,
      car.y == null ? GROUND_Y : car.y,
      car.z,
      car.angle,
      group.model,
      car.quat,
    );
    const civilian = !SERVICE.has(group.model.name);
    const tint = civilian ? PALETTE[colourIndex(salt)] : WHITE;
    for (const part of group.parts) {
      part.mesh.setMatrixAt(count, matrix);
      if (!part.paintable) continue;
      part.recolor.setX(count, civilian ? 1 : 0);
      part.mesh.setColorAt(count, tint);
    }
    return count + 1;
  }

  function pushLight(kind, x, y, z) {
    const slot = lightPool[lightList.length];
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    lightList.push(slot);
  }

  return {
    scare(x, z) {
      sim.scare(x, z);
    },
    cars() {
      const total = parked.length + sim.drivers.length;
      listed.length = total;
      for (let i = 0; i < parked.length; i += 1) listed[i] = parked[i];
      for (let i = 0; i < sim.drivers.length; i += 1) listed[parked.length + i] = sim.drivers[i];
      return listed;
    },
    roadHeight(x, z, y) {
      return plan.heightAt ? plan.heightAt(x, z, y) : null;
    },
    junctions: plan.junctions,
    signalTime() {
      return signalNow();
    },
    update(dt, camX, camZ, playerX, playerZ) {
      sim.step(dt, camX, camZ, playerX, playerZ);
      syncParked();
      for (const list of driversByGroup) list.length = 0;
      for (const car of sim.drivers) {
        const row = groupAt[car.model];
        if (!row) continue;
        const index = row[wearLevel(models[car.model].file, car.id)] - 1;
        if (index < 0) continue;
        driversByGroup[index].push(car);
      }
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        let count = 0;
        for (const car of group.parked) {
          if (!inView(car.x, car.z, camX, camZ)) continue;
          count = placeCar(group, car, car.hash, count);
        }
        for (const car of driversByGroup[index]) {
          if (!inView(car.x, car.z, camX, camZ)) continue;
          count = placeCar(group, car, car.id, count);
        }
        for (const part of group.parts) {
          part.mesh.count = count;
          part.mesh.instanceMatrix.needsUpdate = count > 0;
          if (!part.paintable) continue;
          part.recolor.needsUpdate = count > 0;
          part.mesh.instanceColor.needsUpdate = count > 0;
        }
      }
    },
    lights(camX, camZ) {
      lightList.length = 0;
      const pushCar = (car) => {
        if (lightList.length >= LIGHT_CAP) return;
        if (!inView(car.x, car.z, camX, camZ)) return;
        const fx = -Math.sin(car.angle);
        const fz = -Math.cos(car.angle);
        const rx = -fz;
        const rz = fx;
        const nose = car.h * 0.4;
        const tail = car.h * 0.38;
        const side = Math.min(12, car.w * 0.22);
        const y = car.y == null ? 4.2 : car.y + 3.6;
        pushLight("head", car.x + fx * nose + rx * side, y, car.z + fz * nose + rz * side);
        pushLight("head", car.x + fx * nose - rx * side, y, car.z + fz * nose - rz * side);
        pushLight("tail", car.x - fx * tail + rx * side, y, car.z - fz * tail + rz * side);
        pushLight("tail", car.x - fx * tail - rx * side, y, car.z - fz * tail - rz * side);
      };
      for (const car of sim.drivers) pushCar(car);
      nearList.length = 0;
      for (const car of parkedBodies) {
        if (!inView(car.x, car.z, camX, camZ)) continue;
        const dx = car.x - camX;
        const dz = car.z - camZ;
        const slot = nearPool[nearList.length];
        slot.car = car;
        slot.dist = dx * dx + dz * dz;
        nearList.push(slot);
      }
      nearList.sort(byDist);
      for (let i = 0; i < nearList.length && i < 16; i += 1) pushCar(nearList[i].car);
      return lightList;
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
