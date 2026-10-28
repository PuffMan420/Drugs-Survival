import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import { KITS } from "../js/kenney-city-catalog.js";
import { distanceToOuterCurb, outerCurbSamples, sideRoadUV } from "../js/road-side-skin.js";

const STAINED = "assets/roads/road-straight-2_v3.png";
const CLEAN = "assets/roads/road-straight-2_v3-clean.png";
const SKINNED = [
  ["road-side-entry-2.glb", "GLB format/road-side-entry.glb", CLEAN],
  ["road-side-exit-2.glb", "GLB format/road-side-exit.glb", CLEAN],
  ["road-side-2.glb", "GLB format/road-side.glb", STAINED],
];
const PARKING = [
  ["road-side-entry-3.glb", "GLB format/road-side-entry.glb", "assets/roads/road-side-entry-3.png"],
  ["road-side-exit-3.glb", "GLB format/road-side-exit.glb", "assets/roads/road-side-exit-3.png"],
  ["road-side-3.glb", "GLB format/road-side.glb", "assets/roads/road-side-3.png"],
];

function roads() {
  return KITS.find((kit) => kit.id === "roads").files;
}

function readMesh(path) {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binHeader = 20 + jsonLen;
  const binLen = view.getUint32(binHeader, true);
  const bin = new DataView(bytes.buffer, bytes.byteOffset + binHeader + 8, binLen);
  const prim = json.meshes[0].primitives[0];
  const read = (index, components) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const stride = bufferView.byteStride || components * 4;
    const out = [];
    for (let i = 0; i < accessor.count; i += 1) {
      const at = start + i * stride;
      const row = [];
      for (let k = 0; k < components; k += 1) row.push(bin.getFloat32(at + k * 4, true));
      out.push(row);
    }
    return out;
  };
  return {
    position: read(prim.attributes.POSITION, 3),
    normal: read(prim.attributes.NORMAL, 3),
  };
}

function project(mesh) {
  const points = mesh.position.map(([x, y, z]) => ({ x, y, z }));
  const samples = outerCurbSamples(points);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  return mesh.position.map((position, index) => {
    const [x, y, z] = position;
    const nz = mesh.normal[index][2];
    const [u, v] = sideRoadUV(x, y, z, nz, minX, maxX, samples);
    return { x, y, z, nz, u, v, dist: z < 0 ? distanceToOuterCurb(x, z, samples) : null };
  });
}

function straightV(y, z, nz) {
  if (Math.abs(nz) > 0.5) {
    const d = Math.min(1, Math.max(0, (0.02 - y) * 5));
    const outer = Math.abs(Math.abs(z) - 0.5) < 1e-3;
    const edge = outer ? d : 0.1 - d;
    return z < 0 ? edge : 1 - edge;
  }
  return z + 0.5;
}

test("the catalog keeps the plain side pieces and skins entry and exit clean", () => {
  const files = roads();
  for (const [file, url, texture] of SKINNED) {
    const plain = file.replace("-2.glb", ".glb");
    const original = files.find((item) => item.file === plain);
    const skinned = files.find((item) => item.file === file);
    assert.ok(original, plain);
    assert.equal(original.texture, undefined);
    assert.equal(original.url, url);
    assert.ok(skinned, file);
    assert.equal(skinned.url, url);
    assert.equal(skinned.texture, texture);
    assert.equal(skinned.sideTexture, undefined);
  }
});

test("the narrow end matches a straight road, and the wide curb keeps the band", () => {
  const entry = project(readMesh("GLB format/road-side-entry.glb"));
  const exit = project(readMesh("GLB format/road-side-exit.glb"));
  const side = project(readMesh("GLB format/road-side.glb"));

  function narrow(verts, end) {
    return verts.filter((vert) => (end > 0 ? vert.x > 0.499 : vert.x < -0.499));
  }

  for (const vert of [...narrow(entry, 1), ...narrow(exit, -1)]) {
    const expected = straightV(vert.y, vert.z, vert.nz);
    assert.ok(Math.abs(vert.v - expected) < 0.002, `narrow v ${vert.v} vs ${expected} at z ${vert.z}`);
    assert.ok(vert.u === 0 || vert.u === 1);
  }

  for (const verts of [entry, exit, side]) {
    for (const vert of verts) {
      assert.ok(vert.u >= -1e-6 && vert.u <= 1 + 1e-6);
      assert.ok(vert.v >= -1e-4 && vert.v <= 1 + 1e-4, `v ${vert.v}`);
      if (vert.z > 0.05 && Math.abs(vert.nz) <= 0.5) {
        assert.ok(Math.abs(vert.v - (vert.z + 0.5)) < 1e-6);
      }
      if (vert.z > 0.2 && Math.abs(vert.nz) > 0.5) {
        assert.ok(Math.abs(vert.v - straightV(vert.y, vert.z, vert.nz)) < 1e-6);
      }
      if (vert.dist != null && vert.dist <= 0.02 && Math.abs(vert.nz) <= 0.5) {
        assert.ok(vert.v < 0.02, `outer lip v ${vert.v}`);
      }
      if (vert.dist != null && vert.dist > 0.08 && vert.dist < 0.12 && Math.abs(vert.nz) <= 0.5) {
        assert.ok(Math.abs(vert.v - 0.1) < 0.02);
      }
      if (vert.dist != null && vert.dist > 0.18 && vert.dist < 0.22 && Math.abs(vert.nz) <= 0.5) {
        assert.ok(Math.abs(vert.v - 0.2) < 0.02);
      }
      if (Math.abs(vert.z) < 0.02 && Math.abs(vert.nz) <= 0.5) {
        assert.ok(Math.abs(vert.v - (vert.z + 0.5)) < 1e-6);
      }
    }
  }

  const wide = side.filter((vert) => vert.z < -0.8 && vert.y > 0.015 && Math.abs(vert.nz) <= 0.5);
  assert.ok(wide.length > 0);
  for (const vert of wide) {
    assert.ok(vert.v < 0.02);
    assert.ok(vert.z + 0.5 < -0.2);
  }
});

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  if (dUp <= dUpLeft) return up;
  return upLeft;
}

