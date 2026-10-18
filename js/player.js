import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { GROUND_H, GROUND_W, RENDER_H, RENDER_W } from "./constants.js";

const DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];
const FRAME_W = 54;
const FRAME_H = 80;
const IDLE_W = 43;
const IDLE_H = 73;
const FRAMES = 24;
// The 960×540 picture frames 840×472.5 world units, so one render pixel is
// 0.875 world units.
const WORLD_PER_PX_X = GROUND_W / RENDER_W;
const WORLD_PER_PX_Z = GROUND_H / RENDER_H;
// Thirty percent smaller than the native frames. One scale on the whole
// sprite, so every part of him shrinks together and stays even.
const CHARACTER_SCALE = 0.7;
// Brisk walk. Frames advance from distance, so the cycle keeps up with him.
const SPEED = 80;
const SPRITE_Y = 4;
const SHADOW_Y = 3;
// A sole cannot step backward more than this in one frame. Larger jumps are
// the tracker changing feet, not a plant.
const ADVANCE_CAP = 9;
const SWING = 0.35;

// Image +x is east, image +y is south, matching the flat sprite.
const AXIS = {
  E: [1, 0],
  W: [-1, 0],
  S: [0, 1],
  N: [0, -1],
  SE: [Math.SQRT1_2, Math.SQRT1_2],
  SW: [-Math.SQRT1_2, Math.SQRT1_2],
  NE: [Math.SQRT1_2, -Math.SQRT1_2],
  NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

function directionOf(dx, dz) {
  const east = dx > 0.001;
  const west = dx < -0.001;
  const south = dz > 0.001;
  const north = dz < -0.001;
  if (south && east) return "SE";
  if (south && west) return "SW";
  if (north && east) return "NE";
  if (north && west) return "NW";
  if (south) return "S";
  if (north) return "N";
  if (east) return "E";
  if (west) return "W";
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The player sprite failed to load: ${url}`));
    image.src = url;
  });
}

function textureOf(canvas, smooth) {
  const texture = new CanvasTexture(canvas);
  const filter = smooth ? LinearFilter : NearestFilter;
  texture.magFilter = filter;
  texture.minFilter = filter;
  texture.generateMipmaps = false;
  // Smooth sampling mixes in the clear texels. Premultiply so that black
  // stays out of the edge and the shrink looks even instead of fringed.
  texture.premultiplyAlpha = smooth;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function shadowTexture() {
  const width = 32;
  const height = 16;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const cx = 15.5;
  const cy = 7.5;
  const rx = 15;
  const ry = 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const dist = nx * nx + ny * ny;
      const alpha = dist >= 1 ? 0 : Math.round(160 * (1 - dist) ** 2);
      const index = (y * width + x) * 4;
      image.data[index + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  return textureOf(canvas, true);
}

function drawFrame(image, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function solePoint(canvas) {
  const { width, height, data } = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, canvas.width, canvas.height);
  let maxY = 0;
  for (let y = height - 1; y >= 0; y -= 1) {
    let found = false;
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 32) {
        maxY = y;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  let sumX = 0;
  let count = 0;
  for (let x = 0; x < width; x += 1) {
    if (data[(maxY * width + x) * 4 + 3] > 32) {
      sumX += x;
      count += 1;
    }
  }
  return { x: sumX / count, y: maxY };
}

function strideOf(frames, axisX, axisY, scaleX, scaleZ) {
  const axisScale = Math.hypot(axisX * scaleX, axisY * scaleZ);
  const proj = frames.map((frame) => {
    const sole = solePoint(frame);
    return sole.x * axisX + sole.y * axisY;
  });
  const advances = proj.map((value, index) => {
    const next = proj[(index + 1) % FRAMES];
    const raw = Math.max(0, value - next);
    const step = raw > ADVANCE_CAP || raw < 0.8 ? SWING : raw;
    return step * axisScale;
  });
  const offsets = frames.map((frame) => {
    const sole = solePoint(frame);
    return {
      x: (sole.x - FRAME_W / 2) * scaleX,
      z: (sole.y - FRAME_H / 2) * scaleZ,
    };
  });
  return { advances, offsets };
}

function frameAt(advances, travel) {
  const total = advances.reduce((sum, step) => sum + step, 0);
  let remain = travel % total;
  for (let index = 0; index < FRAMES; index += 1) {
    if (remain < advances[index]) return index;
    remain -= advances[index];
  }
  return 0;
}

export async function createPlayer() {
  const walk = {};
  const idle = {};
  const advances = {};
  const walkWorldW = FRAME_W * WORLD_PER_PX_X;
  const walkWorldH = FRAME_H * WORLD_PER_PX_Z;
  const idleWorldW = IDLE_W * WORLD_PER_PX_X;
  const idleWorldH = IDLE_H * WORLD_PER_PX_Z;

  for (const dir of DIRS) {
    const sheet = await loadImage(new URL(`../assets/player/player_walk_${dir}_sheet.png`, import.meta.url));
    const frames = [];
    const textures = [];
    for (let index = 0; index < FRAMES; index += 1) {
      const frame = drawFrame(sheet, index * FRAME_W, 0, FRAME_W, FRAME_H);
      frames.push(frame);
      textures.push(textureOf(frame, true));
    }
    const [axisX, axisY] = AXIS[dir];
    const stride = strideOf(
      frames,
      axisX,
      axisY,
      WORLD_PER_PX_X * CHARACTER_SCALE,
      WORLD_PER_PX_Z * CHARACTER_SCALE,
    );
    advances[dir] = stride.advances;
    walk[dir] = textures;

    const idleImage = await loadImage(new URL(`../assets/player/player_idle_${dir}.png`, import.meta.url));
    idle[dir] = textureOf(drawFrame(idleImage, 0, 0, IDLE_W, IDLE_H), true);
  }

  const idleScaleX = (idleWorldW / walkWorldW) * CHARACTER_SCALE;
  const idleScaleZ = (idleWorldH / walkWorldH) * CHARACTER_SCALE;

  const geometry = new PlaneGeometry(walkWorldW, walkWorldH);
  geometry.rotateX(-Math.PI / 2);
  // Soft edge from the smooth scale. Premultiplied blending keeps the
  // hoodie solid and stops the clear texels from darkening the outline.
  const material = new MeshBasicMaterial({
    map: idle.S,
    color: 0xffffff,
    transparent: true,
    premultipliedAlpha: true,
    opacity: 1,
    alphaTest: 0.05,
    depthWrite: true,
    fog: false,
    toneMapped: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = SPRITE_Y;
  mesh.renderOrder = 4;
  mesh.scale.set(idleScaleX, 1, idleScaleZ);

  const shadowGeometry = new PlaneGeometry(18 * CHARACTER_SCALE, 8 * CHARACTER_SCALE);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new MeshBasicMaterial({
    map: shadowTexture(),
    color: 0xffffff,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    side: DoubleSide,
  });
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.frustumCulled = false;
  shadow.position.y = SHADOW_Y;
  shadow.renderOrder = 3;

  let dir = "S";
  let travel = 0;
  let standing = true;

  function pixelBias(width, height) {
    // Odd sizes need a half pixel so every texel sits on one screen pixel.
    return {
      x: (width % 2) * WORLD_PER_PX_X * 0.5,
      z: (height % 2) * WORLD_PER_PX_Z * 0.5,
    };
  }

  function place(x, z) {
    const bias = standing ? pixelBias(IDLE_W, IDLE_H) : pixelBias(FRAME_W, FRAME_H);
    const px = x + bias.x;
    const pz = z + bias.z;
    mesh.position.set(px, SPRITE_Y, pz);
    const height = walkWorldH * mesh.scale.z;
    shadow.position.set(px, SHADOW_Y, pz + height * 0.42);
  }

  function showIdle() {
    standing = true;
    material.map = idle[dir];
    mesh.scale.set(idleScaleX, 1, idleScaleZ);
  }

  function showWalk(frame) {
    standing = false;
    material.map = walk[dir][frame];
    mesh.scale.set(CHARACTER_SCALE, 1, CHARACTER_SCALE);
  }

  return {
    mesh,
    shadow,
    speed: SPEED,
    update(dx, dz, x, z) {
      const next = directionOf(dx, dz);
      if (next) {
        if (next !== dir) {
          const oldTotal = advances[dir].reduce((sum, step) => sum + step, 0);
          const phase = oldTotal > 0 ? (travel / oldTotal) % 1 : 0;
          dir = next;
          const total = advances[dir].reduce((sum, step) => sum + step, 0);
          travel = phase * total;
        }
        travel += Math.hypot(dx, dz);
        showWalk(frameAt(advances[dir], travel));
      } else {
        showIdle();
      }
      place(x, z);
    },
  };
}
