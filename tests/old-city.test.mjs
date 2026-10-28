// The island never uses the old downtown city. These checks pin that fact
// so the unused painter, quay, lamps, building drawing, and sidewalk cell
// can go without changing what the island draws or where people walk.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planKenneyRoads, clearBuildingsFromRoads } from "../js/kenney-road-plan.js";
import { layoutFrom, roadKey, roadRecord } from "../js/kenney-roads.js";
import { walkableCells } from "../js/pedestrian-walk.js";

const island = JSON.parse(readFileSync(new URL("../data/island.json", import.meta.url), "utf8"));
const layout = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8"));

const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"]);
const WALK = new Set(["s", "n", "p", "c", "l"]);

// Same rule as the old ground painter: island land, beach, and park are
// plain tiles, and water is in neither set.
function painterCovers(cell, onIsland) {
  if (onIsland && (cell === "l" || cell === "p" || cell === "g")) return false;
  return ROAD.has(cell) || WALK.has(cell) || cell === "q";
}

function census(map) {
  const counts = new Map();
  for (const row of map.ground) {
    for (const cell of row) counts.set(cell, (counts.get(cell) || 0) + 1);
  }
  return counts;
}

test("the island ground is only water, beach, land, and park", () => {
  const counts = census(island);
  assert.deepEqual([...counts.keys()].sort(), ["g", "l", "p", "~"]);
  assert.equal(counts.get("~") > 0, true);
  assert.equal(counts.get("l") > 0, true);
  assert.equal(island.buildings.length, 0);
  assert.equal(island.island, true);
});

test("the ground painter covers no island cell", () => {
  const counts = census(island);
  for (const cell of counts.keys()) {
    assert.equal(painterCovers(cell, true), false, cell);
  }
  assert.equal(painterCovers("s", true), true);
  assert.equal(painterCovers("H", true), true);
  assert.equal(painterCovers("q", true), true);
});

test("the island has none of the cells that made street lamps or signals", () => {
  const counts = census(island);
  for (const cell of ["s", "H", "h", "V", "v", "+", "X"]) {
    assert.equal(counts.has(cell), false, cell);
  }
});

test("the island has no building tiles and no quay or pier tiles", () => {
  const counts = census(island);
  for (const cell of ["b", "d", "y", "q"]) {
    assert.equal(counts.has(cell), false, cell);
  }
});

test("the old road plan places nothing on the island", () => {
  const plan = planKenneyRoads(island);
  assert.equal(plan.placements.length, 0);
  assert.equal(plan.count, 0);
  const buildings = island.buildings.map((building) => ({ ...building }));
  clearBuildingsFromRoads({ ...island, buildings }, plan);
  assert.equal(buildings.length, 0);
});

test("island walkable cells are land, park, and beach, never water or an old sidewalk", () => {
  const cells = walkableCells(island, layout.pieces);
  assert.ok(cells.length > 10000);
  for (const [x, z] of cells) {
    const cell = island.ground[z][x];
    assert.ok(cell === "l" || cell === "g" || cell === "p", cell);
  }
});

test("the saved island file keeps removedRoads, and a road record still round-trips", () => {
  assert.ok(Array.isArray(layout.removedRoads));
  assert.equal(layout.removedRoads.length, 0);
  const record = roadRecord({ piece: "straight", turn: 1, x: 12.5, z: 4 });
  assert.deepEqual(record, { piece: "straight", turn: 1, x: 12.5, z: 4 });
  assert.equal(roadKey(record), "straight:1:12.5:4");
  assert.equal(roadRecord({ piece: "bridge-water", turn: 0, x: 1, z: 1 }), null);
  const kept = layoutFrom({
    pieces: [{ kit: "roads", file: "road-straight.glb" }],
    removedRoads: [{ piece: "corner", turn: 2, x: 8, z: 9 }],
  });
  assert.deepEqual(kept.removedRoads, [{ piece: "corner", turn: 2, x: 8, z: 9 }]);
  assert.deepEqual(layoutFrom(layout).removedRoads, []);
  assert.deepEqual(layoutFrom(null), { pieces: [], removedRoads: [] });
});

test("an old downtown sidewalk cell is not walkable", () => {
  const map = { cols: 1, rows: 1, tile: 48, ground: ["s"] };
  assert.deepEqual(walkableCells(map, []), []);
});
