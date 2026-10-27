// Builds the ?map=roadtest layout from js/road-sockets.js and refuses to write
// it unless every socket meets its neighbour.

import { writeFileSync } from "node:fs";
import { checkRoads, placePiece } from "../js/road-sockets.js";

const straight = (gx, gz, turn) => placePiece("road-straight-7.glb", gx, gz, turn);
const stop = (gx, gz, turn) => placePiece("road-straight-stop.glb", gx, gz, turn);
const bend = (gx, gz, turn) => placePiece("road-bend-3.glb", gx, gz, turn);
const tee = (gx, gz, turn) => placePiece("road-intersection-3.glb", gx, gz, turn);
const cross = (gx, gz, turn) => placePiece("road-crossroad-3.glb", gx, gz, turn);
const ramp = (gx, gz, turn) => placePiece("road-slant-high-4.glb", gx, gz, turn);
const bridge = (gx, gz, turn) => placePiece("road-bridge-2.glb", gx, gz, turn);
const split = (gx, gz, turn) => placePiece("road-split-2.glb", gx, gz, turn);
const water = (gx, gz, turn) => placePiece("bridge-water.glb", gx, gz, turn);
// cellsZ is a whole-cell nudge. ±2 is half a module, the split's narrow line.
const moved = (file, gx, gz, turn, cellsZ) => {
  const placed = placePiece(file, gx, gz, turn);
  placed.z += cellsZ;
  return placed;
};

// Each group is closed: every socket meets the opposite socket on the next piece.
const pieces = [
  // Plaza. The STOP faces the T. The cross is south of that T, and the ring
  // meets the cross through three more T pieces so the cross has four roads.
  bend(1, 1, 1),
  stop(2, 1, 0),
  tee(3, 1, 0),
  straight(4, 1, 0),
  bend(5, 1, 0),
  tee(1, 2, 1),
  straight(2, 2, 0),
  cross(3, 2, 0),
  straight(4, 2, 0),
  tee(5, 2, 3),
  straight(1, 3, 1),
  straight(3, 3, 1),
  straight(5, 3, 1),
  bend(1, 4, 2),
  straight(2, 4, 0),
  tee(3, 4, 2),
  straight(4, 4, 0),
  bend(5, 4, 3),

  // 4-lane road. The wide mouths stay on the two module rows. The single road
  // and the bend that meet each narrow mouth are shifted 2 cells onto the
  // shared edge, then the two narrow ends join around the outside.
  split(2, 9, 2),
  straight(3, 8, 0),
  straight(3, 9, 0),
  bridge(4, 8, 0),
  bridge(4, 9, 0),
  straight(5, 8, 0),
  straight(5, 9, 0),
  split(6, 8, 0),
  moved("road-bend-3.glb", 0, 9, 1, -2),
  moved("road-straight-7.glb", 1, 9, 0, -2),
  moved("road-straight-7.glb", 7, 8, 0, 2),
  moved("road-bend-3.glb", 8, 8, 0, 2),
  moved("road-straight-7.glb", 8, 10, 1, -2),
  moved("road-straight-7.glb", 8, 11, 1, -2),
  moved("road-straight-7.glb", 8, 12, 1, -2),
  moved("road-straight-7.glb", 8, 13, 1, -2),
  moved("road-bend-3.glb", 8, 14, 3, -2),
  moved("road-straight-7.glb", 7, 14, 0, -2),
  moved("road-straight-7.glb", 6, 14, 0, -2),
  moved("road-straight-7.glb", 5, 14, 0, -2),
  moved("road-straight-7.glb", 4, 14, 0, -2),
  moved("road-straight-7.glb", 3, 14, 0, -2),
  moved("road-straight-7.glb", 2, 14, 0, -2),
  moved("road-straight-7.glb", 1, 14, 0, -2),
  moved("road-bend-3.glb", 0, 14, 2, -2),
  moved("road-straight-7.glb", 0, 13, 1, -2),
  moved("road-straight-7.glb", 0, 12, 1, -2),
  moved("road-straight-7.glb", 0, 11, 1, -2),
  moved("road-straight-7.glb", 0, 10, 1, -2),

  // Each ramp's ground end closes on its own, clear of the half-module road.
  ramp(4, 7, 3),
  tee(4, 6, 1),
  bend(4, 5, 1),
  bend(5, 5, 0),
  bend(5, 6, 3),
  ramp(4, 10, 1),
  straight(4, 11, 1),
  tee(4, 12, 1),
  bend(4, 13, 2),
  bend(5, 13, 3),
  bend(5, 12, 0),

  // Water bridge, ramps up to the deck and back down, closed by a side road.
  bend(11, 0, 0),
  straight(10, 0, 0),
  bend(9, 0, 1),
  straight(9, 1, 1),
  straight(9, 2, 1),
  straight(9, 3, 1),
  straight(9, 4, 1),
  straight(9, 5, 1),
  bend(9, 6, 2),
  straight(10, 6, 0),
  bend(11, 6, 3),
  straight(11, 5, 1),
  ramp(11, 4, 1),
  water(11, 2, 0),
  ramp(11, 1, 3),
];

const errors = checkRoads(pieces);
if (errors.length) {
  const lines = errors.map((error) => {
    const where = `${error.gx},${error.gz}`;
    const side = error.side ? ` ${error.side} ${error.socket}/${error.got || "-"}` : "";
    return `${error.kind} ${error.file || ""} ${where}${side}`;
  });
  console.log(lines.join("\n"));
  console.error(`edge errors ${errors.length}`);
  process.exit(1);
}

let maxX = 0;
let maxZ = 0;
for (const piece of pieces) {
  maxX = Math.max(maxX, piece.x);
  maxZ = Math.max(maxZ, piece.z);
}
const cols = maxX + 14;
const rows = maxZ + 14;
const ground = Array.from({ length: rows }, () => Array(cols).fill("l"));
for (let z = 2 * 4 + 1; z <= 3 * 4 + 3; z += 1) {
  for (let x = 11 * 4; x <= 11 * 4 + 4; x += 1) ground[z][x] = "~";
}

const map = {
  cols,
  rows,
  tile: 48,
  roadtest: true,
  spawn: { x: 4 * 4 + 2, z: 4 * 1 + 2 },
  views: [
    { name: "Straight", x: 4 * 4 + 2, z: 4 * 1 + 2 },
    { name: "Stop", x: 4 * 2 + 2, z: 4 * 1 + 2 },
    { name: "Bend", x: 4 * 1 + 2, z: 4 * 1 + 2 },
    { name: "Tee", x: 4 * 3 + 2, z: 4 * 1 + 2 },
    { name: "Cross", x: 4 * 3 + 2, z: 4 * 2 + 2 },
    { name: "Split", x: 4 * 2 + 2, z: 4 * 8 + 4 },
    { name: "Overpass", x: 4 * 4 + 2, z: 4 * 8 + 4 },
    { name: "Water bridge", x: 4 * 11 + 2, z: 4 * 2 + 4 },
  ],
  buildings: [],
  ground: ground.map((row) => row.join("")),
};

writeFileSync(new URL("../roadtest-map.json", import.meta.url), `${JSON.stringify({ pieces, removedRoads: [] }, null, 2)}\n`);
writeFileSync(new URL("../data/roadtest.json", import.meta.url), JSON.stringify(map));
console.log(`roadtest pieces ${pieces.length}, cols ${cols}, rows ${rows}, edge errors 0`);
