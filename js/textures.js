import {
  CanvasTexture,
  NearestFilter,
  ClampToEdgeWrapping,
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
  return pixelTexture(canvas, false);
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

function plot(ctx, x, y) {
  const px = ((x % 48) + 48) % 48;
  const py = ((y % 48) + 48) % 48;
  ctx.fillRect(px, py, 1, 1);
}

function stroke(ctx, x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(1, steps));
    const y = Math.round(y0 + ((y1 - y0) * i) / Math.max(1, steps));
    plot(ctx, x, y);
  }
}

function drawCracks(ctx) {
  ctx.fillStyle = "#2a2e28";
  const cracks = [
    [[2, 10], [8, 14], [14, 13], [22, 20], [28, 28]],
    [[30, 4], [36, 9], [34, 16], [42, 18], [47, 22], [1, 24], [7, 30]],
    [[10, 36], [16, 42], [24, 47], [30, 2], [36, 8]],
    [[8, 4], [6, 12], [12, 18]],
  ];
  for (const crack of cracks) {
    for (let i = 0; i < crack.length - 1; i += 1) stroke(ctx, ...crack[i], ...crack[i + 1]);
  }
}

function drawStains(ctx) {
  const stains = [
    [18, 16, 5, "#3e4638"],
    [30, 28, 4, "#4a4034"],
    [14, 32, 3, "#33382e"],
  ];
  for (const [cx, cy, rad, color] of stains) {
    ctx.fillStyle = color;
    for (let y = -rad; y <= rad; y += 1) {
      for (let x = -rad; x <= rad; x += 1) {
        if (x * x + y * y > rad * rad) continue;
        const px = cx + x;
        const py = cy + y;
        if (px < 4 || py < 4 || px > 43 || py > 43) continue;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

function tintStone(src, district, variant) {
  const { canvas, ctx } = canvas2d();
  const out = ctx.createImageData(48, 48);
  const s = src.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    let r = s[i];
    let g = s[i + 1];
    let b = s[i + 2];
    if (district === "harbor") {
      const grey = (r + g + b) / 3;
      r = grey * 0.9 + 30;
      g = grey * 0.91 + 28;
      b = grey * 0.86 + 24;
    } else {
      r = r * 1.45 + 58;
      g = g * 1.32 + 48;
      b = b * 1.02 + 30;
    }
    if (variant === 0) {
      r = Math.min(255, r * 1.1 + 10);
      g = Math.min(255, g * 1.1 + 8);
      b = Math.min(255, b * 1.06 + 6);
    } else if (variant === 1) {
      r *= 0.76;
      g *= 0.76;
      b *= 0.74;
    }
    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
    d[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  if (variant === 2) drawCracks(ctx);
  if (variant === 3) drawStains(ctx);
  return canvas;
}

function sidewalkAtlas(src) {
  const { canvas, ctx } = canvas2d(WALK_COLS * 48, WALK_ROWS * 48);
  for (let row = 0; row < WALK_ROWS; row += 1) {
    const district = row === 0 ? "downtown" : "harbor";
    for (let col = 0; col < WALK_COLS; col += 1) {
      ctx.drawImage(tintStone(src, district, col), col * 48, row * 48);
    }
  }
  return pixelTexture(canvas, false);
}

function shadowTexture() {
  const size = 32;
  const { canvas, ctx } = canvas2d(size, size);
  const image = ctx.createImageData(size, size);
  const alphas = [168, 118, 72, 32, 0];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = y / (size - 1);
      const band = Math.min(alphas.length - 1, Math.floor(t * alphas.length));
      const i = (y * size + x) * 4;
      image.data[i] = 16;
      image.data[i + 1] = 20;
      image.data[i + 2] = 14;
      image.data[i + 3] = alphas[band];
    }
  }
  ctx.putImageData(image, 0, 0);
  return pixelTexture(canvas, false);
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
  } catch {
    src = proceduralStone();
    stoneSource = "procedural";
  }

  const ground = plainGround();
  ground.b = ground.l;
  for (const key of ["H", "V", "+", "h", "v", "X", "A", "E", "a", "e", "s"]) ground[key] = ground.l;

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
    shadow: shadowTexture(),
    stoneSource,
  };
}
