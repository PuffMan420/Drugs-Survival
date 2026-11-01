import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isLowerBone } from "../js/pose-layers.js";

// Player and every pedestrian load this one rig. The bind pose is the T-pose.
const GLB = new URL("../assets/player/gubbe.glb", import.meta.url);

function parseGlb(path) {
  const data = readFileSync(path);
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
}

function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatRot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

function bindWorld(doc) {
  const nodes = doc.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parent[child] = index;
  });
  const byName = new Map(nodes.map((node, index) => [node.name, index]));
  function world(name) {
    const chain = [];
    let index = byName.get(name);
    if (index == null) throw new Error(`missing ${name}`);
    while (index >= 0) {
      chain.push(index);
      index = parent[index];
    }
    chain.reverse();
    let t = { x: 0, y: 0, z: 0 };
    let q = { x: 0, y: 0, z: 0, w: 1 };
    let s = { x: 1, y: 1, z: 1 };
    for (const id of chain) {
      const node = nodes[id];
      const lt = node.translation || [0, 0, 0];
      const lr = node.rotation || [0, 0, 0, 1];
      const ls = node.scale || [1, 1, 1];
      const localQ = { x: lr[0], y: lr[1], z: lr[2], w: lr[3] };
      const scaled = { x: lt[0] * s.x, y: lt[1] * s.y, z: lt[2] * s.z };
      const rotated = quatRot(q, scaled);
      t = { x: t.x + rotated.x, y: t.y + rotated.y, z: t.z + rotated.z };
      q = quatMul(q, localQ);
      s = { x: s.x * ls[0], y: s.y * ls[1], z: s.z * ls[2] };
    }
    return { t, q, s };
  }
  return { world, byName };
}

function direction(world, from, to) {
  const a = world(from).t;
  const b = world(to).t;
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / len, y: d.y / len, z: d.z / len };
}

test("both hands keep the file's T-pose, thumbs toward the front", () => {
  const doc = parseGlb(GLB);
  assert.equal(doc.animations.length, 42);
  const { world, byName } = bindWorld(doc);
  for (const name of [
    "LeftHand",
    "RightHand",
    "LeftHandThumb3",
    "RightHandThumb3",
    "LeftHandThumb3_end",
    "RightHandThumb3_end",
  ]) {
    assert.ok(byName.has(name), name);
  }
  for (const node of doc.nodes) {
    for (const axis of node.scale || []) {
      assert.ok(axis > 0, node.name);
    }
  }
  const left = direction(world, "LeftHandThumb1", "LeftHandThumb3_end");
  const right = direction(world, "RightHandThumb1", "RightHandThumb3_end");
  // The figure faces +Z. A thumb that has been mirrored sits under the palm,
  // pointing down, instead of out and toward the front.
  assert.ok(left.x > 0.5, `left thumb ${JSON.stringify(left)}`);
  assert.ok(right.x < -0.5, `right thumb ${JSON.stringify(right)}`);
  assert.ok(left.z > 0.4 && right.z > 0.4);
  assert.ok(left.y > -0.25 && right.y > -0.25);
  assert.ok(Math.abs(left.x + right.x) < 1e-3);
  assert.ok(Math.abs(left.y - right.y) < 1e-3);
  assert.ok(Math.abs(left.z - right.z) < 1e-3);
  for (const name of ["LeftHandThumb3", "RightHandThumb3", "LeftHandMiddle1", "RightHandPinky3"]) {
    assert.equal(isLowerBone(name), false, name);
  }
});
