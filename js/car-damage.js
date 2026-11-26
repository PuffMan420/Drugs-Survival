// Car hit points, crash math, and a small shared pool of smoke / fire / blast
// sprites plus the crash/hit sound clips. Weapon and crash code call
// applyCarDamage(); the traffic update plays the wreck once and later removes
// the shell. Enter and exit door clips also live here, on the same listener.

import { skipAmbientOcclusion } from "./ao-skip.js";

// Every car starts with this many hit points, including parked and driven cars.
export const CAR_HP = 100;
// Weapon damage to a car. The pistol still shows its spark.
// Twenty shots wreck a 100 HP car; smoke starts at shot 12, fire at 16.
export const PISTOL_CAR_DAMAGE = 5;
export const BAT_CAR_DAMAGE = 5;
export const BOTTLE_CAR_DAMAGE = 2;
// Crash damage is only for the car the player is driving.
// Ignored unless the sudden speed loss is greater than this (world units / s).
export const CRASH_MIN_SPEED = 60;
export const CRASH_DAMAGE_SCALE = 0.25;
// Visual damage stages, in remaining HP.
export const SMOKE_HP = 40;
export const FIRE_HP = 20;
// Seconds a wreck stays, then it is removed. Also removed if the player is this far away.
export const WRECK_LIFE = 30;
export const WRECK_DESPAWN = 1120;
// Explosion: kill-damage (same as a bat or pistol) to people this close.
export const BLAST_RADIUS = 60;
export const BLAST_DAMAGE = 2;
// How many recycled sprites are allowed at once. Keep this small for frame rate.
export const SMOKE_POOL = 20;
export const FIRE_POOL = 12;
// Crash / weapon-hit sounds. A quiet clip at a small hit, full loudness at this
// much damage in one blow (a hard wall smash; a pistol shot is half of that).
export const CRASH_SOUND_MIN_VOLUME = 0.35;
export const CRASH_SOUND_FULL_DAMAGE = 20;
// Scrapes shorter than this do not start another clip.
export const CRASH_SOUND_COOLDOWN = 0.25;
export const CRASH_SOUND_PITCH_MIN = 0.92;
export const CRASH_SOUND_PITCH_MAX = 1.08;
// Distance fade for a car the player is not driving, in the same units as traffic engines.
export const CRASH_SOUND_NEAR = 160;
export const CRASH_SOUND_FAR = 520;
export const CRASH_SOUND_FILES = ["car-crash-1.ogg", "car-crash-2.ogg", "car-crash-3.ogg", "car-crash-4.ogg"];
// Pistol hits on a car use this impact pool. car-crash-1 is included on purpose
// so that clip can play for bullet hits as well as crashes; it is not copied.
export const BULLET_SOUND_FILES = [
  "car-bullet-1.ogg",
  "car-bullet-2.ogg",
  "car-crash-1.ogg",
  "car-bullet-window-1.ogg",
  "bullet-hit-1.ogg",
];
// Bullets that hit a wall, building, or prop use this pool. Do not play this
// for the ground, the street, people, or cars. car-crash-1 is the existing
// file, not a copy; bullet-hit-1 is also used for cars.
export const BULLET_WORLD_SOUNDS = ["car-crash-1.ogg", "bullet-hit-1.ogg"];
// An upward hit near the street is treated as ground, not a wall.
export const WORLD_HIT_GROUND_NORMAL = 0.65;
export const WORLD_HIT_GROUND_SLACK = 8;
// Short enough that follow-up shots still speak.
export const BULLET_SOUND_COOLDOWN = 0.05;
// Pistol impacts stay quiet, except when the car is right next to the player.
export const BULLET_SOUND_VOLUME = 0.15;
export const BULLET_SOUND_CLOSE_VOLUME = 0.3;
// Two tiles. Inside this the shot is at the close volume.
export const BULLET_SOUND_CLOSE_RANGE = 96;
// By this distance the shot has eased down to BULLET_SOUND_VOLUME, then the far fade takes over.
export const BULLET_SOUND_MID_RANGE = 300;
// Bat and bottle hits reuse the crash clips, quieter than a real smash.
export const MELEE_CAR_SOUND_SCALE = 0.4;
// Played once when a car first starts smoking, or first goes to fire/wreck
// without a smoking stage. Quieter than a crash, heard at the usual car range.
export const SMOKE_SOUND_FILES = ["car-smoke-1.ogg"];
export const SMOKE_SOUND_VOLUME = 0.35;
export const SMOKE_SOUND_NEAR = 160;
export const SMOKE_SOUND_FAR = 520;
// Wreck explosion pool. Louder than a gunshot (0.4) and heard farther than
// bullet hits, which fade out by CRASH_SOUND_FAR (520).
export const EXPLODE_SOUND_FILES = ["car-explode-1.ogg", "car-explode-2.ogg"];
export const EXPLODE_SOUND_VOLUME = 0.6;
export const EXPLODE_SOUND_NEAR = 280;
export const EXPLODE_SOUND_FAR = 900;
// Played when the player gets in or out of a car with E. Two clips each, one
// picked at random. Heard at the player, so there is no distance fade.
export const ENTER_SOUND_FILES = ["car-enter-1.ogg", "car-enter-2.ogg"];
export const EXIT_SOUND_FILES = ["car-exit-1.ogg", "car-exit-2.ogg"];
export const ENTER_SOUND_VOLUME = 0.5;
export const EXIT_SOUND_VOLUME = 0.5;

