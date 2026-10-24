import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Brisk walk. The live speed stays here; constants.js mirrors it.
const SPEED = 80;
// Blue sedan footprint in js/cars.js (assets/cars3d/sedan.glb): 37 wide, 71 long.
// He stands about a third of that length. Shoulders on this model are about
// a quarter of his height, so they stay well inside the sedan's width.
const SEDAN_LENGTH = 71;
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
  // The city is unlit. A standard material would render black, so the albedo
  // is drawn with the same basic material the cars use.
  const swapped = new Map();
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const sources = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = sources.map((source) => {
      if (swapped.has(source)) return swapped.get(source);
      const map = source.map ?? null;
      if (map) map.colorSpace = SRGBColorSpace;
      const basic = new MeshBasicMaterial({
        map,
        color: 0xffffff,
        toneMapped: false,
        fog: false,
        side: source.side ?? DoubleSide,
      });
      swapped.set(source, basic);
      source.dispose();
      return basic;
    });
    obj.material = next.length === 1 ? next[0] : next;
    obj.frustumCulled = false;
  });
}

function clipNamed(animations, name) {
  const clip = animations.find((item) => item.name === name);
  if (!clip) throw new Error(`The player model is missing the ${name} animation.`);
  return clip;
}

// Idle only sways on the T-pose. The upper-arm bone points along its local +Y,
// and the two arms are not the same twist, so each one takes the shortest swing
// that aims that axis down. No extra roll, so the shoulder blend and the sleeve
// stay on the bone. The forearm then bends a little toward the front. Hands are
// left on the forearm. The same turns apply to every key, and the sway stays.
const ARM_OUT = 0.14;
const ELBOW_FORWARD = 0.1;

function premultiplyTrack(clip, boneName, extra) {
  const track = clip.tracks.find((item) => item.name === `${boneName}.quaternion`);
  if (!track) return;
  const turn = new Quaternion();
  const values = track.values;
  for (let i = 0; i < values.length; i += 4) {
    turn.fromArray(values, i).premultiply(extra);
    turn.toArray(values, i);
  }
}

function aimBone(bone, direction) {
  const parentQ = bone.parent.getWorldQuaternion(new Quaternion());
  const worldQ = bone.getWorldQuaternion(new Quaternion());
  const from = new Vector3(0, 1, 0).applyQuaternion(worldQ).normalize();
  const align = new Quaternion().setFromUnitVectors(from, direction.clone().normalize());
  bone.quaternion.copy(parentQ.clone().invert().multiply(align.multiply(worldQ)));
  bone.updateMatrixWorld(true);
}

function standingIdle(model, clip) {
  const edited = clip.clone();
  model.updateMatrixWorld(true);
  const posed = ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"];
  const bind = new Map(posed.map((name) => [name, model.getObjectByName(name).quaternion.clone()]));
  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? 1 : -1;
    const arm = model.getObjectByName(`${side}Arm`);
    aimBone(arm, new Vector3(sign * ARM_OUT, -1, 0));
    const fore = model.getObjectByName(`${side}ForeArm`);
    const foreDir = new Vector3(0, 1, 0).applyQuaternion(fore.getWorldQuaternion(new Quaternion()));
    aimBone(fore, foreDir.add(new Vector3(0, 0, ELBOW_FORWARD)));
  }
  for (const name of posed) {
    const bone = model.getObjectByName(name);
    const extra = bone.quaternion.clone().multiply(bind.get(name).clone().invert());
    premultiplyTrack(edited, name, extra);
    bone.quaternion.copy(bind.get(name));
  }
  model.updateMatrixWorld(true);
  return edited;
}

export async function createPlayer() {
  const loader = new GLTFLoader();
  const url = new URL("../assets/player/humanMaleA_v8.glb", import.meta.url).href;
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
  const scale = (SEDAN_LENGTH / 3) / height;
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
  const actions = {
    idle: mixer.clipAction(standingIdle(model, clipNamed(gltf.animations, "idle"))),
    run: mixer.clipAction(clipNamed(gltf.animations, "run")),
    jump: mixer.clipAction(clipNamed(gltf.animations, "jump")),
  };
  actions.jump.setLoop(LoopOnce, 1);
  actions.jump.clampWhenFinished = true;
  actions.idle.play();

  let playing = "idle";
  let moving = false;
  let then = performance.now();

  function play(name) {
    if (name === playing) return;
    const next = actions[name];
    const prev = actions[playing];
    // A finished fade-out disables the action. play() does not turn it back on,
    // so returning to idle (or leaving it) would freeze on the T-pose bind.
    if (name === "jump") next.reset();
    next.enabled = true;
    next.paused = false;
    next.fadeIn(FADE).play();
    prev.fadeOut(FADE);
    playing = name;
  }

  mixer.addEventListener("finished", (event) => {
    if (event.action !== actions.jump || playing !== "jump") return;
    play(moving ? "run" : "idle");
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
        play("jump");
      } else if (moving) {
        face(dx, dz);
        play("run");
      } else if (playing !== "jump") {
        play("idle");
      }
      mixer.update(dt);
      place(x, z);
    },
  };
}
