import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { KITS } from "../js/kenney-city-catalog.js";
import { distanceToOuterCurb, outerCurbSamples, sideRoadUV } from "../js/road-side-skin.js";

const SKIN = "assets/roads/road-straight-2_v3.png";
const SKINNED = [
  ["road-side-entry-2.glb", "GLB format/road-side-entry.glb"],
  ["road-side-exit-2.glb", "GLB format/road-side-exit.glb"],
  ["road-side-2.glb", "GLB format/road-side.glb"],
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

test("the catalog keeps the plain side pieces and adds one straight-2 skin each", () => {
  const files = roads();
  for (const [file, url] of SKINNED) {
    const plain = file.replace("-2.glb", ".glb");
    const original = files.find((item) => item.file === plain);
    const skinned = files.find((item) => item.file === file);
    assert.ok(original, plain);
    assert.equal(original.texture, undefined);
    assert.equal(original.url, url);
    assert.ok(skinned, file);
    assert.equal(skinned.url, url);
    assert.equal(skinned.texture, SKIN);
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
