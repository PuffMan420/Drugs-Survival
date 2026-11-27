import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TILE } from "../js/constants.js";
import {
  groundSnapOffset,
  groundWorldCenter,
  nextWholeScale,
} from "../js/ground-scale.js";
import { groundsOverlap } from "../js/piece-surface.js";

function ground(x, z, scale) {
  return { kit: "ground", file: "lush-grass.glb", x, z, turn: 0, scale, mirror: false };
}

function footprint(scale, x = 10, z = 20) {
  const half = scale / 2;
  const snap = groundSnapOffset(scale);
  return {
    x0: x + 0.5 + snap - half,
    z0: z + 0.5 + snap - half,
    x1: x + 0.5 + snap + half,
    z1: z + 0.5 + snap + half,
  };
}

test("1x, 2x, and 3x ground tiles cover exact aligned NxN cell blocks", () => {
  const x = 10;
  const z = 20;
  const one = footprint(1, x, z);
  assert.equal(groundSnapOffset(1), 0);
  assert.deepEqual(groundWorldCenter(x, z, 1), { x: (x + 0.5) * TILE, z: (z + 0.5) * TILE });
  assert.deepEqual(one, { x0: 10, z0: 20, x1: 11, z1: 21 });

  const two = footprint(2, x, z);
  assert.equal(groundSnapOffset(2), 0.5);
  assert.deepEqual(groundWorldCenter(x, z, 2), { x: (x + 1) * TILE, z: (z + 1) * TILE });
  assert.deepEqual(two, { x0: 10, z0: 20, x1: 12, z1: 22 });

  const three = footprint(3, x, z);
  assert.equal(groundSnapOffset(3), 0);
  assert.deepEqual(groundWorldCenter(x, z, 3), { x: (x + 0.5) * TILE, z: (z + 0.5) * TILE });
  assert.deepEqual(three, { x0: 9, z0: 19, x1: 12, z1: 22 });
});

test("4x also snaps to the grid, in-between 0.25 steps stay centered", () => {
  assert.deepEqual(footprint(4, 10, 20), { x0: 9, z0: 19, x1: 13, z1: 23 });
  assert.equal(groundSnapOffset(1.25), 0);
  assert.equal(groundSnapOffset(1.5), 0);
  assert.equal(groundSnapOffset(1.75), 0);
  assert.equal(groundSnapOffset(2.25), 0);
  assert.equal(groundSnapOffset(0.75), 0);
  const mid = footprint(1.5, 10, 20);
  assert.deepEqual(mid, { x0: 9.75, z0: 19.75, x1: 11.25, z1: 21.25 });
});

test("a snapped 2x tile overlaps the placement cell and the +x,+z neighbor only", () => {
  const big = ground(8, 8, 2);
  assert.equal(groundsOverlap(big, ground(8, 8, 1)), true);
  assert.equal(groundsOverlap(big, ground(9, 8, 1)), true);
  assert.equal(groundsOverlap(big, ground(8, 9, 1)), true);
  assert.equal(groundsOverlap(big, ground(9, 9, 1)), true);
  assert.equal(groundsOverlap(big, ground(7, 8, 1)), false);
  assert.equal(groundsOverlap(big, ground(8, 7, 1)), false);
  assert.equal(groundsOverlap(big, ground(10, 8, 1)), false);
  assert.equal(groundsOverlap(big, ground(8, 10, 1)), false);
});

test("Shift+scale jumps ground tiles to the next whole size", () => {
  assert.equal(nextWholeScale(1, 1), 2);
  assert.equal(nextWholeScale(1.25, 1), 2);
  assert.equal(nextWholeScale(1.75, 1), 2);
  assert.equal(nextWholeScale(2, 1), 3);
  assert.equal(nextWholeScale(2.25, 1), 3);
  assert.equal(nextWholeScale(3, 1), 4);
  assert.equal(nextWholeScale(4, 1), 4);
  assert.equal(nextWholeScale(3.25, -1), 3);
  assert.equal(nextWholeScale(3, -1), 2);
  assert.equal(nextWholeScale(2, -1), 1);
  assert.equal(nextWholeScale(1.25, -1), 1);
  assert.equal(nextWholeScale(1, -1), 1);
  assert.equal(nextWholeScale(0.75, 1), 1);
  assert.equal(nextWholeScale(0.75, -1), 0.75);
});

test("saved island-map ground pieces keep their old centers", () => {
  const pieces = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8")).pieces;
  const grounds = pieces.filter((piece) => piece.kit === "ground");
  const scaled = grounds.filter((piece) => (piece.scale ?? 1) !== 1);
  assert.ok(scaled.length > 0);
  for (const piece of scaled) {
    // No saved even-integer scales, so the snap offset stays 0 and nothing moves.
    assert.equal(groundSnapOffset(piece.scale ?? 1), 0);
    const at = groundWorldCenter(piece.x, piece.z, piece.scale ?? 1);
    assert.equal(at.x, (piece.x + 0.5) * TILE);
    assert.equal(at.z, (piece.z + 0.5) * TILE);
  }
});
