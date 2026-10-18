import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

const SHEET = new URL("../assets/textures/buildings/", import.meta.url);
const CELL = 96;
const TEAL = [0, 128, 128];

// Dirty and rundown pieces share one district so those buildings sit together.
// The rest of the map uses the cleaner residential and shop pieces.
const RUNDOWN = { x0: 12, x1: 100, z0: 64, z1: 140 };

const ROOFS = [
  [288, 0, 143, 92],
  [288, 92, 143, 92],
  [0, 16, 143, 76],
  [144, 16, 143, 76],
  [144, 295, 143, 73],
  [288, 202, 143, 74],
  [0, 294, 143, 74],
  [144, 201, 143, 75],
  [0, 112, 143, 72],
  [144, 112, 143, 72],
  [0, 204, 143, 72],
];
// Darker roof pieces stay with the rundown district. Brighter ones stay outside it.
const ROOF_DIRTY = new Set([0, 1, 2, 3, 5, 8, 9]);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The building sheet failed to load: ${url}`));
    image.src = url;
  });
}

function keyedCanvas(image, x, y, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const raw = data.data;
  let solid = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i] === TEAL[0] && raw[i + 1] === TEAL[1] && raw[i + 2] === TEAL[2]) raw[i + 3] = 0;
    else solid += 1;
  }
  ctx.putImageData(data, 0, 0);
  return { canvas, solid };
}

function makeTexture(canvas, repeat) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

function makeMaterial(texture, side) {
  return new MeshBasicMaterial({
    map: texture,
    side,
    toneMapped: false,
    alphaTest: 0.5,
  });
}

function piece(image, x, y, w, h, repeat, id, side) {
  const { canvas, solid } = keyedCanvas(image, x, y, w, h);
  if (solid < w * h * 0.2) return null;
  const texture = makeTexture(canvas, repeat);
  return { id, material: makeMaterial(texture, side) };
}

function wallCells(image, prefix, rows) {
  const out = [];
  for (const row of rows) {
    for (let col = 0; col < image.width / CELL; col += 1) {
      const item = piece(image, col * CELL, row * CELL, CELL, CELL, true, `${prefix}-${row}-${col}`, FrontSide);
      if (item) out.push(item);
    }
  }
  return out;
}

function hash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

export async function createFacades() {
  const [residential, industrial, shops, roofs] = await Promise.all(
    ["walls-residential.png", "walls-industrial.png", "walls-shops.png", "roofs.png"].map((name) => loadImage(new URL(name, SHEET))),
  );
  const dirty = [
    ...wallCells(industrial, "industrial", [0, 1, 2, 3, 4, 5, 6, 7]),
    ...wallCells(shops, "shops", [2, 3, 6, 7]),
    ...wallCells(residential, "residential", [6, 7]),
  ];
  const clean = [
    ...wallCells(residential, "residential", [0, 1, 2, 3, 4, 5]),
    ...wallCells(shops, "shops", [0, 1, 4, 5]),
  ];
  const roofPieces = ROOFS.map((box, index) => piece(roofs, box[0], box[1], box[2], box[3], false, `roof-${index}`, DoubleSide)).filter(Boolean);
  const dirtyRoofs = roofPieces.filter((item) => ROOF_DIRTY.has(Number(item.id.slice(5))));
  const cleanRoofs = roofPieces.filter((item) => !ROOF_DIRTY.has(Number(item.id.slice(5))));
  const pick = (list, x, z, salt) => list[hash(Math.floor(x / 8), Math.floor(z / 8) + salt) % list.length];
  return {
    look(building) {
      const rundown = building.x >= RUNDOWN.x0 && building.x < RUNDOWN.x1 && building.z >= RUNDOWN.z0 && building.z < RUNDOWN.z1;
      return {
        rundown,
        wall: pick(rundown ? dirty : clean, building.x, building.z, 0),
        roof: pick(rundown ? dirtyRoofs : cleanRoofs, building.x, building.z, 3),
      };
    },
  };
}
