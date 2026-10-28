// Pins the shared tile hash and the cell letters so a later edit cannot
// drift the copies back apart or move parked-car and tree placement.

import assert from "node:assert/strict";
import test from "node:test";
import { DRIVEN_ROAD, LAND, ROAD, WALK, tileHash } from "../js/cells.js";

test("tile hash outputs stay put", () => {
  const vectors = [
    [0, 0, 0],
    [1, 0, 2182411202],
    [0, 1, 3299696776],
    [1, 1, 266529354],
    [-3, 7, 1347728689],
    [40, 126, 3428410293],
    [82, 194, 2870635540],
    [302, 90, 1141432463],
    [410, 202, 2340674416],
    [7, 13, 1293937677],
    [100, 200, 400386565],
  ];
  for (const [x, z, hash] of vectors) {
    assert.equal(tileHash(x, z), hash, `${x},${z}`);
  }
  assert.equal(tileHash(40, 126) % 8, 5);
  assert.equal(tileHash(126, 40) % 2, 1);
});

test("road, driven road, walk, and land stay one set each", () => {
  assert.deepEqual([...ROAD], ["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"]);
  assert.deepEqual([...DRIVEN_ROAD], ["H", "h", "V", "v", "+", "X", "1", "2", "5", "6"]);
  assert.equal(DRIVEN_ROAD.has("4"), false);
  assert.equal(DRIVEN_ROAD.has("8"), false);
  assert.equal(ROAD.has("4"), true);
  assert.equal(ROAD.has("8"), true);
  for (const cell of DRIVEN_ROAD) assert.equal(ROAD.has(cell), true);
  assert.deepEqual([...WALK], ["s", "n", "p", "c", "l"]);
  assert.deepEqual([...LAND], ["l", "g", "p"]);
  assert.equal(LAND.has("~"), false);
  assert.equal(WALK.has("g"), false);
});
