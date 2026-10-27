import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unexpectedErrors, yellowCells } from "../tools/build-island-sw.mjs";

test("the southwest quarter has no errors except open joins and the quarter edge", () => {
  const pieces = JSON.parse(readFileSync(new URL("../island-sw-map.json", import.meta.url), "utf8")).pieces;
  const map = JSON.parse(readFileSync(new URL("../data/island-sw.json", import.meta.url), "utf8"));
  const yellow = yellowCells();
  assert.deepEqual(unexpectedErrors(pieces, yellow), []);
  for (const piece of pieces) {
    const gx = Math.round((piece.x - 2) / 4);
    const gy = Math.round((piece.z - 2) / 4);
    const glyph = map.ground[4 * gy + 2]?.[4 * gx + 2];
    assert.equal(glyph === "l" || glyph === "g", true, `${piece.file} at ${gx},${gy} sits on ${glyph}`);
    assert.equal(gx >= 0 && gx <= 63 && gy >= 35 && gy <= 69, true);
  }
  const cross = pieces.find((piece) => piece.x === 4 * 24 + 2 && piece.z === 4 * 50 + 2);
  assert.equal(cross.file, "road-crossroad-3.glb");
});
