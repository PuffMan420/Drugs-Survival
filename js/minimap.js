import { westOfCanal } from "./kenney-road-plan.js";

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

export function createMinimap(map, jumps = []) {
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
      const bare = !map.island && westOfCanal(x, z) && row[x] !== "~" && row[x] !== "d";
      const hex = bare ? "#505b29" : (GROUND[row[x]] ?? "#ff00ff");
      const i = (z * map.cols + x) * 4;
      data[i] = Number.parseInt(hex.slice(1, 3), 16);
      data[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
      data[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  for (const building of map.buildings) {
    const [r, g, b] = STYLES[building.style] ?? STYLES.house;
    const shade = Math.max(70, 230 - building.h * 8);
    ctx.fillStyle = `rgb(${(r * shade) / 220 | 0}, ${(g * shade) / 220 | 0}, ${(b * shade) / 220 | 0})`;
    ctx.fillRect(building.x, building.z, building.w, building.d);
  }

  const mini = document.getElementById("minimap");
  const full = document.getElementById("map-full");
  const overlay = document.getElementById("map-overlay");
  mini.width = map.cols;
  mini.height = map.rows;
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

  function fitOverlay() {
    const scale = Math.max(1, Math.floor((Math.min(window.innerWidth, window.innerHeight) * 0.86) / map.cols));
    full.style.width = `${map.cols * scale}px`;
    full.style.height = `${map.rows * scale}px`;
  }

  let lastFull = "";

  return {
    draw(camX, camZ, playerX, playerZ, tile, viewW, viewH) {
      draw(miniCtx, camX, camZ, playerX, playerZ, tile, viewW, viewH);
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
