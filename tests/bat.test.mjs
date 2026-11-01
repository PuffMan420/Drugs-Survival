import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BAT_BLOOD_HOLD,
  BAT_GRIME_FADE,
  BAT_HIT,
  BAT_REACH,
  BAT_SCALE,
  BAT_SIDE,
  BAT_SWING,
  batEaseIn,
  batHits,
  freshBatWear,
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

test("the three bat textures are 512 square", () => {
  for (const name of ["clean.png", "blood.png", "grime.png"]) {
    assert.deepEqual(pngSize(new URL(`../assets/bat/${name}`, import.meta.url)), [512, 512]);
  }
});
