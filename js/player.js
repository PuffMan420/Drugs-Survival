import {
  AnimationClip,
  AnimationMixer,
  Audio,
  AudioLoader,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  LoopOnce,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  PLAYER_MODEL,
  SHOTGUN_CLIPS_MODEL,
  UAL2_CLIPS_MODEL,
  fitCharacter,
  isArmBone,
  matteMaterials,
  mergeFigure,
  modelUrl,
} from "./characters.js";
import { PLAYER_SPEED } from "./constants.js";
import { dropHeadScaleTracks, shrinkHead } from "./head-scale.js";
import { DEATH_RESPAWN_DELAY } from "./player-health.js";
import {
  GUN_PRIORITY,
  HIT_REACT_COOLDOWN,
  JUMP_MAX,
  clipSpeedForMax,
  isLowerBone,
  legsWhileAiming,
  moveDirection,
  shouldPlayHit,
} from "./pose-layers.js";

// His height is CHARACTER_HEIGHT in js/characters.js (car units). Pedestrians
// use the same fit, so they stand at his height.
// Tires sit at this height. His soles use the same ground.
const FEET_Y = 0.6;
const SHADOW_Y = 0.35;
// Keys 1–8 place him across the island in one frame. A step never does.
const PLACE_STEP = 240;
// Long enough to read the change, short enough that the gaits still connect.
const FADE = 0.25;
// Aim and shoot keep a relaxed left arm. 0.7 is Idle_Loop, the rest is the pistol clip.
const LEFT_ARM_IDLE = 0.7;
function isLeftArmBone(name) {
  return isArmBone(name, "l");
}

function clipWithout(clip, drop) {
  const tracks = clip.tracks.filter((track) => !drop(track.name.split(".")[0]));
  return new AnimationClip(`${clip.name}_kept`, clip.duration, tracks);
}

function clipOnly(clip, keep) {
  const tracks = clip.tracks.filter((track) => keep(track.name.split(".")[0]));
  return new AnimationClip(`${clip.name}_left`, clip.duration, tracks);
}
// Most of a speed change lands inside a third of a second. Not a snap.
const SPEED_TAU = 0.16;
// About nine tenths of a 90° turn is done by 0.12s, and it is finished by 0.15s.
const TURN_TAU = 0.055;
// Toe plants, then the clip length so the next plant wraps.
// Walk_Loop is 4/3 s, Jog_Fwd_Loop is 11/12 s, Sprint_Loop is 2/3 s.
const STEP_MARKS = {
  walk: { plants: [0.1667, 0.8333], duration: 4 / 3 },
  jog: { plants: [0.0339, 0.5143], duration: 11 / 12 },
  sprint: { plants: [0.051, 0.4243], duration: 2 / 3 },
};
const GAIT_SPEED = {
  walk: 0.5,
  jog: 1,
  sprint: 1.4,
};

function plantsBetween(plants, from, to) {
  let hits = 0;
  for (const plant of plants) {
    if (plant > from && plant <= to) hits += 1;
  }
  return hits;
}
// Half of the previous gain. The clips peak near full scale.
const FOOTSTEP_VOLUME = 0.45 * 0.5 * 0.8 * 0.8 * 0.5;

function shadowTexture() {
  const width = 64;
  const height = 32;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      const dist = nx * nx + ny * ny;
      const alpha = dist >= 1 ? 0 : Math.round(210 * (1 - dist) ** 2);
      image.data[(y * width + x) * 4 + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.needsUpdate = true;
  return texture;
}

function figureMaterial() {
  // The sun lights the city with Lambert, which has no shine, so the figure
  // is matte. Each part's color is a vertex color (see mergeFigure).
  return new MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    fog: false,
    side: DoubleSide,
  });
}

function clipNamed(animations, name) {
  const clip = animations.find((item) => item.name === name);
  if (!clip) throw new Error(`The player model is missing the ${name} animation.`);
  return clip;
}

function maskedClip(clip, lower) {
  const tracks = clip.tracks.filter((track) => isLowerBone(track.name.split(".")[0]) === lower);
  return new AnimationClip(`${clip.name}_${lower ? "legs" : "arms"}`, clip.duration, tracks);
}