const WRECK_R = 0.12;
const WRECK_G = 0.11;
const WRECK_B = 0.1;

export function initCarHealth(car) {
  if (!car) return car;
  if (car.hp == null) car.hp = CAR_HP;
  if (!car.wrecked) car.wrecked = false;
  if (car.wreckAge == null) car.wreckAge = 0;
  // New and recycled cars start ready to play the smoke clip once.
  if (car.smokeSoundPlayed == null) car.smokeSoundPlayed = false;
  return car;
}

export function resetSmokeSound(car) {
  if (!car) return car;
  car.smokeSoundPlayed = false;
  return car;
}

// First time this car reaches the smoke HP line, or skips straight to fire/wreck.
export function markSmokeSound(car) {
  if (!car || car.smokeSoundPlayed) return false;
  const triggered = Boolean(car.wrecked) || (car.hp != null && car.hp <= SMOKE_HP);
  if (!triggered) return false;
  car.smokeSoundPlayed = true;
  return true;
}

// Damage from a sudden speed drop, in the same units as the arcade car.
export function crashDamageFromLostSpeed(lost) {
  const extra = lost - CRASH_MIN_SPEED;
  if (!(extra > 0)) return 0;
  return extra * CRASH_DAMAGE_SCALE;
}


export function crashSoundVolume(damage) {
  const t = Math.min(1, Math.max(0, damage / CRASH_SOUND_FULL_DAMAGE));
  return CRASH_SOUND_MIN_VOLUME + (1 - CRASH_SOUND_MIN_VOLUME) * t;
}

export function crashSoundPitch(random = Math.random()) {
  const u = Math.min(1, Math.max(0, random));
  return CRASH_SOUND_PITCH_MIN + (CRASH_SOUND_PITCH_MAX - CRASH_SOUND_PITCH_MIN) * u;
}

// Never picks the last clip if another one is available.
export function pickCrashClip(lastIndex, count = CRASH_SOUND_FILES.length, random = Math.random()) {
  const n = Math.max(1, count | 0);
  if (n === 1) return 0;
  if (lastIndex == null || lastIndex < 0 || lastIndex >= n) {
    return Math.floor(random * n) % n;
  }
  const skip = Math.floor(random * (n - 1)) % (n - 1);
  return skip >= lastIndex ? skip + 1 : skip;
}

export function distanceFalloff(dist, near, far, isPlayerCar = false) {
  if (isPlayerCar) return 1;
  if (!(dist >= 0)) return 0;
  if (dist >= far) return 0;
  if (dist <= near) return 1;
  const t = (dist - near) / (far - near);
  return (1 - t) * (1 - t);
}

export function crashSoundFalloff(dist, isPlayerCar = false) {
  return distanceFalloff(dist, CRASH_SOUND_NEAR, CRASH_SOUND_FAR, isPlayerCar);
}

export function smokeSoundGain(dist, isPlayerCar = false) {
  return SMOKE_SOUND_VOLUME * distanceFalloff(dist, SMOKE_SOUND_NEAR, SMOKE_SOUND_FAR, isPlayerCar);
}

export function explodeSoundGain(dist, isPlayerCar = false) {
  return EXPLODE_SOUND_VOLUME * distanceFalloff(dist, EXPLODE_SOUND_NEAR, EXPLODE_SOUND_FAR, isPlayerCar);
}

