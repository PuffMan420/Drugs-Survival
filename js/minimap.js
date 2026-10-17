const GROUND = {
  "~": "#1b6d78",
  d: "#7a5a32",
  c: "#8d9094",
  1: "#3e424a",
  2: "#3e424a",
  3: "#3e424a",
  4: "#5d6b58",
  5: "#3e424a",
  6: "#3e424a",
  7: "#3e424a",
  8: "#5d6b58",
  "+": "#4a4e56",
  h: "#34373d",
  v: "#34373d",
  X: "#34373d",
  A: "#3e424a",
  E: "#3e424a",
  a: "#3e424a",
  e: "#3e424a",
  n: "#2a2e34",
  q: "#d4cbb8",
  s: "#c8bfb0",
  g: "#3d6b45",
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

export function createMinimap(map) {
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
