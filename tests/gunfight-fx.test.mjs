import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BLOOM_RADIANCE } from "../js/bloom-guard.js";
import { SHELL_GRAVITY, SHELL_LIFE, SHELL_SIZE, SHELL_SPEED, SHELL_UP } from "../js/game-feel.js";
import {
  ASPHALT_TOP,
  IMPACT_CONCRETE,
  IMPACT_FLESH,
  IMPACT_METAL,
  MAX_FX_CHANNEL,
  SHELL_BOUNCES,
  SHELL_COLOR_BRASS,
  SHELL_COLOR_SHOTGUN,
  SHELL_FADE,
  SHELL_KIND_SHOTGUN,
  SHOTGUN_SHELL_SIZE,
  SPARK_COLOR_CORE,
  SPARK_COLOR_HOT,
  TIRE_ABOVE_ASPHALT,
  asphaltTopY,
  bloomSafeChannel,
  bloomSafeColor,
  fleshStreaks,
  gunsmokeWisp,
  impactBurst,
  impactSpec,
  livingKnockOffset,
  ragdollKickFromShot,
  ragdollLinvel,
  shellColorFor,
  shellEjectVelocity,
  shellRadius,
  shellRestY,
  stepGunsmoke,
  stepImpactParticle,
  stepShellPhysics,
} from "../js/gunfight-fx.js";

