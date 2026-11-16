import assert from "node:assert/strict";
import test from "node:test";
import {
  BAT_CAR_DAMAGE,
  BLAST_DAMAGE,
  BLAST_RADIUS,
  BOTTLE_CAR_DAMAGE,
  CAR_HP,
  CRASH_DAMAGE_SCALE,
  CRASH_MIN_SPEED,
  FIRE_HP,
  PISTOL_CAR_DAMAGE,
  SMOKE_HP,
  WRECK_DESPAWN,
  WRECK_LIFE,
  applyCarDamage,
  blastPeds,
  canPlayCrashSound,
  crashDamageFromLostSpeed,
  crashSoundFalloff,
  crashSoundGain,
  crashSoundPitch,
  crashSoundVolume,
  createCrashSoundClock,
  BULLET_SOUND_CLOSE_RANGE,
  BULLET_SOUND_CLOSE_VOLUME,
  BULLET_SOUND_COOLDOWN,
  BULLET_SOUND_FILES,
  BULLET_SOUND_MID_RANGE,
  BULLET_SOUND_VOLUME,
  BULLET_WORLD_SOUNDS,
  WORLD_HIT_GROUND_NORMAL,
  WORLD_HIT_GROUND_SLACK,
  EXPLODE_SOUND_FAR,
  EXPLODE_SOUND_FILES,
  EXPLODE_SOUND_NEAR,
  EXPLODE_SOUND_VOLUME,
  SMOKE_SOUND_FAR,
  SMOKE_SOUND_FILES,
  SMOKE_SOUND_NEAR,
  SMOKE_SOUND_VOLUME,
  bulletHitCar,
  bulletSoundVolumeAt,
  explodeSoundGain,
  isBulletWorldGroundHit,
  markSmokeSound,
  playBulletHitSound,
  playBulletWorldHitSound,
  playCarExplodeSound,
  playCarSmokeSound,
  resetSmokeSound,
  smokeSoundGain,
  CRASH_SOUND_COOLDOWN,
  CRASH_SOUND_FAR,
  CRASH_SOUND_FILES,
  MELEE_CAR_SOUND_SCALE,
  carHitSoundCooldown,
  carHitSoundGain,
  CRASH_SOUND_FULL_DAMAGE,
  CRASH_SOUND_MIN_VOLUME,
  CRASH_SOUND_NEAR,
  CRASH_SOUND_PITCH_MAX,
  CRASH_SOUND_PITCH_MIN,
  initCarHealth,
  isBurning,
  isSmoking,
  pickCrashClip,
  shouldCullWreck,
  swingHitsCar,
} from "../js/car-damage.js";

function freshCar(extra = {}) {
  return initCarHealth({
    x: 0,
    z: 0,
    y: 0.6,
    w: 36,
    h: 70,
    angle: 0,
    speed: 80,
    ...extra,
  });
}

test("every car starts with 100 hit points", () => {
  const car = initCarHealth({});
  assert.equal(car.hp, CAR_HP);
  assert.equal(CAR_HP, 100);
  assert.equal(car.wrecked, false);
});

