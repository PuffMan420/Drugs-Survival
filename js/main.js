import {
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import {
  CAMERA_HEIGHT,
  CAMERA_TILT,
  GROUND_H,
  GROUND_W,
  PLAYER_SIZE,
  PLAYER_SPEED,
  RENDER_H,
  RENDER_W,
  TILE,
} from "./constants.js";
import { createTraffic } from "./cars.js";
import { buildCity, tileAt, tileCenter, updateChunks } from "./city.js";
import { createGlow } from "./glow.js";
import { createMinimap } from "./minimap.js";

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
    // so the 12.5% closer view stays even across the picture.
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
  // Fill the window with the same 16:9 frame. The scene itself stays at one
  // pixel per world unit; this only nearest-scales that picture.
  const unit = Math.min(window.innerWidth / 16, window.innerHeight / 9);
  const width = Math.max(1, Math.floor(unit) * 16);
  const height = Math.max(1, Math.floor(unit) * 9);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER_W, RENDER_H, false);
}

function createPresenter(renderer) {
  // The canvas context has no depth buffer. The city is drawn into this
  // target, which does, so roofs cover the floors inside the buildings.
  // The target is then nearest-copied onto the screen.
  const target = new WebGLRenderTarget(RENDER_W, RENDER_H, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.minFilter = NearestFilter;
  target.texture.magFilter = NearestFilter;
  target.texture.generateMipmaps = false;
  target.texture.colorSpace = LinearSRGBColorSpace;

  const screenScene = new Scene();
  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  screenCamera.position.z = 1;
  screenScene.add(new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({
    map: target.texture,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })));

  return {
    render(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(screenScene, screenCamera);
    },
  };
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
    depth: false,
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
  const traffic = await createTraffic(scene, map);
  const glow = createGlow(scene, map);
  const minimap = createMinimap(map);
  const camera = new PerspectiveCamera(15, RENDER_W / RENDER_H, NEAR, FAR);
  const tiltUp = Math.sin(CAMERA_TILT);
  const tiltNorth = Math.cos(CAMERA_TILT);
  camera.up.set(0, tiltUp, -tiltNorth);
  lockPixelProjection(camera);
  const cameraSouth = Math.round(CAMERA_HEIGHT * Math.tan(CAMERA_TILT));
  const presenter = createPresenter(renderer);
  const origin = tileCenter(map.spawn.x, map.spawn.z);
  const player = { x: origin.x, z: origin.z };
  const half = PLAYER_SIZE / 2;

  session.ready = true;
  session.map = map;
  session.player = player;
  session.minimap = minimap;
  placeEl.textContent = map.views[0]?.name ?? "Downtown";

  let fps = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    let moveX = 0;
    let moveZ = 0;
    if (held.has("KeyW") || held.has("ArrowUp")) moveZ -= 1;
    if (held.has("KeyS") || held.has("ArrowDown")) moveZ += 1;
    if (held.has("KeyA") || held.has("ArrowLeft")) moveX -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) moveX += 1;
    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.hypot(moveX, moveZ);
      const stepX = (moveX / length) * PLAYER_SPEED * dt;
      const stepZ = (moveZ / length) * PLAYER_SPEED * dt;
      const nextX = player.x + stepX;
      const nextZ = player.z + stepZ;
      if (!blocked(map, nextX, player.z) && !traffic.blocks(nextX, player.z)) player.x = nextX;
      if (!blocked(map, player.x, nextZ) && !traffic.blocks(player.x, nextZ)) player.z = nextZ;
    }
    player.x = clamp(player.x, half, city.mapW - half);
    player.z = clamp(player.z, half, city.mapH - half);

    const snappedX = Math.round(player.x);
    const snappedZ = Math.round(player.z);
    city.playerMesh.position.set(snappedX, half, snappedZ);

    const camX = clamp(snappedX, GROUND_W / 2, city.mapW - GROUND_W / 2);
    const camZ = clamp(snappedZ, GROUND_H / 2, city.mapH - GROUND_H / 2);
    traffic.update(dt, camX, camZ, player.x, player.z);
    glow.update(camX, camZ, traffic.lights(camX, camZ));
    camera.position.set(camX, CAMERA_HEIGHT, camZ + cameraSouth);
    camera.lookAt(camX, 0, camZ);
    updateChunks(city.chunks, camX, camZ);
    presenter.render(scene, camera);
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
  const view = session.map.views[index];
  if (!view) return;
  const point = tileCenter(view.x, view.z);
  session.player.x = point.x;
  session.player.z = point.z;
  session.placeName = view.name;
  placeEl.textContent = view.name;
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
    if (index >= 0 && index < 6) {
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
