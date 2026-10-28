import { pieceCells } from "./road-sockets.js";

const GROUND = {
  "~": "#1b6d78",
  d: "#7a5a32",
  c: "#8d9094",
  1: "#5c6558",
  2: "#5c6558",
  4: "#3d6b45",
  5: "#5c6558",
  6: "#5c6558",
  8: "#3d6b45",
  H: "#5c6558",
  V: "#5c6558",
  "+": "#5c6558",
  h: "#545d50",
  v: "#545d50",
  X: "#545d50",
  A: "#5c6558",
  E: "#5c6558",
  a: "#545d50",
  e: "#545d50",
  n: "#3a4238",
  q: "#d4cbb8",
  s: "#c6c2a4",
  g: "#3d6b45",
  y: "#505b29",
  p: "#c2b48a",
  l: "#7a7368",
  b: "#6a645a",
};

const STYLES = {
  tower: [176, 164, 140],
  glass: [150, 186, 204],
  mid: [120, 140, 156],
  brick: [168, 96, 78],
  house: [184, 146, 112],
  shed: [96, 90, 84],
};

const ROAD = "#c6c2a4";
const CORNER = 280;
const TILE_PX = 4;
const SPAN = CORNER / TILE_PX;

function paintRoadModules(ctx, pieces) {
  ctx.fillStyle = ROAD;
  for (const piece of pieces) {
    const cells = pieceCells(piece);
    if (!cells) continue;
    for (const cell of cells) {
      if (!Number.isInteger(cell.gx) || !Number.isInteger(cell.gz)) continue;
      ctx.fillRect(cell.gx * 4, cell.gz * 4, 4, 4);
    }
  }
}

function rgbHex(r, g, b) {
  return `#${(r | 0).toString(16).padStart(2, "0")}${(g | 0).toString(16).padStart(2, "0")}${(b | 0).toString(16).padStart(2, "0")}`;
}

function cellColors(map, pieces) {
  const palette = [];
  const indexOf = new Map();
  const id = (hex) => {
    let index = indexOf.get(hex);
    if (index === undefined) {
      index = palette.length;
      palette.push(hex);
      indexOf.set(hex, index);
    }
    return index;
  };
  const cells = new Uint16Array(map.cols * map.rows);
  for (let z = 0; z < map.rows; z += 1) {
    const row = map.ground[z];
    for (let x = 0; x < map.cols; x += 1) {
      cells[z * map.cols + x] = id(GROUND[row[x]] ?? "#ff00ff");
    }
  }
  if (pieces) {
    const road = id(ROAD);
    for (const piece of pieces) {
      const covered = pieceCells(piece);
      if (!covered) continue;
      for (const cell of covered) {
        if (!Number.isInteger(cell.gx) || !Number.isInteger(cell.gz)) continue;
        const x0 = cell.gx * 4;
        const z0 = cell.gz * 4;
        for (let dz = 0; dz < 4; dz += 1) {
          const z = z0 + dz;
          if (z < 0 || z >= map.rows) continue;
          const row = z * map.cols;
          for (let dx = 0; dx < 4; dx += 1) {
            const x = x0 + dx;
            if (x < 0 || x >= map.cols) continue;
            cells[row + x] = road;
          }
        }
      }
    }
  }
  for (const building of map.buildings) {
    const [r, g, b] = STYLES[building.style] ?? STYLES.house;
    const shade = Math.max(70, 230 - building.h * 8);
    const color = id(rgbHex((r * shade) / 220, (g * shade) / 220, (b * shade) / 220));
    const x1 = Math.min(map.cols, building.x + building.w);
    const z1 = Math.min(map.rows, building.z + building.d);
    for (let z = Math.max(0, building.z); z < z1; z += 1) {
      const row = z * map.cols;
      for (let x = Math.max(0, building.x); x < x1; x += 1) cells[row + x] = color;
    }
  }
  return { palette, cells };
}

