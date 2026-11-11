// Staged opening clip. The car move is timed by hand.
// It does not use the city, the driving physics, or the combat code.

import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { menuRevealed, openMenu } from "./start-menu.js";

const HOLD = 8;
const DRIVE = 1.05;
const SETTLE = 0.5;
const DOOR = 0.7;
const WALK = 1.2;
const AIM = 0.4;
const SHOOT = 0.6;
const WOMAN_HEIGHT = 1.75;
const CAR_LENGTH = 4.1;
const WOMAN_Z = 1.5;
const CAR_X = 0.15;
// glTF characters face +Z. The camera sits on +Z, so this keeps them looking at it.
const FACE_Y = 0;

const WOMEN = [
  { file: "woman_standing_v12.glb", role: "standing", x: -2.85, yaw: 0.2 },
  { file: "female_cowgirl_v4.glb", role: "cowgirl", x: CAR_X, yaw: 0 },
  { file: "woman_sexy_pose_v16.glb", role: "pose", x: 2.85, yaw: -0.2 },
];

const look = new Vector3(0, 1.55, 0.6);
const handPoint = new Vector3();

let scene = null;
let camera = null;
let renderer = null;
let looping = false;
let frameId = 0;
let last = 0;
let castSettled = false;
let carCast = null;
let playerCast = null;

const state = {
  phase: "load",
  time: 0,
  shake: 0,
  hit: false,
  wall: null,
  cow: null,
  car: null,
  player: null,
  shards: [],
  muzzle: null,
};

function showIntroError(message) {
  const el = document.getElementById("intro-error");
  if (!el || !message) return;
  const lines = el.dataset.lines ? el.dataset.lines.split("\n") : [];
  if (!lines.includes(message)) lines.push(message);
  el.dataset.lines = lines.join("\n");
  el.hidden = false;
  el.textContent = lines.join("\n");
  const status = document.getElementById("intro-status");
  if (status) status.hidden = true;
}

