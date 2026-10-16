import { CanvasTexture, NearestFilter, ClampToEdgeWrapping, SRGBColorSpace } from "three";
import { TILE } from "./city-data.js";

export function shade(hex, delta) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => {
    const mixed = ((value >> shift) & 255) + delta;
    return Math.max(0, Math.min(255, mixed));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function pixelTexture(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function canvas2d(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function makeWallTexture(tilesWide, floors, wallHex) {
  const width = tilesWide * TILE;
  const height = floors * TILE;
  const { canvas, ctx } = canvas2d(width, height);
  ctx.fillStyle = wallHex;
  ctx.fillRect(0, 0, width, height);

  const mortar = shade(wallHex, -32);
  const frame = shade(wallHex, 42);
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < tilesWide; column += 1) {
      const x = column * TILE;
      const y = floor * TILE;
      ctx.fillStyle = mortar;
      ctx.fillRect(x, y + TILE - 2, TILE, 2);
      ctx.fillRect(x + TILE - 2, y, 2, TILE);
      ctx.fillStyle = "#10141c";
      ctx.fillRect(x + 14, y + 12, 20, 22);
      ctx.fillStyle = frame;
      ctx.fillRect(x + 12, y + 10, 24, 2);
      ctx.fillRect(x + 12, y + 32, 24, 2);
      ctx.fillRect(x + 12, y + 10, 2, 24);
      ctx.fillRect(x + 34, y + 10, 2, 24);
      ctx.fillStyle = "#7eb0cc";
      ctx.fillRect(x + 16, y + 14, 6, 8);
    }
  }

  return pixelTexture(canvas);
}

export function makeRoofTexture(tilesWide, tilesDeep, roofHex) {
  const width = tilesWide * TILE;
  const height = tilesDeep * TILE;
  const { canvas, ctx } = canvas2d(width, height);
  ctx.fillStyle = roofHex;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = shade(roofHex, -20);
  for (let x = TILE; x < width; x += TILE) ctx.fillRect(x, 0, 1, height);
  for (let y = TILE; y < height; y += TILE) ctx.fillRect(0, y, width, 1);

  ctx.fillStyle = shade(roofHex, -40);
  ctx.fillRect(0, 0, width, 4);
  ctx.fillRect(0, height - 4, width, 4);
  ctx.fillRect(0, 0, 4, height);
  ctx.fillRect(width - 4, 0, 4, height);

  const ventX = Math.floor(width / 2) - 8;
  const ventY = Math.floor(height / 2) - 6;
  ctx.fillStyle = shade(roofHex, 30);
  ctx.fillRect(ventX, ventY, 16, 12);
  ctx.fillStyle = shade(roofHex, -55);
  ctx.fillRect(ventX, ventY, 16, 2);
  ctx.fillRect(ventX, ventY, 2, 12);

  return pixelTexture(canvas);
}
