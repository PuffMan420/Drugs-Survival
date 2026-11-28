// Pure rules for cop cars (js/cop-cars.js). Runs in node, no three.js.
import assert from "node:assert/strict";
import { MAX_COPS, OFFSCREEN_MARGIN } from "../js/police.js";
import {
  desiredCopCars, copCarsFor, parseCopCarsFlag, parseStarsFlag, parseFpsFlag,
  stepCooldown, canRam, ramEffect, crewShouldExit, crewRoom, crewSpots, spawnRadius,
  circleHitsCar, carsOverlap, snapHeading, roadblockSpot, roadblockGone, headingOf,
  COP_CAR_MIN_STARS, COP_CARS_PER_STAR, MAX_COP_CARS, COP_CAR_SPEED, COP_CAR_RAM_DAMAGE,
  COP_CAR_RAM_COOLDOWN, COP_CAR_EXIT_RANGE, COP_CAR_CREW, COP_CAR_SPAWN_GAP,
  ROADBLOCK_MIN_STARS, ROADBLOCK_CARS, ROADBLOCK_AHEAD, ROADBLOCK_COOLDOWN,
  COP_CAR_TOP_SPEED, SEDAN_TOP_SPEED, COP_RAM_MIN_SPEED, COP_EXIT_STOP_SPEED, COP_CARS_FLAG_MAX,
  roadField, turnSpeedCap, ROAD_CELL,
} from "../js/cop-cars.js";

// Loke's numbers, as he wrote them.
assert.equal(COP_CAR_MIN_STARS, 3);
assert.equal(COP_CARS_PER_STAR, 1);
assert.equal(MAX_COP_CARS, 2);
assert.equal(COP_CAR_SPEED, 1.05);
assert.equal(COP_CAR_RAM_DAMAGE, 15);
assert.equal(COP_CAR_RAM_COOLDOWN, 1.5);
assert.equal(COP_CAR_EXIT_RANGE, 120);
assert.equal(COP_CAR_CREW, 2);
assert.equal(COP_CAR_SPAWN_GAP, 4);
assert.equal(ROADBLOCK_MIN_STARS, 5);
assert.equal(ROADBLOCK_CARS, 2);
assert.equal(ROADBLOCK_AHEAD, 400);
assert.equal(ROADBLOCK_COOLDOWN, 30);

// Cars per star: 0,0,0,1,2,2 for 0..5 stars.
assert.deepEqual([0, 1, 2, 3, 4, 5].map(desiredCopCars), [0, 0, 0, 1, 2, 2]);
// copCarsFor with the default cap is desiredCopCars; half stars round down.
assert.deepEqual([0, 1, 2, 3, 4, 5].map((s) => copCarsFor(s)), [0, 0, 0, 1, 2, 2]);
assert.equal(copCarsFor(3.5), 1);
assert.equal(copCarsFor(2.99), 0);
// ?copcars=N override: same steps, new cap.
assert.deepEqual([0, 1, 2, 3, 4, 5].map((s) => copCarsFor(s, 0)), [0, 0, 0, 0, 0, 0]);
assert.deepEqual([0, 1, 2, 3, 4, 5].map((s) => copCarsFor(s, 1)), [0, 0, 0, 1, 1, 1]);
assert.deepEqual([0, 1, 2, 3, 4, 5].map((s) => copCarsFor(s, 8)), [0, 0, 0, 1, 2, 3]);

// Speed: 1.05 x sedan; a sports car (1.16 x) can escape.
assert.equal(COP_CAR_TOP_SPEED, SEDAN_TOP_SPEED * 1.05);
assert.ok(SEDAN_TOP_SPEED * 1.16 > COP_CAR_TOP_SPEED);

// Flags: off by default, clamped.
assert.equal(parseCopCarsFlag(""), null);
assert.equal(parseCopCarsFlag("?copcars=4"), 4);
assert.equal(parseCopCarsFlag("?copcars=99"), COP_CARS_FLAG_MAX);
assert.equal(parseCopCarsFlag("?copcars=-2"), 0);
assert.equal(parseCopCarsFlag("?copcars=abc"), null);
assert.equal(parseStarsFlag("?fx=off"), null);
assert.equal(parseStarsFlag("?stars=3"), 3);
assert.equal(parseStarsFlag("?stars=9"), 5);
assert.equal(parseFpsFlag(""), false);
assert.equal(parseFpsFlag("?fps=1"), true);
assert.equal(parseFpsFlag("?fps=0"), false);
assert.equal(parseFpsFlag(new URLSearchParams("fps=1&stars=5")), true);

// Ram cooldown.
assert.equal(stepCooldown(1.5, 0.5), 1);
assert.equal(stepCooldown(0.2, 0.5), 0);
assert.equal(canRam(0, COP_RAM_MIN_SPEED), true);
assert.equal(canRam(0, COP_RAM_MIN_SPEED - 1), false);
assert.equal(canRam(0.01, 200), false);
let cd = COP_CAR_RAM_COOLDOWN;
for (let i = 0; i < 89; i += 1) cd = stepCooldown(cd, 1 / 60);
assert.equal(canRam(cd, 100), false); // 89 frames < 1.5 s
cd = stepCooldown(cd, 1 / 60 + 1e-9);
assert.equal(canRam(cd, 100), true);
// On foot the player takes it, in a car the car takes it.
assert.deepEqual(ramEffect(false), { target: "player", damage: 15, cooldown: 1.5 });
assert.deepEqual(ramEffect(true), { target: "car", damage: 15, cooldown: 1.5 });

