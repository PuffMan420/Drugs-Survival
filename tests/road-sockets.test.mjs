import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STOP_TURN, checkRoads, pieceCells, placePiece } from "../js/road-sockets.js";

test("the stop line faces the junction", () => {
  assert.deepEqual(STOP_TURN, { E: 0, N: 1, W: 2, S: 3 });
});

test("the narrow mouth meets a road shifted by half a piece", () => {
  const split = placePiece("road-split-2.glb", 2, 9, 2);
  const wide = pieceCells(split).filter((cell) => cell.gz === 8 || cell.gz === 9);
  assert.equal(wide.length, 2);
  const narrow = pieceCells(split).find((cell) => cell.gz === 8.5);
  assert.equal(narrow.sockets.W, "g");
  const road = placePiece("road-straight-7.glb", 1, 9, 0);
  road.z -= 2;
  const bend = placePiece("road-bend-3.glb", 0, 9, 1);
  bend.z -= 2;
  const errors = checkRoads([
    split,
    road,
    bend,
    placePiece("road-straight-7.glb", 3, 9, 0),
    placePiece("road-straight-7.glb", 3, 8, 0),
  ]);
  assert.deepEqual(errors.filter((error) => error.file === "road-split-2.glb"), []);
  assert.deepEqual(errors.filter((error) => error.file === "road-straight-7.glb" && error.gz === 8.5 && error.side === "E"), []);
  assert.deepEqual(errors.filter((error) => error.kind === "offgrid" || error.kind === "mismatch"), []);
});

test("the roadtest map has no edge errors", () => {
  const pieces = JSON.parse(readFileSync(new URL("../roadtest-map.json", import.meta.url), "utf8")).pieces;
  const errors = checkRoads(pieces);
  assert.deepEqual(errors, []);
});
