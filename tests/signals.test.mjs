// Junction timers and the stop line in front of a red or yellow light.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { headingAngle, createSim } from "../js/routes.js";
import { TILE } from "../js/constants.js";
import { junctionKind } from "../js/built-lanes.js";
import {
  SIGNAL_ALL_RED,
  SIGNAL_GREEN,
  SIGNAL_YELLOW,
  detectJunctions,
  facingAxis,
  linkSignal,
  pedPhase,
  phaseAt,
  setSignalTime,
  SIGNAL_STOP_INSET,
  signalApproach,
  signalPeriod,
  signalSpeedCap,
} from "../js/signals.js";

const STEP = 1 / 60;
const BRAKE = 180;
const HALF = SIGNAL_GREEN + SIGNAL_YELLOW + SIGNAL_ALL_RED;

test("the two axes alternate green, yellow, and a short all-red", () => {
  assert.equal(SIGNAL_GREEN, 6);
  assert.equal(SIGNAL_YELLOW, 2);
  assert.ok(SIGNAL_ALL_RED > 0 && SIGNAL_ALL_RED < SIGNAL_YELLOW);
  assert.equal(signalPeriod(), HALF * 2);

  assert.deepEqual(phaseAt(0), { x: "green", z: "red" });
  assert.deepEqual(phaseAt(SIGNAL_GREEN - 0.01), { x: "green", z: "red" });
  assert.deepEqual(phaseAt(SIGNAL_GREEN), { x: "yellow", z: "red" });
  assert.deepEqual(phaseAt(SIGNAL_GREEN + SIGNAL_YELLOW - 0.01), { x: "yellow", z: "red" });
  assert.deepEqual(phaseAt(SIGNAL_GREEN + SIGNAL_YELLOW), { x: "red", z: "red" });
  assert.deepEqual(phaseAt(HALF - 0.01), { x: "red", z: "red" });
  assert.deepEqual(phaseAt(HALF), { x: "red", z: "green" });
  assert.deepEqual(phaseAt(HALF + SIGNAL_GREEN), { x: "red", z: "yellow" });
  assert.deepEqual(phaseAt(HALF + SIGNAL_GREEN + SIGNAL_YELLOW), { x: "red", z: "red" });
  assert.deepEqual(phaseAt(signalPeriod()), { x: "green", z: "red" });
  assert.deepEqual(phaseAt(3, HALF), { x: "red", z: "green" });
});

test("a pedestrian lamp is the opposite of the car lamp on its axis", () => {
  assert.equal(pedPhase("green"), "red");
  assert.equal(pedPhase("yellow"), "red");
  assert.equal(pedPhase("red"), "green");
});

test("crossroads and intersections are junctions, curves are not", () => {
  assert.equal(junctionKind("road-crossroad-3.glb"), true);
  assert.equal(junctionKind("road-intersection-3.glb"), true);
  assert.equal(junctionKind("road-intersection-path.glb"), true);
  assert.equal(junctionKind("road-curve-intersection-3.glb"), false);
  assert.equal(junctionKind("road-straight-7.glb"), false);

  const pieces = [
    { kit: "roads", file: "road-straight-7.glb", x: 2, z: 2, turn: 0, scale: 1 },
    { kit: "roads", file: "road-curve-intersection-3.glb", x: 6, z: 2, turn: 0, scale: 1 },
    { kit: "roads", file: "road-crossroad-3.glb", x: 10, z: 20, turn: 1, scale: 1 },
    { kit: "roads", file: "road-intersection-3.glb", x: 30, z: 20, turn: 0, scale: 2 },
  ];
  const junctions = detectJunctions(pieces);
  assert.equal(junctions.length, 2);
  assert.equal(junctions[0].x, 10.5 * TILE);
  assert.equal(junctions[0].z, 20.5 * TILE);
  assert.equal(junctions[0].half, 2 * TILE);
  assert.equal(junctions[1].half, 4 * TILE);
  assert.ok(junctions[0].offset !== junctions[1].offset || junctions[0].x === junctions[1].x);

  const island = JSON.parse(readFileSync(new URL("../island-map.json", import.meta.url), "utf8"));
  assert.ok(detectJunctions(island.pieces).length > 10);
});

test("a placed light takes the nearest junction and the axis it faces", () => {
  const junctions = [
    { id: 0, x: 0, z: 0, half: 96, offset: 0 },
    { id: 1, x: 400, z: 0, half: 96, offset: 3 },
  ];
  const near = linkSignal({ x: 1, z: 1, turn: 0 }, junctions);
  assert.equal(near.junction.id, 0);
  assert.equal(near.axis, "x");
  assert.equal(facingAxis(1), "z");
  assert.equal(facingAxis(2), "x");
  assert.equal(facingAxis(3), "z");
  const far = linkSignal({ x: 8, z: 0, turn: 1 }, junctions);
  assert.equal(far.junction.id, 1);
  assert.equal(far.axis, "z");
});

test("a car that cannot brake is not given a stop cap", () => {
  assert.equal(signalSpeedCap(120, 10, BRAKE), null);
  const room = 100;
  const cap = signalSpeedCap(30, room, BRAKE);
  assert.ok(Math.abs(cap - Math.sqrt(2 * BRAKE * room)) < 1e-6);
  assert.equal(signalSpeedCap(0, 0, BRAKE), 0);
});

function northPlan(offset = 0) {
  const north = { pts: [{ x: 1000, z: 3000 }, { x: 1000, z: 0 }], seg: [3000], len: 3000, to: 1 };
  return {
    nodes: [
      { index: 0, x: 1000, z: 3000, tx: 20, tz: 62, exits: [north] },
      { index: 1, x: 1000, z: 0, tx: 20, tz: 0, exits: [] },
    ],
    parked: [],
    buckets: new Map(),
    poseFits: () => true,
    junctions: [{ id: 0, x: 1000, z: 1500, half: 96, offset }],
  };
}