function smooth(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function showMeshes(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

function fitHeight(object, height) {
  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  const measured = Math.max(0.001, bounds.max.y - bounds.min.y);
  object.scale.multiplyScalar(height / measured);
  object.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(object);
  object.position.x -= (fitted.min.x + fitted.max.x) / 2;
  object.position.y -= fitted.min.y;
  object.position.z -= (fitted.min.z + fitted.max.z) / 2;
}

function holdPose(root, animations) {
  if (!animations || !animations.length) return;
  const mixer = new AnimationMixer(root);
  const clip = animations[0];
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  if (clip.duration > 0) action.time = Math.max(0, clip.duration - 0.001);
  mixer.update(0.016);
  action.paused = true;
}

function drawWindows(ctx, x, y, w, h) {
  const stepX = 16;
  const stepY = 20;
  for (let row = 12; row < h - 14; row += stepY) {
    for (let col = 8; col < w - 8; col += stepX) {
      if ((row / stepY + col / stepX) % 5 === 0) continue;
      ctx.fillStyle = (row + col) % 32 === 0 ? "#ffe14a" : "#d5e2ee";
      ctx.fillRect(x + col, y + row, 4, 7);
    }
  }
}

function drawSpire(ctx, x, top, w) {
  ctx.fillStyle = "#d5e2ee";
  ctx.fillRect(x + w / 2 - 2, top - 70, 4, 70);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, top - 92);
  ctx.lineTo(x + w / 2 + 7, top - 62);
  ctx.lineTo(x + w / 2 - 7, top - 62);
  ctx.fill();
}

function drawSkyline(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#243244");
  sky.addColorStop(0.55, "#172230");
  sky.addColorStop(1, "#101820");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const ground = height * 0.9;
  const towers = [
    { x: 36, w: 78, h: 150, color: "#5a697c" },
    { x: 124, w: 64, h: 250, color: "#6d7d92", crown: "step" },
    { x: 198, w: 54, h: 320, color: "#4e5e72", crown: "spire" },
    { x: 262, w: 96, h: 190, color: "#3f4e60" },
    { x: 370, w: 70, h: 280, color: "#647488", crown: "slant" },
    { x: 450, w: 120, h: 160, color: "#556476" },
    { x: 980, w: 110, h: 175, color: "#5c6b7e" },
    { x: 1100, w: 64, h: 300, color: "#738398", crown: "step" },
    { x: 1174, w: 86, h: 230, color: "#465566", crown: "slant" },
    { x: 1270, w: 70, h: 270, color: "#66768a", crown: "spire" },
    { x: 1350, w: 100, h: 150, color: "#516070" },
    { x: 1460, w: 90, h: 200, color: "#5e6e82" },
  ];

  for (const tower of towers) {
    const top = ground - tower.h;
    ctx.fillStyle = tower.color;
    ctx.fillRect(tower.x, top, tower.w, tower.h);
    drawWindows(ctx, tower.x, top, tower.w, tower.h);
    if (tower.crown === "spire") drawSpire(ctx, tower.x, top, tower.w);
    if (tower.crown === "step") {
      ctx.fillStyle = tower.color;
      ctx.fillRect(tower.x + 12, top - 28, tower.w - 24, 28);
      ctx.fillRect(tower.x + 24, top - 48, tower.w - 48, 20);
    }
    if (tower.crown === "slant") {
      ctx.fillStyle = tower.color;
      ctx.beginPath();
      ctx.moveTo(tower.x + 8, top);
      ctx.lineTo(tower.x + tower.w - 8, top);
      ctx.lineTo(tower.x + tower.w * 0.72, top - 54);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#101820";
  ctx.fillRect(0, ground, width, height - ground);
  ctx.strokeStyle = "#1d2836";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const y = ground + 8 + i * 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.font = `900 ${Math.floor(height * 0.34)}px Impact, "Arial Black", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 22;
  ctx.strokeStyle = "#050608";
  ctx.lineJoin = "round";
  ctx.strokeText("DSA", width / 2, height * 0.46);
  ctx.fillStyle = "#f7f4ec";
  ctx.fillText("DSA", width / 2, height * 0.46);
}

function skylineTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 640;
  drawSkyline(canvas.getContext("2d"), canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const paint = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  paint.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  paint.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function flashTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const paint = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  paint.addColorStop(0, "rgba(255, 250, 230, 1)");
  paint.addColorStop(0.35, "rgba(255, 214, 90, 0.95)");
  paint.addColorStop(1, "rgba(255, 160, 40, 0)");
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function bloodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const blobs = [
    [128, 128, 74, 56],
    [156, 108, 36, 26],
    [92, 146, 40, 22],
    [168, 156, 28, 18],
    [78, 104, 22, 16],
    [146, 176, 34, 16],
    [118, 86, 16, 12],
  ];
  for (const [x, y, rx, ry] of blobs) {
    ctx.fillStyle = "rgba(176, 6, 16, 0.94)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function loadGltf(url, label) {
  try {
    return await new GLTFLoader().loadAsync(url);
  } catch {
    showIntroError(`The intro model failed to load: ${label}`);
    return null;
  }
}

function takeClip(animations, name) {
  const clip = animations.find((item) => item.name === name);
  if (!clip) {
    showIntroError(`The player model is missing the ${name} animation.`);
    return null;
  }
  return clip;
}

function frontWheelSide(object) {
  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  const center = (bounds.min.z + bounds.max.z) / 2;
  let sum = 0;
  let count = 0;
  object.traverse((child) => {
    if (!child.name || !child.name.startsWith("wheel-front")) return;
    sum += child.getWorldPosition(new Vector3()).z;
    count += 1;
  });
  if (!count) return 1;
  return sum / count - center;
}

function prepareCar(gltf) {
  const model = gltf.scene;
  showMeshes(model);
  model.updateMatrixWorld(true);
  let bounds = new Box3().setFromObject(model);
  if (bounds.max.x - bounds.min.x > bounds.max.z - bounds.min.z) model.rotation.y += Math.PI / 2;
  if (frontWheelSide(model) < 0) model.rotation.y += Math.PI;
  model.updateMatrixWorld(true);
  bounds = new Box3().setFromObject(model);
  const measured = Math.max(0.001, bounds.max.z - bounds.min.z);
  model.scale.multiplyScalar(CAR_LENGTH / measured);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.x -= (fitted.min.x + fitted.max.x) / 2;
  model.position.y -= fitted.min.y;
  model.position.z -= (fitted.min.z + fitted.max.z) / 2;
  model.updateMatrixWorld(true);

  const group = new Group();
  group.add(model);
  const box = new Box3().setFromObject(group);
  const height = box.max.y - box.min.y;
  const length = box.max.z - box.min.z;
  const hinge = new Group();
  hinge.position.set(box.min.x + 0.02, height * 0.52, box.max.z - length * 0.22);
  const door = new Mesh(
    new BoxGeometry(0.07, height * 0.46, length * 0.3),
    new MeshLambertMaterial({ color: 0xd5d8df, toneMapped: false }),
  );
  door.position.set(-0.04, 0, -length * 0.15);
  const glass = new Mesh(
    new PlaneGeometry(length * 0.14, height * 0.16),
    new MeshBasicMaterial({ color: 0x9fd7ff, toneMapped: false }),
  );
  glass.position.set(-0.04, height * 0.06, 0.02);
  door.add(glass);
  hinge.add(door);
  group.add(hinge);

  const bulb = new MeshBasicMaterial({ color: 0xfff4d2, toneMapped: false });
  const lampY = height * 0.4;
  const lampZ = box.max.z - 0.06;
  const lampX = (box.max.x - box.min.x) * 0.28;
  for (const side of [-1, 1]) {
    const lamp = new Mesh(new SphereGeometry(0.07, 12, 8), bulb);
    lamp.position.set(side * lampX, lampY, lampZ);
    group.add(lamp);
  }
  const nose = new PointLight(0xfff0cc, 70, 16, 2);
  nose.position.set(0, lampY, box.max.z);
  group.add(nose);
  group.position.set(CAR_X, 0, -(length * 0.5) - 0.25);

  return { group, hinge, box, length, doorZ: hinge.position.z };
}

function preparePlayer(gltf) {
  const walkClip = takeClip(gltf.animations, "Walk_Loop");
  const shootClip = takeClip(gltf.animations, "Pistol_Shoot");
  if (!walkClip || !shootClip) return null;
  const model = gltf.scene;
  showMeshes(model);
  const mixer = new AnimationMixer(model);
  const walk = mixer.clipAction(walkClip);
  const shoot = mixer.clipAction(shootClip);
  shoot.setLoop(LoopOnce, 1);
  shoot.clampWhenFinished = true;
  walk.play();
  shoot.play();
  shoot.setEffectiveWeight(0);
  mixer.update(0);
  fitHeight(model, WOMAN_HEIGHT);
  const group = new Group();
  group.add(model);
  group.visible = false;
  group.position.set(0, 0, -4);
  return { group, model, mixer, walk, shoot, from: new Vector3(), to: new Vector3(), yaw: 0 };
}

async function loadWomen() {
  const loaded = [];
  for (const item of WOMEN) {
    const url = new URL(`../06 Player Character/new try out horor/${item.file}`, import.meta.url).href;
    const gltf = await loadGltf(url, item.file);
    if (!gltf || menuRevealed() || !looping) return false;
    const model = gltf.scene;
    showMeshes(model);
    holdPose(model, gltf.animations);
    model.updateMatrixWorld(true);
    fitHeight(model, WOMAN_HEIGHT);
    const group = new Group();
    group.add(model);
    const shadow = new Mesh(
      new PlaneGeometry(1.2, 0.6),
      new MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);
    group.position.set(item.x, 0, WOMAN_Z);
    group.rotation.y = FACE_Y + item.yaw;
    scene.add(group);
    const record = { role: item.role, group, flying: false, vx: 0, vy: 0, vz: 0, spin: 0 };
    loaded.push(record);
    if (item.role === "cowgirl") state.cow = record;
  }
  return loaded.length === WOMEN.length && state.cow;
}

async function loadCar() {
  const url = new URL("../assets/cars3d/weathered/sedan-L2.glb", import.meta.url).href;
  const gltf = await loadGltf(url, "sedan-L2.glb");
  if (!gltf) return null;
  return prepareCar(gltf);
}

async function loadPlayer() {
  const url = new URL("../06 Player Character/gubbe.glb", import.meta.url).href;
  const gltf = await loadGltf(url, "gubbe.glb");
  if (!gltf) return null;
  const player = preparePlayer(gltf);
  if (!player || menuRevealed() || !looping) return player;
  scene.add(player.group);
  return player;
}

function shatterWall() {
  const wall = state.wall;
  if (!wall || wall.userData.broke) return;
  wall.userData.broke = true;
  wall.visible = false;
  const mat = new MeshBasicMaterial({ color: 0x8d9aab, toneMapped: false, side: DoubleSide });
  for (let i = 0; i < 9; i += 1) {
    const mesh = new Mesh(new PlaneGeometry(0.5 + (i % 3) * 0.22, 0.38 + (i % 2) * 0.28), mat);
    mesh.position.set(-2.2 + (i % 5) * 0.95, 0.7 + (i % 4) * 0.65, 0.2);
    scene.add(mesh);
    state.shards.push({
      mesh,
      v: new Vector3((i - 4) * 0.7, 1.1 + (i % 3) * 0.4, 1.2 + i * 0.12),
      spin: (i % 2 ? 1 : -1) * (2 + i * 0.15),
    });
  }
}

function impact() {
  if (state.hit) return;
  state.hit = true;
  state.shake = 0.45;
  shatterWall();
  const cow = state.cow;
  if (!cow) return;
  cow.flying = true;
  cow.vx = 1.7;
  cow.vy = 2.7;
  cow.vz = 2.8;
  cow.spin = 5.2;
  const map = bloodTexture();
  const spriteMat = new SpriteMaterial({
    map,
    color: 0xff1a22,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const stain = new Sprite(spriteMat);
  stain.position.set(0, 1.2, 0.2);
  stain.scale.set(1.45, 1.45, 1);
  stain.frustumCulled = false;
  cow.group.add(stain);
  const floor = new Mesh(
    new PlaneGeometry(1.6, 1),
    new MeshBasicMaterial({
      map,
      color: 0xff1a22,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cow.group.position.x, 0.045, cow.group.position.z);
  floor.frustumCulled = false;
  scene.add(floor);
}

function beginWalk() {
  const car = state.car;
  const player = state.player;
  if (!car || !player) return;
  const from = new Vector3(
    car.group.position.x + car.box.min.x - 0.25,
    0,
    car.group.position.z + car.doorZ,
  );
  const to = new Vector3(from.x - 0.9, 0, from.z + 1.65);
  player.from.copy(from);
  player.to.copy(to);
  player.group.visible = true;
  player.group.position.copy(from);
  player.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  player.yaw = player.group.rotation.y;
  player.walk.setEffectiveWeight(1);
  player.shoot.setEffectiveWeight(0);
  player.walk.reset().play();
}

function beginAim() {
  const player = state.player;
  player.yaw = player.group.rotation.y;
  player.walk.setEffectiveWeight(0);
  player.shoot.setEffectiveWeight(1);
  player.shoot.reset().play();
  state.phase = "aim";
  state.time = 0;
}

function flyCowgirl(dt) {
  const cow = state.cow;
  if (!cow || !cow.flying) return;
  cow.vy -= 12 * dt;
  cow.group.position.x += cow.vx * dt;
  cow.group.position.y += cow.vy * dt;
  cow.group.position.z += cow.vz * dt;
  cow.group.rotation.z += cow.spin * dt;
  cow.group.rotation.x += cow.spin * 0.35 * dt;
  if (cow.group.position.y <= 0 && cow.vy < 0) {
    cow.group.position.y = 0;
    cow.flying = false;
  }
}

function moveShards(dt) {
  for (const shard of state.shards) {
    shard.v.y -= 6 * dt;
    shard.mesh.position.addScaledVector(shard.v, dt);
    shard.mesh.rotation.z += shard.spin * dt;
    shard.mesh.rotation.x += shard.spin * 0.4 * dt;
  }
}

function placeCamera() {
  const drift = state.phase === "hold" ? Math.sin(state.time * 0.35) * 0.08 : 0;
  camera.position.set(0.35 + drift, 1.9, 8.8);
  let shakeX = 0;
  let shakeY = 0;
  if (state.shake > 0) {
    const mag = state.shake * 0.22;
    shakeX = Math.sin(state.time * 46) * mag;
    shakeY = Math.cos(state.time * 33) * mag * 0.55;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
  }
  camera.lookAt(look.x + shakeX * 0.35, look.y, look.z);
}

function stepHold() {
  if (state.time < HOLD) return;
  if (!castSettled) {
    const status = document.getElementById("intro-status");
    if (status) {
      status.hidden = false;
      status.textContent = "Loading the car…";
    }
    return;
  }
  const status = document.getElementById("intro-status");
  if (status) status.hidden = true;
  if (!carCast || !state.cow) {
    state.phase = "stuck";
    return;
  }
  carCast.group.visible = true;
  carCast.hitZ = state.cow.group.position.z - carCast.length * 0.5 + 0.3;
  carCast.stopZ = carCast.hitZ + 1.05;
  carCast.startZ = carCast.group.position.z;
  state.car = carCast;
  state.player = playerCast;
  state.phase = "drive";
  state.time = 0;
}

function stepDrive() {
  const car = state.car;
  const t = Math.min(1, state.time / DRIVE);
  car.group.position.z = car.startZ + (car.hitZ - car.startZ) * t * t;
  if (car.group.position.z + car.length * 0.5 > 0.02) shatterWall();
  if (t < 1) return;
  impact();
  state.phase = "settle";
  state.time = 0;
}

function stepSettle() {
  const car = state.car;
  const t = Math.min(1, state.time / SETTLE);
  car.group.position.z = car.hitZ + (car.stopZ - car.hitZ) * (1 - (1 - t) * (1 - t));
  if (t < 1) return;
  state.phase = "door";
  state.time = 0;
}

function stepDoor() {
  const t = Math.min(1, state.time / DOOR);
  state.car.hinge.rotation.y = -1.2 * smooth(t);
  if (t < 1) return;
  if (!state.player) {
    state.phase = "stuck";
    return;
  }
  beginWalk();
  state.phase = "walk";
  state.time = 0;
}

function stepWalk() {
  const player = state.player;
  const t = Math.min(1, state.time / WALK);
  player.group.position.lerpVectors(player.from, player.to, smooth(t));
  if (t < 1) return;
  beginAim();
}

function stepAim() {
  const player = state.player;
  const face = Math.atan2(
    camera.position.x - player.group.position.x,
    camera.position.z - player.group.position.z,
  );
  player.group.rotation.y = lerpAngle(player.yaw, face, smooth(state.time / AIM));
  if (state.time < AIM) return;
  state.phase = "shoot";
  state.time = 0;
}

function stepShoot() {
  const flash = document.getElementById("intro-flash");
  const show = state.time > 0.06 && state.time < 0.24;
  if (state.muzzle) {
    state.muzzle.visible = show;
    const hand = state.player.model.getObjectByName("RightHand");
    if (hand) hand.getWorldPosition(handPoint);
    else handPoint.set(state.player.group.position.x, 1.35, state.player.group.position.z + 0.4);
    handPoint.z += 0.35;
    state.muzzle.position.copy(handPoint);
  }
  if (flash) flash.hidden = !show;
  if (state.time < SHOOT) return;
  if (flash) flash.hidden = true;
  state.phase = "done";
}

function step(dt) {
  state.time += dt;
  flyCowgirl(dt);
  moveShards(dt);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  if (state.phase === "hold") stepHold();
  else if (state.phase === "drive") stepDrive();
  else if (state.phase === "settle") stepSettle();
  else if (state.phase === "door") stepDoor();
  else if (state.phase === "walk") stepWalk();
  else if (state.phase === "aim") stepAim();
  else if (state.phase === "shoot") stepShoot();
  if (state.player && state.player.group.visible) state.player.mixer.update(dt);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
}

function stopLoop() {
  if (!looping) return;
  looping = false;
  cancelAnimationFrame(frameId);
  window.removeEventListener("resize", onResize);
  if (!renderer) return;
  renderer.dispose();
  try {
    renderer.forceContextLoss();
  } catch {
    // The context can already be gone.
  }
  renderer = null;
}

function endClip() {
  stopLoop();
  openMenu();
}

function frame(now) {
  if (!looping) return;
  if (menuRevealed()) {
    stopLoop();
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  if (!looping || menuRevealed() || state.phase === "done") {
    endClip();
    return;
  }
  placeCamera();
  renderer.render(scene, camera);
  frameId = requestAnimationFrame(frame);
}

function buildRoom() {
  const canvas = document.getElementById("intro-view");
  renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) {
    throw new Error("WebGL is not available for the intro.");
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  scene = new Scene();
  camera = new PerspectiveCamera(40, 1, 0.08, 40);
  onResize();

  const wallMap = skylineTexture();
  wallMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wall = new Mesh(
    new PlaneGeometry(12, 4.8),
    new MeshBasicMaterial({ map: wallMap, toneMapped: false }),
  );
  wall.position.set(0, 2.4, 0);
  scene.add(wall);
  state.wall = wall;

  const floor = new Mesh(
    new PlaneGeometry(18, 18),
    new MeshLambertMaterial({ color: 0x12141a, toneMapped: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const sideMat = new MeshBasicMaterial({ color: 0x050505, toneMapped: false, side: DoubleSide });
  for (const side of [-1, 1]) {
    const sideWall = new Mesh(new PlaneGeometry(10, 4.8), sideMat);
    sideWall.position.set(side * 6, 2.4, 2);
    sideWall.rotation.y = side * Math.PI / 2;
    scene.add(sideWall);
  }

  scene.add(new HemisphereLight(0xd7e2ee, 0x1a1c20, Math.PI * 0.75));
  const key = new DirectionalLight(0xfff6ea, Math.PI * 1.45);
  key.position.set(2.2, 6.2, 8);
  scene.add(key);

  state.muzzle = new Sprite(new SpriteMaterial({
    map: flashTexture(),
    color: 0xfff2c8,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  state.muzzle.scale.set(0.55, 0.55, 1);
  state.muzzle.visible = false;
  state.muzzle.frustumCulled = false;
  scene.add(state.muzzle);
}

async function loadAll() {
  const womenTask = loadWomen();
  const carTask = loadCar().catch((error) => {
    showIntroError(error instanceof Error ? error.message : "The car model failed to load.");
    return null;
  });
  const playerTask = loadPlayer().catch((error) => {
    showIntroError(error instanceof Error ? error.message : "The player model failed to load.");
    return null;
  });
  const womenOk = await womenTask;
  if (menuRevealed() || !looping) return;
  if (womenOk) {
    state.phase = "hold";
    state.time = 0;
    const status = document.getElementById("intro-status");
    if (status) status.hidden = true;
  } else {
    state.phase = "stuck";
  }
  const [car, player] = await Promise.all([carTask, playerTask]);
  if (menuRevealed() || !looping) return;
  carCast = car;
  playerCast = player;
  castSettled = true;
  if (car) {
    car.group.visible = false;
    scene.add(car.group);
  }
}

function startIntro() {
  if (menuRevealed()) return;
  try {
    buildRoom();
  } catch (error) {
    showIntroError(error instanceof Error ? error.message : "The intro failed to start.");
    return;
  }
  looping = true;
  last = performance.now();
  window.addEventListener("resize", onResize);
  frameId = requestAnimationFrame(frame);
  void loadAll();
}

startIntro();
