// Pins the phone frame so a touch screen fills the window without stretching,
// and a desktop window keeps the 16:9 letterbox and the original ground size.

import assert from "node:assert/strict";
import test from "node:test";
import { GROUND_H, GROUND_W } from "../js/constants.js";
import { clampStick, displayFrame, stickAxes, stickWish } from "../js/touch-ui.js";

test("desktop frame stays the 16:9 letterbox", () => {
  const wide = displayFrame(1920, 1080, false, GROUND_W, GROUND_H);
  assert.deepEqual(wide, { cssW: 1920, cssH: 1080, spanW: GROUND_W, spanH: GROUND_H });

  const tall = displayFrame(800, 1200, false, GROUND_W, GROUND_H);
  assert.equal(tall.cssW, 800);
  assert.equal(tall.cssH, 450);
  assert.equal(tall.spanW, GROUND_W);
  assert.equal(tall.spanH, GROUND_H);

  const odd = displayFrame(1366, 768, false, GROUND_W, GROUND_H);
  assert.equal(odd.cssW, 1365);
  assert.equal(odd.cssH, 768);
  assert.equal(odd.spanW, GROUND_W);
  assert.equal(odd.spanH, GROUND_H);
});

test("touch frame fills the window and keeps world units per pixel", () => {
  const landscape = displayFrame(844, 390, true, GROUND_W, GROUND_H);
  assert.equal(landscape.cssW, 844);
  assert.equal(landscape.cssH, 390);
  assert.ok(landscape.spanW > GROUND_W);
  assert.equal(landscape.spanH, GROUND_H);

  const portrait = displayFrame(390, 844, true, GROUND_W, GROUND_H);
  assert.equal(portrait.cssW, 390);
  assert.equal(portrait.cssH, 844);
  assert.equal(portrait.spanW, GROUND_W);
  assert.ok(portrait.spanH > GROUND_H);

  const exact = displayFrame(1600, 900, true, GROUND_W, GROUND_H);
  assert.equal(exact.cssW, 1600);
  assert.equal(exact.cssH, 900);
  assert.ok(Math.abs(exact.spanW - GROUND_W) < 1e-9);
  assert.ok(Math.abs(exact.spanH - GROUND_H) < 1e-9);
});

test("stick maps up to north and ignores a small nudge", () => {
  assert.deepEqual(stickAxes(0, -1), { KeyW: true, KeyS: false, KeyA: false, KeyD: false });
  assert.deepEqual(stickAxes(0, 1), { KeyW: false, KeyS: true, KeyA: false, KeyD: false });
  assert.deepEqual(stickAxes(-1, 0), { KeyW: false, KeyS: false, KeyA: true, KeyD: false });
  assert.deepEqual(stickAxes(1, 0), { KeyW: false, KeyS: false, KeyA: false, KeyD: true });
  assert.deepEqual(stickAxes(-0.8, -0.8), { KeyW: true, KeyS: false, KeyA: true, KeyD: false });
  assert.deepEqual(stickAxes(0.1, -0.1), { KeyW: false, KeyS: false, KeyA: false, KeyD: false });
});

test("a short stick push walks and a full push jogs", () => {
  assert.equal(stickWish(0, 0).gait, "idle");
  assert.equal(stickWish(0.1, -0.1).active, false);
  const walk = stickWish(0, -0.45);
  assert.equal(walk.gait, "walk");
  assert.equal(walk.active, true);
  assert.ok(Math.abs(walk.x) < 1e-9);
  assert.ok(Math.abs(walk.z + 1) < 1e-9);
  const jog = stickWish(0, -1);
  assert.equal(jog.gait, "jog");
  assert.ok(Math.abs(jog.z + 1) < 1e-9);
  const east = stickWish(1, 0);
  assert.equal(east.gait, "jog");
  assert.ok(Math.abs(east.x - 1) < 1e-9);
});

test("stick clamp stays inside the base", () => {
  const nudged = clampStick(10, -10, 40);
  assert.equal(nudged.x, 10);
  assert.equal(nudged.y, -10);
  const shoved = clampStick(80, 0, 40);
  assert.equal(shoved.x, 40);
  assert.equal(shoved.y, 0);
  assert.ok(Math.abs(shoved.nx - 1) < 1e-9);
});
