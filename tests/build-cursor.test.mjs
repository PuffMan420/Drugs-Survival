// Build mode shows a small transparent hammer. The head is the hotspot.
// Outside build mode the view keeps the hidden pointer.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function readPng(path) {
  const buf = readFileSync(path);
  assert.equal(buf.toString("ascii", 1, 4), "PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const parts = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? row[i - 4] : 0;
      const up = prev[i];
      const upLeft = i >= 4 ? prev[i - 4] : 0;
      let value = raw[src];
      src += 1;
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const nearest = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + nearest) & 255;
      }
      row[i] = value;
    }
    row.copy(pixels, y * stride);
    prev = row;
  }
  return { width, height, pixels };
}

function pixel(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
}

test("the build cursor is a 32px hammer with a transparent plate and the hotspot on the head", () => {
  const png = readPng(new URL("../assets/cursors/hammer.png", import.meta.url));
  assert.equal(png.width, 32);
  assert.equal(png.height, 32);
  let transparent = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const [r, g, b, a] = pixel(png, x, y);
      if (a < 16) {
        transparent += 1;
        continue;
      }
      assert.ok(!(b > r + 40 && b > 150), `blue plate remains at ${x},${y}`);
    }
  }
  assert.ok(transparent > 100, "the rounded square is gone");
  const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
  const rule = css.match(/#view\.is-building\s*\{[^}]*cursor:\s*url\("\.\.\/assets\/cursors\/hammer\.png"\)\s+(\d+)\s+(\d+)/);
  assert.ok(rule, "build mode points with the hammer");
  const hx = Number(rule[1]);
  const hy = Number(rule[2]);
  const head = pixel(png, hx, hy);
  assert.ok(head[3] > 200, "hotspot sits on the hammer");
  assert.ok(head[0] > 200 && head[1] > 200 && head[2] > 200, "hotspot is the white head");
  const hidden = css.match(/#view\s*\{[^}]*cursor:\s*none/);
  assert.ok(hidden, "the view stays pointerless outside build mode");
  const source = readFileSync(new URL("../js/build-mode.js", import.meta.url), "utf8");
  assert.match(source, /classList\.toggle\("is-building", enabled\)/);
});
