import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { walkableCells } from "../js/pedestrian-walk.js";

function blank(cols, rows, code = "l") {
  return {
    cols,
    rows,
    tile: 48,
    ground: Array.from({ length: rows }, () => code.repeat(cols)),
  };
}

function has(cells, x, z) {
  return cells.some(([cx, cz]) => cx === x && cz === z);
}

test("a straight road blocks asphalt and keeps the sidewalks", () => {
  const map = blank(20, 20);
  const piece = { file: "road-straight-7.glb", x: 10, z: 10, turn: 0, scale: 1, mirror: false };
  const cells = walkableCells(map, [piece]);
  assert.equal(has(cells, 10, 10), false);
  assert.equal(has(cells, 10, 9), false);
  assert.equal(has(cells, 8, 10), false);
  assert.equal(has(cells, 10, 8), true);
  assert.equal(has(cells, 10, 12), true);
  assert.equal(has(cells, 9, 8), true);
  assert.equal(has(cells, 0, 0), true);
});

test("a turned straight puts the sidewalks on the east and west", () => {
  const map = blank(20, 20);
  const piece = { file: "road-straight-7.glb", x: 10, z: 10, turn: 1, scale: 1, mirror: false };
  const cells = walkableCells(map, [piece]);
  assert.equal(has(cells, 12, 10), true);
  assert.equal(has(cells, 8, 10), true);
  assert.equal(has(cells, 10, 8), false);
  assert.equal(has(cells, 10, 10), false);
});

test("a crossing piece can be crossed on the zebra and nowhere else on the asphalt", () => {
  const map = blank(20, 20);
  const piece = { file: "road-crossing-3.glb", x: 10, z: 10, turn: 0, scale: 1, mirror: false };
  const cells = walkableCells(map, [piece]);
  assert.equal(has(cells, 10, 9), true);
  assert.equal(has(cells, 10, 10), true);
  assert.equal(has(cells, 10, 11), true);
  assert.equal(has(cells, 9, 10), false);
  assert.equal(has(cells, 11, 10), false);
  assert.equal(has(cells, 10, 8), true);
  assert.equal(has(cells, 10, 12), true);
});

test("water is never walkable, and beach, park, and land are", () => {
  const ground = ["~~~~", "plg~", "llll", "~~~~"];
  const map = { cols: 4, rows: 4, tile: 48, ground };
  const cells = walkableCells(map, []);
  assert.equal(cells.some(([x, z]) => ground[z][x] === "~"), false);
  assert.equal(has(cells, 0, 1), true);
  assert.equal(has(cells, 1, 1), true);
  assert.equal(has(cells, 2, 1), true);
  assert.equal(has(cells, 3, 1), false);
  assert.equal(has(cells, 0, 2), true);
  assert.equal(cells.length, 7);
});

test("the island crowd stays off the roads, the water, and on the land", () => {
  const map = JSON.parse(readFileSync(new URL("../data/island.json", import.meta.url), "utf8"));
  const pieces = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8")).pieces;
  const cells = walkableCells(map, pieces);
  assert.ok(cells.length > 10000);
  for (const [x, z] of cells) {
    assert.notEqual(map.ground[z][x], "~");
  }
  const straight = pieces.find((piece) => piece.file === "road-straight-7.glb" && piece.turn === 0);
  assert.ok(straight);
  assert.equal(has(cells, straight.x, straight.z), false);
  assert.equal(has(cells, straight.x, straight.z - 2), true);
  const crossing = pieces.find((piece) => piece.file.startsWith("road-crossing"));
  assert.equal(crossing, undefined);

  let beach = 0;
  let park = 0;
  for (const [x, z] of cells) {
    const code = map.ground[z][x];
    if (code === "p") beach += 1;
    if (code === "g") park += 1;
  }
  assert.ok(beach > 0);
  assert.ok(park > 0);
});
