import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { PAT, ROAD_COLS, ROAD_ROWS, WALK_COLS, WALK_ROWS } from "./markings.js";

const STONE_URL = new URL("../assets/tiles/sidewalk_stone.png", import.meta.url);

function canvas2d(width = 48, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function pixelTexture(canvas, repeat, mipmaps = true) {
  const texture = new CanvasTexture(canvas);
  texture.magFilter = LinearFilter;
  texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter;
  texture.generateMipmaps = mipmaps;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function wallTile(base, mortar, glass) {
  // Two floors in one tile so the facade is a wall with windows, not a stack of identical squares.
  const { canvas, ctx } = canvas2d(48, 96);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 48, 96);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, 48, 3);
  ctx.fillRect(0, 46, 48, 2);
  ctx.fillRect(0, 94, 48, 2);
  const holes = [
    [7, 14, 8, 12],
    [27, 14, 8, 12],
    [4, 60, 8, 12],
    [20, 60, 8, 12],
    [36, 60, 8, 12],
  ];
  ctx.fillStyle = "#141820";
  for (const [x, y, w, h] of holes) ctx.fillRect(x, y, w, h);
  ctx.fillStyle = glass;
  for (const [x, y, w, h] of holes) ctx.fillRect(x + 2, y + 2, 3, 4);
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

function paintAsphalt(ctx, ox, oy) {
  ctx.fillStyle = "#5c6558";
  ctx.fillRect(ox, oy, 48, 48);
  ctx.fillStyle = "#4e574b";
  const dark = [
    [2, 6], [14, 3], [27, 11], [40, 5], [8, 22], [19, 30], [33, 24], [44, 18], [6, 38], [22, 42], [36, 36], [15, 16],
  ];
  for (const [x, y] of dark) ctx.fillRect(ox + x, oy + y, 2, 2);
  ctx.fillStyle = "#6d7668";
  const light = [
    [9, 9], [24, 6], [38, 14], [4, 28], [17, 20], [30, 34], [43, 40], [12, 44],
  ];
  for (const [x, y] of light) ctx.fillRect(ox + x, oy + y, 2, 2);
}

function laneEdge(ctx, edge) {
  paintAsphalt(ctx, 0, 0);
  ctx.fillStyle = "#f4f4f4";
  for (let i = 2; i < 48; i += 12) {
    if (edge === "s") ctx.fillRect(i, 43, 8, 3);
    if (edge === "n") ctx.fillRect(i, 2, 8, 3);
    if (edge === "e") ctx.fillRect(43, i, 3, 8);
    if (edge === "w") ctx.fillRect(2, i, 3, 8);
  }
}

function medianTile(ctx, horizontal) {
  paintAsphalt(ctx, 0, 0);
  ctx.fillStyle = "#f0d24a";
  if (horizontal) {
    ctx.fillRect(0, 1, 48, 3);
    ctx.fillRect(0, 44, 48, 3);
    ctx.fillStyle = "#6a645c";
    ctx.fillRect(0, 10, 48, 28);
    ctx.fillStyle = "#3d6b45";
    ctx.fillRect(0, 16, 48, 16);
  } else {
    ctx.fillRect(1, 0, 3, 48);
    ctx.fillRect(44, 0, 3, 48);
    ctx.fillStyle = "#6a645c";
    ctx.fillRect(10, 0, 28, 48);
    ctx.fillStyle = "#3d6b45";
    ctx.fillRect(16, 0, 16, 48);
  }
}

function dashes(ctx, ox, oy, horizontal) {
  paintAsphalt(ctx, ox, oy);
  ctx.fillStyle = "#f0d24a";
  for (let i = 4; i < 48; i += 16) {
    if (horizontal) ctx.fillRect(ox + i, oy + 22, 8, 3);
    else ctx.fillRect(ox + 22, oy + i, 3, 8);
  }
}

function diagonalDashes(ctx, ox, oy, slash) {
  paintAsphalt(ctx, ox, oy);
  ctx.fillStyle = "#f0d24a";
  for (let i = 0; i < 48; i += 1) {
    const along = slash ? i - 24 : i;
    const band = ((along % 16) + 16) % 16;
    if (band > 8) continue;
    const y = slash ? 47 - i : i;
    ctx.fillRect(ox + i, oy + y, 1, 2);
  }
}

function zebraBars(ctx, ox, oy, vertical) {
  paintAsphalt(ctx, ox, oy);
  ctx.fillStyle = "#f4f4f4";
  for (let i = 2; i < 48; i += 8) {
    if (vertical) ctx.fillRect(ox + i, oy, 4, 48);
    else ctx.fillRect(ox, oy + i, 48, 4);
  }
}

function zebraDiagonal(ctx, ox, oy, slash) {
  paintAsphalt(ctx, ox, oy);
  ctx.fillStyle = "#f4f4f4";
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const along = slash ? x + y : x - y;
      const band = ((along % 8) + 8) % 8;
      if (band < 4) ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

const FONT = {
  S: ["11111", "10000", "11110", "00001", "11110"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10101", "10101", "01010"],
};

function drawGlyph(ctx, rows, x, y, scale) {
  ctx.fillStyle = "#f4f4f4";
  for (let gy = 0; gy < rows.length; gy += 1) {
    for (let gx = 0; gx < rows[gy].length; gx += 1) {
      if (rows[gy][gx] === "1") ctx.fillRect(x + gx * scale, y + gy * scale, scale, scale);
    }
  }
}

function drawSlow(ctx, ox, oy, vertical) {
  const word = "SLOW";
  const scale = 2;
  const glyph = 5 * scale;
  if (!vertical) {
    const gap = 2;
    const total = word.length * glyph + (word.length - 1) * gap;
    let x = ox + Math.floor((48 - total) / 2);
    const y = oy + Math.floor((48 - glyph) / 2);
    for (const ch of word) {
      drawGlyph(ctx, FONT[ch], x, y, scale);
      x += glyph + gap;
    }
    return;
  }
  const gap = 1;
  const total = word.length * glyph + (word.length - 1) * gap;
  let y = oy + Math.floor((48 - total) / 2);
  const x = ox + Math.floor((48 - glyph) / 2);
  for (const ch of word) {
    drawGlyph(ctx, FONT[ch], x, y, scale);
    y += glyph + gap;
  }
}

function arrowHead(ctx, ox, oy, dir) {
  ctx.fillStyle = "#f4f4f4";
  if (dir === "e") {
    ctx.fillRect(ox + 8, oy + 22, 22, 4);
    ctx.fillRect(ox + 26, oy + 18, 4, 12);
    ctx.fillRect(ox + 30, oy + 20, 4, 8);
    ctx.fillRect(ox + 34, oy + 22, 4, 4);
  } else if (dir === "w") {
    ctx.fillRect(ox + 18, oy + 22, 22, 4);
    ctx.fillRect(ox + 18, oy + 18, 4, 12);
    ctx.fillRect(ox + 14, oy + 20, 4, 8);
    ctx.fillRect(ox + 10, oy + 22, 4, 4);
  } else if (dir === "n") {
    ctx.fillRect(ox + 22, oy + 18, 4, 22);
    ctx.fillRect(ox + 18, oy + 18, 12, 4);
    ctx.fillRect(ox + 20, oy + 14, 8, 4);
    ctx.fillRect(ox + 22, oy + 10, 4, 4);
  } else if (dir === "s") {
    ctx.fillRect(ox + 22, oy + 8, 4, 22);
    ctx.fillRect(ox + 18, oy + 26, 12, 4);
    ctx.fillRect(ox + 20, oy + 30, 8, 4);
    ctx.fillRect(ox + 22, oy + 34, 4, 4);
  } else if (dir === "el") {
    ctx.fillRect(ox + 6, oy + 28, 18, 4);
    ctx.fillRect(ox + 20, oy + 14, 4, 18);
    ctx.fillRect(ox + 16, oy + 14, 12, 4);
    ctx.fillRect(ox + 18, oy + 10, 8, 4);
    ctx.fillRect(ox + 20, oy + 6, 4, 4);
  } else if (dir === "er") {
    ctx.fillRect(ox + 6, oy + 16, 18, 4);
    ctx.fillRect(ox + 20, oy + 16, 4, 18);
    ctx.fillRect(ox + 16, oy + 30, 12, 4);
    ctx.fillRect(ox + 18, oy + 34, 8, 4);
    ctx.fillRect(ox + 20, oy + 38, 4, 4);
  } else if (dir === "wl") {
    ctx.fillRect(ox + 24, oy + 16, 18, 4);
    ctx.fillRect(ox + 24, oy + 16, 4, 18);
    ctx.fillRect(ox + 20, oy + 30, 12, 4);
    ctx.fillRect(ox + 22, oy + 34, 8, 4);
    ctx.fillRect(ox + 24, oy + 38, 4, 4);
  } else if (dir === "wr") {
    ctx.fillRect(ox + 24, oy + 28, 18, 4);
    ctx.fillRect(ox + 24, oy + 14, 4, 18);
    ctx.fillRect(ox + 20, oy + 14, 12, 4);
    ctx.fillRect(ox + 22, oy + 10, 8, 4);
    ctx.fillRect(ox + 24, oy + 6, 4, 4);
  } else if (dir === "nl") {
    ctx.fillRect(ox + 28, oy + 24, 4, 18);
    ctx.fillRect(ox + 14, oy + 24, 18, 4);
    ctx.fillRect(ox + 14, oy + 20, 4, 12);
    ctx.fillRect(ox + 10, oy + 22, 4, 8);
    ctx.fillRect(ox + 6, oy + 24, 4, 4);
  } else if (dir === "nr") {
    ctx.fillRect(ox + 16, oy + 24, 4, 18);
    ctx.fillRect(ox + 16, oy + 24, 18, 4);
    ctx.fillRect(ox + 30, oy + 20, 4, 12);
    ctx.fillRect(ox + 34, oy + 22, 4, 8);
    ctx.fillRect(ox + 38, oy + 24, 4, 4);
  } else if (dir === "sl") {
    ctx.fillRect(ox + 16, oy + 6, 4, 18);
    ctx.fillRect(ox + 16, oy + 20, 18, 4);
    ctx.fillRect(ox + 30, oy + 16, 4, 12);
    ctx.fillRect(ox + 34, oy + 18, 4, 8);
    ctx.fillRect(ox + 38, oy + 20, 4, 4);
  } else if (dir === "sr") {
    ctx.fillRect(ox + 28, oy + 6, 4, 18);
    ctx.fillRect(ox + 14, oy + 20, 18, 4);
    ctx.fillRect(ox + 14, oy + 16, 4, 12);
    ctx.fillRect(ox + 10, oy + 18, 4, 8);
    ctx.fillRect(ox + 6, oy + 20, 4, 4);
  }
}

function paintRoadCell(ctx, ox, oy, pat) {
  switch (pat) {
    case PAT.DASH_H:
      dashes(ctx, ox, oy, true);
      break;
    case PAT.DASH_V:
      dashes(ctx, ox, oy, false);
      break;
    case PAT.DASH_A:
      diagonalDashes(ctx, ox, oy, true);
      break;
    case PAT.DASH_E:
      diagonalDashes(ctx, ox, oy, false);
      break;
    case PAT.ZEBRA_H:
      zebraBars(ctx, ox, oy, true);
      break;
    case PAT.ZEBRA_V:
      zebraBars(ctx, ox, oy, false);
      break;
    case PAT.ZEBRA_A:
      zebraDiagonal(ctx, ox, oy, true);
      break;
    case PAT.ZEBRA_E:
      zebraDiagonal(ctx, ox, oy, false);
      break;
    case PAT.SLOW_H:
      paintAsphalt(ctx, ox, oy);
      drawSlow(ctx, ox, oy, false);
      break;
    case PAT.SLOW_V:
      paintAsphalt(ctx, ox, oy);
      drawSlow(ctx, ox, oy, true);
      break;
    case PAT.ARROW_E:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "e");
      break;
    case PAT.ARROW_W:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "w");
      break;
    case PAT.ARROW_N:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "n");
      break;
    case PAT.ARROW_S:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "s");
      break;
    case PAT.TURN_E_L:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "el");
      break;
    case PAT.TURN_E_R:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "er");
      break;
    case PAT.TURN_W_L:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "wl");
      break;
    case PAT.TURN_W_R:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "wr");
      break;
    case PAT.TURN_N_L:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "nl");
      break;
    case PAT.TURN_N_R:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "nr");
      break;
    case PAT.TURN_S_L:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "sl");
      break;
    case PAT.TURN_S_R:
      paintAsphalt(ctx, ox, oy);
      arrowHead(ctx, ox, oy, "sr");
      break;
    default:
      paintAsphalt(ctx, ox, oy);
  }
}

