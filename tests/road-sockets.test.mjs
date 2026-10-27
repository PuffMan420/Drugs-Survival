import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STOP_TURN, checkRoads, placePiece } from "../js/road-sockets.js";

test("the stop line faces the junction", () => {
  assert.deepEqual(STOP_TURN, { E: 0, N: 1, W: 2, S: 3 });
});

test("a split placed on a module stays on whole modules", () => {
  const piece = placePiece("road-split-2.glb", 2, 9, 2);
  const errors = checkRoads([
    piece,
    placePiece("road-straight-7.glb", 1, 9, 0),
    placePiece("road-straight-7.glb", 3, 9, 0),
    placePiece("road-straight-7.glb", 3, 8, 0),
  ]).filter((error) => error.kind === "offgrid" || error.file === "road-split-2.glb" && error.kind === "open" && error.side === "W" && error.gz === 8);
  assert.equal(errors.length, 0);
});

test("the roadtest map has no edge errors", () => {
  const pieces = JSON.parse(readFileSync(new URL("../roadtest-map.json", import.meta.url), "utf8")).pieces;
  const errors = checkRoads(pieces);
  assert.deepEqual(errors, []);
});