export function crashSoundGain(damage, dist, isPlayerCar = false) {
  return crashSoundVolume(damage) * crashSoundFalloff(dist, isPlayerCar);
}

// "bullet" is the pistol pool, "melee" is the crash pool at low volume, anything else is a crash.
export function carHitSoundCooldown(kind) {
  return kind === "bullet" ? BULLET_SOUND_COOLDOWN : CRASH_SOUND_COOLDOWN;
}

export function bulletSoundVolumeAt(dist) {
  if (!(dist >= 0)) return 0;
  if (dist <= BULLET_SOUND_CLOSE_RANGE) return BULLET_SOUND_CLOSE_VOLUME;
  if (dist < BULLET_SOUND_MID_RANGE) {
    const t = (dist - BULLET_SOUND_CLOSE_RANGE) / (BULLET_SOUND_MID_RANGE - BULLET_SOUND_CLOSE_RANGE);
    const u = t * t * (3 - 2 * t);
    return BULLET_SOUND_CLOSE_VOLUME + (BULLET_SOUND_VOLUME - BULLET_SOUND_CLOSE_VOLUME) * u;
  }
  if (dist >= CRASH_SOUND_FAR) return 0;
  const t = (dist - BULLET_SOUND_MID_RANGE) / (CRASH_SOUND_FAR - BULLET_SOUND_MID_RANGE);
  return BULLET_SOUND_VOLUME * (1 - t) * (1 - t);
}

export function carHitSoundGain(damage, dist, isPlayerCar = false, kind = "crash") {
  if (kind === "bullet") return bulletSoundVolumeAt(dist);
  const gain = crashSoundGain(damage, dist, isPlayerCar);
  return kind === "melee" ? gain * MELEE_CAR_SOUND_SCALE : gain;
}

// Play the bullet-hit pool at a point. Volume still uses the close / mid / far curve.
export function playBulletHitSound(sounds, x, z, opts = {}) {
  if (!sounds || typeof sounds.play !== "function") return false;
  return sounds.play({
    kind: "bullet",
    damage: opts.damage ?? 0,
    x,
    z,
    listenerX: opts.listenerX,
    listenerZ: opts.listenerZ,
    isPlayerCar: Boolean(opts.isPlayerCar),
  });
}

// Shared bullet-on-car entry point. Any gun that fires bullets should call this
// (or traffic.bulletHit, which wraps it) when a shot hits a car, so damage and
// the bullet-hit sound stay the same for every weapon.
export function bulletHitCar(car, damage, x, z, hooks = {}) {
  const result = applyCarDamage(car, damage);
  if (result.damaged) {
    playBulletHitSound(hooks.sounds, x ?? car?.x, z ?? car?.z, {
      damage,
      listenerX: hooks.listenerX,
      listenerZ: hooks.listenerZ,
      isPlayerCar: Boolean(hooks.isPlayerCar) || Boolean(car?.held),
    });
  }
  if (result.smokeSound) {
    playCarSmokeSound(hooks.sounds, x ?? car?.x, z ?? car?.z, {
      listenerX: hooks.listenerX,
      listenerZ: hooks.listenerZ,
      isPlayerCar: Boolean(hooks.isPlayerCar) || Boolean(car?.held),
    });
  }
  return result;
}

export function isBulletWorldGroundHit(normalY, hitY, groundY) {
  if (normalY != null && normalY > WORLD_HIT_GROUND_NORMAL) {
    return hitY <= groundY + WORLD_HIT_GROUND_SLACK;
  }
  return false;
}

// Play a world-impact clip at a wall, building, or prop. Future guns should
// call this (or traffic.playBulletWorldHitSound) when a bullet hits one of
// those, never for the ground, the street, people, or cars.
export function playBulletWorldHitSound(sounds, x, z, opts = {}) {
  if (!sounds || typeof sounds.playWorld !== "function") return false;
  return sounds.playWorld({
    x,
    z,
    listenerX: opts.listenerX,
    listenerZ: opts.listenerZ,
  });
}

export function playCarSmokeSound(sounds, x, z, opts = {}) {
  if (!sounds || typeof sounds.playSmoke !== "function") return false;
  return sounds.playSmoke({
    x,
    z,
    listenerX: opts.listenerX,
    listenerZ: opts.listenerZ,
    isPlayerCar: Boolean(opts.isPlayerCar),
  });
}