function roadAtlas() {
  const { canvas, ctx } = canvas2d(ROAD_COLS * 48, ROAD_ROWS * 48);
  for (let pat = 0; pat < ROAD_COLS * ROAD_ROWS; pat += 1) {
    const col = pat % ROAD_COLS;
    const row = Math.floor(pat / ROAD_COLS);
    paintRoadCell(ctx, col * 48, row * 48, pat);
  }
  // Cells sit side by side. Mipmaps would blend one marking into the next.
  return pixelTexture(canvas, false, false);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The sidewalk stone tile failed to load."));
    image.src = url;
  });
}

function proceduralStone() {
  const { canvas, ctx } = canvas2d();
  const image = ctx.createImageData(48, 48);
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const n = (Math.imul(x, 17) ^ Math.imul(y, 43)) & 15;
      let r = 74;
      let g = 84;
      let b = 78;
      if (n === 0) {
        r = 66;
        g = 80;
        b = 73;
      } else if (n === 1) {
        r = 81;
        g = 89;
        b = 81;
      } else if (n === 2) {
        r = 73;
        g = 81;
        b = 81;
      }
      const i = (y * 48 + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  return image;
}

function stoneData(image) {
  const { canvas, ctx } = canvas2d();
  ctx.drawImage(image, 0, 0, 48, 48);
  return ctx.getImageData(0, 0, 48, 48);
}

function tintStone(src) {
  const { canvas, ctx } = canvas2d();
  const out = ctx.createImageData(48, 48);
  const s = src.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const grain = (s[i] + s[i + 1] + s[i + 2]) / 3;
    const lift = (grain - 80) * 0.22;
    d[i] = Math.max(0, Math.min(255, 196 + lift));
    d[i + 1] = Math.max(0, Math.min(255, 188 + lift));
    d[i + 2] = Math.max(0, Math.min(255, 150 + lift * 0.7));
    d[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function sidewalkCorner(base, kind) {
  const { canvas, ctx } = canvas2d();
  ctx.drawImage(base, 0, 0);
  const origin = {
    2: [47, 0],
    3: [0, 0],
    4: [47, 47],
    5: [0, 47],
  }[kind];
  const [ox, oy] = origin;
  const image = ctx.getImageData(0, 0, 48, 48);
  const data = image.data;
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const dist = Math.hypot(x - ox, y - oy);
      const i = (y * 48 + x) * 4;
      if (dist < 12) {
        data[i] = 92;
        data[i + 1] = 101;
        data[i + 2] = 88;
      } else if (dist < 16) {
        data[i] = 186;
        data[i + 1] = 176;
        data[i + 2] = 132;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function sidewalkAtlas(src) {
  const plain = tintStone(src);
  const { canvas, ctx } = canvas2d(WALK_COLS * 48, WALK_ROWS * 48);
  ctx.drawImage(plain, 0, 0);
  ctx.drawImage(plain, 48, 0);
  ctx.drawImage(sidewalkCorner(plain, 2), 96, 0);
  ctx.drawImage(sidewalkCorner(plain, 3), 0, 48);
  ctx.drawImage(sidewalkCorner(plain, 4), 48, 48);
  ctx.drawImage(sidewalkCorner(plain, 5), 96, 48);
  return pixelTexture(canvas, false, false);
}

function plainGround() {
  return {
    "~": groundTile((ctx) => {
      ctx.fillStyle = "#1b6d78";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#228696";
      ctx.fillRect(6, 10, 16, 2);
      ctx.fillRect(26, 30, 14, 2);
      ctx.fillStyle = "#145860";
      ctx.fillRect(14, 22, 10, 2);
    }),
    c: groundTile((ctx) => {
      ctx.fillStyle = "#8d9094";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#6e7276";
      ctx.fillRect(0, 0, 48, 3);
      ctx.fillRect(0, 45, 48, 3);
      ctx.fillRect(0, 22, 48, 2);
    }),
    1: groundTile((ctx) => laneEdge(ctx, "s")),
    2: groundTile((ctx) => laneEdge(ctx, "n")),
    4: groundTile((ctx) => medianTile(ctx, true)),
    5: groundTile((ctx) => laneEdge(ctx, "e")),
    6: groundTile((ctx) => laneEdge(ctx, "w")),
    8: groundTile((ctx) => medianTile(ctx, false)),
    n: groundTile((ctx) => {
      ctx.fillStyle = "#3a4238";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#4a5446";
      ctx.fillRect(6, 6, 36, 36);
    }),
    q: groundTile((ctx) => {
      ctx.fillStyle = "#d4cbb8";
      ctx.fillRect(0, 0, 48, 48);
      ctx.fillStyle = "#b7ad98";
      ctx.fillRect(0, 0, 48, 2);
      ctx.fillRect(0, 0, 2, 48);
      ctx.fillStyle = "#e4dccb";
      ctx.fillRect(8, 8, 14, 14);
      ctx.fillRect(26, 26, 14, 14);
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
}

export async function createTextures() {
  let src = null;
  let stoneSource = "asset";
  try {
    const image = await loadImage(STONE_URL);
    if (image.width < 2 || image.height < 2) throw new Error("empty stone");
    src = stoneData(image);
  } catch (error) {
    console.warn("Sidewalk stone texture failed to load; using the drawn stand-in.", error);
    src = proceduralStone();
    stoneSource = "procedural";
  }

  const ground = plainGround();
  ground.b = ground.l;
  for (const key of ["H", "V", "+", "h", "v", "X", "A", "E", "a", "e"]) ground[key] = ground.l;

  const walls = {
    tower: wallTile("#c8c2b4", "#9a9488", "#9ec4d4"),
    glass: wallTile("#6d838f", "#51616c", "#e7f4fb"),
    mid: wallTile("#7f8c99", "#5e6b76", "#b7d0dc"),
    brick: wallTile("#8d5344", "#6a3a30", "#ead7b4"),
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

  return {
    ground,
    walls,
    roof: pixelTexture(canvas, true),
    road: roadAtlas(),
    walk: sidewalkAtlas(src),
    stoneSource,
  };
}
