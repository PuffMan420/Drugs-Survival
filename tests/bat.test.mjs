import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  BAT_BLOOD_HOLD,
  BAT_EULER,
  BAT_GRIME_FADE,
  BAT_HAND,
  BAT_HIT,
  BAT_REACH,
  BAT_RUN_SPAN,
  BAT_RUN_START,
  BAT_SCALE,
  BAT_SIDE,
  BAT_SWING,
  batBarrelAxis,
  batEaseIn,
  batHits,
  batHoldPose,
  freshBatWear,
  meleePlaybackRate,
  stepBatWear,
} from "../js/bat.js";

test("the fade starts slowly and finishes at grime", () => {
  assert.equal(batEaseIn(0), 0);
  assert.equal(batEaseIn(1), 1);
  assert.equal(batEaseIn(0.5), 0.5);
  assert.ok(batEaseIn(0.2) < 0.2);
  assert.ok(batEaseIn(0.05) < 0.01);
});

test("a kill holds blood for 5s, eases across 10s, then stays grime", () => {
  assert.equal(BAT_BLOOD_HOLD, 5);
  assert.equal(BAT_GRIME_FADE, 10);
  let wear = freshBatWear();
  assert.equal(wear.stage, "clean");
  wear = stepBatWear(wear, 30, false);
  assert.equal(wear.stage, "clean");
  wear = stepBatWear(wear, 1, true);
  assert.deepEqual(wear, { stage: "blood", clock: 0, mix: 0 });
  wear = stepBatWear(wear, 4, false);
  assert.deepEqual(wear, { stage: "blood", clock: 4, mix: 0 });
  wear = stepBatWear(wear, 1, false);
  assert.deepEqual(wear, { stage: "fade", clock: 0, mix: 0 });
  wear = stepBatWear(wear, 1, false);
  assert.equal(wear.stage, "fade");
  assert.equal(wear.clock, 1);
  assert.ok(wear.mix < 0.05);
  const early = wear.mix;
  wear = stepBatWear(wear, 4, false);
  assert.ok(wear.mix > early);
  assert.ok(wear.mix < 1);
  wear = stepBatWear({ stage: "fade", clock: 9, mix: 0 }, 1, false);
  assert.deepEqual(wear, { stage: "grime", clock: 0, mix: 1 });
  wear = stepBatWear(wear, 4, true);
  assert.equal(wear.stage, "grime");
  assert.equal(wear.mix, 1);
});

test("another kill before grime restarts the blood hold", () => {
  const fading = stepBatWear({ stage: "fade", clock: 6, mix: 0.5 }, 0.2, true);
  assert.deepEqual(fading, { stage: "blood", clock: 0, mix: 0 });
  const jumped = stepBatWear({ stage: "blood", clock: 0, mix: 0 }, 20, false);
  assert.equal(jumped.stage, "grime");
});

test("the swing reaches one tile in front and misses the side and the back", () => {
  assert.equal(BAT_HIT, 0.5);
  assert.equal(BAT_SWING, 1.5);
  assert.equal(BAT_REACH, 48);
  assert.equal(BAT_SIDE, 18);
  assert.equal(BAT_SCALE, 0.024);
  assert.equal(batHits(0, 0, 0, 1, 0, 40), true);
  assert.equal(batHits(0, 0, 0, 1, 10, 40), true);
  assert.equal(batHits(0, 0, 0, 1, 19, 40), false);
  assert.equal(batHits(0, 0, 0, 1, 0, 49), false);
  assert.equal(batHits(0, 0, 0, 1, 0, -5), false);
  assert.equal(batHits(10, 20, 1, 0, 50, 20), true);
});

test("the bat file is a mesh without the source texture path", () => {
  const data = readFileSync(new URL("../assets/bat/bat.glb", import.meta.url));
  const jsonLength = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
  assert.equal(doc.asset.version, "2.0");
  assert.equal(JSON.stringify(doc).includes("/Users/"), false);
  assert.equal(doc.images, undefined);
  assert.equal(doc.nodes[0].mesh, 0);
  assert.equal(doc.nodes[0].matrix, undefined);
  assert.equal(doc.accessors[0].count, 181);
});

function pngSize(url) {
  const data = readFileSync(url);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function unit(v) {
  const len = Math.hypot(...v);
  return v.map((n) => n / len);
}

test("the knob stays in the fist and the barrel leaves through the thumb", () => {
  assert.deepEqual(BAT_HAND, [0, 0.205, -0.089]);
  assert.equal(BAT_EULER.length, 3);
  const axis = batBarrelAxis();
  assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-6);
  assert.ok(axis[0] < -0.99, `thumb side ${axis}`);
  assert.ok(Math.abs(axis[1]) < 1e-6 && Math.abs(axis[2]) < 1e-6);
});

test("idle and jog point the barrel up, and a sprint lets it hang", () => {
  assert.equal(BAT_RUN_START, 1.12);
  assert.equal(BAT_RUN_SPAN, 0.22);
  const carry = batHoldPose(-1, 0);
  const jog = batHoldPose(-1, 1);
  assert.deepEqual(jog, carry);
  const barrel = unit(carry.barrel);
  assert.ok(barrel[1] > 0.7, `up ${barrel}`);
  assert.ok(barrel[0] > 0, `out to his right ${barrel}`);
  assert.ok(carry.hand[0] > 0.2, "right hip");
  const hang = unit(batHoldPose(-1, 1.4).barrel);
  assert.ok(hang[1] < -0.7, `down ${hang}`);
  assert.ok(hang[2] > 0.3, `forward ${hang}`);
  const mid = batHoldPose(-1, BAT_RUN_START + BAT_RUN_SPAN / 2);
  assert.ok(mid.barrel[1] < carry.barrel[1]);
  assert.ok(mid.barrel[1] > batHoldPose(-1, 1.4).barrel[1]);
});

test("the sword clip owns the swing, and the hold pose stays put", () => {
  assert.equal(BAT_SWING, 1.5);
  assert.ok(BAT_HIT > 0 && BAT_HIT < BAT_SWING);
  const carry = batHoldPose(-1, 0);
  assert.deepEqual(batHoldPose(0, 0).barrel, carry.barrel);
  assert.deepEqual(batHoldPose(BAT_HIT, 0).hand, carry.hand);
  assert.deepEqual(batHoldPose(BAT_SWING, 0).barrel, carry.barrel);
});

test("a melee hit stays within five percent of normal pitch", () => {
  assert.equal(meleePlaybackRate(0), 0.95);
  assert.equal(meleePlaybackRate(0.5), 1);
  assert.equal(meleePlaybackRate(1), 1.05);
  assert.equal(meleePlaybackRate(-2), 0.95);
  assert.equal(meleePlaybackRate(4), 1.05);
});

test("the melee hit sound is the darker clip", () => {
  const data = readFileSync(new URL("../assets/sound/melee-hit.ogg", import.meta.url));
  assert.equal(data.subarray(0, 4).toString("utf8"), "OggS");
  assert.equal(createHash("sha256").update(data).digest("hex"),
    "6a8cca996d54163ea47e29a16e8eca35ea17455a689514844e095bf2a624fef6");
});

test("the three bat textures are 512 square", () => {
  for (const name of ["clean.png", "blood.png", "grime.png"]) {
    assert.deepEqual(pngSize(new URL(`../assets/bat/${name}`, import.meta.url)), [512, 512]);
  }
});