// Crew exit: stopped, in range, once.
assert.equal(crewShouldExit(COP_CAR_EXIT_RANGE, 0, false), true);
assert.equal(crewShouldExit(COP_CAR_EXIT_RANGE + 1, 0, false), false);
assert.equal(crewShouldExit(50, COP_EXIT_STOP_SPEED + 1, false), false);
assert.equal(crewShouldExit(50, 0, true), false);
// Crew counts toward MAX_COPS.
assert.equal(MAX_COPS, 4);
assert.equal(crewRoom(0), 2);
assert.equal(crewRoom(3), 1);
assert.equal(crewRoom(4), 0);
assert.equal(crewRoom(9), 0);
const spots = crewSpots({ x: 100, z: 100, angle: 0, w: 36, h: 70 });
assert.equal(spots.length, COP_CAR_CREW);
// Angle 0 faces -Z, so the doors are on the x sides.
assert.ok(Math.abs(spots[0].z - 100) < 1e-9 && Math.abs(spots[1].z - 100) < 1e-9);
assert.ok(Math.abs(Math.abs(spots[0].x - 100) - 32) < 1e-9);

// Spawn radius: half-diagonal plus OFFSCREEN_MARGIN.
assert.equal(spawnRadius(300, 400), 500 + OFFSCREEN_MARGIN);

// Contacts.
const car = { x: 0, z: 0, angle: 0, w: 36, h: 70 };
assert.equal(circleHitsCar(car, 0, 0), true);
assert.equal(circleHitsCar(car, 0, -(70 * 1.1) / 2 - 10), true);
assert.equal(circleHitsCar(car, 0, -(70 * 1.1) / 2 - 20), false);
assert.equal(carsOverlap(car, { x: 30, z: 0, angle: 0, w: 36, h: 70 }), true);
assert.equal(carsOverlap(car, { x: 60, z: 0, angle: 0, w: 36, h: 70 }), false);
// Turned 90 degrees: its long side now reaches 35 along x.
assert.equal(carsOverlap(car, { x: 52, z: 0, angle: Math.PI / 2, w: 36, h: 70 }), true);

// Heading convention: angle 0 faces -Z.
assert.ok(Math.abs(headingOf(0, -1)) < 1e-9);
assert.ok(Math.abs(snapHeading(0.3)) < 1e-9);
assert.ok(Math.abs(snapHeading(1.3) - Math.PI / 2) < 1e-9);

// Roadblock on a straight north-south road 96 wide (x 0..96), player heading north (-Z).
const isRoad = (x, z) => x >= 0 && x <= 96 && z > -2000 && z < 2000;
const spot = roadblockSpot(40, 0, 0.1, isRoad);
assert.ok(spot);
assert.ok(Math.abs(spot.z + ROADBLOCK_AHEAD) < 1e-9); // 400 ahead
assert.ok(Math.abs(spot.x - 48) <= 4); // centred on the road
assert.equal(spot.cars.length, ROADBLOCK_CARS);
for (const c of spot.cars) assert.ok(Math.abs(Math.abs(c.angle) - Math.PI / 2) < 1e-9); // across the road
// Road ends 350 ahead: the closest road spot is used, not behind 300.
const shortRoad = (x, z) => x >= 0 && x <= 96 && z > -350 && z < 2000;
const near = roadblockSpot(40, 0, 0, shortRoad);
assert.ok(near && near.along <= 350 && near.along >= 300);
// No road ahead at all: no roadblock.
assert.equal(roadblockSpot(40, 0, 0, (x, z) => z > -10), null);
// Gone once off-screen behind; stays while ahead or on screen.
const block = { x: 48, z: -400 };
assert.equal(roadblockGone(block, 48, 0, 0, 600), false); // ahead, on screen
assert.equal(roadblockGone(block, 48, 300, 0, 600), false); // 700 away but ahead
assert.equal(roadblockGone(block, 48, -1100, 0, 600), true); // passed it, off-screen behind
assert.equal(roadblockGone(block, 48, -800, 0, 600), false); // passed it, still on screen
assert.equal(roadblockGone(null, 0, 0, 0, 600), true);

// Road map: an L-shaped road (x 0..64 going north, then z -640..-576 going east).
const lRoad = (x, z) => (x >= 0 && x < 64 && z > -640 && z < 64) || (z >= -640 && z < -576 && x >= 0 && x < 640);
const field = roadField(lRoad, 32, 32, 40);
assert.equal(field.at(32, 32), 0);
assert.equal(field.at(400, 0), -1); // not road
assert.ok(field.at(600, -600) > field.at(32, -600)); // the far end is farther by road
// From the far end of the east arm, the next step goes west (toward the corner).
const step = field.next(600, -600);
assert.ok(step && step.x < 600);
// Away mode steps the other way.
const back = field.next(300, -600, true);
assert.ok(back && back.x > 300);
// Player off the road (on the pavement next to it): the nearest road cell is used.
const side = roadField(lRoad, 80, 0, 40);
assert.ok(side.reached > 0 && side.at(48, 16) >= 0 && side.at(48, 16) <= 1);
// No road anywhere near: nothing reached, next() is null.
const none = roadField(() => false, 0, 0, 10);
assert.equal(none.reached, 0);
assert.equal(none.next(0, 0), null);
assert.equal(ROAD_CELL, 32);

// Turning cap: straight ahead is full speed, a target off to the side close by is slow.
assert.equal(turnSpeedCap(200, 0, 2.4, 189), 189);
assert.ok(turnSpeedCap(60, Math.PI / 2, 2.4, 189) < 100);
assert.ok(turnSpeedCap(60, Math.PI / 2, 2.4, 189) >= 30);

console.log("cop cars tests passed");
