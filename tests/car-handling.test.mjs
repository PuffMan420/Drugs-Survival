// Per-class driving feel: every live roster model maps to a class, sedan
// stays the baseline, and sports / sedan / heavy keep a clear speed and weight order.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_HANDLING_CLASS,
  HANDLING,
  HANDLING_BY_FILE,
  HANDLING_BY_NAME,
  HANDLING_CLASSES,
  handlingClassFor,
  handlingFor,
} from "../js/car-handling.js";
import { createArcadeVehicle } from "../js/kenney-vehicle.js";

const STEP = 1 / 60;
const NUMERIC_FIELDS = [
  "SPEED",
  "THROTTLE_BLEND",
  "BRAKE_BLEND",
  "REVERSE_BLEND",
  "SPOOL",
  "OVERRUN",
  "STEER_CRAWL",
  "STEER_FAST",
  "STEER_FOLLOW",
  "DRIFT_ON",
  "DRIFT_OFF",
  "GRIP_ALIGN",
  "SLIDE_ALIGN",
  "MASS",
];

function rosterRows() {
  const src = readFileSync(new URL("../js/cars.js", import.meta.url), "utf8");
  return [...src.matchAll(/\{\s*name:\s*"([^"]+)",\s*file:\s*"([^"]+)"/g)].map(
    ([, name, file]) => ({ name, file }),
  );
}

function run(seconds, inputAt, vehicle) {
  let last = null;
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) last = vehicle.step(STEP, inputAt(i * STEP), true);
  return last;
}

function speedOf(frame) {
  return Math.hypot(frame.vx, frame.vz);
}

function slipOf(frame) {
  const heading = Math.atan2(-frame.vx, -frame.vz);
  let slip = heading - frame.yaw;
  while (slip > Math.PI) slip -= Math.PI * 2;
  while (slip < -Math.PI) slip += Math.PI * 2;
  return Math.abs(slip);
}