test("weapon hits take the named amounts, and twenty pistol shots wreck a car", () => {
  assert.equal(PISTOL_CAR_DAMAGE, 5);
  assert.equal(BAT_CAR_DAMAGE, 5);
  assert.equal(BOTTLE_CAR_DAMAGE, 2);
  const shotsToSmoke = (CAR_HP - SMOKE_HP) / PISTOL_CAR_DAMAGE;
  const shotsToFire = (CAR_HP - FIRE_HP) / PISTOL_CAR_DAMAGE;
  const shotsToWreck = CAR_HP / PISTOL_CAR_DAMAGE;
  assert.equal(shotsToSmoke, 12);
  assert.equal(shotsToFire, 16);
  assert.equal(shotsToWreck, 20);
  const car = freshCar();
  for (let i = 0; i < shotsToWreck - 1; i += 1) {
    const result = applyCarDamage(car, PISTOL_CAR_DAMAGE);
    assert.equal(result.justWrecked, false);
    assert.equal(car.wrecked, false);
    if (i + 1 === shotsToSmoke) {
      assert.equal(car.hp, SMOKE_HP);
      assert.equal(isSmoking(car), true);
    }
    if (i + 1 === shotsToFire) {
      assert.equal(car.hp, FIRE_HP);
      assert.equal(isBurning(car), true);
    }
  }
  assert.equal(car.hp, PISTOL_CAR_DAMAGE);
  const last = applyCarDamage(car, PISTOL_CAR_DAMAGE);
  assert.equal(last.justWrecked, true);
  assert.equal(car.wrecked, true);
  assert.equal(car.hp, 0);
  assert.equal(car.speed, 0);
  const again = applyCarDamage(car, PISTOL_CAR_DAMAGE);
  assert.equal(again.damaged, false);
  assert.equal(again.justWrecked, false);
});

test("small bumps do no crash damage, hard impacts scale past the floor", () => {
  assert.equal(CRASH_MIN_SPEED, 60);
  assert.equal(CRASH_DAMAGE_SCALE, 0.25);
  assert.equal(crashDamageFromLostSpeed(0), 0);
  assert.equal(crashDamageFromLostSpeed(59), 0);
  assert.equal(crashDamageFromLostSpeed(60), 0);
  assert.equal(crashDamageFromLostSpeed(61), 0.25);
  assert.equal(crashDamageFromLostSpeed(100), 10);
  const car = freshCar();
  applyCarDamage(car, crashDamageFromLostSpeed(100));
  assert.equal(car.hp, 90);
  // Four of those 40-unit-over-floor crashes leave 60; more than that wrecks.
  applyCarDamage(car, crashDamageFromLostSpeed(100) * 9);
  assert.equal(car.wrecked, true);
});

test("smoke starts at 40 HP and fire at 20, including wrecks", () => {
  assert.equal(SMOKE_HP, 40);
  assert.equal(FIRE_HP, 20);
  const car = freshCar();
  car.hp = 41;
  assert.equal(isSmoking(car), false);
  assert.equal(isBurning(car), false);
  car.hp = 40;
  assert.equal(isSmoking(car), true);
  assert.equal(isBurning(car), false);
  car.hp = 20;
  assert.equal(isSmoking(car), false);
  assert.equal(isBurning(car), true);
  car.hp = 0;
  car.wrecked = true;
  assert.equal(isBurning(car), true);
  assert.equal(isSmoking(car), false);
});

test("smoke and explode clips have named volumes and falloff", () => {
  assert.deepEqual(SMOKE_SOUND_FILES, ["car-smoke-1.ogg"]);
  assert.equal(SMOKE_SOUND_VOLUME, 0.35);
  assert.equal(SMOKE_SOUND_NEAR, 160);
  assert.equal(SMOKE_SOUND_FAR, 520);
  assert.deepEqual(EXPLODE_SOUND_FILES, ["car-explode-1.ogg", "car-explode-2.ogg"]);
  assert.equal(EXPLODE_SOUND_VOLUME, 0.6);
  assert.equal(EXPLODE_SOUND_NEAR, 280);
  assert.equal(EXPLODE_SOUND_FAR, 900);
  assert.ok(EXPLODE_SOUND_FAR > 520);
  assert.equal(smokeSoundGain(0, true), 0.35);
  assert.equal(smokeSoundGain(160, false), 0.35);
  assert.equal(smokeSoundGain(520, false), 0);
  assert.equal(explodeSoundGain(0, true), 0.6);
  assert.equal(explodeSoundGain(280, false), 0.6);
  assert.equal(explodeSoundGain(900, false), 0);
  assert.ok(explodeSoundGain(520, false) > 0);
  assert.equal(pickCrashClip(0, 2, 0.5), 1);
  assert.equal(playCarSmokeSound(null, 0, 0), false);
  assert.equal(playCarExplodeSound(null, 0, 0), false);
});