function readPng(path) {
  const buf = readFileSync(new URL(`../${path}`, import.meta.url));
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      assert.equal(data[8], 8);
      assert.equal(data[12], 0);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 2 ? 3 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = raw.subarray(src, src + stride);
    src += stride;
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`png filter ${filter}`);
      cur[i] = value & 255;
    }
    prev = Buffer.from(cur);
  }
  return { width, height, channels, pixels };
}

function lumAt(png, x, y) {
  const i = (y * png.width + x) * png.channels;
  return (png.pixels[i] + png.pixels[i + 1] + png.pixels[i + 2]) / 3;
}

function changed(png, clean, x, y) {
  const i = (y * png.width + x) * png.channels;
  return Math.abs(png.pixels[i] - clean.pixels[i])
    + Math.abs(png.pixels[i + 1] - clean.pixels[i + 1])
    + Math.abs(png.pixels[i + 2] - clean.pixels[i + 2]) > 40;
}

function bandsAt(png, clean, y) {
  const groups = [];
  let start = -1;
  for (let x = 0; x < png.width; x += 1) {
    if (changed(png, clean, x, y)) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      groups.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) groups.push([start, png.width - 1]);
  return groups;
}

test("the clean straight-2 skin has no drain grate", () => {
  const png = readPng(CLEAN);
  let min = 255;
  let sum = 0;
  let count = 0;
  for (let y = 52; y < 96; y += 1) {
    for (let x = 40; x < 190; x += 1) {
      const lum = lumAt(png, x, y);
      min = Math.min(min, lum);
      sum += lum;
      count += 1;
    }
  }
  assert.ok(min > 70, `grate still dark (${min})`);
  let neighbor = 0;
  let neighborCount = 0;
  for (let y = 52; y < 96; y += 1) {
    for (let x = 250; x < 400; x += 1) {
      neighbor += lumAt(png, x, y);
      neighborCount += 1;
    }
  }
  assert.ok(Math.abs(sum / count - neighbor / neighborCount) < 6);
});

test("the parking pieces reuse the side meshes and paint only the pocket", () => {
  const files = roads();
  const clean = readPng(CLEAN);
  for (const [file, url, texture] of PARKING) {
    const plain = file.replace("-3.glb", ".glb");
    const skinned = file.replace("-3.glb", "-2.glb");
    const original = files.find((item) => item.file === plain);
    const previous = files.find((item) => item.file === skinned);
    const parking = files.find((item) => item.file === file);
    assert.equal(original.texture, undefined);
    assert.equal(original.url, url);
    assert.equal(previous.url, url);
    assert.ok(parking, file);
    assert.equal(parking.url, url);
    assert.equal(parking.texture, texture);
    assert.equal(parking.sideTexture, undefined);

    const png = readPng(texture);
    assert.equal(png.width, clean.width);
    assert.equal(png.height, clean.height);
    let pocket = 0;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (!changed(png, clean, x, y)) continue;
        assert.ok(y >= 360 && y <= 460, `${file} paint at ${x},${y}`);
        const i = (y * png.width + x) * png.channels;
        const yellower = (png.pixels[i] - png.pixels[i + 2]) - (clean.pixels[i] - clean.pixels[i + 2]);
        assert.ok(yellower > 0, `${file} yellow at ${x},${y}`);
        pocket += 1;
      }
    }
    assert.ok(pocket > 1000, file);
  }

  const side = readPng("assets/roads/road-side-3.png");
  const straight = bandsAt(side, clean, 410).map(([a, b]) => (a + b) / 2);
  assert.equal(straight.length, 4);
  const gaps = straight.slice(1).map((x, i) => x - straight[i]);
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 2, `gap ${gap}`);
  for (const [a, b] of bandsAt(side, clean, 410)) assert.ok(b - a >= 10 && b - a <= 20);

  const entryPng = readPng("assets/roads/road-side-entry-3.png");
  const entryNear = bandsAt(entryPng, clean, 445);
  const entryFar = bandsAt(entryPng, clean, 415);
  assert.equal(entryNear.length, 4);
  assert.equal(entryFar.length, 4);
  const entryShift = (entryNear[3][0] + entryNear[3][1]) / 2 - (entryFar[3][0] + entryFar[3][1]) / 2;
  assert.ok(entryShift > 15, `entry angle ${entryShift}`);

  const exitPng = readPng("assets/roads/road-side-exit-3.png");
  const exitNear = bandsAt(exitPng, clean, 445);
  const exitFar = bandsAt(exitPng, clean, 415);
  assert.equal(exitNear.length, 4);
  assert.equal(exitFar.length, 4);
  const exitShift = (exitFar[0][0] + exitFar[0][1]) / 2 - (exitNear[0][0] + exitNear[0][1]) / 2;
  assert.ok(exitShift > 15, `exit angle ${exitShift}`);
});
