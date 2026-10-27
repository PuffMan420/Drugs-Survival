// The spatial hash must link the same mouths as the old double loop.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planBuiltLanes } from "../js/built-lanes.js";

const LINK_XZ = 18;
const LINK_Y = 10;

function bruteNext(lanes) {
  const next = new Array(lanes.length).fill(-1);
  const pairs = [];
  for (let i = 0; i < lanes.length; i += 1) {
    const end = lanes[i][lanes[i].length - 1];
    for (let j = 0; j < lanes.length; j += 1) {
      if (i === j) continue;
      const start = lanes[j][0];
      if (Math.abs(end.y - start.y) > LINK_Y) continue;
      const dist = Math.hypot(end.x - start.x, end.z - start.z);
      if (dist < LINK_XZ) pairs.push({ i, j, dist });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist || a.i - b.i || a.j - b.j);
  const usedIn = new Array(lanes.length).fill(false);
  const usedOut = new Array(lanes.length).fill(false);
  for (const pair of pairs) {
    if (usedOut[pair.i] || usedIn[pair.j]) continue;
    next[pair.i] = pair.j;
    usedOut[pair.i] = true;
    usedIn[pair.j] = true;
  }
  return next;
}

test("spatial hash matches the brute-force linker on the current map", () => {
  const pieces = JSON.parse(readFileSync(new URL("../west-map.json", import.meta.url), "utf8")).pieces;
  const plan = planBuiltLanes(pieces);
  assert.deepEqual(plan.next, bruteNext(plan.lanes));
  assert.ok(plan.lanes.length > 100);
});

test("oneWay keeps a single direction and still links the next piece", () => {
  const pieces = [0, 1].map((i) => ({
    kit: "roads",
    file: "road-straight.glb",
    x: 10 + i * 4,
    z: 10,
    turn: 0,
    scale: 1,
    mirror: false,
    oneWay: true,
  }));
  const plan = planBuiltLanes(pieces);
  assert.equal(plan.lanes.length, 2);
  assert.equal(plan.next[0] === 1 || plan.next[1] === 0, true);
  const both = planBuiltLanes(pieces.map((piece) => ({ ...piece, oneWay: false })));
  assert.equal(both.lanes.length, 4);
});
