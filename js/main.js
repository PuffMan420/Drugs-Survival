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
  PLAYER_SIZE,
  PLAYER_SPEED,
  TILE,
  VIEW_H,
  VIEW_W,
} from "./constants.js";
import { buildCity, tileAt, tileCenter, updateChunks } from "./city.js";
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
    const scale = camera.near / CAMERA_HEIGHT;
    camera.projectionMatrix.makePerspective(
      (-VIEW_W / 2) * scale,
      (VIEW_W / 2) * scale,
      (VIEW_H / 2) * scale,
      (-VIEW_H / 2) * scale,
      camera.near,
      camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  camera.updateProjectionMatrix = apply;
  apply();
}

function integerScale() {
  const fitX = Math.floor(window.innerWidth / VIEW_W);
  const fitY = Math.floor(window.innerHeight / VIEW_H);
  const scale = Math.max(1, Math.min(fitX, fitY));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}

function createPresenter(renderer) {
  const target = new WebGLRenderTarget(VIEW_W, VIEW_H, {
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
  return tileAt(map, x, z) === "~";
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

  renderer.setPixelRatio(1);
  renderer.setSize(VIEW_W, VIEW_H, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x102028, 1);
  integerScale();
  window.addEventListener("resize", integerScale);

  fpsEl.textContent = "Loading map…";
  const map = await fetch("./data/city.json").then((response) => {
    if (!response.ok) throw new Error("The city map failed to load.");
    return response.json();
  });
  fpsEl.textContent = "Building city…";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const scene = new Scene();
  const city = buildCity(scene, map);
  const minimap = createMinimap(map);
  const camera = new PerspectiveCamera(15, VIEW_W / VIEW_H, NEAR, FAR);
  camera.up.set(0, 0, -1);
  lockPixelProjection(camera);
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
      if (!blocked(map, player.x + stepX, player.z)) player.x += stepX;
      if (!blocked(map, player.x, player.z + stepZ)) player.z += stepZ;
    }
    player.x = clamp(player.x, half, city.mapW - half);
    player.z = clamp(player.z, half, city.mapH - half);

    const snappedX = Math.round(player.x);
    const snappedZ = Math.round(player.z);
    city.playerMesh.position.set(snappedX, half, snappedZ);

    const camX = clamp(snappedX, VIEW_W / 2, city.mapW - VIEW_W / 2);
    const camZ = clamp(snappedZ, VIEW_H / 2, city.mapH - VIEW_H / 2);
    camera.position.set(camX, CAMERA_HEIGHT, camZ);
    camera.lookAt(camX, 0, camZ);
    updateChunks(city.chunks, camX, camZ);
    presenter.render(scene, camera);
    minimap.draw(camX, camZ, player.x, player.z, TILE, VIEW_W / TILE, VIEW_H / TILE);

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