test("the smoke sound triggers once when a car first starts smoking or skips to a wreck", () => {
  const car = freshCar();
  assert.equal(car.smokeSoundPlayed, false);
  const first = applyCarDamage(car, 50);
  assert.equal(first.hp, 50);
  assert.equal(first.smokeSound, false);
  assert.equal(car.smokeSoundPlayed, false);
  const smoke = applyCarDamage(car, 20);
  assert.equal(smoke.hp, 30);
  assert.equal(smoke.smokeSound, true);
  assert.equal(car.smokeSoundPlayed, true);
  const again = applyCarDamage(car, 5);
  assert.equal(again.smokeSound, false);
  const skip = freshCar();
  const wreck = applyCarDamage(skip, 100);
  assert.equal(wreck.justWrecked, true);
  assert.equal(wreck.smokeSound, true);
  assert.equal(skip.smokeSoundPlayed, true);
  assert.equal(applyCarDamage(skip, 10).smokeSound, false);
  assert.equal(markSmokeSound(skip), false);
  resetSmokeSound(skip);
  skip.hp = 100;
  skip.wrecked = false;
  assert.equal(skip.smokeSoundPlayed, false);
  assert.equal(markSmokeSound(skip), false);
  skip.hp = 20;
  assert.equal(markSmokeSound(skip), true);
  const kept = freshCar();
  kept.smokeSoundPlayed = true;
  initCarHealth(kept);
  assert.equal(kept.smokeSoundPlayed, true);
});

test("a wreck is removed after 30 seconds, or sooner if the player is far away", () => {
  assert.equal(WRECK_LIFE, 30);
  assert.equal(WRECK_DESPAWN, 1120);
  const car = freshCar({ wrecked: true, wreckAge: 29.9, x: 0, z: 0 });
  assert.equal(shouldCullWreck(car, 0, 0), false);
  car.wreckAge = 30;
  assert.equal(shouldCullWreck(car, 0, 0), true);
  const far = freshCar({ wrecked: true, wreckAge: 1, x: 0, z: 0 });
  assert.equal(shouldCullWreck(far, 1120, 0), true);
  assert.equal(shouldCullWreck(far, 1119, 0), false);
  far.held = true;
  assert.equal(shouldCullWreck(far, 2000, 0), false);
});

test("the blast hurts people inside 60 units with kill damage", () => {
  assert.equal(BLAST_RADIUS, 60);
  assert.equal(BLAST_DAMAGE, 2);
  const hurt = [];
  const peds = {
    targets() {
      return [
        { x: 0, z: 0 },
        { x: 60, z: 0 },
        { x: 61, z: 0 },
      ];
    },
    hurt(ped, dx, dz, amount) {
      hurt.push({ ped, dx, dz, amount });
      return ped;
    },
  };
  const n = blastPeds({ x: 0, z: 0 }, peds);
  assert.equal(n, 2);
  assert.equal(hurt[0].amount, BLAST_DAMAGE);
  assert.equal(hurt[1].ped.x, 60);
  assert.equal(hurt.length, 2);
});

test("a bat swing hits a car in reach and misses one behind or beside", () => {
  const car = freshCar({ x: 0, z: -40, w: 36, h: 70, angle: 0 });
  // Facing -Z, the car sits just ahead (its body extends toward the player).
  assert.equal(swingHitsCar(0, 0, 0, -1, car, 48, 18), true);
  const behind = freshCar({ x: 0, z: 80, w: 36, h: 70, angle: 0 });
  assert.equal(swingHitsCar(0, 0, 0, -1, behind, 48, 18), false);
  const beside = freshCar({ x: 80, z: 0, w: 36, h: 70, angle: 0 });
  assert.equal(swingHitsCar(0, 0, 0, -1, beside, 48, 18), false);
});

