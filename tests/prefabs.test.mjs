import assert from "node:assert/strict";
import { boxFrom, capturePrefab, rotatePrefab, anchorFor, stampSpecs, cleanPrefabs } from "../js/prefabs.js";

const box = boxFrom({ x: 12, z: 7 }, { x: 10, z: 6 });
assert.deepEqual(box, { x0: 10, z0: 6, x1: 12, z1: 7, w: 3, d: 2 });

const records = [
  { kit: "a", file: "house.glb", x: 10, z: 6, turn: 0, scale: 1, mirror: false },
  { kit: "f", file: "fence.glb", x: 12, z: 7, turn: 1, scale: 1, mirror: true },
  { kit: "f", file: "free.glb", x: 11.25, z: 6.5, turn: 0, scale: 1, mirror: false, yaw: 0.3 },
  { kit: "a", file: "outside.glb", x: 13, z: 6, turn: 0, scale: 1, mirror: false },
];
const prefab = capturePrefab("Hus", records, box);
assert.equal(prefab.pieces.length, 3);
assert.deepEqual(prefab.pieces.map((p) => [p.dx, p.dz]), [[0, 0], [2, 1], [1.25, 0.5]]);
assert.equal(capturePrefab("none", records, boxFrom({ x: 0, z: 0 }, { x: 1, z: 1 })), null);

// One quarter: (dx, dz) -> (dz, w-1-dx), turn+1, box 3x2 -> 2x3
const r1 = rotatePrefab(prefab, 1);
assert.equal(r1.w, 2);
assert.equal(r1.d, 3);
assert.deepEqual(r1.pieces.map((p) => [p.dx, p.dz, p.turn]), [[0, 2, 1], [1, 0, 2], [0.5, 0.75, 1]]);
assert.equal(r1.pieces[2].yaw, Math.round((0.3 + Math.PI / 2) * 1000) / 1000);
// Every offset stays inside the turned box
for (const q of [1, 2, 3]) {
  const t = rotatePrefab(prefab, q);
  for (const p of t.pieces) {
    assert.ok(p.dx >= 0 && p.dx <= t.w - 1 && p.dz >= 0 && p.dz <= t.d - 1, `q${q} ${p.file}`);
  }
}
// Four quarters is the original (yaw aside, which grows by 2π)
const r4 = rotatePrefab(prefab, 4);
assert.deepEqual(r4.pieces.map((p) => [p.dx, p.dz, p.turn]), prefab.pieces.map((p) => [p.dx, p.dz, p.turn]));

// Rotation matches three.js rotation.y about the box centre: world (x,z) -> (z,-x)
{
  const p = prefab.pieces[1]; // centre at (2.5, 1.5) in a 3x2 box, box centre (1.5, 1)
  const rx = p.dx + 0.5 - 1.5, rz = p.dz + 0.5 - 1;
  const q = r1.pieces[1]; // turned box 2x3, centre (1, 1.5)
  assert.deepEqual([q.dx + 0.5 - 1, q.dz + 0.5 - 1.5], [rz, -rx]);
}

// Stamp: cursor in the middle of the box
const anchor = anchorFor({ x: 50, z: 40 }, 3, 2);
assert.deepEqual(anchor, { x: 49, z: 40 });
const specs = stampSpecs(prefab, 0, anchor);
assert.deepEqual(specs.map((s) => [s.file, s.x, s.z, s.turn]), [["house.glb", 49, 40, 0], ["fence.glb", 51, 41, 1], ["free.glb", 50.25, 40.5, 0]]);
assert.equal(specs[1].mirror, true);

// Import cleaning
assert.equal(cleanPrefabs({ prefabs: [prefab, { name: "bad", w: 1, d: 1, pieces: [{ kit: 1 }] }] }).length, 1);
assert.equal(cleanPrefabs(null).length, 0);
console.log("prefab tests passed");
