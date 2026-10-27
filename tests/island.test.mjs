import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pieceCells } from "../js/road-sockets.js";
import { unexpectedErrors, yellowCells } from "../tools/build-island-map.mjs";

test("the full island leaves joins, splits and 4-lane crossings open", () => {
  const pieces = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8")).pieces;
  const map = JSON.parse(readFileSync(new URL("../data/island.json", import.meta.url), "utf8"));
  const yellow = yellowCells();
  assert.deepEqual(unexpectedErrors(pieces, yellow, map.ground), []);

  const files = {};
  for (const piece of pieces) files[piece.file] = (files[piece.file] || 0) + 1;
  assert.equal(files["bridge-water.glb"], 10);
  assert.equal(files["road-slant-high-4.glb"], 10);
  assert.equal(files["road-split-2.glb"], undefined);
  assert.equal(files["road-bridge-2.glb"], undefined);
  assert.equal(files["road-crossroad-3.glb"], 35);

  for (const [gx, gy] of [[34, 16], [80, 22], [24, 50], [70, 54]]) {
    const hit = pieces.find((piece) => piece.x === 4 * gx + 2 && piece.z === 4 * gy + 2);
    assert.equal(hit && hit.file, "road-crossroad-3.glb", `${gx},${gy}`);
  }
  assert.equal(pieces.some((piece) => piece.x === 4 * 60 + 2 && piece.z === 4 * 12 + 2), false);

  const glyph = (gx, gy) => map.ground[4 * gy + 2]?.[4 * gx + 2];
  for (const piece of pieces) {
    const cells = pieceCells(piece);
    for (const cell of cells) {
      const ground = glyph(cell.gx, cell.gz);
      assert.notEqual(ground, "p", `${piece.file} on beach ${cell.gx},${cell.gz}`);
      if (piece.file !== "bridge-water.glb") {
        assert.equal(ground === "l" || ground === "g", true, `${piece.file} on ${ground} at ${cell.gx},${cell.gz}`);
      }
    }
  }
});