test("crash volume goes from the floor up to full loudness by 20 damage", () => {
  assert.equal(CRASH_SOUND_MIN_VOLUME, 0.35);
  assert.equal(CRASH_SOUND_FULL_DAMAGE, 20);
  assert.equal(crashSoundVolume(0), CRASH_SOUND_MIN_VOLUME);
  assert.equal(crashSoundVolume(20), 1);
  assert.equal(crashSoundVolume(40), 1);
  assert.equal(crashSoundVolume(10), 0.675);
});

test("a crash clip is never followed by the same one", () => {
  const n = CRASH_SOUND_FILES.length;
  assert.equal(n, 4);
  assert.deepEqual(CRASH_SOUND_FILES, [
    "car-crash-1.ogg",
    "car-crash-2.ogg",
    "car-crash-3.ogg",
    "car-crash-4.ogg",
  ]);
  for (let last = 0; last < n; last += 1) {
    for (const u of [0, 0.49, 0.99]) {
      const pick = pickCrashClip(last, n, u);
      assert.notEqual(pick, last);
      assert.ok(pick >= 0 && pick < n);
    }
  }
  const first = pickCrashClip(-1, n, 0);
  assert.equal(first, 0);
});

test("pitch stays in the slight random band", () => {
  assert.equal(CRASH_SOUND_PITCH_MIN, 0.92);
  assert.equal(CRASH_SOUND_PITCH_MAX, 1.08);
  assert.equal(crashSoundPitch(0), 0.92);
  assert.equal(crashSoundPitch(1), 1.08);
});

test("scrapes are held off for a quarter second", () => {
  assert.equal(CRASH_SOUND_COOLDOWN, 0.25);
  const clock = createCrashSoundClock(0);
  assert.equal(canPlayCrashSound(clock, 0), true);
  clock.nextTime = 0.25;
  assert.equal(canPlayCrashSound(clock, 0.249), false);
  assert.equal(canPlayCrashSound(clock, 0.25), true);
});

test("other cars fade with distance, the player's car does not", () => {
  assert.equal(CRASH_SOUND_NEAR, 160);
  assert.equal(CRASH_SOUND_FAR, 520);
  assert.equal(crashSoundFalloff(900, true), 1);
  assert.equal(crashSoundFalloff(0, false), 1);
  assert.equal(crashSoundFalloff(160, false), 1);
  assert.equal(crashSoundFalloff(520, false), 0);
  assert.ok(crashSoundFalloff(340, false) > 0 && crashSoundFalloff(340, false) < 1);
  assert.equal(crashSoundGain(20, 900, false), 0);
  assert.equal(crashSoundGain(20, 0, true), 1);
});

test("bullet hits use the clips on disk and a short cooldown", () => {
  assert.equal(BULLET_SOUND_COOLDOWN, 0.05);
  assert.equal(carHitSoundCooldown("bullet"), 0.05);
  assert.equal(carHitSoundCooldown("crash"), 0.25);
  assert.equal(carHitSoundCooldown("melee"), 0.25);
  assert.equal(BULLET_SOUND_FILES.length, 5);
  assert.equal(BULLET_SOUND_FILES[0], "car-bullet-1.ogg");
  assert.equal(BULLET_SOUND_FILES[1], "car-bullet-2.ogg");
  assert.equal(BULLET_SOUND_FILES[2], "car-crash-1.ogg");
  assert.equal(BULLET_SOUND_FILES[3], "car-bullet-window-1.ogg");
  assert.equal(BULLET_SOUND_FILES[4], "bullet-hit-1.ogg");
  for (let last = 0; last < 5; last += 1) {
    const pick = pickCrashClip(last, 5, 0.5);
    assert.notEqual(pick, last);
    assert.ok(pick >= 0 && pick < 5);
  }
});

