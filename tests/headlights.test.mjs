// Headlight quads fold over the nose corner: equal halves on the hood and the
// front face, following those face angles. Body triangles stay where they are.

import test from "node:test";
import assert from "node:assert/strict";
import { foldHeadlightGeometry } from "../js/headlights.js";

function vec(positions, index) {
  return [
    positions[index * 3],
    positions[index * 3 + 1],
    positions[index * 3 + 2],
  ];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

// A vertical nose lamp, a flat hood behind its top edge, and a front panel
// below it. Vertex order faces out (+Y hood, +Z nose).
function frontLamp() {
  const positions = [
    // 0..3 left headlight, bottom then top.
    -0.2, 0.6, 1, -0.5, 0.6, 1, -0.5, 0.8, 1, -0.2, 0.8, 1,
    // 4..6 hood, sloping up as it goes back.
    -0.2, 0.8, 1, -0.35, 0.88, 0.6, -0.5, 0.8, 1,
    // 7..9 front face under the lamp.
    -0.2, 0.4, 1, -0.5, 0.4, 1, -0.35, 0.2, 1,
    // 10..12 a tail lamp that must not move.
    -0.2, 0.5, -1, -0.5, 0.5, -1, -0.35, 0.7, -1,
  ];
  const normals = new Array(positions.length).fill(0);
  const uvs = [
    0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9,
    0.2, 0.3, 0.2, 0.4, 0.25, 0.3,
    0.4, 0.5, 0.4, 0.6, 0.45, 0.5,
    0.7, 0.7, 0.7, 0.8, 0.75, 0.7,
  ];
  // Head 0,2,1 and 0,3,2. Hood 4,5,6. Front 7,8,9. Tail 10,11,12.
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6,
    7, 8, 9,
    10, 11, 12,
  ];
  const cats = [2, 2, 0, 0, 3];
  const paint = new Array(positions.length / 3).fill(0);
  paint[4] = 1;
  paint[5] = 1;
  paint[6] = 1;
  paint[7] = 1;
  paint[8] = 1;
  paint[9] = 1;
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
    cats,
    paint: Float32Array.from(paint),
  };
}

function hoodLamp() {
  const positions = [
    // Flat on the hood: back edge z=0.8, front edge z=1.
    -0.2, 0.8, 0.8, -0.5, 0.8, 0.8, -0.5, 0.8, 1, -0.2, 0.8, 1,
    // Hood beside it, and the front face at z=1.
    -0.2, 0.8, 0.7, -0.5, 0.8, 0.7, -0.35, 0.8, 0.5,
    -0.2, 0.6, 1, -0.5, 0.6, 1, -0.35, 0.4, 1,
  ];
  const uvs = new Array((positions.length / 3) * 2).fill(0.2);
  for (let i = 0; i < 8; i += 1) uvs[i] = 0.9;
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 6, 5,
    7, 8, 9,
  ];
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
    cats: [2, 2, 0, 0],
    paint: null,
  };
}

