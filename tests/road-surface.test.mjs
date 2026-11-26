import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assignGroundLayers,
  CITY_Y,
  groundsOverlap,
  GROUND_PIECE_Y,
  GROUND_STACK_STEP,
  ROAD_Y,
  SURFACE_GAP,
  visualPieceY,
} from "../js/piece-surface.js";

const CHARACTER_HEIGHT = 37.35;
const SEDAN_LENGTH = 71;

function ground(file, x, z, extra = {}) {
  return { kit: "ground", file, x, z, turn: 0, scale: 1, mirror: false, ...extra };
}

function road(file, x, z) {
  return { kit: "roads", file, x, z, turn: 0, scale: 1, mirror: false };
}

test("city lots, yard stamps, and roads sit on distinct Y bands with a safe gap", () => {
  assert.ok(ROAD_Y > GROUND_PIECE_Y);
  assert.ok(GROUND_PIECE_Y > CITY_Y);
  assert.equal(ROAD_Y - GROUND_PIECE_Y, SURFACE_GAP);
  assert.equal(GROUND_PIECE_Y - CITY_Y, SURFACE_GAP);
  assert.ok(SURFACE_GAP > 0.38);
  assert.ok(ROAD_Y < 2);
  assert.ok(Math.abs(CITY_Y) < CHARACTER_HEIGHT * 0.05);
  assert.ok(Math.abs(CITY_Y) < SEDAN_LENGTH * 0.05);
});

test("a road piece stays at ROAD_Y and a yard stamp sits below it", () => {
  const street = road("road-straight-7.glb", 10, 10);
  const yard = ground("asphalt-worn.glb", 10, 10);
  const list = [street, yard];
  assert.equal(visualPieceY(street, list), ROAD_Y);
  assert.equal(visualPieceY(yard, list), GROUND_PIECE_Y);
  assert.ok(visualPieceY(street, list) - visualPieceY(yard, list) >= SURFACE_GAP);
});

test("exact duplicate yard stamps keep one copy and skip the other", () => {
  const first = ground("tiny-grass-12.glb", 71, 240, { scale: 3 });
  const copy = ground("tiny-grass-12.glb", 71, 240, { scale: 3 });
  const layers = assignGroundLayers([first, copy]);
  assert.equal(layers.get(first), 0);
  assert.equal(layers.get(copy), -1);
  assert.equal(visualPieceY(first, [first, copy]), GROUND_PIECE_Y);
  assert.equal(visualPieceY(copy, [first, copy]), null);
});

test("overlapping yard stamps of different files get stepped Y values", () => {
  const a = ground("tiny-grass-04.glb", 5, 5);
  const b = ground("tiny-grass-03.glb", 5, 5);
  const list = [a, b];
  const ya = visualPieceY(a, list);
  const yb = visualPieceY(b, list);
  assert.ok(ya != null && yb != null);
  assert.notEqual(ya, yb);
  assert.equal(Math.abs(ya - yb), GROUND_STACK_STEP);
  assert.ok(ya < ROAD_Y && yb < ROAD_Y);
});

test("adjacent non-overlapping yard stamps stay on the same base Y", () => {
  const a = ground("asphalt-plain.glb", 8, 8);
  const b = ground("asphalt-plain.glb", 9, 8);
  assert.equal(groundsOverlap(a, b), false);
  assert.equal(visualPieceY(a, [a, b]), GROUND_PIECE_Y);
  assert.equal(visualPieceY(b, [a, b]), GROUND_PIECE_Y);
});

test("island-map yard stamps that overlap do not share a drawn Y", () => {
  const pieces = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8")).pieces;
  const layers = assignGroundLayers(pieces);
  const drawn = [];
  let skipped = 0;
  for (const piece of pieces) {
    const layer = layers.get(piece);
    if (layer == null) continue;
    if (layer < 0) {
      skipped += 1;
      continue;
    }
    const y = GROUND_PIECE_Y + layer * GROUND_STACK_STEP;
    assert.ok(y < ROAD_Y, `${piece.file} at ${piece.x},${piece.z} reached road height ${y}`);
    assert.ok(y >= GROUND_PIECE_Y);
    drawn.push({ piece, y });
  }
  assert.ok(skipped >= 1, "expected the exact duplicate stamps to be skipped");
  const dupes = pieces.filter((piece) => piece.kit === "ground" && piece.file === "tiny-grass-12.glb"
    && piece.x === 71 && piece.z === 240 && piece.scale === 3);
  assert.equal(dupes.length, 2);
  assert.equal(layers.get(dupes[0]), 0);
  assert.equal(layers.get(dupes[1]), -1);

  let checked = 0;
  for (let i = 0; i < drawn.length; i += 1) {
    for (let j = i + 1; j < drawn.length; j += 1) {
      if (!groundsOverlap(drawn[i].piece, drawn[j].piece)) continue;
      checked += 1;
      assert.notEqual(
        drawn[i].y,
        drawn[j].y,
        `${drawn[i].piece.file} @${drawn[i].piece.x},${drawn[i].piece.z} and ${drawn[j].piece.file} @${drawn[j].piece.x},${drawn[j].piece.z}`,
      );
    }
  }
  assert.ok(checked > 0, "expected overlapping yard stamps in the live map");
});
