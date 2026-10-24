import {
  NoToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import {
  CAMERA_HEIGHT,
  CAMERA_TILT,
  GROUND_H,
  GROUND_W,
  PLAYER_SIZE,
  TILE,
} from "./constants.js";
import { createTraffic } from "./cars.js";
import { buildCity, tileAt, tileCenter, updateChunks } from "./city.js";
import { createGlow } from "./glow.js";
import { createMinimap } from "./minimap.js";
import { createPlayer } from "./player.js";

const NEAR = 10;
const FAR = 6000;

const canvas = document.getElementById("view");
const fpsEl = document.getElementById("fps");
const errorEl = document.getElementById("boot-error");
const placeEl = document.getElementById("place");

const held = new Set();
const MOVE = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const JUMPS = [
  { name: "Northwest ring", x: 41, z: 40 },
  { name: "North avenue", x: 130, z: 34 },
  { name: "Northeast corner", x: 220, z: 28 },
  { name: "West avenue", x: 40, z: 126 },
  { name: "Midtown", x: 130, z: 126 },
  { name: "East avenue", x: 220, z: 128 },
  { name: "Southwest quay", x: 52, z: 200 },
  { name: "South shore", x: 138, z: 196 },
  { name: "Southeast ring", x: 214, z: 205 },
];

const session = {
  ready: false,
  map: null,
  player: null,
  minimap: null,
  placeName: "Downtown",
};

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
  fpsEl.hidden = true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lockPixelProjection(camera) {
  const apply = () => {
    // The center ray meets the ground farther out than the camera's height,
    // because the camera is tilted. Frame the smaller ground rectangle there
    // so the 12.5% closer view stays even across the same 840×472.5 world.
    const distance = CAMERA_HEIGHT / Math.cos(CAMERA_TILT);
    const scale = camera.near / distance;
    camera.projectionMatrix.makePerspective(
      (-GROUND_W / 2) * scale,
      (GROUND_W / 2) * scale,
      (GROUND_H / 2) * scale,
      (-GROUND_H / 2) * scale,
      camera.near,
      camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  camera.updateProjectionMatrix = apply;
  apply();
}

function fitDisplay(renderer) {
  // Same 16:9 frame as the ground the camera shows. Draw it into the canvas
  // at the window's own pixels, with devicePixelRatio capped at 2.
  const unit = Math.min(window.innerWidth / 16, window.innerHeight / 9);
  const width = Math.max(1, Math.round(unit * 16));
  const height = Math.max(1, Math.round(width * 9 / 16));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
}

function blocked(map, x, z) {
  // The square's corners have to stay off water and off building footprints.
  // Roads, sidewalks, parks, docks, and plazas stay open.
  const reach = PLAYER_SIZE / 2 - 0.01;
  const samples = [
    [x - reach, z - reach],
    [x + reach, z - reach],
    [x - reach, z + reach],
    [x + reach, z + reach],
  ];
  for (const [sx, sz] of samples) {
    const tile = tileAt(map, sx, sz);
    if (tile === "~" || tile === "b") return true;
  }
  return false;
}

async function start() {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) {
    showError("WebGL is not available in this browser.");
    return;
  }

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x102028, 1);
  fitDisplay(renderer);
  window.addEventListener("resize", () => fitDisplay(renderer));

  fpsEl.textContent = "Loading map…";
  const map = await fetch("./data/city.json").then((response) => {
    if (!response.ok) throw new Error("The city map failed to load.");
    return response.json();
  });
  fpsEl.textContent = "Building city…";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const scene = new Scene();
  const city = await buildCity(scene, map);
  city.playerMesh.removeFromParent();
  city.playerMesh.geometry.dispose();
  for (const material of city.playerMesh.material) material.dispose();
  const playerSprite = await createPlayer();
  scene.add(playerSprite.shadow);
  scene.add(playerSprite.mesh);
  const traffic = await createTraffic(scene, map);
  const glow = createGlow(scene, map);
  const minimap = createMinimap(map, JUMPS);
  const camera = new PerspectiveCamera(15, GROUND_W / GROUND_H, NEAR, FAR);
  const tiltUp = Math.sin(CAMERA_TILT);
  const tiltNorth = Math.cos(CAMERA_TILT);
  camera.up.set(0, tiltUp, -tiltNorth);
  lockPixelProjection(camera);
  const cameraSouth = Math.round(CAMERA_HEIGHT * Math.tan(CAMERA_TILT));
  const origin = tileCenter(map.spawn.x, map.spawn.z);
  const player = { x: origin.x, z: origin.z };
  const half = PLAYER_SIZE / 2;

  session.ready = true;
  session.map = map;
  session.player = player;
  session.minimap = minimap;
  placeEl.textContent = "Downtown";

  let fps = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const previousX = player.x;
    const previousZ = player.z;

    let moveX = 0;
    let moveZ = 0;
    if (held.has("KeyW") || held.has("ArrowUp")) moveZ -= 1;
    if (held.has("KeyS") || held.has("ArrowDown")) moveZ += 1;
    if (held.has("KeyA") || held.has("ArrowLeft")) moveX -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) moveX += 1;
    const radius = half + 0.75;
    const stuck = (x, z) => footBlocked(map, x, z, half);
    const release = () => {
      const freed = traffic.shove(player.x, player.z, radius, stuck);
      player.x = freed.x;
      player.z = freed.z;
    };
    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.hypot(moveX, moveZ);
      const stepX = (moveX / length) * playerSprite.speed * dt;
      const stepZ = (moveZ / length) * playerSprite.speed * dt;
      // Short slices so a fast step cannot hop through a narrow car.
      const slices = Math.max(1, Math.ceil(Math.hypot(stepX, stepZ) / 8));
      for (let slice = 0; slice < slices; slice += 1) {
        const nextX = player.x + stepX / slices;
        const nextZ = player.z + stepZ / slices;
        if (!blocked(map, nextX, player.z)) player.x = nextX;
        if (!blocked(map, player.x, nextZ)) player.z = nextZ;
        release();
      }
    } else {
      release();
    }
    player.x = clamp(player.x, half, city.mapW - half);
    player.z = clamp(player.z, half, city.mapH - half);

    let snappedX = Math.round(player.x);
    let snappedZ = Math.round(player.z);
    let camX = clamp(snappedX, GROUND_W / 2, city.mapW - GROUND_W / 2);
    let camZ = clamp(snappedZ, GROUND_H / 2, city.mapH - GROUND_H / 2);
    traffic.update(dt, camX, camZ, player.x, player.z);
    // A moving car can roll over the square after the step above.
    release();
    player.x = clamp(player.x, half, city.mapW - half);
    player.z = clamp(player.z, half, city.mapH - half);
    snappedX = Math.round(player.x);
    snappedZ = Math.round(player.z);
    playerSprite.update(player.x - previousX, player.z - previousZ, snappedX, snappedZ);
    camX = clamp(snappedX, GROUND_W / 2, city.mapW - GROUND_W / 2);
    camZ = clamp(snappedZ, GROUND_H / 2, city.mapH - GROUND_H / 2);
    glow.update(camX, camZ, traffic.lights(camX, camZ));
    camera.position.set(camX, CAMERA_HEIGHT, camZ + cameraSouth);
    camera.lookAt(camX, 0, camZ);
    updateChunks(city.chunks, camX, camZ);
    renderer.render(scene, camera);
    minimap.draw(camX, camZ, player.x, player.z, TILE, GROUND_W / TILE, GROUND_H / TILE);

    const instant = 1 / Math.max(dt, 1 / 240);
    fps = fps === 0 ? instant : fps + (instant - fps) * 0.1;
    fpsEl.textContent = `FPS ${Math.round(fps)}`;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function jumpTo(index) {
  if (!session.ready) return;
  const view = JUMPS[index];
  if (!view) return;
  const point = tileCenter(view.x, view.z);
  session.player.x = point.x;
  session.player.z = point.z;
  session.placeName = view.name;
  placeEl.textContent = view.name;
}

function footBlocked(map, x, z, limit) {
  if (x < limit || z < limit || x > map.cols * TILE - limit || z > map.rows * TILE - limit) return true;
  return blocked(map, x, z);
}

window.addEventListener("keydown", (event) => {
  if (MOVE.has(event.code)) {
    held.add(event.code);
    event.preventDefault();
    return;
  }
  if (event.code === "KeyM") {
    session.minimap?.toggle();
    event.preventDefault();
    return;
  }
  if (event.code === "Escape") {
    session.minimap?.close();
    return;
  }
  if (event.code.startsWith("Digit")) {
    const index = Number(event.code.slice(5)) - 1;
    if (index >= 0 && index < JUMPS.length) {
      jumpTo(index);
      event.preventDefault();
    }
  }
});

window.addEventListener("keyup", (event) => {
  held.delete(event.code);
});

window.addEventListener("blur", () => held.clear());

start().catch((error) => {
  showError(error instanceof Error ? error.message : "The game failed to start.");
});