export function playCarExplodeSound(sounds, x, z, opts = {}) {
  if (!sounds || typeof sounds.playExplode !== "function") return false;
  return sounds.playExplode({
    x,
    z,
    listenerX: opts.listenerX,
    listenerZ: opts.listenerZ,
    isPlayerCar: Boolean(opts.isPlayerCar),
  });
}

export function playCarEnterSound(sounds) {
  if (!sounds || typeof sounds.playEnter !== "function") return false;
  return sounds.playEnter();
}

export function playCarExitSound(sounds) {
  if (!sounds || typeof sounds.playExit !== "function") return false;
  return sounds.playExit();
}

export function createCrashSoundClock(now = 0) {
  return { lastIndex: -1, nextTime: now };
}

export function canPlayCrashSound(clock, now) {
  return Boolean(clock) && now >= clock.nextTime;
}

export function applyCarDamage(car, amount) {
  initCarHealth(car);
  if (!car || car.wrecked) {
    return { damaged: false, justWrecked: false, smokeSound: false, hp: car ? car.hp : 0 };
  }
  const dealt = Math.max(0, amount);
  if (!(dealt > 0)) {
    return { damaged: false, justWrecked: false, smokeSound: false, hp: car.hp };
  }
  car.hp = Math.max(0, car.hp - dealt);
  const justWrecked = car.hp <= 0;
  if (justWrecked) {
    car.wrecked = true;
    car.wreckAge = 0;
    car.speed = 0;
    car.wait = 0;
  }
  const smokeSound = markSmokeSound(car);
  return { damaged: true, justWrecked, smokeSound, hp: car.hp };
}

export function shouldCullWreck(car, playerX, playerZ) {
  if (!car || !car.wrecked || car.held) return false;
  if (car.wreckAge >= WRECK_LIFE) return true;
  const dist = Math.hypot((car.x || 0) - playerX, (car.z || 0) - playerZ);
  return dist >= WRECK_DESPAWN;
}

export function wreckRgb() {
  return { r: WRECK_R, g: WRECK_G, b: WRECK_B };
}

export function isSmoking(car) {
  return Boolean(car && !car.wrecked && car.hp != null && car.hp <= SMOKE_HP && car.hp > FIRE_HP);
}

export function isBurning(car) {
  return Boolean(car && car.hp != null && (car.wrecked || car.hp <= FIRE_HP));
}

function overlap1d(a0, a1, b0, b1) {
  return !(a1 < b0 || b1 < a0);
}

// Does a bat (or similar) forward box overlap this car's footprint?
export function swingHitsCar(px, pz, dirX, dirZ, car, reach, side) {
  if (!car) return false;
  const hx = (car.w || 36) * 0.5;
  const hz = (car.h || 70) * 0.5;
  const ang = car.angle || 0;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const corners = [
    [hx, hz],
    [hx, -hz],
    [-hx, hz],
    [-hx, -hz],
  ];
  let alongMin = Infinity;
  let alongMax = -Infinity;
  let sideMin = Infinity;
  let sideMax = -Infinity;
  for (let i = 0; i < corners.length; i += 1) {
    const lx = corners[i][0];
    const lz = corners[i][1];
    const x = car.x + lx * c + lz * s;
    const z = car.z - lx * s + lz * c;
    const dx = x - px;
    const dz = z - pz;
    const along = dx * dirX + dz * dirZ;
    const lateral = dirX * dz - dirZ * dx;
    if (along < alongMin) alongMin = along;
    if (along > alongMax) alongMax = along;
    if (lateral < sideMin) sideMin = lateral;
    if (lateral > sideMax) sideMax = lateral;
  }
  return overlap1d(0, reach, alongMin, alongMax) && overlap1d(-side, side, sideMin, sideMax);
}

function radialSpriteTexture(Three, stops, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new Three.CanvasTexture(canvas);
  texture.colorSpace = Three.SRGBColorSpace;
  return texture;
}