test("every live roster model resolves to an explicit, valid handling class", () => {
  const rows = rosterRows();
  assert.ok(rows.length >= 17, `roster only had ${rows.length} models`);
  const missing = [];
  for (const row of rows) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(HANDLING_BY_NAME, row.name),
      `no explicit class for name ${row.name}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(HANDLING_BY_FILE, row.file),
      `no explicit class for file ${row.file}`,
    );
    const byName = handlingClassFor({ name: row.name, file: row.file });
    const listed = HANDLING_BY_NAME[row.name];
    if (byName !== listed || !HANDLING_CLASSES.includes(listed)) missing.push(row.name);
    assert.equal(byName, listed);
    assert.equal(handlingFor(row.name), HANDLING[listed]);
  }
  assert.equal(missing.length, 0);
  // Name wins when the sprite reuses a heavier or lighter file.
  assert.equal(handlingClassFor({ name: "pickup", file: "truck" }), "suv");
  assert.equal(handlingClassFor({ name: "school_bus", file: "van" }), "heavy");
  assert.equal(handlingClassFor({ name: "swat_van", file: "suv" }), "van");
});

test("unknown models fall back to sedan, and bulky without a name is heavy", () => {
  assert.equal(DEFAULT_HANDLING_CLASS, "sedan");
  assert.equal(handlingClassFor(), "sedan");
  assert.equal(handlingClassFor(null), "sedan");
  assert.equal(handlingClassFor("mystery-wagon"), "sedan");
  assert.equal(handlingClassFor({ name: "ghost", file: "nope" }), "sedan");
  assert.equal(handlingClassFor({ bulky: true }), "heavy");
  assert.equal(handlingClassFor({ bulky: false }), "sedan");
  assert.equal(handlingClassFor("sports"), "sports");
  assert.equal(createArcadeVehicle().feel().handling, "sedan");
  assert.equal(createArcadeVehicle({ bulky: true }).feel().handling, "heavy");
  assert.equal(createArcadeVehicle({ handling: "sports" }).feel().handling, "sports");
  assert.equal(
    createArcadeVehicle({ car: { name: "supercar", file: "sedan-sports" } }).feel().handling,
    "sports",
  );
});

test("handling numbers stay positive and finite, with a clear sports > sedan > heavy order", () => {
  assert.deepEqual(HANDLING_CLASSES, [
    "sports",
    "police",
    "compact",
    "sedan",
    "suv",
    "van",
    "heavy",
  ]);
  for (const name of HANDLING_CLASSES) {
    const row = HANDLING[name];
    assert.equal(typeof row.BULKY, "boolean");
    for (const field of NUMERIC_FIELDS) {
      const value = row[field];
      assert.ok(Number.isFinite(value) && value > 0, `${name}.${field} = ${value}`);
    }
    assert.ok(row.DRIFT_ON > row.DRIFT_OFF, `${name} drift window`);
  }

  const sports = HANDLING.sports;
  const sedan = HANDLING.sedan;
  const heavy = HANDLING.heavy;
  assert.equal(sedan.SPEED, 1);
  assert.equal(sedan.THROTTLE_BLEND, 3.2);
  assert.equal(sedan.BRAKE_BLEND, 4.0);
  assert.equal(sedan.REVERSE_BLEND, 1.2);
  assert.equal(sedan.SPOOL, 2.0);
  assert.equal(sedan.OVERRUN, 4.2);
  assert.equal(sedan.STEER_CRAWL, 3.2);
  assert.equal(sedan.STEER_FAST, 2.8);
  assert.equal(sedan.STEER_FOLLOW, 1.15);
  assert.equal(sedan.DRIFT_ON, 166);
  assert.equal(sedan.DRIFT_OFF, 138);
  assert.equal(sedan.GRIP_ALIGN, 18);
  assert.equal(sedan.SLIDE_ALIGN, 0.8);
  assert.equal(sedan.MASS, 90);
  assert.equal(sedan.BULKY, false);

  assert.ok(sports.SPEED > sedan.SPEED);
  assert.ok(sedan.SPEED > heavy.SPEED);
  assert.ok(sports.THROTTLE_BLEND > sedan.THROTTLE_BLEND);
  assert.ok(sedan.THROTTLE_BLEND > heavy.THROTTLE_BLEND);
  assert.ok(sports.STEER_CRAWL > sedan.STEER_CRAWL);
  assert.ok(sedan.STEER_CRAWL > heavy.STEER_CRAWL);
  assert.ok(sports.STEER_FAST > sedan.STEER_FAST);
  assert.ok(sedan.STEER_FAST > heavy.STEER_FAST);
  assert.ok(heavy.MASS > sedan.MASS);
  assert.ok(sedan.MASS > sports.MASS);

  assert.ok(HANDLING.police.SPEED > sedan.SPEED);
  assert.ok(HANDLING.police.SPEED < sports.SPEED);
  assert.ok(HANDLING.police.BRAKE_BLEND > sedan.BRAKE_BLEND);
  assert.ok(HANDLING.compact.MASS < sedan.MASS);
  assert.ok(HANDLING.suv.MASS > sedan.MASS);
  assert.ok(HANDLING.van.MASS > HANDLING.suv.MASS);
  assert.ok(HANDLING.van.MASS < heavy.MASS);
  assert.ok(HANDLING.suv.SPEED < sedan.SPEED);
  assert.ok(HANDLING.van.SPEED < HANDLING.suv.SPEED);
  assert.ok(HANDLING.van.SPEED > heavy.SPEED);
  assert.equal(HANDLING.suv.BULKY, true);
  assert.equal(HANDLING.van.BULKY, true);
  assert.equal(HANDLING.heavy.BULKY, true);
  assert.equal(HANDLING.sports.BULKY, false);
  assert.equal(HANDLING.police.BULKY, false);
  assert.equal(HANDLING.compact.BULKY, false);
});

test("sports cruises faster than a sedan, and a heavy body stays slower but still useful", () => {
  const sedan = run(8, () => ({ forward: true }), createArcadeVehicle());
  const sports = run(8, () => ({ forward: true }), createArcadeVehicle({ handling: "sports" }));
  const heavy = run(8, () => ({ forward: true }), createArcadeVehicle({ handling: "heavy" }));
  const sedanSpeed = speedOf(sedan);
  const sportsSpeed = speedOf(sports);
  const heavySpeed = speedOf(heavy);
  assert.ok(sedanSpeed > 170 && sedanSpeed < 200, `sedan cruise ${sedanSpeed}`);
  assert.ok(sportsSpeed > sedanSpeed + 8, `sports ${sportsSpeed} vs sedan ${sedanSpeed}`);
  assert.ok(heavySpeed < sedanSpeed - 8, `heavy ${heavySpeed} vs sedan ${sedanSpeed}`);
  assert.ok(heavySpeed > 145, `heavy was too slow ${heavySpeed}`);
  assert.equal(sedan.handling, "sedan");
  assert.equal(sports.handling, "sports");
  assert.equal(heavy.handling, "heavy");
  assert.equal(heavy.bulky, true);
  assert.equal(sports.bulky, false);
});

test("a sports car can drift a little and still hooks up after a full lock", () => {
  const sports = createArcadeVehicle({ handling: "sports" });
  run(5, () => ({ forward: true }), sports);
  let smoked = false;
  let slipped = 0;
  let minSpeed = Infinity;
  for (let i = 0; i < 90; i += 1) {
    const frame = sports.step(STEP, { forward: true, right: true }, true);
    const speed = speedOf(frame);
    if (frame.emit) smoked = true;
    slipped = Math.max(slipped, slipOf(frame));
    if (speed < minSpeed) minSpeed = speed;
    assert.ok(Number.isFinite(speed) && Number.isFinite(frame.yaw), "sports spin left the finite range");
  }
  assert.ok(smoked, "sports never broke traction on a fast full lock");
  assert.ok(slipped > 0.4, `sports slip only ${slipped}`);
  assert.ok(minSpeed > 80, `sports slide collapsed (${minSpeed})`);
  const recovered = run(3, () => ({ forward: true }), sports);
  const recoveredSpeed = speedOf(recovered);
  assert.ok(recoveredSpeed > 160, `sports did not hook up (${recoveredSpeed})`);
  assert.ok(slipOf(recovered) < 0.2, `sports stayed sideways (${slipOf(recovered)})`);
});