test("a front headlight folds onto the hood and the nose in equal halves", () => {
  const source = frontLamp();
  const before = Array.from(source.positions);
  const folded = foldHeadlightGeometry(source);
  const hoodNormal = [0, 0.9805806756909202, 0.19611613513818404];
  const frontNormal = [0, 0, 1];

  // Top corners swing onto the hood. Bottom corners drop to the nose.
  for (const index of [2, 3]) {
    const moved = vec(folded.positions, index);
    const lip = [before[index * 3], 0.8, 1];
    const delta = sub(moved, lip);
    assert.ok(Math.abs(dot(delta, hoodNormal)) < 1e-3, `hood half leaves the hood: ${delta}`);
    assert.ok(delta[2] < -0.05, "hood half should run back along the hood");
    assert.equal(moved[0], before[index * 3]);
  }
  for (const index of [0, 1]) {
    const moved = vec(folded.positions, index);
    const lip = [before[index * 3], 0.8, 1];
    const delta = sub(moved, lip);
    assert.ok(Math.abs(dot(delta, frontNormal)) < 1e-3, `face half leaves the nose: ${delta}`);
    assert.ok(delta[1] < -0.05, "face half should run down the nose");
    assert.equal(moved[0], before[index * 3]);
  }
  const hoodReach = length(sub(vec(folded.positions, 2), [before[2 * 3], 0.8, 1]));
  const faceReach = length(sub(vec(folded.positions, 0), [before[0], 0.8, 1]));
  assert.ok(Math.abs(hoodReach - faceReach) < 1e-3, `halves differ: ${hoodReach} vs ${faceReach}`);
  assert.ok(Math.abs(hoodReach - 0.1) < 1e-3);

  // The crease sits on the corner, and every lamp piece faces its surface.
  let crease = 0;
  const headTris = folded.cats.map((cat, tri) => (cat === 2 ? tri : -1)).filter((tri) => tri >= 0);
  assert.ok(headTris.length > 2);
  for (const tri of headTris) {
    const ids = [
      folded.indices[tri * 3],
      folded.indices[tri * 3 + 1],
      folded.indices[tri * 3 + 2],
    ];
    const a = vec(folded.positions, ids[0]);
    const b = vec(folded.positions, ids[1]);
    const c = vec(folded.positions, ids[2]);
    const normal = cross(sub(b, a), sub(c, a));
    const len = length(normal);
    assert.ok(len > 1e-6);
    const unit = [normal[0] / len, normal[1] / len, normal[2] / len];
    const onHood = dot(unit, hoodNormal) > 0.9;
    const onFace = dot(unit, frontNormal) > 0.9;
    assert.ok(onHood || onFace, `lamp piece faces neither surface: ${unit}`);
    for (const point of [a, b, c]) {
      if (Math.abs(point[1] - 0.8) < 1e-3 && Math.abs(point[2] - 1) < 1e-3) crease += 1;
    }
  }
  assert.ok(crease >= 2, "the fold line is missing from the corner");

  // Body and the tail lamp stay. The fill covers only the vacated lower half.
  for (const index of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const now = vec(folded.positions, index);
    assert.equal(now[0], before[index * 3]);
    assert.equal(now[1], before[index * 3 + 1]);
    assert.equal(now[2], before[index * 3 + 2]);
  }
  const fills = folded.cats.map((cat, tri) => (cat === 0 && tri >= source.cats.length ? tri : -1)).filter((tri) => tri >= 0);
  assert.equal(fills.length, 3);
  for (const tri of fills) {
    for (let corner = 0; corner < 3; corner += 1) {
      const point = vec(folded.positions, folded.indices[tri * 3 + corner]);
      assert.ok(point[1] <= 0.7 + 1e-3, `fill climbs onto the lamp: ${point}`);
      assert.ok(point[1] >= 0.6 - 1e-3);
      assert.ok(Math.abs(point[2] - 1) < 1e-3);
      assert.equal(folded.paint[folded.indices[tri * 3 + corner]], 1);
    }
  }
  for (const index of [0, 1, 2, 3]) assert.equal(folded.paint[index], 0);
});

test("a hood headlight drops its front half down the nose", () => {
  const source = hoodLamp();
  const folded = foldHeadlightGeometry(source);
  // Front corners (z was 1) leave the hood. Back corners stay on it.
  for (const index of [2, 3]) {
    const moved = vec(folded.positions, index);
    assert.ok(moved[1] < 0.75, `front half stays on the hood: ${moved}`);
    assert.ok(Math.abs(moved[2] - 1) < 1e-3);
    assert.equal(moved[0], source.positions[index * 3]);
  }
  for (const index of [0, 1]) {
    const moved = vec(folded.positions, index);
    assert.ok(Math.abs(moved[1] - 0.8) < 1e-3, `back half leaves the hood: ${moved}`);
    assert.ok(moved[2] < 0.95 && moved[2] > 0.85);
    assert.equal(moved[0], source.positions[index * 3]);
  }
  const down = 0.8 - vec(folded.positions, 2)[1];
  const back = 1 - vec(folded.positions, 0)[2];
  assert.ok(Math.abs(down - back) < 1e-3, `halves differ: ${down} vs ${back}`);
  for (const index of [4, 5, 6, 7, 8, 9]) {
    assert.equal(folded.positions[index * 3 + 1], source.positions[index * 3 + 1]);
    assert.equal(folded.positions[index * 3 + 2], source.positions[index * 3 + 2]);
  }
});