test("world bullet hits use a separate pool and skip the ground", () => {
  assert.deepEqual(BULLET_WORLD_SOUNDS, ["car-crash-1.ogg", "bullet-hit-1.ogg"]);
  assert.equal(WORLD_HIT_GROUND_NORMAL, 0.65);
  assert.equal(WORLD_HIT_GROUND_SLACK, 8);
  assert.equal(isBulletWorldGroundHit(1, 0, 0), true);
  assert.equal(isBulletWorldGroundHit(0.66, 0, 0), true);
  assert.equal(isBulletWorldGroundHit(0.2, 0, 0), false);
  assert.equal(isBulletWorldGroundHit(1, 40, 0), false);
  assert.equal(playBulletWorldHitSound(null, 1, 2), false);
  const plays = [];
  const sounds = { playWorld(opts) { plays.push(opts); return true; } };
  assert.equal(playBulletWorldHitSound(sounds, 10, 20, { listenerX: 0, listenerZ: 0 }), true);
  assert.equal(plays[0].x, 10);
  assert.equal(plays[0].z, 20);
  assert.equal(bulletSoundVolumeAt(96), BULLET_SOUND_CLOSE_VOLUME);
});

test("any gun can apply a bullet hit through one shared helper", () => {
  const car = freshCar({ hp: 100, x: 10, z: 20, held: false });
  const plays = [];
  const sounds = { play(opts) { plays.push(opts); return true; } };
  const result = bulletHitCar(car, PISTOL_CAR_DAMAGE, 12, 24, {
    sounds,
    listenerX: 0,
    listenerZ: 0,
  });
  assert.equal(result.damaged, true);
  assert.equal(car.hp, CAR_HP - PISTOL_CAR_DAMAGE);
  assert.equal(plays.length, 1);
  assert.equal(plays[0].kind, "bullet");
  assert.equal(plays[0].damage, PISTOL_CAR_DAMAGE);
  assert.equal(plays[0].x, 12);
  assert.equal(plays[0].z, 24);
  const played = playBulletHitSound(sounds, 1, 2, { damage: 4, isPlayerCar: true });
  assert.equal(played, true);
  assert.equal(plays[1].kind, "bullet");
  assert.equal(plays[1].x, 1);
  assert.equal(plays[1].z, 2);
  assert.equal(playBulletHitSound(null, 0, 0), false);
});

test("bat and bottle hits use the crash pool at low volume", () => {
  assert.equal(MELEE_CAR_SOUND_SCALE, 0.4);
  assert.equal(carHitSoundGain(20, 0, true, "crash"), 1);
  assert.equal(carHitSoundGain(20, 0, true, "melee"), 0.4);
  assert.equal(carHitSoundGain(20, 900, false, "melee"), 0);
  assert.equal(carHitSoundGain(20, 0, true, "bullet"), BULLET_SOUND_CLOSE_VOLUME);
});

test("bullet hits are louder up close, then ease down to a quiet cap", () => {
  assert.equal(BULLET_SOUND_VOLUME, 0.15);
  assert.equal(BULLET_SOUND_CLOSE_VOLUME, 0.3);
  assert.equal(BULLET_SOUND_CLOSE_RANGE, 96);
  assert.equal(BULLET_SOUND_MID_RANGE, 300);
  assert.equal(bulletSoundVolumeAt(0), BULLET_SOUND_CLOSE_VOLUME);
  assert.equal(bulletSoundVolumeAt(96), BULLET_SOUND_CLOSE_VOLUME);
  assert.equal(bulletSoundVolumeAt(300), BULLET_SOUND_VOLUME);
  assert.equal(bulletSoundVolumeAt(520), 0);
  const mid = bulletSoundVolumeAt(198);
  assert.ok(mid < BULLET_SOUND_CLOSE_VOLUME && mid > BULLET_SOUND_VOLUME);
  assert.ok(bulletSoundVolumeAt(400) < BULLET_SOUND_VOLUME && bulletSoundVolumeAt(400) > 0);
  assert.equal(carHitSoundGain(10, 96, false, "bullet"), BULLET_SOUND_CLOSE_VOLUME);
  assert.equal(carHitSoundGain(10, 300, false, "bullet"), BULLET_SOUND_VOLUME);
});
