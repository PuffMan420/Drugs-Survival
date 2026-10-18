import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

const DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];
const FRAME_W = 54;
const FRAME_H = 80;
const IDLE_W = 43;
const IDLE_H = 73;
const FRAMES = 24;
// 60% of the full-size sheets. Rounded so each texel is one world unit.
const SCALE = 0.6;
// One east/west cycle of the drawn walk lasts this long at full speed.
const CYCLE_SECONDS = 2;
const SPRITE_Y = 4;
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

function textureOf(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
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

function sampleDown(source) {
  const sw = source.width;
  const sh = source.height;
  const dw = Math.max(1, Math.round(sw * SCALE));
  const dh = Math.max(1, Math.round(sh * SCALE));
  const src = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(dw, dh);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const fromX = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const fromY = Math.min(sh - 1, Math.floor((y * sh) / dh));
      const from = (fromY * sw + fromX) * 4;
      const to = (y * dw + x) * 4;
      out.data[to] = src[from];
      out.data[to + 1] = src[from + 1];
      out.data[to + 2] = src[from + 2];
      out.data[to + 3] = src[from + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return { texture: textureOf(canvas), w: dw, h: dh };
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
  const idleFoot = {};
  const advances = {};
  const soles = {};
  let idleW = 1;
  let idleH = 1;
  let walkW = 1;
  let walkH = 1;

  for (const dir of DIRS) {
    const sheet = await loadImage(new URL(`../assets/player/player_walk_${dir}_sheet.png`, import.meta.url));
    const frames = [];
    const textures = [];
    for (let index = 0; index < FRAMES; index += 1) {
      const frame = drawFrame(sheet, index * FRAME_W, 0, FRAME_W, FRAME_H);
      frames.push(frame);
      const sampled = sampleDown(frame);
      textures.push(sampled.texture);
      walkW = sampled.w;
      walkH = sampled.h;
    }
    const scaleX = walkW / FRAME_W;
    const scaleZ = walkH / FRAME_H;
    const [axisX, axisY] = AXIS[dir];
    const stride = strideOf(frames, axisX, axisY, scaleX, scaleZ);
    advances[dir] = stride.advances;
    soles[dir] = stride.offsets;
    walk[dir] = textures;

    const idleImage = await loadImage(new URL(`../assets/player/player_idle_${dir}.png`, import.meta.url));
    const idleFrame = drawFrame(idleImage, 0, 0, IDLE_W, IDLE_H);
    const sampledIdle = sampleDown(idleFrame);
    idle[dir] = sampledIdle.texture;
    idleW = sampledIdle.w;
    idleH = sampledIdle.h;
    const foot = solePoint(idleFrame);
    idleFoot[dir] = {
      x: (foot.x - IDLE_W / 2) * (sampledIdle.w / IDLE_W),
      z: (foot.y - IDLE_H / 2) * (sampledIdle.h / IDLE_H),
    };
  }

  const eastCycle = advances.E.reduce((sum, step) => sum + step, 0);
  const speed = eastCycle / CYCLE_SECONDS;

  const geometry = new PlaneGeometry(walkW, walkH);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: idle.S,
    alphaTest: 0.45,
    toneMapped: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = SPRITE_Y;
  mesh.renderOrder = 4;
  mesh.scale.set(idleW / walkW, 1, idleH / walkH);

  let dir = "S";
  let travel = 0;
  let plant = null;
  let prevForward = null;
  let prevSole = null;

  function forwardOf(offset, facing) {
    const [axisX, axisZ] = AXIS[facing];
    return offset.x * axisX + offset.z * axisZ;
  }

  function showIdle() {
    material.map = idle[dir];
    mesh.scale.set(idleW / walkW, 1, idleH / walkH);
    const foot = idleFoot[dir];
    if (plant) {
      mesh.position.set(plant.x - foot.x, SPRITE_Y, plant.z - foot.z);
    }
  }

  function showWalk(frame, x, z) {
    material.map = walk[dir][frame];
    mesh.scale.set(1, 1, 1);
    const sole = soles[dir][frame];
    const forward = forwardOf(sole, dir);
    if (!plant || prevForward === null || forward > prevForward + 1.2) {
      if (plant && prevSole) {
        plant = {
          x: plant.x - prevSole.x + sole.x,
          z: plant.z - prevSole.z + sole.z,
        };
      } else {
        plant = { x: x + sole.x, z: z + sole.z };
      }
    }
    prevForward = forward;
    prevSole = sole;
    mesh.position.set(plant.x - sole.x, SPRITE_Y, plant.z - sole.z);
  }

  return {
    mesh,
    speed,
    update(dx, dz, x, z) {
      const next = directionOf(dx, dz);
      if (next) {
        if (next !== dir) {
          const oldTotal = advances[dir].reduce((sum, step) => sum + step, 0);
          const phase = oldTotal > 0 ? (travel / oldTotal) % 1 : 0;
          dir = next;
          const total = advances[dir].reduce((sum, step) => sum + step, 0);
          travel = phase * total;
          plant = null;
          prevForward = null;
          prevSole = null;
        }
        travel += Math.hypot(dx, dz);
        showWalk(frameAt(advances[dir], travel), x, z);
      } else {
        showIdle();
        if (!plant) mesh.position.set(x, SPRITE_Y, z);
      }
    },
  };
}