function driver(dist, extra = {}) {
  return {
    id: 1,
    model: 0,
    w: 36,
    h: 70,
    x: 1000,
    z: 3000 - dist,
    angle: headingAngle(0, -1),
    speed: 0,
    cruise: 120,
    node: 0,
    exit: 0,
    dist,
    wait: 0,
    y: null,
    alive: true,
    blocked: false,
    arc: null,
    commit: null,
    ...extra,
  };
}

function run(sim, seconds, cam) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    sim.step(STEP, cam.x, cam.z, cam.x + 200, cam.z + 200);
  }
}

test("opposite faces share a street, and that street's pedestrian lamp is the opposite", () => {
  assert.equal(facingAxis(0), "x");
  assert.equal(facingAxis(2), "x");
  assert.equal(facingAxis(1), "z");
  assert.equal(facingAxis(3), "z");
  for (let t = 0; t < signalPeriod(); t += 0.5) {
    const phase = phaseAt(t, 0);
    const xMoving = phase.x === "green" || phase.x === "yellow";
    const zMoving = phase.z === "green" || phase.z === "yellow";
    assert.equal(xMoving && zMoving, false);
    assert.equal(pedPhase(phase.x), phase.x === "red" ? "green" : "red");
    assert.equal(pedPhase(phase.z), phase.z === "red" ? "green" : "red");
  }
});

test("a car that can brake stops at the bar before the crossing", () => {
  setSignalTime(0);
  const half = 96;
  const edge = 1500 + half;
  const line = edge + SIGNAL_STOP_INSET * half * 2;
  const nose = 35;
  const ahead = signalApproach({
    x: 1000,
    z: 1800,
    hx: 0,
    hz: -1,
    length: 70,
  }, [{ id: 0, x: 1000, z: 1500, half, offset: 0 }], 0);
  assert.equal(ahead.axis, "z");
  assert.equal(ahead.stop, true);
  assert.ok(Math.abs(ahead.gap - (1800 - line - nose)) < 1e-6);

  const sim = createSim(northPlan(0), [], () => 0);
  const holding = driver(3000 - 1800, { speed: 80 });
  sim.drivers.push(holding);
  run(sim, 4, { x: holding.x, z: holding.z });
  assert.ok(holding.speed < 5, `still moving at ${holding.speed}`);
  assert.ok(Math.abs(holding.z - (line + nose)) < 6, `stopped at z ${holding.z}, bar is ${line}`);
  assert.equal(holding.blocked, true);
});

test("a car inside the crossing clears, including one whose heading has swung", () => {
  setSignalTime(0);
  const junction = { id: 0, x: 1000, z: 1500, half: 96, offset: 0 };
  assert.equal(signalApproach({
    x: 1000,
    z: 1500,
    hx: 1,
    hz: -0.2,
    length: 70,
  }, [junction], 0), null);

  const through = createSim(northPlan(0), [], () => 0);
  const inside = driver(3000 - 1500, { speed: 80, angle: headingAngle(1, -0.2) });
  through.drivers.push(inside);
  const startZ = inside.z;
  run(through, 1, { x: inside.x, z: inside.z });
  assert.ok(inside.z < startZ - 40, `inside car only reached z ${inside.z}`);
  assert.ok(inside.speed > 20, `inside car slowed to ${inside.speed}`);
});

test("a car too fast to brake enters on red, and green lets traffic through", () => {
  setSignalTime(0);
  const edge = 1500 + 96;
  const sim = createSim(northPlan(0), [], () => 0);
  const late = driver(3000 - 1650, { speed: 120, cruise: 120 });
  sim.drivers.push(late);
  run(sim, 1, { x: late.x, z: late.z });
  assert.ok(late.z < edge - 10, `fast car held at z ${late.z}`);

  setSignalTime(0);
  const open = createSim(northPlan(HALF), [], () => 0);
  const going = driver(3000 - 1800, { speed: 40, cruise: 120 });
  open.drivers.push(going);
  run(open, 3, { x: going.x, z: going.z });
  assert.ok(going.z < 1550, `green car held at z ${going.z}`);
  assert.ok(going.speed > 40, `green car slowed to ${going.speed}`);
});

test("green on the crossing axis does not stop that traffic", () => {
  setSignalTime(0);
  const east = { pts: [{ x: 0, z: 1500 }, { x: 3000, z: 1500 }], seg: [3000], len: 3000, to: 1 };
  const plan = {
    nodes: [
      { index: 0, x: 0, z: 1500, tx: 0, tz: 30, exits: [east] },
      { index: 1, x: 3000, z: 1500, tx: 60, tz: 30, exits: [] },
    ],
    parked: [],
    buckets: new Map(),
    poseFits: () => true,
    junctions: [{ id: 0, x: 1500, z: 1500, half: 96, offset: 0 }],
  };
  const sim = createSim(plan, [], () => 0);
  const car = driver(1200, {
    x: 1200,
    z: 1500,
    speed: 40,
    angle: headingAngle(1, 0),
  });
  sim.drivers.push(car);
  const approach = signalApproach({
    x: 1200,
    z: 1500,
    hx: 1,
    hz: 0,
    length: 70,
  }, plan.junctions, 0);
  assert.equal(approach.stop, false);
  assert.equal(approach.axis, "x");
  run(sim, 4, { x: car.x, z: car.z });
  assert.ok(car.x > 1550, `eastbound car held at x ${car.x}`);
});
