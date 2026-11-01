// Each rock in the garbage truck bed gets its own dark grey. Body paint is a
// different mesh and is not part of this colouring.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROCK_GREYS, rockGroups, rockVertexColors } from "../js/bed-rocks.js";

function shadeKey(colors, vertex) {
  return [
    colors[vertex * 3],
    colors[vertex * 3 + 1],
    colors[vertex * 3 + 2],
  ].join(",");
}

test("separate rocks get different dark greys and a welded rock stays one shade", () => {
  // Two triangles far apart, plus a second triangle welded to the first.
  const positions = [
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 0, 0, 1,
    5, 0, 5, 6, 0, 5, 5, 1, 5,
  ];
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const groups = rockGroups(positions, indices);
  assert.equal(groups.length, 2);
  const colors = rockVertexColors(positions, indices);
  assert.equal(shadeKey(colors, 0), shadeKey(colors, 3));
  assert.notEqual(shadeKey(colors, 0), shadeKey(colors, 6));
  for (const vertex of [0, 6]) {
    const shade = [colors[vertex * 3], colors[vertex * 3 + 1], colors[vertex * 3 + 2]];
    const spread = Math.max(...shade) - Math.min(...shade);
    assert.ok(spread <= 0.04, `shade is grey: ${shade}`);
    assert.ok(Math.max(...shade) <= 0.45, `shade is dark: ${shade}`);
    assert.ok(Math.min(...shade) >= 0.12, `shade is still a grey, not black: ${shade}`);
  }
});

test("the eight bed-rock shades are distinct dark greys", () => {
  const seen = new Set();
  for (const shade of ROCK_GREYS) {
    const spread = Math.max(...shade) - Math.min(...shade);
    assert.ok(spread <= 0.03, `grey: ${shade}`);
    assert.ok(Math.max(...shade) <= 0.45 && Math.min(...shade) >= 0.12, `dark: ${shade}`);
    seen.add(shade.join(","));
  }
  assert.equal(seen.size, ROCK_GREYS.length);
  assert.equal(ROCK_GREYS.length, 8);
});

function loadTrash(path) {
  const data = readFileSync(path);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    offset += length;
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
  }
  const mesh = json.meshes.find((entry) => entry.name === "trash");
  const primitive = mesh.primitives[0];
  const read = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const components = accessor.type === "SCALAR" ? 1 : 3;
    const out = new Float32Array(count * components);
    if (accessor.componentType === 5126) {
      for (let i = 0; i < count * components; i += 1) {
        out[i] = bin.readFloatLE(start + i * 4);
      }
      return out;
    }
    const indices = new Uint32Array(count);
    const width = accessor.componentType === 5123 ? 2 : 4;
    for (let i = 0; i < count; i += 1) {
      indices[i] = width === 2 ? bin.readUInt16LE(start + i * 2) : bin.readUInt32LE(start + i * 4);
    }
    return indices;
  };
  return {
    positions: read(primitive.attributes.POSITION),
    indices: read(primitive.indices),
  };
}

test("the truck bed rocks are eight lumps and each is a different dark grey", () => {
  for (const file of [
    "assets/cars3d/garbage-truck.glb",
    "assets/cars3d/weathered/garbage-truck-L2.glb",
    "assets/cars3d/weathered/garbage-truck-L3.glb",
  ]) {
    const { positions, indices } = loadTrash(new URL(`../${file}`, import.meta.url));
    const groups = rockGroups(positions, indices);
    assert.equal(groups.length, 8, file);
    const colors = rockVertexColors(positions, indices);
    const used = new Set();
    for (const group of groups) {
      const first = shadeKey(colors, group.vertices[0]);
      used.add(first);
      for (const vertex of group.vertices) {
        assert.equal(shadeKey(colors, vertex), first);
      }
    }
    assert.equal(used.size, 8, file);
  }
});
