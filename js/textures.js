import {
  CanvasTexture,
  NearestFilter,
  ClampToEdgeWrapping,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

function canvas2d(size = 48) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function pixelTexture(canvas, repeat) {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function wallTile(base, mortar, glass) {
  const { canvas, ctx } = canvas2d();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 46, 48, 2);
  ctx.fillRect(46, 0, 2, 48);
  ctx.fillStyle = "#10141c";
  ctx.fillRect(8, 10, 14, 22);
  ctx.fillRect(26, 10, 14, 22);
  ctx.fillStyle = glass;
  ctx.fillRect(10, 12, 4, 8);
  ctx.fillRect(28, 12, 4, 8);
  return pixelTexture(canvas, true);
}

function shedTile() {
  const { canvas, ctx } = canvas2d();
  ctx.fillStyle = "#6a6e70";
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = "#51565a";
  for (let y = 0; y < 48; y += 6) ctx.fillRect(0, y, 48, 2);
  ctx.fillStyle = "#1c2430";
  ctx.fillRect(6, 18, 12, 8);
  ctx.fillRect(30, 18, 12, 8);
  ctx.fillStyle = "#8aa4b4";
  ctx.fillRect(8, 20, 3, 3);
  ctx.fillRect(32, 20, 3, 3);
  return pixelTexture(canvas, true);
}

function groundTile(paint) {
  const { canvas, ctx } = canvas2d();
  paint(ctx);
  return pixelTexture(canvas, false);
}

function asphalt(ctx, major) {
  ctx.fillStyle = major ? "#3e424a" : "#34373d";
  ctx.fillRect(0, 0, 48, 48);
}

export function createTextures() {
  const ground = {
    "~": groundTile((ctx) => {
      ctx.fillStyle = "#1b6d78";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#228696";
      ctx.fillRect(6, 10, 16, 2);
      ctx.fillRect(26, 30, 14, 2);
      ctx.fillStyle = "#145860";
      ctx.fillRect(14, 22, 10, 2);
    }),
    d: groundTile((ctx) => {
      ctx.fillStyle = "#7a5a32";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#5c4124";
      for (let y = 0; y < 48; y += 8) ctx.fillRect(0, y, 48, 2);
      ctx.fillStyle = "#3a2a16";
      ctx.fillRect(8, 0, 2, 48);
      ctx.fillRect(32, 0, 2, 48);
    }),
    c: groundTile((ctx) => {
      ctx.fillStyle = "#8d9094";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#6e7276";
      ctx.fillRect(0, 0, 48, 3);
      ctx.fillRect(0, 45, 48, 3);
      ctx.fillRect(0, 22, 48, 2);
    }),
    H: groundTile((ctx) => {
      asphalt(ctx, true);
      ctx.fillStyle = "#e2c14a";
      ctx.fillRect(0, 20, 48, 2);
      ctx.fillRect(0, 26, 48, 2);
    }),
    V: groundTile((ctx) => {
      asphalt(ctx, true);
      ctx.fillStyle = "#e2c14a";
      ctx.fillRect(20, 0, 2, 48);
      ctx.fillRect(26, 0, 2, 48);
    }),
    "+": groundTile((ctx) => asphalt(ctx, true)),
    h: groundTile((ctx) => {
      asphalt(ctx, false);
      ctx.fillStyle = "#e2c14a";
      ctx.fillRect(10, 23, 28, 2);
    }),
    v: groundTile((ctx) => {
      asphalt(ctx, false);
      ctx.fillStyle = "#e2c14a";
      ctx.fillRect(23, 10, 2, 28);
    }),
    X: groundTile((ctx) => asphalt(ctx, false)),
    s: groundTile((ctx) => {
      ctx.fillStyle = "#b7b1a4";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#d5cfc2";
      ctx.fillRect(3, 3, 42, 42);
      ctx.fillStyle = "#8e887c";
      ctx.fillRect(0, 0, 48, 2);
      ctx.fillRect(0, 46, 48, 2);
      ctx.fillRect(0, 0, 2, 48);
      ctx.fillRect(46, 0, 2, 48);
    }),
    p: groundTile((ctx) => {
      ctx.fillStyle = "#c2b48a";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#a89870";
      ctx.fillRect(0, 22, 48, 2);
      ctx.fillRect(22, 0, 2, 48);
    }),
    g: groundTile((ctx) => {
      ctx.fillStyle = "#3d6b45";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#2f5536";
      ctx.fillRect(8, 10, 6, 6);
      ctx.fillRect(30, 28, 8, 8);
      ctx.fillStyle = "#4e8054";
      ctx.fillRect(20, 6, 4, 4);
      ctx.fillRect(12, 32, 4, 4);
    }),
    l: groundTile((ctx) => {
      ctx.fillStyle = "#7a7368";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#6a645a";
      ctx.fillRect(0, 46, 48, 2);
      ctx.fillRect(46, 0, 2, 48);
    }),
  };
  ground.b = ground.l;

  const walls = {
    tower: wallTile("#c8c2b4", "#9a9488", "#9ec4d4"),
    mid: wallTile("#7f8c99", "#5e6b76", "#b7d0dc"),
    house: wallTile("#c4a574", "#8d7048", "#d8e4ec"),
    shed: shedTile(),
  };

  const { canvas, ctx } = canvas2d();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = "#c4c4c4";
  ctx.fillRect(0, 0, 48, 3);
  ctx.fillRect(0, 45, 48, 3);
  ctx.fillRect(0, 0, 3, 48);
  ctx.fillRect(45, 0, 3, 48);
  ctx.fillStyle = "#dedede";
  ctx.fillRect(20, 18, 10, 8);

  return { ground, walls, roof: pixelTexture(canvas, true) };
}