// Shared smoke, fire, and a one-at-a-time blast flash. Sprites are recycled.
export async function createCarDamageFx(scene) {
  const Three = await import("three");
  const smokeMap = await new Promise((resolve) => {
    const loader = new Three.TextureLoader();
    const url = new URL("../assets/kenney-racing/smoke.png", import.meta.url).href;
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = Three.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      () => resolve(radialSpriteTexture(Three, [[0, "rgba(90,90,95,0.85)"], [1, "rgba(90,90,95,0)"]])),
    );
  });
  const fireMap = radialSpriteTexture(Three, [
    [0, "rgba(255,240,180,1)"],
    [0.35, "rgba(255,140,40,0.9)"],
    [1, "rgba(180,30,0,0)"],
  ]);
  const flashMap = radialSpriteTexture(Three, [
    [0, "rgba(255,255,230,1)"],
    [0.25, "rgba(255,180,60,0.9)"],
    [1, "rgba(255,80,0,0)"],
  ], 128);

  function makePool(map, count, additive) {
    const material = new Three.SpriteMaterial({
      map,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: additive ? Three.AdditiveBlending : Three.NormalBlending,
    });
    const sprites = [];
    for (let i = 0; i < count; i += 1) {
      const sprite = new Three.Sprite(material.clone());
      sprite.visible = false;
      sprite.renderOrder = 4;
      skipAmbientOcclusion(sprite);
      scene.add(sprite);
      sprites.push({ sprite, life: 0, max: 0.4, vx: 0, vy: 0, vz: 0, size: 8 });
    }
    return { material, sprites, cursor: 0 };
  }

  const smoke = makePool(smokeMap, SMOKE_POOL, false);
  const fire = makePool(fireMap, FIRE_POOL, true);
  const flash = new Three.Sprite(new Three.SpriteMaterial({
    map: flashMap,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: Three.AdditiveBlending,
  }));
  flash.visible = false;
  flash.renderOrder = 5;
  skipAmbientOcclusion(flash);
  scene.add(flash);
  let flashLife = 0;
  const FLASH_MAX = 0.28;
  let emitClock = 0;

  function spawn(pool, x, y, z, opts) {
    const slot = pool.sprites[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.sprites.length;
    slot.life = opts.max;
    slot.max = opts.max;
    slot.vx = opts.vx || 0;
    slot.vy = opts.vy || 0;
    slot.vz = opts.vz || 0;
    slot.size = opts.size || 8;
    slot.sprite.position.set(x, y, z);
    slot.sprite.scale.set(slot.size, slot.size, 1);
    slot.sprite.material.opacity = 1;
    slot.sprite.visible = true;
    return slot;
  }

  function stepPool(pool, dt) {
    for (const slot of pool.sprites) {
      if (!slot.sprite.visible) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.sprite.visible = false;
        continue;
      }
      slot.sprite.position.x += slot.vx * dt;
      slot.sprite.position.y += slot.vy * dt;
      slot.sprite.position.z += slot.vz * dt;
      const t = 1 - slot.life / slot.max;
      const fade = 1 - t;
      const grow = slot.size * (1 + t * 0.8);
      slot.sprite.scale.set(grow, grow, 1);
      slot.sprite.material.opacity = fade;
    }
  }

  function hood(car) {
    const y = (car.y == null ? 0.6 : car.y) + Math.max(10, (car.bodyH || 18) * 0.55);
    return { x: car.x, y, z: car.z };
  }

  return {
    explode(car) {
      if (!car) return;
      const at = hood(car);
      flash.position.set(at.x, at.y + 6, at.z);
      flash.scale.set(90, 90, 1);
      flash.material.opacity = 1;
      flash.visible = true;
      flashLife = FLASH_MAX;
      for (let i = 0; i < 6; i += 1) {
        const ang = (i / 6) * Math.PI * 2;
        spawn(smoke, at.x, at.y, at.z, {
          max: 0.7,
          vx: Math.cos(ang) * 18,
          vy: 22 + (i % 3) * 8,
          vz: Math.sin(ang) * 18,
          size: 22,
        });
      }
      for (let i = 0; i < 4; i += 1) {
        spawn(fire, at.x, at.y, at.z, {
          max: 0.45,
          vx: (i - 1.5) * 8,
          vy: 28,
          vz: ((i % 2) - 0.5) * 10,
          size: 16,
        });
      }
    },
    // Call once per frame. cars is the live list from traffic.cars().
    update(dt, cars, playerX, playerZ) {
      const step = Math.max(0, dt);
      if (flashLife > 0) {
        flashLife = Math.max(0, flashLife - step);
        const t = 1 - flashLife / FLASH_MAX;
        flash.material.opacity = Math.max(0, 1 - t);
        flash.scale.set(90 + t * 50, 90 + t * 50, 1);
        if (flashLife <= 0) flash.visible = false;
      }
      emitClock += step;
      const pulse = emitClock >= 0.08;
      if (pulse) emitClock = 0;
      if (pulse && cars) {
        let emitters = 0;
        for (let i = 0; i < cars.length && emitters < 6; i += 1) {
          const car = cars[i];
          if (!car) continue;
          const burn = isBurning(car);
          const smokeOn = burn || isSmoking(car);
          if (!smokeOn) continue;
          if (Math.hypot((car.x || 0) - playerX, (car.z || 0) - playerZ) > 700) continue;
          emitters += 1;
          const at = hood(car);
          spawn(smoke, at.x + (Math.random() - 0.5) * 6, at.y, at.z + (Math.random() - 0.5) * 6, {
            max: burn ? 0.55 : 0.7,
            vx: (Math.random() - 0.5) * 6,
            vy: burn ? 28 : 18,
            vz: (Math.random() - 0.5) * 6,
            size: burn ? 14 : 16,
          });
          if (burn) {
            spawn(fire, at.x + (Math.random() - 0.5) * 4, at.y, at.z + (Math.random() - 0.5) * 4, {
              max: 0.28,
              vx: (Math.random() - 0.5) * 4,
              vy: 22,
              vz: (Math.random() - 0.5) * 4,
              size: 10 + Math.random() * 5,
            });
          }
        }
      }
      stepPool(smoke, step);
      stepPool(fire, step);
    },
  };
}