export function createMinimap(map, jumps = [], pieces = null) {
  const source = document.createElement("canvas");
  source.width = map.cols;
  source.height = map.rows;
  const ctx = source.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(map.cols, map.rows);
  const data = image.data;
  for (let z = 0; z < map.rows; z += 1) {
    const row = map.ground[z];
    for (let x = 0; x < map.cols; x += 1) {
      const hex = GROUND[row[x]] ?? "#ff00ff";
      const i = (z * map.cols + x) * 4;
      data[i] = Number.parseInt(hex.slice(1, 3), 16);
      data[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
      data[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (map.island && pieces) paintRoadModules(ctx, pieces);
  for (const building of map.buildings) {
    const [r, g, b] = STYLES[building.style] ?? STYLES.house;
    const shade = Math.max(70, 230 - building.h * 8);
    ctx.fillStyle = `rgb(${(r * shade) / 220 | 0}, ${(g * shade) / 220 | 0}, ${(b * shade) / 220 | 0})`;
    ctx.fillRect(building.x, building.z, building.w, building.d);
  }

  const mini = document.getElementById("minimap");
  const full = document.getElementById("map-full");
  const overlay = document.getElementById("map-overlay");
  const help = document.getElementById("map-help");
  if (map.island && help) {
    help.textContent = "Island. Yellow dot is you, white box is the camera, blue marks are jumps 1–8. M or Esc closes this.";
  }
  const corner = map.island ? cellColors(map, pieces) : null;
  mini.width = map.island ? CORNER : map.cols;
  mini.height = map.island ? CORNER : map.rows;
  full.width = map.cols;
  full.height = map.rows;
  const miniCtx = mini.getContext("2d");
  const fullCtx = full.getContext("2d");
  miniCtx.imageSmoothingEnabled = false;
  fullCtx.imageSmoothingEnabled = false;

  function draw(context, camX, camZ, playerX, playerZ, tile, viewW, viewH) {
    context.drawImage(source, 0, 0);
    context.font = "bold 12px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    for (let i = 0; i < jumps.length; i += 1) {
      const jump = jumps[i];
      context.fillStyle = "#082028";
      context.fillRect(jump.x - 3, jump.z - 3, 8, 8);
      context.fillStyle = "#7fd0ff";
      context.fillRect(jump.x - 2, jump.z - 2, 6, 6);
      context.fillStyle = "#082028";
      context.fillText(String(i + 1), jump.x + 6, jump.z - 7);
      context.fillStyle = "#fff6d0";
      context.fillText(String(i + 1), jump.x + 5, jump.z - 8);
    }
    const left = camX / tile - viewW / 2;
    const top = camZ / tile - viewH / 2;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, viewW - 1, viewH - 1);
    context.fillStyle = "#ffe14a";
    context.fillRect((playerX / tile) - 1.5, (playerZ / tile) - 1.5, 3, 3);
  }

  function drawCorner(camX, camZ, playerX, playerZ, tile, viewW, viewH) {
    const originX = playerX / tile - SPAN / 2;
    const originZ = playerZ / tile - SPAN / 2;
    if (
      originX === drawnOriginX &&
      originZ === drawnOriginZ &&
      camX === drawnCamX &&
      camZ === drawnCamZ &&
      viewW === drawnViewW &&
      viewH === drawnViewH
    ) return;
    drawnOriginX = originX;
    drawnOriginZ = originZ;
    drawnCamX = camX;
    drawnCamZ = camZ;
    drawnViewW = viewW;
    drawnViewH = viewH;
    miniCtx.fillStyle = "#1b6d78";
    miniCtx.fillRect(0, 0, CORNER, CORNER);
    const x0 = Math.max(0, Math.floor(originX));
    const z0 = Math.max(0, Math.floor(originZ));
    const x1 = Math.min(map.cols, Math.ceil(originX + SPAN));
    const z1 = Math.min(map.rows, Math.ceil(originZ + SPAN));
    const { palette, cells } = corner;
    for (let z = z0; z < z1; z += 1) {
      const row = z * map.cols;
      const top = Math.floor((z - originZ) * TILE_PX);
      const height = Math.floor((z + 1 - originZ) * TILE_PX) - top;
      if (height <= 0) continue;
      let x = x0;
      while (x < x1) {
        const color = palette[cells[row + x]];
        let end = x + 1;
        while (end < x1 && palette[cells[row + end]] === color) end += 1;
        const left = Math.floor((x - originX) * TILE_PX);
        const right = Math.floor((end - originX) * TILE_PX);
        miniCtx.fillStyle = color;
        miniCtx.fillRect(left, top, Math.max(1, right - left), height);
        x = end;
      }
    }
    const boxLeft = (camX / tile - viewW / 2 - originX) * TILE_PX;
    const boxTop = (camZ / tile - viewH / 2 - originZ) * TILE_PX;
    miniCtx.strokeStyle = "#ffffff";
    miniCtx.lineWidth = 2;
    miniCtx.strokeRect(Math.round(boxLeft) + 0.5, Math.round(boxTop) + 0.5, Math.round(viewW * TILE_PX), Math.round(viewH * TILE_PX));
    miniCtx.fillStyle = "#082028";
    miniCtx.fillRect(CORNER / 2 - 5, CORNER / 2 - 5, 10, 10);
    miniCtx.fillStyle = "#ffe14a";
    miniCtx.fillRect(CORNER / 2 - 3, CORNER / 2 - 3, 6, 6);
  }

  function fitOverlay() {
    const scale = Math.max(1, Math.floor((Math.min(window.innerWidth, window.innerHeight) * 0.86) / map.cols));
    full.style.width = `${map.cols * scale}px`;
    full.style.height = `${map.rows * scale}px`;
  }

  let lastFull = "";
  let drawnOriginX = Number.NaN;
  let drawnOriginZ = Number.NaN;
  let drawnCamX = Number.NaN;
  let drawnCamZ = Number.NaN;
  let drawnViewW = Number.NaN;
  let drawnViewH = Number.NaN;

  return {
    draw(camX, camZ, playerX, playerZ, tile, viewW, viewH) {
      if (corner) drawCorner(camX, camZ, playerX, playerZ, tile, viewW, viewH);
      else draw(miniCtx, camX, camZ, playerX, playerZ, tile, viewW, viewH);
      if (overlay.hidden) return;
      const key = `${Math.round(camX)}:${Math.round(camZ)}:${Math.round(playerX)}:${Math.round(playerZ)}`;
      if (key === lastFull) return;
      lastFull = key;
      draw(fullCtx, camX, camZ, playerX, playerZ, tile, viewW, viewH);
    },
    toggle() {
      overlay.hidden = !overlay.hidden;
      lastFull = "";
      if (!overlay.hidden) fitOverlay();
      return !overlay.hidden;
    },
    close() {
      overlay.hidden = true;
    },
  };
}
