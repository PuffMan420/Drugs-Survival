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
const FRAMES = 24;
const FPS = 12;
// Above the street (y = 0), the bridge decks (y = 2), and the cars (y = 2.5).
const SPRITE_Y = 4;

// Walk poses whose shoe sits on the bottom row of the cell. The approved
// 43×73 idle drawings are not in this repo, so a still player uses these.
const PLANTED = {
  S: 6,
  SE: 6,
  E: 18,
  NE: 3,
  N: 3,
  NW: 3,
  W: 18,
  SW: 6,
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

function sliceSheet(image) {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  const sourceCtx = source.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(image, 0, 0);
  const frames = [];
  for (let index = 0; index < FRAMES; index += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, index * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
    frames.push(textureOf(canvas));
  }
  return frames;
}

export async function createPlayer() {
  const walk = {};
  for (const dir of DIRS) {
    const sheet = await loadImage(new URL(`../assets/player/player_walk_${dir}_sheet.png`, import.meta.url));
    walk[dir] = sliceSheet(sheet);
  }

  // One art pixel is one world unit, so the ~73px figure stays the same
  // size as a 73px idle drawing.
  const geometry = new PlaneGeometry(FRAME_W, FRAME_H);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: walk.S[PLANTED.S],
    alphaTest: 0.45,
    toneMapped: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = SPRITE_Y;
  mesh.renderOrder = 4;

  let dir = "S";
  let time = 0;

  return {
    mesh,
    update(dt, dx, dz, x, z) {
      const next = directionOf(dx, dz);
      if (next) {
        dir = next;
        time += dt;
        material.map = walk[dir][Math.floor(time * FPS) % FRAMES];
      } else {
        material.map = walk[dir][PLANTED[dir]];
      }
      mesh.position.set(x, SPRITE_Y, z);
    },
  };
}
