import {
  AnimationClip,
  AnimationMixer,
  Audio,
  AudioLoader,
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  LoopOnce,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAYER_SPEED } from "./constants.js";
import { dropHeadScaleTracks, shrinkHead } from "./head-scale.js";
import { isLowerBone, legsWhileAiming } from "./pose-layers.js";

// Blue sedan footprint in js/cars.js (assets/cars3d/sedan.glb): 37 wide, 71 long.
// A real height is a third of that length. He is drawn a bit larger than that
// so he reads clearly beside the cars, then another 10%, another 10% on
// top of that, and another 5%. Pedestrians use this same bump, so they stand at his height.
// Shoulders stay inside the sedan's width.
const SEDAN_LENGTH = 71;
const SCALE_BUMP = 1.15 * 1.1 * 1.1 * 1.05;
// Tires sit at this height. His soles use the same ground.
const FEET_Y = 0.6;
const SHADOW_Y = 0.35;
// Keys 1–8 place him across the island in one frame. A step never does.
const PLACE_STEP = 240;
// Long enough to read the change, short enough that the gaits still connect.
const FADE = 0.25;
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

function litMaterials(model) {
  // The sun lights the city with Lambert. The same material shades the figure.
  const swapped = new Map();
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const sources = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = sources.map((source) => {
      if (swapped.has(source)) return swapped.get(source);
      const map = source.map ?? null;
      if (map) map.colorSpace = SRGBColorSpace;
      const lit = new MeshLambertMaterial({
        map,
        color: 0xffffff,
        toneMapped: false,
        fog: false,
        side: source.side ?? DoubleSide,
      });
      swapped.set(source, lit);
      source.dispose();
      return lit;
    });
    obj.material = next.length === 1 ? next[0] : next;
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
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
  const url = new URL("../assets/player/gubbe.glb", import.meta.url).href;
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch {
    throw new Error("The player model failed to load.");
  }

  const model = gltf.scene;
  litMaterials(model);
  // The figure faces +Z. atan2(east, south) turns that axis toward travel.
  // The sedan fit divides out the file's root scale. v13 was root 1.05, so
  // measure there and put this file's scale back. 1.134 / 1.05 is the 8%.
  // v14 stored that 1.134 on Root. v15's root is 1.0, so measure at
  // 1.05 / 1.134 and the restored scale still lands on the same height.
  const root = model.getObjectByName("Root");
  const fileScale = root ? root.scale.x : 1;
  if (root) root.scale.setScalar(1.05 / 1.134);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = (SEDAN_LENGTH / 3) * SCALE_BUMP / height;
  model.scale.setScalar(scale);
  if (root) root.scale.setScalar(fileScale);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  // After the height fit, so SCALE_BUMP still measures the full body.
  // The clips' Head.scale tracks are a constant 1 and would undo this.
  shrinkHead(model);
  dropHeadScaleTracks(gltf.animations);

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
  const pistolClips = {
    pistolIdle: "Pistol_Idle_Loop",
    pistolAim: "Pistol_Aim_Neutral",
    pistolShoot: "Pistol_Shoot",
    pistolReload: "Pistol_Reload",
  };
  for (const key of Object.keys(pistolClips)) {
    actions[key] = mixer.clipAction(clipNamed(gltf.animations, pistolClips[key]));
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
  const lowerActions = {};
  for (const name of ["idle", "walk", "jog", "sprint"]) {
    lowerActions[name] = mixer.clipAction(maskedClip(actions[name].getClip(), true));
    setWeight(lowerActions[name], 0);
    lowerActions[name].play();
  }
  const upperActions = {};
  for (const name of ["pistolAim", "pistolShoot", "pistolReload", "punchCross"]) {
    upperActions[name] = mixer.clipAction(maskedClip(actions[name].getClip(), false));
    setWeight(upperActions[name], 0);
    upperActions[name].play();
  }
  upperActions.pistolShoot.setLoop(LoopOnce, 1);
  upperActions.pistolShoot.clampWhenFinished = true;
  upperActions.pistolReload.setLoop(LoopOnce, 1);
  upperActions.pistolReload.clampWhenFinished = true;
  upperActions.punchCross.setLoop(LoopOnce, 1);
  upperActions.punchCross.clampWhenFinished = true;
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
  let layered = false;
  let legGait = "idle";
  let kick = "";
  let blendOut = false;
  // Aim curls the right fingers toward −Z, so that is the palm. The left palm
  // is +Z. Rolling the wrist a quarter turn around the fingers faces that palm
  // at the right hand, and the shift moves the hand onto the grip from below.
  const leftHand = model.getObjectByName("LeftHand");
  const supportRoll = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  const supportShift = new Vector3(0.08, -0.05, 0.02);
  const supportWorld = new Vector3();
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
    if (name === "pistolShoot") {
      for (const key of Object.keys(actions)) setWeight(actions[key], key === name ? 1 : 0);
      actions.pistolShoot.reset().play();
      playing = name;
      return;
    }
    const fade = playing === "pistolShoot" ? 0.08 : FADE;
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
    model,
    useListener,
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
      const split = legsWhileAiming(forced, gait !== "idle");
      if (holder.visible && dist < PLACE_STEP) {
        const tau = Math.max(step, 1 / 120);
        if (split) {
          blendOut = false;
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
          const fast = forced === "pistolShoot" || forced === "punchCross";
          for (const key of Object.keys(upperActions)) {
            glide(upperActions[key], key === forced ? 1 : 0, tau, fast ? 0.04 : 0.1);
          }
        } else {
          for (const key of Object.keys(lowerActions)) glide(lowerActions[key], 0, tau, 0.1);
          for (const key of Object.keys(upperActions)) glide(upperActions[key], 0, tau, 0.08);
          const next = forced || gait;
          if (layered && next === playing) {
            layered = false;
            blendOut = true;
          } else if (layered || next !== playing) {
            layered = false;
            blendOut = false;
            show(next);
          } else if (!blendOut) {
            show(next);
          }
          if (blendOut) {
            for (const key of Object.keys(actions)) glide(actions[key], key === playing ? 1 : 0, tau, 0.12);
            let upperLeft = 0;
            for (const key of Object.keys(upperActions)) {
              upperLeft = Math.max(upperLeft, upperActions[key].getEffectiveWeight());
            }
            if (upperLeft < 0.02 && actions[playing].getEffectiveWeight() > 0.98) blendOut = false;
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
      for (const name of Object.keys(upperActions)) upperActions[name].setEffectiveTimeScale(1);
      mixer.update(step);
      if (leftHand && (forced === "pistolAim" || forced === "pistolShoot")) {
        leftHand.quaternion.multiply(supportRoll);
        leftHand.updateMatrixWorld(true);
        leftHand.getWorldPosition(supportWorld);
        supportWorld.add(supportShift);
        leftHand.parent.worldToLocal(supportWorld);
        leftHand.position.copy(supportWorld);
      }
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
