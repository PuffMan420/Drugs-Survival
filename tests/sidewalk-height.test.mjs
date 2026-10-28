import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TILE } from "../js/constants.js";
import { createSidewalkIndex, feetOnPiece, sampleSidewalk, sidewalkMesh } from "../js/sidewalk-height.js";

const straight = sidewalkMesh(readFileSync(new URL("../GLB format/road-straight.glb", import.meta.url)));
const bend = sidewalkMesh(readFileSync(new URL("../GLB format/road-bend.glb", import.meta.url)));
const bridge = sidewalkMesh(readFileSync(new URL("../GLB format/road-bridge.glb", import.meta.url)));

function pieceAt(extra = {}) {
  return { kit: "roads", file: "road-straight.glb", x: 10, z: 10, turn: 0, scale: 1, mirror: false, ...extra };
}

function center(tx, tz) {
  return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE };
}

test("the straight sidewalk top is the mesh lip, and the asphalt is left alone", () => {
  const piece = pieceAt();
  const lip = sampleSidewalk(straight, 0, -0.45);
  assert.ok(lip);
  assert.ok(lip.rise > 0.005 && lip.rise < 0.02);
  const north = center(10, 8);
  const y = feetOnPiece(piece, straight, north.x, north.z, 0.6);
  assert.ok(Math.abs(y - (0.2 + lip.y * 4 * TILE)) < 1e-3, `sidewalk ${y}`);
  const road = center(10, 10);
  assert.equal(feetOnPiece(piece, straight, road.x, road.z, 2.27), null);
  const south = center(10, 12);
  const southY = feetOnPiece(piece, straight, south.x, south.z, 0.6);
  assert.ok(Math.abs(southY - y) < 1e-3);
});

test("the curb eases from the road up to the lip over a short run", () => {
  const piece = pieceAt();
  const { x } = center(10, 10);
  const cz = (10.5) * TILE;
  const size = 4 * TILE;
  const at = (lz, street) => feetOnPiece(piece, straight, x, cz + lz * size, street);
  const deck = 2.27;
  const edge = at(-0.4, deck);
  const step = at(-0.41, deck);
  const top = at(-0.45, deck);
  assert.ok(edge != null && step != null && top != null);
  assert.ok(Math.abs(edge - deck) < 1e-6, `edge ${edge}`);
  assert.ok(step > deck && step < top, `step ${step} top ${top}`);
  assert.ok(top > deck + 1);
});

test("a turned straight lifts the east and west sidewalks", () => {
  const piece = pieceAt({ turn: 1 });
  const east = center(12, 10);
  const north = center(10, 8);
  const y = feetOnPiece(piece, straight, east.x, east.z, 0.6);
  assert.ok(y > 3, `east ${y}`);
  assert.equal(feetOnPiece(piece, straight, north.x, north.z, 0.6), null);
});

test("a bridge sidewalk is the upper lip, and the deck stays a road", () => {
  assert.equal(sampleSidewalk(bridge, 0, 0), null);
  const lip = sampleSidewalk(bridge, -0.45, 0);
  assert.ok(lip, "the bridge has a raised sidewalk");
  assert.ok(lip.y > 0.5);
  const groundLip = sampleSidewalk(bridge, 0, -0.45);
  assert.ok(groundLip);
  assert.ok(groundLip.y < 0.05);
});

test("a bend sidewalk follows the mesh, including a mirror", () => {
  let local = null;
  for (let x = -0.5; x <= 0.5; x += 0.05) {
    for (let z = -0.5; z <= 0.5; z += 0.05) {
      const hit = sampleSidewalk(bend, x, z);
      if (hit && hit.dist > hit.rise * 3 && Math.abs(x) > 0.05) {
        local = { x, z, hit };
        break;
      }
    }
    if (local) break;
  }
  assert.ok(local);
  const piece = pieceAt({ file: "road-bend.glb", mirror: false });
  const mirrored = pieceAt({ file: "road-bend.glb", mirror: true });
  const size = 4 * TILE;
  const cz = 10.5 * TILE;
  const cx = 10.5 * TILE;
  const plain = feetOnPiece(piece, bend, cx + local.x * size, cz + local.z * size, 0.6);
  const flipped = feetOnPiece(mirrored, bend, cx - local.x * size, cz + local.z * size, 0.6);
  const unflipped = feetOnPiece(mirrored, bend, cx + local.x * size, cz + local.z * size, 0.6);
  assert.ok(plain > 3 && flipped > 3);
  assert.equal(unflipped, null);
});

test("an island straight lifts the sidewalk tile the crowd walks", () => {
  const pieces = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8")).pieces;
  const piece = pieces.find((item) => item.file === "road-straight-7.glb" && item.turn === 0 && item.scale === 1);
  assert.ok(piece);
  const north = center(piece.x, piece.z - 2);
  const y = feetOnPiece(piece, straight, north.x, north.z, 0.6);
  assert.ok(y > 3, `island sidewalk ${y}`);
  assert.equal(feetOnPiece(piece, straight, center(piece.x, piece.z).x, center(piece.x, piece.z).z, 0.6), null);
});

test("the index answers from the placed pieces", async () => {
  const index = createSidewalkIndex(async () => readFileSync(new URL("../GLB format/road-straight.glb", import.meta.url)));
  const piece = pieceAt({ file: "road-straight-7.glb" });
  await index.setPieces([piece]);
  const north = center(10, 8);
  const y = index.feetY(north.x, north.z, 0.6);
  assert.ok(y > 3, `indexed ${y}`);
  assert.equal(index.feetY(center(10, 10).x, center(10, 10).z, 0.6), 0.6);
  await index.setPieces([]);
  assert.equal(index.feetY(north.x, north.z, 0.6), 0.6);
});
