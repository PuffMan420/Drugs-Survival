import {
  AnimationMixer,
  AnimationUtils,
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Brisk walk. The live speed stays here; constants.js mirrors it.
const SPEED = 80;
// Blue sedan footprint in js/cars.js (assets/cars3d/sedan.glb): 37 wide, 71 long.
// A real height is a third of that length. He is drawn a bit larger than that
// so he reads clearly beside the cars. Shoulders stay inside the sedan's width.
const SEDAN_LENGTH = 71;
const SCALE_BUMP = 1.15;
// Tires sit at this height. His soles use the same ground.
const FEET_Y = 0.6;
const SHADOW_Y = 0.35;
// Map jumps (keys 1-9) move hundreds of units in one frame. A shove never does.
const JUMP_STEP = 200;
const FADE = 0.12;

function shadowTexture() {
  const width = 32;
  const height = 16;
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
      const alpha = dist >= 1 ? 0 : Math.round(140 * (1 - dist) ** 2);
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
  const url = new URL("../assets/player/humanMaleA_v10.glb", import.meta.url).href;
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch {
    throw new Error("The player model failed to load.");
  }

  const model = gltf.scene;
  litMaterials(model);
  // The figure faces +Z. atan2(east, south) turns that axis toward travel.
  const bounds = new Box3().setFromObject(model);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = (SEDAN_LENGTH / 3) * SCALE_BUMP / height;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.y -= fitted.min.y;

  const holder = new Group();
  holder.frustumCulled = false;
  holder.add(model);

  const shadow = new Mesh(new PlaneGeometry(9, 4.5), new MeshBasicMaterial({
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
  // The run clip's loop point is this skeleton's bind pose, arms straight out.
  // Frames 5–13 (24 fps) are the stride itself: arms stay down, legs stay bent.
  const runClip = AnimationUtils.subclip(clipNamed(gltf.animations, "run"), "run", 5, 13, 24);
  const actions = {
    idle: mixer.clipAction(clipNamed(gltf.animations, "idle")),
    run: mixer.clipAction(runClip),
    jump: mixer.clipAction(clipNamed(gltf.animations, "jump")),
  };
  actions.jump.setLoop(LoopOnce, 1);
  // Leaving this false disables the action when the clip ends. A disabled
  // action contributes no weight, and the mixer then writes the bind pose back.
  actions.jump.clampWhenFinished = true;

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
  setWeight(actions.run, 0);
  setWeight(actions.jump, 0);
  actions.idle.play();
  actions.run.play();
  actions.jump.play();
  // LoopOnce would otherwise play the jump out while its weight is still 0.
  actions.jump.paused = true;
  // Bones are still the bind T until the mixer writes. Do that before the
  // first paint, while idle is the only action with weight.
  mixer.update(0);

  let playing = "idle";
  let moving = false;
  let then = performance.now();

  function show(name) {
    if (name === playing) return;
    const next = actions[name];
    if (name === "jump") next.reset();
    crossFade(actions[playing], next);
    playing = name;
  }

  mixer.addEventListener("finished", (event) => {
    if (event.action !== actions.jump || playing !== "jump") return;
    show(moving ? "run" : "idle");
  });

  function face(dx, dz) {
    holder.rotation.y = Math.atan2(dx, dz);
  }

  function place(x, z) {
    holder.position.set(x, FEET_Y, z);
    shadow.position.set(x, SHADOW_Y, z);
  }

  return {
    mesh: holder,
    shadow,
    speed: SPEED,
    update(dx, dz, x, z) {
      const now = performance.now();
      const dt = Math.min((now - then) / 1000, 0.05);
      then = now;
      const dist = Math.hypot(dx, dz);
      moving = dist > 0.001 && dist < JUMP_STEP;
      if (dist >= JUMP_STEP) {
        face(dx, dz);
        show("jump");
      } else if (moving) {
        face(dx, dz);
        show("run");
      } else if (playing !== "jump") {
        show("idle");
      }
      mixer.update(dt);
      place(x, z);
    },
  };
}