export async function createPlayer() {
  const loader = new GLTFLoader();
  const url = modelUrl(PLAYER_MODEL);
  const ual2Url = modelUrl(UAL2_CLIPS_MODEL);
  const shotgunUrl = modelUrl(SHOTGUN_CLIPS_MODEL);
  let gltf;
  let ual2;
  let shotgunClips;
  try {
    [gltf, ual2, shotgunClips] = await Promise.all([
      loader.loadAsync(url),
      loader.loadAsync(ual2Url),
      loader.loadAsync(shotgunUrl),
    ]);
  } catch {
    throw new Error("The player model failed to load.");
  }

  const model = gltf.scene;
  matteMaterials(model);
  const figure = mergeFigure(model, figureMaterial());
  figure.castShadow = true;
  figure.receiveShadow = true;
  // The figure faces +Z. atan2(east, south) turns that axis toward travel.
  // Standing height is CHARACTER_HEIGHT car units, the old player's height.
  fitCharacter(model);
  // After the height fit, so the fit still measures the full body.
  // The clips' Head.scale tracks are a constant 1 and would undo this.
  shrinkHead(model);
  dropHeadScaleTracks(gltf.animations);
  dropHeadScaleTracks(ual2.animations);

  const holder = new Group();
  holder.frustumCulled = false;
  holder.add(model);

  const shadow = new Mesh(new PlaneGeometry(11, 5.5), new MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    side: DoubleSide,
  }));
  shadow.geometry.rotateX(-Math.PI / 2);
  shadow.frustumCulled = false;
  shadow.renderOrder = 1;
  shadow.position.y = SHADOW_Y;

  const mixer = new AnimationMixer(model);
  // Idle when he is still. Jog is PLAYER_SPEED. Walk is half of that, sprint
  // is 1.4 times. The other UAL clips stay in the file. There is no jump.
  const actions = {
    idle: mixer.clipAction(clipNamed(gltf.animations, "Idle_Loop")),
    walk: mixer.clipAction(clipNamed(gltf.animations, "Walk_Loop")),
    jog: mixer.clipAction(clipNamed(gltf.animations, "Jog_Fwd_Loop")),
    sprint: mixer.clipAction(clipNamed(gltf.animations, "Sprint_Loop")),
  };

  // webgl_animation_skinning_blending.html: every action stays playing, and a
  // change of clip is setWeight + crossFadeTo. crossFadeTo's fade-out sets
  // enabled to false and, if warped, rewrites timeScale. The next blend turns
  // the incoming action back on. Warp stays off so the foot rate can follow
  // the ground speed.
  function setWeight(action, weight) {
    action.enabled = true;
    action.setEffectiveWeight(weight);
  }

  function crossFade(from, to, fade) {
    to.paused = false;
    setWeight(to, 1);
    to.time = 0;
    from.crossFadeTo(to, fade, false);
  }

  // A 0.25s blend hides the pistol recoil, which is over in a few frames.
  // The shoot clip's first frame matches the aim, so it can take the arms at once.
  function glide(action, want, step, tau) {
    action.stopFading();
    action.stopWarping();
    const now = action.getEffectiveWeight();
    let next = now + (want - now) * (1 - Math.exp(-step / tau));
    if (want === 0 && next < 0.02) next = 0;
    if (want === 1 && next > 0.98) next = 1;
    setWeight(action, next);
  }

  setWeight(actions.idle, 1);
  setWeight(actions.walk, 0);
  setWeight(actions.jog, 0);
  setWeight(actions.sprint, 0);
  const pistolSources = {
    pistolIdle: clipNamed(gltf.animations, "Pistol_Idle_Loop"),
    pistolAim: clipNamed(gltf.animations, "Pistol_Aim_Neutral"),
    pistolShoot: clipNamed(gltf.animations, "Pistol_Shoot"),
    pistolReload: clipNamed(gltf.animations, "Pistol_Reload"),
  };
  // Aim and shoot are two-handed. The left arm is a separate blend, so those
  // clips no longer drive LeftShoulder, LeftArm, LeftForeArm, or LeftHand.
  const leftIdle = mixer.clipAction(clipOnly(actions.idle.getClip(), isLeftArmBone));
  const leftAim = mixer.clipAction(clipOnly(pistolSources.pistolAim, isLeftArmBone));
  const leftShoot = mixer.clipAction(clipOnly(pistolSources.pistolShoot, isLeftArmBone));
  for (const action of [leftIdle, leftAim, leftShoot]) {
    setWeight(action, 0);
    action.play();
  }
  for (const key of Object.keys(pistolSources)) {
    const source = pistolSources[key];
    const clip = key === "pistolAim" || key === "pistolShoot"
      ? clipWithout(source, isLeftArmBone)
      : source;
    actions[key] = mixer.clipAction(clip);
    setWeight(actions[key], 0);
  }
  actions.pistolShoot.setLoop(LoopOnce, 1);
  actions.pistolShoot.clampWhenFinished = true;
  actions.pistolReload.setLoop(LoopOnce, 1);
  actions.pistolReload.clampWhenFinished = true;
  actions.punchCross = mixer.clipAction(clipNamed(gltf.animations, "Punch_Cross"));
  setWeight(actions.punchCross, 0);
  actions.punchCross.setLoop(LoopOnce, 1);
  actions.punchCross.clampWhenFinished = true;
  actions.idle.play();
  actions.walk.play();
  actions.jog.play();
  actions.sprint.play();
  actions.pistolIdle.play();
  actions.pistolAim.play();
  actions.pistolShoot.play();
  actions.pistolReload.play();
  actions.punchCross.play();
  actions.swordIdle = mixer.clipAction(clipNamed(gltf.animations, "Sword_Idle"));
  actions.swordAttack = mixer.clipAction(clipNamed(gltf.animations, "Sword_Attack"));
  setWeight(actions.swordIdle, 0);
  setWeight(actions.swordAttack, 0);
  actions.swordAttack.setLoop(LoopOnce, 1);
  actions.swordAttack.clampWhenFinished = true;
  actions.swordIdle.play();
  actions.swordAttack.play();
  const ual2Clips = {
    swordRegularA: "Sword_Regular_A",
    swordRegularB: "Sword_Regular_B",
    swordRegularC: "Sword_Regular_C",
    swordHeavy: "Sword_Heavy_Combo",
    consume: "Consume",
    overhandThrow: "OverhandThrow",
    meleeHook: "Melee_Hook",
    hitKnockback: "Hit_Knockback",
    idlePhone: "Idle_TalkingPhone_Loop",
    idleFold: "Idle_FoldArms_Loop",
  };
  for (const key of Object.keys(ual2Clips)) {
    actions[key] = mixer.clipAction(clipNamed(ual2.animations, ual2Clips[key]));
    setWeight(actions[key], 0);
    actions[key].play();
  }
  // Two-handed shotgun hold. Upper body only, so they always play as layers.
  const shotgunNames = { shotgunHold: "Shotgun_Hold", shotgunAim: "Shotgun_Aim", shotgunShoot: "Shotgun_Shoot" };
  for (const key of Object.keys(shotgunNames)) {
    actions[key] = mixer.clipAction(clipNamed(shotgunClips.animations, shotgunNames[key]));
    setWeight(actions[key], 0);
    actions[key].play();
  }
  actions.punchJab = mixer.clipAction(clipNamed(gltf.animations, "Punch_Jab"));
  setWeight(actions.punchJab, 0);
  actions.punchJab.setLoop(LoopOnce, 1);
  actions.punchJab.clampWhenFinished = true;
  actions.punchJab.play();
  const ual1Extra = {
    death: "Death01",
    hitChest: "Hit_Chest",
    hitHead: "Hit_Head",
    jumpIn: "Jump_Start",
  };
  for (const key of Object.keys(ual1Extra)) {
    actions[key] = mixer.clipAction(clipNamed(gltf.animations, ual1Extra[key]));
    setWeight(actions[key], 0);
    actions[key].play();
  }
  const lowerActions = {};
  for (const name of ["idle", "walk", "jog", "sprint"]) {
    lowerActions[name] = mixer.clipAction(maskedClip(actions[name].getClip(), true));
    setWeight(lowerActions[name], 0);
    lowerActions[name].play();
  }
  const upperNames = [
    "pistolAim", "pistolShoot", "pistolReload",
    "punchCross", "punchJab", "meleeHook",
    "overhandThrow", "consume",
    "swordIdle", "swordRegularA", "swordRegularB", "swordRegularC", "swordHeavy",
    "hitChest", "hitHead",
    "shotgunHold", "shotgunAim", "shotgunShoot",
  ];
  const upperActions = {};
  for (const name of upperNames) {
    upperActions[name] = mixer.clipAction(maskedClip(actions[name].getClip(), false));
    setWeight(upperActions[name], 0);
    upperActions[name].play();
  }
  const oneShots = [
    "pistolShoot", "pistolReload", "punchCross", "punchJab", "meleeHook",
    "overhandThrow", "consume", "swordRegularA", "swordRegularB", "swordRegularC",
    "swordHeavy", "hitKnockback", "swordAttack",
    "hitChest", "hitHead", "death", "jumpIn", "shotgunShoot",
  ];
  for (const name of oneShots) {
    const action = actions[name];
    if (!action) continue;
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    const upper = upperActions[name];
    if (!upper) continue;
    upper.setLoop(LoopOnce, 1);
    upper.clampWhenFinished = true;
  }
  // Bones are still the bind T until the mixer writes. Do that before the
  // first paint, while idle is the only action with weight.
  mixer.update(0);

  let playing = "idle";
  let listener = null;
  // Time within the gait clip. A plant plays when this crosses a toe contact.
  let cycle = 0;
  // Smoothed ground speed, and the way he is facing. Movement follows facing.
  let speed = 0;
  let facing = 0;
  let forced = "";
  let aim = null;
  // Walking direction. Same as facing unless he aims (see moveDirection).
  let moveX = 0;
  let moveZ = 1;
  let layered = false;
  let legGait = "idle";
  let kick = "";
  // One-shot that owns the arms (consume) or the whole body (car hit).
  let upperCue = "";
  let bodyCue = "";
  let ride = "";
  let hitCool = 0;
  let lastHit = "hitHead";
  const FULL_ONESHOT = new Set(["pistolShoot", "swordAttack", "hitKnockback", "death", "jumpIn"]);
  const UPPER_FAST = new Set([
    "pistolShoot", "punchCross", "punchJab", "meleeHook",
    "overhandThrow", "consume",
    "swordRegularA", "swordRegularB", "swordRegularC", "swordHeavy",
    "hitChest", "hitHead", "shotgunShoot",
  ]);
  const buffers = [null, null];
  let stepsReady = false;

  function useListener(next) {
    if (!next || listener) return;
    listener = next;
    const loader = new AudioLoader();
    const files = ["footstep-1.ogg", "footstep-2.ogg"];
    for (let i = 0; i < files.length; i += 1) {
      const url = new URL(`../assets/sound/${files[i]}`, import.meta.url).href;
      loader.load(url, (buffer) => {
        buffers[i] = buffer;
        if (buffers[0] && buffers[1]) {
          stepsReady = true;
          console.info("Footstep sounds loaded");
        }
      }, undefined, (error) => {
        console.error("A footstep sound failed to load", error);
      });
    }
  }

  const voices = [];

  function playFootstep() {
    if (!stepsReady || !listener) return;
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    if (!buffer) return;
    const start = () => {
      let audio = voices.find((item) => !item.isPlaying);
      if (!audio) {
        audio = new Audio(listener);
        voices.push(audio);
      }
      try {
        audio.setBuffer(buffer);
        audio.setLoop(false);
        // The listener gain already applies the master volume.
        audio.setVolume(FOOTSTEP_VOLUME);
        audio.play();
      } catch (error) {
        console.error("A footstep failed to play", error);
      }
    };
    const context = listener.context;
    if (context.state === "suspended") {
      context.resume().then(() => {
        if (context.state !== "suspended") start();
      }).catch(() => {});
      return;
    }
    start();
  }

  function show(name) {
    if (name === playing) return;
    if (FULL_ONESHOT.has(name)) {
      for (const key of Object.keys(actions)) setWeight(actions[key], key === name ? 1 : 0);
      actions[name].reset().play();
      playing = name;
      return;
    }
    const fade = FULL_ONESHOT.has(playing) ? 0.08 : FADE;
    crossFade(actions[playing], actions[name], fade);
    playing = name;
    cycle = 0;
  }

  function restoreFull(name) {
    if (name !== playing) {
      show(name);
      return;
    }
    for (const key of Object.keys(actions)) {
      actions[key].stopFading();
      actions[key].stopWarping();
      setWeight(actions[key], key === name ? 1 : 0);
    }
  }

  function gaitForSpeed(ground) {
    const ratio = ground / PLAYER_SPEED;
    if (!(ratio > 0.15)) return "idle";
    let best = "walk";
    let bestDist = Infinity;
    for (const name of Object.keys(GAIT_SPEED)) {
      const dist = Math.abs(ratio - GAIT_SPEED[name]);
      if (dist < bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    return best;
  }

  function clipScale(name, ground) {
    const ref = GAIT_SPEED[name];
    if (!ref) return 1;
    return ground / (PLAYER_SPEED * ref);
  }

  function place(x, z, y) {
    const feet = y == null ? FEET_Y : y;
    holder.position.set(x, feet, z);
    shadow.position.set(x, feet - (FEET_Y - SHADOW_Y), z);
  }

  function hideHeld(hide) {
    const socket = model.getObjectByName("hand_r_socket");
    if (socket) socket.visible = !hide;
  }

  return {
    mesh: holder,
    shadow,
    get speed() {
      return speed;
    },
    get dirX() {
      return Math.sin(facing);
    },
    get dirZ() {
      return Math.cos(facing);
    },
    // Use these for the step. dirX/dirZ stay the facing for hits and shots.
    get moveX() {
      return moveX;
    },
    get moveZ() {
      return moveZ;
    },
    model,
    useListener,
    // The UAL pistol clips close the fingers themselves, so nothing to add.
    holdPistol() {},
    // Wish is a unit direction. Gait is walk, jog, sprint, or idle. Boost is
    // the build-mode pace. Speed and facing ease. They do not snap.
    forcePose(name) {
      forced = name || "";
    },
    kickPose(name) {
      kick = name || "";
      // The click can land after this frame's pose was chosen. Keep the recoil
      // on the arms for the update that is about to run.
      if (kick) forced = kick;
    },
    clipDuration(name) {
      const action = actions[name];
      return action ? action.getClip().duration : 0;
    },
    // Upper-body one-shot. Drug keys can call this later. F10 calls it now.
    playConsume() {
      upperCue = "consume";
      kick = "consume";
      forced = "consume";
    },
    // Full-body one-shot. A car hit calls this. Small hits do not.
    playKnockback() {
      bodyCue = "hitKnockback";
      upperCue = "";
      kick = "hitKnockback";
      forced = "hitKnockback";
    },
    playDeath() {
      upperCue = "";
      ride = "";
      bodyCue = "death";
      kick = "death";
      forced = "death";
    },
    playHit(source = "") {
      const pose = bodyCue || ride || forced || playing;
      const locked = Boolean(bodyCue || ride === "jumpIn");
      if (!shouldPlayHit({ source, pose, locked, cooldown: hitCool })) return false;
      lastHit = lastHit === "hitChest" ? "hitHead" : "hitChest";
      upperCue = lastHit;
      kick = lastHit;
      forced = lastHit;
      hitCool = HIT_REACT_COOLDOWN;
      return true;
    },
    ridePose(name) {
      ride = name || "";
      if (ride) {
        kick = ride;
        forced = ride;
      } else if (forced === "jumpIn") {
        kick = "";
        forced = "";
      }
    },
    setFacing(yaw) {
      facing = yaw;
      holder.rotation.y = yaw;
    },
    resetPose() {
      ride = "";
      upperCue = "";
      bodyCue = "";
      kick = "";
      forced = "";
      layered = false;
      hitCool = 0;
      for (const key of Object.keys(lowerActions)) setWeight(lowerActions[key], 0);
      for (const key of Object.keys(upperActions)) setWeight(upperActions[key], 0);
      for (const key of Object.keys(actions)) {
        actions[key].stopFading();
        actions[key].stopWarping();
        setWeight(actions[key], key === "idle" ? 1 : 0);
      }
      actions.idle.reset().play();
      playing = "idle";
      hideHeld(false);
      mixer.update(0);
    },
    hideHeld,
    // 0..1: how much the two-handed shotgun clips own the arms right now.
    // The held shotgun turns into the two-handed grip by this much.
    // carryShare: the part of it that is the carry clip (not aim or shoot).
    get carryShare() {
      const hold = upperActions.shotgunHold.getEffectiveWeight();
      const all = hold + upperActions.shotgunAim.getEffectiveWeight() + upperActions.shotgunShoot.getEffectiveWeight();
      return all > 1e-4 ? hold / all : 0;
    },
    get twoHandedWeight() {
      const w = upperActions.shotgunHold.getEffectiveWeight()
        + upperActions.shotgunAim.getEffectiveWeight()
        + upperActions.shotgunShoot.getEffectiveWeight();
      return Math.min(1, Math.max(0, w));
    },
    get poseName() {
      return bodyCue || ride || forced || playing;
    },
    get hitCooldown() {
      return hitCool;
    },
    locked() {
      return bodyCue === "death";
    },
    playDuration(name) {
      const action = actions[name];
      if (!action) return 0;
      const duration = action.getClip().duration;
      if (name === "jumpIn") {
        return duration / clipSpeedForMax(duration, JUMP_MAX);
      }
      if (name === "death") {
        return duration / clipSpeedForMax(duration, DEATH_RESPAWN_DELAY);
      }
      return duration;
    },
    aimAt(x, z) {
      aim = { x, z };
    },
    clearAim() {
      aim = null;
    },
    guide(dt, wishX, wishZ, gait, boost) {
      const step = Math.max(0, dt);
      const wish = Math.hypot(wishX, wishZ);
      let target = null;
      if (aim) {
        const dx = aim.x - holder.position.x;
        const dz = aim.z - holder.position.z;
        if (Math.hypot(dx, dz) > 1) target = Math.atan2(dx, dz);
      } else if (wish > 0.001) {
        target = Math.atan2(wishX / wish, wishZ / wish);
      }
      if (target != null) {
        const delta = Math.atan2(Math.sin(target - facing), Math.cos(target - facing));
        const tau = aim ? 0.04 : TURN_TAU;
        facing += delta * (1 - Math.exp(-step / tau));
        holder.rotation.y = facing;
      }
      const move = moveDirection({ aiming: Boolean(aim), facing, wishX, wishZ, lastX: moveX, lastZ: moveZ });
      moveX = move.x;
      moveZ = move.z;
      const rate = GAIT_SPEED[gait] || 0;
      const goal = PLAYER_SPEED * rate * (boost > 0 ? boost : 1);
      speed += (goal - speed) * (1 - Math.exp(-step / SPEED_TAU));
      if (speed < 0.05) speed = 0;
    },
    halt() {
      speed = 0;
    },
    update(dx, dz, x, z, y, dt) {
      const step = Math.max(0, dt || 0);
      const dist = Math.hypot(dx, dz);
      const moved = dist > 0.001 && dist < PLACE_STEP;
      const ground = moved && step > 0 ? dist / step : 0;
      const gait = gaitForSpeed(ground);
      if (hitCool > 0) hitCool = Math.max(0, hitCool - step);
      if (ride === "jumpIn") {
        const clip = actions.jumpIn;
        if (kick !== "jumpIn" && clip.time >= clip.getClip().duration - 0.001) ride = "";
      }
      if (bodyCue) {
        const clip = actions[bodyCue];
        const done = kick !== bodyCue && clip.time >= clip.getClip().duration - 0.001;
        // Death holds its last frame until resetPose(). Knockback still ends.
        if (done && bodyCue !== "death") bodyCue = "";
        else forced = bodyCue;
      } else if (upperCue && !GUN_PRIORITY.has(forced)) {
        const clip = upperActions[upperCue];
        const done = kick !== upperCue && clip.time >= clip.getClip().duration - 0.001;
        if (done) upperCue = "";
        else forced = upperCue;
      } else if (ride) {
        forced = ride;
      }
      const split = legsWhileAiming(forced, gait !== "idle");
      if (holder.visible && dist < PLACE_STEP) {
        const tau = Math.max(step, 1 / 120);
        if (split) {
          if (!layered) {
            const seed = actions[gait];
            lowerActions[gait].time = seed.getEffectiveWeight() > 0.5 ? seed.time : 0;
            legGait = gait;
          } else if (gait !== legGait) {
            lowerActions[gait].time = 0;
            cycle = 0;
            legGait = gait;
          }
          layered = true;
          for (const key of Object.keys(actions)) glide(actions[key], 0, tau, 0.1);
          for (const key of Object.keys(lowerActions)) glide(lowerActions[key], key === gait ? 1 : 0, tau, 0.1);
          const fast = UPPER_FAST.has(forced);
          for (const key of Object.keys(upperActions)) {
            glide(upperActions[key], key === forced ? 1 : 0, tau, fast ? 0.04 : 0.1);
          }
        } else {
          for (const key of Object.keys(lowerActions)) glide(lowerActions[key], 0, tau, 0.1);
          for (const key of Object.keys(upperActions)) glide(upperActions[key], 0, tau, 0.08);
          if (layered) {
            layered = false;
            restoreFull(forced || gait);
          } else {
            show(forced || gait);
          }
        }
      }
      if (kick && forced === kick) {
        const upper = upperActions[kick];
        if (split && upper) {
          upper.reset().play();
          setWeight(upper, 1);
          for (const key of Object.keys(upperActions)) {
            if (key !== kick) setWeight(upperActions[key], 0);
          }
        } else if (actions[kick] && playing === kick) {
          actions[kick].reset().play();
          setWeight(actions[kick], 1);
        }
        kick = "";
      } else if (!forced) {
        kick = "";
      }
      for (const name of Object.keys(GAIT_SPEED)) {
        const scale = clipScale(name, ground);
        actions[name].setEffectiveTimeScale(scale);
        lowerActions[name].setEffectiveTimeScale(scale);
      }
      if (forced && actions[forced]) actions[forced].setEffectiveTimeScale(1);
      if (forced === "jumpIn") {
        actions.jumpIn.setEffectiveTimeScale(
          clipSpeedForMax(actions.jumpIn.getClip().duration, JUMP_MAX),
        );
      }
      if (forced === "death") {
        actions.death.setEffectiveTimeScale(
          clipSpeedForMax(actions.death.getClip().duration, DEATH_RESPAWN_DELAY),
        );
      }
      for (const name of Object.keys(upperActions)) upperActions[name].setEffectiveTimeScale(1);
      hideHeld(Boolean(ride === "jumpIn" || bodyCue === "death"));
      const aimW = actions.pistolAim.getEffectiveWeight() + upperActions.pistolAim.getEffectiveWeight();
      const shootW = actions.pistolShoot.getEffectiveWeight() + upperActions.pistolShoot.getEffectiveWeight();
      setWeight(leftIdle, LEFT_ARM_IDLE * (aimW + shootW));
      setWeight(leftAim, (1 - LEFT_ARM_IDLE) * aimW);
      setWeight(leftShoot, (1 - LEFT_ARM_IDLE) * shootW);
      const aimTime = actions.pistolAim.getEffectiveWeight() >= upperActions.pistolAim.getEffectiveWeight()
        ? actions.pistolAim.time
        : upperActions.pistolAim.time;
      const shootTime = actions.pistolShoot.getEffectiveWeight() >= upperActions.pistolShoot.getEffectiveWeight()
        ? actions.pistolShoot.time
        : upperActions.pistolShoot.time;
      leftIdle.time = actions.idle.time;
      leftAim.time = aimTime;
      leftShoot.time = shootTime;
      leftIdle.setEffectiveTimeScale(0);
      leftAim.setEffectiveTimeScale(0);
      leftShoot.setEffectiveTimeScale(0);
      mixer.update(step);
      // The mesh is hidden in a car. A map jump is a huge step, not a footfall.
      // Clip time moves with the playback rate, so a faster gait steps sooner.
      // While aiming, the feet follow the gait even though the arms play the pistol.
      const stepName = split ? gait : playing;
      const marks = STEP_MARKS[stepName];
      if (holder.visible && moved && marks) {
        const scale = clipScale(stepName, ground);
        let next = cycle + step * scale;
        let hits = 0;
        while (next >= marks.duration) {
          hits += plantsBetween(marks.plants, cycle, marks.duration);
          next -= marks.duration;
          cycle = 0;
        }
        hits += plantsBetween(marks.plants, cycle, next);
        cycle = next;
        for (let i = 0; i < hits; i += 1) playFootstep();
      }
      place(x, z, y);
    },
  };
}
