import {
  AnimationMixer,
  Audio,
  AudioLoader,
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAYER_SPEED } from "./constants.js";
import { dropHeadScaleTracks, shrinkHead } from "./head-scale.js";

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
const FADE = 0.12;
// The run clip's hips bottom out at these times. That is a footfall.
const STEP_MARKS = [0.2083, 0.5833];
// Half the previous gain. The clips peak near full scale.
const FOOTSTEP_VOLUME = 0.45 * 0.5;

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

export async function createPlayer() {
  const loader = new GLTFLoader();
  const url = new URL("../assets/player/humanMaleA_v15.glb", import.meta.url).href;
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
  // The file has idle, walk, and run. He only moves at PLAYER_SPEED, so a step plays
  // the full run. Walk stays in the mixer so every clip is playing.
  const actions = {
    idle: mixer.clipAction(clipNamed(gltf.animations, "idle")),
    walk: mixer.clipAction(clipNamed(gltf.animations, "walk")),
    run: mixer.clipAction(clipNamed(gltf.animations, "run")),
  };

  // webgl_animation_skinning_blending.html: every action stays playing, and a
  // change of clip is setWeight + crossFadeTo. crossFadeTo's fade-out sets
  // enabled to false and warps timeScale, so the next blend has to turn the
  // incoming action back on and clear that warp before it fades.
  function setWeight(action, weight) {
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(weight);
  }

  function crossFade(from, to) {
    to.paused = false;
    setWeight(to, 1);
    to.time = 0;
    from.crossFadeTo(to, FADE, true);
  }

  setWeight(actions.idle, 1);
  setWeight(actions.walk, 0);
  setWeight(actions.run, 0);
  actions.idle.play();
  actions.walk.play();
  actions.run.play();
  // Bones are still the bind T until the mixer writes. Do that before the
  // first paint, while idle is the only action with weight.
  mixer.update(0);

  let playing = "idle";
  let then = performance.now();
  let listener = null;
  // Half a run cycle. The first plant is STEP_MARKS[0] into the clip.
  const stepGap = STEP_MARKS[1] - STEP_MARKS[0];
  let sinceStep = 0;
  let wasStepping = false;
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
    crossFade(actions[playing], actions[name]);
    playing = name;
  }

  function face(dx, dz) {
    holder.rotation.y = Math.atan2(dx, dz);
  }

  function place(x, z, y) {
    const feet = y == null ? FEET_Y : y;
    holder.position.set(x, feet, z);
    shadow.position.set(x, feet - (FEET_Y - SHADOW_Y), z);
  }

  return {
    mesh: holder,
    shadow,
    speed: PLAYER_SPEED,
    useListener,
    update(dx, dz, x, z, y) {
      const now = performance.now();
      const dt = Math.min((now - then) / 1000, 0.05);
      then = now;
      const dist = Math.hypot(dx, dz);
      const stepping = dist > 0.001 && dist < PLACE_STEP;
      if (stepping) {
        face(dx, dz);
        show("run");
      } else if (dist < PLACE_STEP) {
        show("idle");
      }
      mixer.update(dt);
      // The mesh is hidden in a car. A jump is a huge step, not a footfall.
      // Steps follow the run clip: first plant at 0.208s, then every 0.375s.
      if (holder.visible && stepping && playing === "run") {
        if (!wasStepping) sinceStep = stepGap - STEP_MARKS[0];
        wasStepping = true;
        sinceStep += dt;
        if (sinceStep >= stepGap) {
          sinceStep -= stepGap;
          playFootstep();
        }
      } else {
        wasStepping = false;
      }
      place(x, z, y);
    },
  };
}
