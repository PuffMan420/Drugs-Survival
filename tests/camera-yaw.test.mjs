import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_TURN_MAX,
  CAMERA_TURN_SPEED,
  CAMERA_YAW_MOUSE,
  CAMERA_YAW_PAUSE,
  CAR_VIEW,
  FOOT_VIEW,
} from "../js/constants.js";
import {
  createManualYaw,
  isTypingTarget,
  pointerDelta,
  wrapAngle,
} from "../js/camera-yaw.js";

test("foot view zooms out a little from 0.80, and the car view stays put", () => {
  assert.equal(FOOT_VIEW, 0.90);
  assert.equal(CAR_VIEW, 1.20);
  assert.ok(FOOT_VIEW > 0.80);
  assert.ok(FOOT_VIEW < 1.05);
});

test("auto-follow is 5× slower and the turn cap stays gentler than the old 0.35", () => {
  assert.equal(CAMERA_TURN_SPEED, 0.06);
  assert.equal(CAMERA_TURN_MAX, 0.07);
  assert.ok(CAMERA_TURN_MAX > CAMERA_TURN_SPEED);
});

test("wrapAngle keeps a turn on the shortest path around a circle", () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-12);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2) - 0) < 1e-12);
  assert.ok(Math.abs(wrapAngle(-Math.PI * 2) - 0) < 1e-12);
  assert.ok(wrapAngle(Math.PI + 0.2) < 0);
  assert.ok(wrapAngle(-Math.PI - 0.2) > 0);
});

test("isTypingTarget ignores Q when an input or textarea is focused", () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "CANVAS" }), false);
});

test("pointerDelta prefers movementX, then a clientX delta", () => {
  assert.equal(pointerDelta(12, 400, 300), 12);
  assert.equal(pointerDelta(0, 400, 300), 0);
  assert.equal(pointerDelta(undefined, 400, 300), 100);
  assert.equal(pointerDelta(NaN, 250, 200), 50);
  assert.equal(pointerDelta(undefined, 100, null), 0);
  assert.equal(pointerDelta(undefined, undefined, undefined), 0);
});

test("holding Q and moving the mouse turns yaw; releasing Q stops the turn", () => {
  const yaw = createManualYaw({ mouse: 0.01, pause: 2 });
  assert.equal(yaw.held, false);
  assert.equal(yaw.paused(0), false);
  assert.equal(yaw.applyMouse(0, 40), 0);

  assert.equal(yaw.press(), true);
  assert.equal(yaw.held, true);
  assert.equal(yaw.paused(1), true);
  const turned = yaw.applyMouse(0, 40);
  assert.ok(Math.abs(turned - 0.4) < 1e-12);

  assert.equal(yaw.release(10), true);
  assert.equal(yaw.held, false);
  assert.equal(yaw.applyMouse(turned, 40), turned);
});

test("auto-follow stays paused while Q is held and for 2 seconds after release", () => {
  const yaw = createManualYaw({ pause: CAMERA_YAW_PAUSE });
  yaw.press();
  assert.equal(yaw.paused(0), true);
  yaw.release(5);
  assert.equal(yaw.paused(5), true);
  assert.equal(yaw.paused(5 + CAMERA_YAW_PAUSE - 0.001), true);
  assert.equal(yaw.paused(5 + CAMERA_YAW_PAUSE), false);
  assert.equal(yaw.paused(8), false);
});

test("typing or build mode does not start a hold, and a second press is safe", () => {
  const yaw = createManualYaw();
  assert.equal(yaw.press({ typing: true }), false);
  assert.equal(yaw.held, false);
  assert.equal(yaw.press({ blocked: true }), false);
  assert.equal(yaw.held, false);
  assert.equal(yaw.press(), true);
  assert.equal(yaw.press(), true);
  assert.equal(yaw.held, true);
});

test("releasing Q twice, or without a hold, does not get stuck", () => {
  const yaw = createManualYaw({ pause: 2 });
  assert.equal(yaw.release(1), false);
  assert.equal(yaw.paused(1.5), false);
  yaw.press();
  assert.equal(yaw.release(3), true);
  assert.equal(yaw.release(3.1), false);
  assert.equal(yaw.held, false);
  assert.equal(yaw.paused(4), true);
});

test("window blur releases a held Q so the key cannot stick", () => {
  const yaw = createManualYaw({ pause: 2, mouse: 0.01 });
  yaw.press();
  const aimed = yaw.applyMouse(0, 20);
  assert.ok(aimed !== 0);
  assert.equal(yaw.blur(20), true);
  assert.equal(yaw.held, false);
  assert.equal(yaw.applyMouse(aimed, 80), aimed);
  assert.equal(yaw.paused(21), true);
  assert.equal(yaw.paused(22), false);
  assert.equal(yaw.blur(30), false);
});

test("mouse yaw wraps cleanly all the way around", () => {
  const yaw = createManualYaw({ mouse: CAMERA_YAW_MOUSE });
  yaw.press();
  let angle = 0;
  // A long swipe past a full turn should stay in (-π, π].
  angle = yaw.applyMouse(angle, 2000);
  assert.ok(angle > -Math.PI - 1e-9 && angle <= Math.PI + 1e-9);
  angle = yaw.applyMouse(angle, -4000);
  assert.ok(angle > -Math.PI - 1e-9 && angle <= Math.PI + 1e-9);
});

test("default mouse scale matches the tunable constant", () => {
  const yaw = createManualYaw();
  yaw.press();
  const turned = yaw.applyMouse(0, 10);
  assert.ok(Math.abs(turned - 10 * CAMERA_YAW_MOUSE) < 1e-12);
});
