import assert from "node:assert/strict";
import test from "node:test";
import {
  CYCLE_SECONDS,
  CYCLE_START_HOUR,
  MIN_ELEVATION_DEG,
  nightFactorAt,
  parseDayNight,
  sampleDayNight,
  stepCycleHour,
  wrapHour,
} from "../js/day-night.js";

const MIN_Y = Math.sin(MIN_ELEVATION_DEG * Math.PI / 180);

function dirLen(sample) {
  return Math.hypot(sample.dirX, sample.dirY, sample.dirZ);
}

test("sampleDayNight at midday is a high bright sun with no night factor", () => {
  const noon = sampleDayNight(12, {});
  assert.equal(noon.hour, 12);
  assert.ok(Math.abs(dirLen(noon) - 1) < 1e-6);
  assert.ok(noon.dirY > 0.7, `midday sun too low: ${noon.dirY}`);
  assert.ok(noon.sunIntensity >= 0.55);
  assert.ok(noon.nightFactor === 0);
  assert.ok(noon.glowScale < 0.5, "day headlights should stay dim");
  // Matches the familiar northwest daytime sun.
  assert.ok(Math.abs(noon.dirX - (-0.345)) < 0.02);
  assert.ok(Math.abs(noon.dirY - 0.794) < 0.02);
});

test("sampleDayNight at sunset is warm gold with long but safe shadows", () => {
  const sunset = sampleDayNight(18.5, {});
  assert.equal(sunset.hour, 18.5);
  assert.ok(Math.abs(dirLen(sunset) - 1) < 1e-6);
  assert.ok(sunset.dirY >= MIN_Y - 1e-9, `sunset elevation dipped below 25°: ${sunset.dirY}`);
  assert.ok(sunset.dirY < 0.55, "sunset should sit lower than midday");
  assert.ok(sunset.sunR > sunset.sunB + 0.2, "sunset sun should be warm / amber");
  assert.ok(sunset.fogR > sunset.fogB, "sunset fog should be warm");
  assert.ok(sunset.shadowFar > 5000, "sunset shadows need a longer shadow box");
  assert.ok(sunset.nightFactor > 0 && sunset.nightFactor < 1);
});

test("sampleDayNight at late night is cool moonlight and still readable", () => {
  const night = sampleDayNight(23, {});
  assert.equal(night.hour, 23);
  assert.ok(Math.abs(dirLen(night) - 1) < 1e-6);
  assert.ok(night.dirY >= MIN_Y - 1e-9, `moon dipped below 25°: ${night.dirY}`);
  assert.ok(night.nightFactor === 1);
  assert.ok(night.hemiSkyB > night.hemiSkyR, "night sky should be cool blue-slate");
  assert.ok(night.fogB >= night.fogR, "night fog should be cool");
  assert.ok(night.hemiIntensity >= 0.45, "night fill must keep the street readable");
  assert.ok(night.sunIntensity >= 0.18, "moon must still shape the street");
  assert.ok(night.glowScale > 1.2, "headlights should bloom at night");
  assert.ok(night.lampEmissive > 0.8);
});

test("sampleDayNight at dawn is a warm low sun that stays above 25°", () => {
  const dawn = sampleDayNight(6.5, {});
  assert.equal(dawn.hour, 6.5);
  assert.ok(dawn.dirY >= MIN_Y - 1e-9, `dawn dipped below 25°: ${dawn.dirY}`);
  assert.ok(dawn.sunR > dawn.sunB, "dawn should be warm");
  assert.ok(dawn.nightFactor < 0.5);
  assert.ok(dawn.dirX > 0, "dawn sun should come from the east");
});

test("hours wrap around the 24h clock", () => {
  assert.equal(wrapHour(24), 0);
  assert.equal(wrapHour(25), 1);
  assert.equal(wrapHour(-1), 23);
  assert.equal(wrapHour(18.5), 18.5);
  const a = sampleDayNight(0, {});
  const b = sampleDayNight(24, {});
  const c = sampleDayNight(-1, {});
  const d = sampleDayNight(23, {});
  assert.equal(a.hour, 0);
  assert.equal(b.hour, 0);
  assert.ok(Math.abs(a.dirY - b.dirY) < 1e-9);
  assert.ok(Math.abs(a.sunIntensity - b.sunIntensity) < 1e-9);
  assert.ok(Math.abs(c.nightFactor - d.nightFactor) < 1e-9);
  assert.ok(Math.abs(c.dirY - d.dirY) < 0.05);
});

test("nightFactor stays in [0, 1] across the day", () => {
  for (let h = 0; h <= 24; h += 0.25) {
    const value = nightFactorAt(h);
    assert.ok(value >= 0 && value <= 1, `nightFactor(${h}) = ${value}`);
    const sample = sampleDayNight(h, {});
    assert.equal(sample.nightFactor, value);
    assert.ok(sample.dirY >= MIN_Y - 1e-9, `hour ${h} elevation ${sample.dirY}`);
    assert.ok(Math.abs(dirLen(sample) - 1) < 1e-6);
  }
  assert.equal(nightFactorAt(12), 0);
  assert.equal(nightFactorAt(23), 1);
  assert.equal(nightFactorAt(0), 1);
});

test("?time= locks an hour and ?cycle=off freezes midday, without breaking ?look=", () => {
  assert.deepEqual(parseDayNight("?time=12"), { mode: "lock", hour: 12 });
  assert.deepEqual(parseDayNight("?time=18.5"), { mode: "lock", hour: 18.5 });
  assert.deepEqual(parseDayNight("?time=23"), { mode: "lock", hour: 23 });
  assert.deepEqual(parseDayNight("?time=25"), { mode: "lock", hour: 1 });
  assert.deepEqual(parseDayNight("?cycle=off"), { mode: "lock", hour: 12 });
  assert.deepEqual(parseDayNight("?cycle=off&time=23"), { mode: "lock", hour: 23 });
  assert.deepEqual(parseDayNight("?look=30"), { mode: "legacy", afternoon: false });
  assert.deepEqual(parseDayNight("?light=afternoon"), { mode: "legacy", afternoon: true });
  assert.deepEqual(parseDayNight("?look=50&light=afternoon"), { mode: "legacy", afternoon: true });
  assert.deepEqual(parseDayNight("?look=30&time=23"), { mode: "lock", hour: 23 });
  assert.deepEqual(parseDayNight(""), { mode: "cycle", hour: CYCLE_START_HOUR, duration: CYCLE_SECONDS });
  assert.deepEqual(parseDayNight("?fx=on"), { mode: "cycle", hour: CYCLE_START_HOUR, duration: CYCLE_SECONDS });
  assert.equal(CYCLE_SECONDS, 1440);
  assert.equal(CYCLE_START_HOUR, 11);
  const later = stepCycleHour(11, CYCLE_SECONDS / 24);
  assert.ok(Math.abs(later - 12) < 1e-9);
});

test("sampleDayNight reuses the same out object (no per-frame allocation)", () => {
  const out = sampleDayNight(12, {});
  const again = sampleDayNight(23, out);
  assert.equal(again, out);
  assert.equal(out.hour, 23);
});