function fixed(values) {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

test("shells bounce on the real asphalt top and linger before a gentle fade", () => {
  assert.equal(ASPHALT_TOP, 2.12);
  assert.equal(asphaltTopY(undefined), 2.12);
  assert.equal(asphaltTopY(2.27), 2.12);
  assert.ok(SHELL_SIZE[0] >= 1.6 && SHELL_SIZE[0] <= 2.2, `brass length ${SHELL_SIZE[0]} should be a small casing`);
  assert.ok(SHELL_SIZE[1] >= 0.45 && SHELL_SIZE[1] <= 0.6, `brass diameter ${SHELL_SIZE[1]} should be sleek`);
  assert.equal(SHOTGUN_SHELL_SIZE[0], 2.5);
  assert.equal(SHOTGUN_SHELL_SIZE[1], 0.75);
  const half = shellRadius(SHELL_SIZE);
  const floor = shellRestY(2.27, half);
  assert.ok(Math.abs(floor - (2.12 + half)) < 1e-9);

  const slot = {
    x: 0,
    y: floor + 8,
    z: 0,
    vx: 20,
    vy: -5,
    vz: 10,
    spin: 8,
    ry: 0,
    rz: 0,
    age: 0,
    bounces: 0,
    scale: 1,
    alive: true,
  };
  // Fall onto the asphalt and bounce, never sinking under the visual top.
  for (let i = 0; i < 240; i += 1) stepShellPhysics(slot, 1 / 60, floor, {
    life: SHELL_LIFE,
    fade: SHELL_FADE,
    gravity: SHELL_GRAVITY,
  });
  assert.ok(slot.bounces >= SHELL_BOUNCES);
  assert.ok(slot.y >= floor - 1e-6);
  assert.equal(slot.vy, 0);
  assert.equal(slot.alive, true);
  assert.ok(slot.age > 3, `shell should still be lingering, age=${slot.age}`);
  assert.equal(slot.scale, 1);

  slot.age = SHELL_LIFE - SHELL_FADE / 2;
  stepShellPhysics(slot, 0, floor, { life: SHELL_LIFE, fade: SHELL_FADE, gravity: SHELL_GRAVITY });
  assert.ok(slot.scale > 0.4 && slot.scale < 0.7);

  stepShellPhysics(slot, SHELL_FADE, floor, { life: SHELL_LIFE, fade: SHELL_FADE, gravity: SHELL_GRAVITY });
  assert.equal(slot.alive, false);
  assert.equal(slot.scale, 0);
});

test("brass and red shotgun hulls eject out of the port with a visible arc", () => {
  assert.equal(SHELL_COLOR_BRASS, 0xd9b44a);
  assert.equal(shellColorFor("brass"), SHELL_COLOR_BRASS);
  assert.equal(shellColorFor(SHELL_KIND_SHOTGUN), SHELL_COLOR_SHOTGUN);
  const vel = shellEjectVelocity(0, 1, fixed([0.5, 0.5, 0.5]), SHELL_SPEED, SHELL_UP);
  // Aim is +Z, so casings fly out to the right (-X) and a little backward.
  assert.ok(vel.vx < 0);
  assert.ok(vel.vz < 0);
  assert.ok(vel.vy > 30);
  const flew = { x: 0, y: 20, z: 0, ...vel, age: 0, bounces: 0, ry: 0, rz: 0 };
  stepShellPhysics(flew, 0.1, shellRestY(2.27, 1), { gravity: SHELL_GRAVITY, life: SHELL_LIFE });
  assert.ok(flew.x < 0);
  assert.ok(flew.y !== 20);
});

test("bullet impact sparks and dust use finite bloom-safe colors and change by surface", () => {
  assert.equal(MAX_FX_CHANNEL, MAX_BLOOM_RADIANCE);
  assert.equal(bloomSafeChannel(Number.NaN), 0);
  assert.equal(bloomSafeChannel(Infinity), 0);
  assert.equal(bloomSafeChannel(-1), 0);
  assert.equal(bloomSafeChannel(17), 0);
  const safe = bloomSafeColor(SPARK_COLOR_CORE, 1);
  assert.ok(safe.r > 0.9 && safe.g > 0.9 && safe.b > 0.4);
  assert.ok([safe.r, safe.g, safe.b].every((c) => Number.isFinite(c) && c >= 0 && c <= MAX_FX_CHANNEL));

  const metal = impactSpec(IMPACT_METAL);
  const concrete = impactSpec(IMPACT_CONCRETE);
  const flesh = impactSpec(IMPACT_FLESH);
  assert.ok(metal.sparks > concrete.sparks);
  assert.ok(concrete.debris >= metal.debris);
  assert.equal(metal.sparkColor, SPARK_COLOR_CORE);
  assert.equal(metal.sparkHot, SPARK_COLOR_HOT);
  assert.ok(concrete.dustSize > metal.dustSize);
  assert.equal(flesh.sparks, 0);
  assert.ok(flesh.streaks > 0);

  const burst = impactBurst({ x: 1, y: 8, z: 2 }, { x: 0, y: 0, z: 1 }, IMPACT_METAL, fixed(Array(40).fill(0.5)));
  assert.ok(burst.particles.some((p) => p.kind === "spark"));
  assert.ok(burst.particles.some((p) => p.kind === "debris"));
  assert.ok(burst.particles.every((p) => Number.isFinite(p.r) && Number.isFinite(p.g) && Number.isFinite(p.b)));
  assert.ok(burst.particles.every((p) => p.r <= MAX_FX_CHANNEL && p.g <= MAX_FX_CHANNEL && p.b <= MAX_FX_CHANNEL));
  const spark = burst.particles.find((p) => p.kind === "spark");
  assert.ok(spark.vz > 0, "metal sparks fly out along the hit normal");
  assert.ok(spark.length / spark.thick >= 10, `sparks must be thin streaks, got ${spark.length} x ${spark.thick}`);
  const core = bloomSafeColor(SPARK_COLOR_CORE, 1);
  assert.ok(core.b > 0.7, "core spark color should be hot-white, not a soft yellow puff");

  const dustBurst = impactBurst({ x: 0, y: 2.12, z: 0 }, { x: 0, y: 1, z: 0 }, IMPACT_CONCRETE, () => 0.4);
  const dust = dustBurst.particles.find((p) => p.kind === "dust");
  stepImpactParticle(dust, 0.1, 2.12 + 0.2);
  assert.ok(dust.alive);
  assert.ok(dust.size > dust.baseSize);
  const chip = dustBurst.particles.find((p) => p.kind === "debris");
  chip.y = 1.5;
  chip.vy = -20;
  stepImpactParticle(chip, 0.2, 2.12);
  assert.ok(chip.y >= 2.12 - 1e-6, "concrete chips land on the asphalt, not under it");
});

test("flesh hits travel along the shot and ragdoll kick stays weighty and grounded", () => {
  const streaks = fleshStreaks({ x: 0, y: 16, z: 0 }, 10, 0, () => 0.5, 4);
  assert.equal(streaks.length, 4);
  assert.ok(streaks.every((s) => s.vx > 0));

  const knock = livingKnockOffset(0, 8, 6);
  assert.ok(Math.abs(knock.x) < 1e-9);
  assert.equal(knock.z, 6);

  const kick = ragdollKickFromShot(3, 4, 6, true, 1.6);
  const len = Math.hypot(3, 4);
  assert.ok(Math.abs(kick.x / kick.z - 3 / 4) < 1e-9);
  assert.ok(Math.abs(Math.hypot(kick.x, kick.z) - 6 * 1.6) < 1e-9);
  assert.ok(kick.y <= 14 && kick.y >= 6);
  assert.ok(Math.abs(kick.x / (3 / len) - 9.6) < 1e-9);

  const shotVel = ragdollLinvel(kick);
  assert.ok(shotVel.y <= 14);
  assert.ok(shotVel.x > 0 && shotVel.z > 0);
  const along = shotVel.x / shotVel.z;
  assert.ok(Math.abs(along - kick.x / kick.z) < 1e-9);

  // Car-hit kicks without an explicit up stay on the original uncapped curve.
  const car = ragdollLinvel({ x: 50, z: 10 });
  assert.ok(car.y > 14);
});

test("gunsmoke wisps curl up from the barrel and fade out", () => {
  const wisp = gunsmokeWisp({ x: 0, y: 18, z: 0 }, 0, 1, () => 0.5, 1.2);
  assert.ok(wisp.vy > 8);
  const startY = wisp.y;
  stepGunsmoke(wisp, 0.2);
  assert.ok(wisp.y > startY);
  assert.ok(wisp.alive);
  assert.ok(wisp.opacity > 0);
  stepGunsmoke(wisp, 2);
  assert.equal(wisp.alive, false);
  assert.equal(wisp.opacity, 0);
});