export function blastPeds(car, pedestrians) {
  if (!car || !pedestrians || !pedestrians.targets || !pedestrians.hurt) return 0;
  const list = pedestrians.targets();
  let hit = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ped = list[i];
    const dx = ped.x - car.x;
    const dz = ped.z - car.z;
    if (dx * dx + dz * dz > BLAST_RADIUS * BLAST_RADIUS) continue;
    if (pedestrians.hurt(ped, dx, dz, BLAST_DAMAGE)) hit += 1;
  }
  return hit;
}

// Loads crash, bullet-hit, world-impact, and enter/exit clips on the shared listener from drive-effects.
export async function createCarCrashSounds(listener) {
  if (!listener) {
    return { play() { return false; }, playWorld() { return false; }, playSmoke() { return false; }, playExplode() { return false; }, playEnter() { return false; }, playExit() { return false; } };
  }
  const Three = await import("three");
  const loader = new Three.AudioLoader();

  async function loadBuffers(files, label) {
    const buffers = files.map(() => null);
    await Promise.all(files.map((name, i) => new Promise((resolve) => {
      const url = new URL(`../assets/audio/${name}`, import.meta.url).href;
      loader.load(
        url,
        (buffer) => {
          buffers[i] = buffer;
          resolve();
        },
        undefined,
        (error) => {
          console.error(`The car ${label} sound failed to load: ${name}`, error);
          resolve();
        },
      );
    })));
    return buffers;
  }

  function makeVoices(count) {
    const voices = [];
    for (let i = 0; i < count; i += 1) {
      const audio = new Three.Audio(listener);
      audio.setLoop(false);
      voices.push(audio);
    }
    return voices;
  }

  function makeBank(files, label, voiceCount) {
    return {
      files,
      label,
      buffers: null,
      voices: makeVoices(voiceCount),
      cursor: 0,
      clock: createCrashSoundClock(0),
    };
  }

  const crash = makeBank(CRASH_SOUND_FILES, "crash", 4);
  const bullet = makeBank(BULLET_SOUND_FILES, "bullet", 4);
  const world = makeBank(BULLET_WORLD_SOUNDS, "world", 4);
  const smoke = makeBank(SMOKE_SOUND_FILES, "smoke", 4);
  const explode = makeBank(EXPLODE_SOUND_FILES, "explode", 4);
  const enter = makeBank(ENTER_SOUND_FILES, "enter", 2);
  const leave = makeBank(EXIT_SOUND_FILES, "exit", 2);
  crash.buffers = await loadBuffers(crash.files, crash.label);
  bullet.buffers = await loadBuffers(bullet.files, bullet.label);
  world.buffers = await loadBuffers(world.files, world.label);
  smoke.buffers = await loadBuffers(smoke.files, smoke.label);
  explode.buffers = await loadBuffers(explode.files, explode.label);
  enter.buffers = await loadBuffers(enter.files, enter.label);
  leave.buffers = await loadBuffers(leave.files, leave.label);

  function playBank(bank, cooldown, gain, opts = {}) {
    const context = listener.context;
    const now = context && typeof context.currentTime === "number" ? context.currentTime : 0;
    if (!canPlayCrashSound(bank.clock, now)) return false;
    const loaded = [];
    for (let i = 0; i < bank.buffers.length; i += 1) {
      if (bank.buffers[i]) loaded.push(i);
    }
    if (loaded.length === 0) return false;
    let pick;
    if (loaded.length === 1) {
      pick = loaded[0];
    } else {
      const choices = loaded.filter((index) => index !== bank.clock.lastIndex);
      const pool = choices.length > 0 ? choices : loaded;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    bank.clock.lastIndex = pick;
    bank.clock.nextTime = now + cooldown;
    const voice = bank.voices[bank.cursor];
    bank.cursor = (bank.cursor + 1) % bank.voices.length;
    try {
      if (context && context.state === "suspended" && typeof context.resume === "function") {
        context.resume().catch(() => {});
      }
      if (voice.isPlaying) voice.stop();
      voice.setBuffer(bank.buffers[pick]);
      voice.setLoop(false);
      voice.setVolume(gain);
      voice.setPlaybackRate(opts.rate != null ? opts.rate : crashSoundPitch());
      voice.play();
    } catch (error) {
      console.error(`The car ${bank.label} sound failed to play`, error);
      return false;
    }
    return true;
  }

  return {
    get ready() {
      return crash.buffers.some(Boolean) || bullet.buffers.some(Boolean) || world.buffers.some(Boolean)
        || smoke.buffers.some(Boolean) || explode.buffers.some(Boolean)
        || enter.buffers.some(Boolean) || leave.buffers.some(Boolean);
    },
    playPositional(bank, cooldown, gainFn, opts = {}) {
      const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
      if (!(master > 0)) return false;
      const hasPos = opts.x != null && opts.z != null && opts.listenerX != null && opts.listenerZ != null;
      const dist = hasPos ? Math.hypot(opts.x - opts.listenerX, opts.z - opts.listenerZ) : 0;
      const gain = gainFn(dist, Boolean(opts.isPlayerCar));
      if (!(gain > 0)) return false;
      return playBank(bank, cooldown, gain);
    },
    playSmoke(opts = {}) {
      return this.playPositional(smoke, 0, smokeSoundGain, opts);
    },
    playExplode(opts = {}) {
      return this.playPositional(explode, 0, explodeSoundGain, opts);
    },
    playEnter() {
      const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
      if (!(master > 0)) return false;
      return playBank(enter, 0, ENTER_SOUND_VOLUME, { rate: 1 });
    },
    playExit() {
      const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
      if (!(master > 0)) return false;
      return playBank(leave, 0, EXIT_SOUND_VOLUME, { rate: 1 });
    },
    playWorld(opts = {}) {
      const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
      if (!(master > 0)) return false;
      const hasPos = opts.x != null && opts.z != null && opts.listenerX != null && opts.listenerZ != null;
      const dist = hasPos ? Math.hypot(opts.x - opts.listenerX, opts.z - opts.listenerZ) : 0;
      const gain = bulletSoundVolumeAt(dist);
      if (!(gain > 0)) return false;
      return playBank(world, BULLET_SOUND_COOLDOWN, gain);
    },
    play(opts = {}) {
      const damage = opts.damage;
      if (!(damage > 0)) return false;
      const kind = opts.kind === "bullet" || opts.kind === "melee" ? opts.kind : "crash";
      const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
      if (!(master > 0)) return false;
      const isPlayerCar = Boolean(opts.isPlayerCar);
      const hasPos = opts.x != null && opts.z != null && opts.listenerX != null && opts.listenerZ != null;
      const dist = hasPos ? Math.hypot(opts.x - opts.listenerX, opts.z - opts.listenerZ) : 0;
      const gain = carHitSoundGain(damage, dist, isPlayerCar, kind);
      if (!(gain > 0)) return false;
      const bank = kind === "bullet" ? bullet : crash;
      return playBank(bank, carHitSoundCooldown(kind), gain);
    },
  };
}
