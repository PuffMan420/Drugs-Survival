import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isLowerBone } from "../js/pose-layers.js";

// Player and pedestrians load the Modular figures on the UAL skeleton.
const FILES = [
  "men_Casual_Hoodie_UAL.glb",
  "women_Casual_UAL.glb",
].map((name) => new URL(`../06 Player Character/Modular/${name}`, import.meta.url));
const BAT = new URL("../06 Player Character/Modular/ual-bat.glb", import.meta.url);

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

// The clips the game plays by name (player.js, pedestrians.js, intro.js).
const USED_CLIPS = [
  "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Driving_Loop",
  "Pistol_Idle_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Pistol_Reload",
  "Punch_Cross", "Punch_Jab", "Sword_Idle", "Sword_Attack",
  "Hit_Chest", "Hit_Head", "Death01",
];

function inHandFrame(world, hand, point) {
  const h = world(hand);
  const p = world(point).t;
  const d = { x: p.x - h.t.x, y: p.y - h.t.y, z: p.z - h.t.z };
  const inv = { x: -h.q.x, y: -h.q.y, z: -h.q.z, w: h.q.w };
  const local = quatRot(inv, d);
  const len = Math.hypot(local.x, local.y, local.z) || 1;
  return { x: local.x / len, y: local.y / len, z: local.z / len };
}

for (const file of FILES) {
  const name = file.pathname.split("/").pop();
  test(`${name}: UAL skeleton, the clips the game uses, and the right-hand frame`, () => {
    const doc = parseGlb(file);
    const clips = new Set(doc.animations.map((clip) => clip.name));
    for (const clip of USED_CLIPS) assert.ok(clips.has(clip), `${name} ${clip}`);
    const { world, byName } = bindWorld(doc);
    for (const bone of ["root", "pelvis", "Head", "neck_01", "hand_r", "hand_l", "thigh_l", "calf_r", "foot_l", "spine_03"]) {
      assert.ok(byName.has(bone), `${name} ${bone}`);
    }
    for (const node of doc.nodes) {
      for (const axis of node.scale || []) assert.ok(axis > 0, node.name);
    }
    // characters.js handSocket: fingers run +Y in hand_r, the pinky sits -Z.
    const fingers = inHandFrame(world, "hand_r", "middle_01_r");
    assert.ok(fingers.y > 0.95, `fingers ${JSON.stringify(fingers)}`);
    const index = world("index_01_r").t;
    const pinky = world("pinky_01_r").t;
    const h = world("hand_r");
    const across = quatRot({ x: -h.q.x, y: -h.q.y, z: -h.q.z, w: h.q.w }, {
      x: pinky.x - index.x, y: pinky.y - index.y, z: pinky.z - index.z,
    });
    const len = Math.hypot(across.x, across.y, across.z);
    assert.ok(across.z / len < -0.9, `pinky ${JSON.stringify(across)}`);
    for (const bone of ["thumb_03_r", "upperarm_l", "lowerarm_r", "hand_l", "spine_02", "Head"]) {
      assert.equal(isLowerBone(bone), false, bone);
    }
    for (const bone of ["pelvis", "thigh_l", "calf_r", "foot_l", "ball_r", "root"]) {
      assert.equal(isLowerBone(bone), true, bone);
    }
  });
}

test("ual-bat.glb has the three bat clips on UAL bones", () => {
  const doc = parseGlb(BAT);
  const names = doc.animations.map((clip) => clip.name).sort();
  assert.deepEqual(names, ["Bat_Hang", "Bat_Shoulder", "Bat_Swing"]);
  const nodes = doc.nodes.map((node) => node.name);
  for (const clip of doc.animations) {
    const bones = new Set(clip.channels.map((channel) => nodes[channel.target.node]));
    for (const bone of ["pelvis", "upperarm_r", "lowerarm_r", "hand_r", "hand_l"]) {
      assert.ok(bones.has(bone), `${clip.name} ${bone}`);
    }
  }
});
