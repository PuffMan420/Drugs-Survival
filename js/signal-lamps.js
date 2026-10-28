// Lens glow for the two placed signals. The housing is one mesh; the red,
// yellow, and green lamps are spots in the texture. A mask built from those
// colours drives emissive so only the active lamp lights.

import {
  CanvasTexture,
  LinearFilter,
  NoColorSpace,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { AO_SKIP_LAYER } from "./constants.js";

export const CAR_SIGNAL = "traffic-light-hanging-2.glb";
export const PED_SIGNAL = "traffic-light-2.glb";

const lensMasks = new WeakMap();
const signalOn = new WeakMap();

// Lens centers on the front face (model -X), just clear of the hood so the
// gameplay camera, 20° off straight down, can see the lamp.
const LENS_X = -0.075;
const LENS_COLOR = {
  red: 0xff4638,
  yellow: 0xffe14a,
  green: 0x3ad86a,
};
const LENS_LAYOUT = {
  [PED_SIGNAL]: [
    ["red", 0.4776, 0],
    ["yellow", 0.4366, 0],
    ["green", 0.3955, 0],
  ],
  [CAR_SIGNAL]: [
    ["red", 0.478, -0.2195],
    ["yellow", 0.437, -0.2195],
    ["green", 0.3957, -0.2195],
  ],
};

let lensGlowMap = null;

function lensGlowTexture() {
  if (lensGlowMap) return lensGlowMap;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  const center = size / 2;
  const radius = size * 0.46;
  for (let i = 0; i < 8; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  lensGlowMap = texture;
  return texture;
}

export function isSignalFile(file) {
  return file === CAR_SIGNAL || file === PED_SIGNAL;
}

export function signalRole(file) {
  return file === PED_SIGNAL ? "ped" : "car";
}

function lensOf(r, g, b) {
  if (r > 200 && g < 100 && b < 100 && r > g + 80) return "red";
  if (g > 160 && r < 120 && g > r + 60 && g > b) return "green";
  if (r > 190 && g > 160 && b < 110 && Math.abs(r - g) < 80 && g > b + 60) return "yellow";
  return null;
}

function buildLensMask(image) {
  const width = image.width || image.naturalWidth || 0;
  const height = image.height || image.naturalHeight || 0;
  if (width < 2 || height < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const src = ctx.getImageData(0, 0, width, height);
  const marks = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < src.data.length; i += 4, p += 1) {
    const kind = lensOf(src.data[i], src.data[i + 1], src.data[i + 2]);
    marks[p] = kind === "red" ? 1 : kind === "yellow" ? 2 : kind === "green" ? 3 : 0;
  }
  const grown = marks.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (marks[p]) continue;
      const near = (x > 0 && marks[p - 1])
        || (x + 1 < width && marks[p + 1])
        || (y > 0 && marks[p - width])
        || (y + 1 < height && marks[p + width]);
      if (near) grown[p] = near;
    }
  }
  const out = ctx.createImageData(width, height);
  for (let p = 0; p < grown.length; p += 1) {
    const i = p * 4;
    const kind = grown[p];
    out.data[i] = kind === 1 ? 255 : 0;
    out.data[i + 1] = kind === 2 ? 255 : 0;
    out.data[i + 2] = kind === 3 ? 255 : 0;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function compileSignal(shader) {
  const mask = lensMasks.get(this);
  const on = signalOn.get(this);
  if (!mask || !on) return;
  shader.uniforms.uLensMask = { value: mask };
  shader.uniforms.uSignalOn = on;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <map_pars_fragment>",
      `#include <map_pars_fragment>
      uniform sampler2D uLensMask;
      uniform vec3 uSignalOn;`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec3 lens = texture2D(uLensMask, vMapUv).rgb;
        float cover = max(lens.r, max(lens.g, lens.b));
        // "active" is reserved in GLSL ES 3.00. Using it fails the compile and the mesh is dropped.
        float lampOn = dot(lens, uSignalOn);
        vec3 lit = vec3(1.0, 0.12, 0.08) * lens.r
          + vec3(1.0, 0.78, 0.08) * lens.g
          + vec3(0.08, 0.78, 0.16) * lens.b;
        totalEmissiveRadiance += lit * lampOn * 1.6;
        diffuseColor.rgb *= mix(1.0, 0.12, clamp(cover * (1.0 - lampOn), 0.0, 1.0));
      }`,
    );
}

export function prepareSignal(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || !mat.map || !mat.map.image || lensMasks.has(mat)) continue;
      const mask = buildLensMask(mat.map.image);
      if (!mask) continue;
      lensMasks.set(mat, mask);
    }
  });
}

export function assignSignalMaterials(root) {
  const made = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((source) => {
      const mat = source.clone();
      mat.onBeforeCompile = compileSignal;
      mat.customProgramCacheKey = () => "traffic-signal-lens";
      const on = { value: new Vector3(0, 0, 0) };
      signalOn.set(mat, on);
      const mask = lensMasks.get(source);
      if (mask) lensMasks.set(mat, mask);
      mat.needsUpdate = true;
      return mat;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    made.push(...next);
  });
  return made;
}

export function setSignalPhase(material, phase) {
  const on = signalOn.get(material);
  if (!on) return;
  if (phase === "red") on.value.set(1, 0, 0);
  else if (phase === "yellow") on.value.set(0, 1, 0);
  else if (phase === "green") on.value.set(0, 0, 1);
  else on.value.set(0, 0, 0);
}

export function attachSignalLenses(root, file) {
  const layout = LENS_LAYOUT[file];
  if (!layout) return [];
  const map = lensGlowTexture();
  const lamps = [];
  for (const [phase, y, z] of layout) {
    const material = new SpriteMaterial({
      map,
      color: LENS_COLOR[phase],
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      fog: false,
    });
    const sprite = new Sprite(material);
    sprite.position.set(LENS_X, y, z);
    sprite.scale.setScalar(0.028);
    sprite.visible = false;
    sprite.castShadow = false;
    sprite.receiveShadow = false;
    sprite.frustumCulled = false;
    sprite.renderOrder = 2;
    sprite.layers.set(AO_SKIP_LAYER);
    sprite.userData.phase = phase;
    root.add(sprite);
    lamps.push(sprite);
  }
  return lamps;
}

export function setSignalLenses(lamps, phase) {
  if (!lamps) return;
  for (const lamp of lamps) lamp.visible = lamp.userData.phase === phase;
}

export function disposeSignalLenses(lamps) {
  if (!lamps) return;
  for (const lamp of lamps) {
    lamp.material.dispose();
    lamp.removeFromParent();
  }
}

export function disposeSignalMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      signalOn.delete(mat);
      lensMasks.delete(mat);
      mat.dispose();
    }
  });
}
