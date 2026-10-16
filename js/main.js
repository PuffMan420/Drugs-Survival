import {
  WebGLRenderer,
  WebGLRenderTarget,
  NearestFilter,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
  SRGBColorSpace,
  NoToneMapping,
  LinearSRGBColorSpace,
} from "three";
import { PLAYER_SIZE, PLAYER_SPEED, PLAYER_START_X, PLAYER_START_Z } from "./city-data.js";
import { buildCity } from "./city.js";

const VIEW_W = 960;
const VIEW_H = 540;
// Higher camera = milder perspective lean. Ground coverage stays exactly 960×540.
const CAMERA_HEIGHT = 2800;
const NEAR = 10;
const FAR = 6000;

const canvas = document.getElementById("view");
const fpsEl = document.getElementById("fps");
const errorEl = document.getElementById("boot-error");

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

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
  fpsEl.hidden = true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lockPixelProjection(camera) {
  // Frustum at the ground plane is exactly the 960×540 render target,
  // so 48 world units land on 48 pixels when the camera sits on whole pixels.
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
  const screenMaterial = new MeshBasicMaterial({
    map: target.texture,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  screenScene.add(new Mesh(new PlaneGeometry(2, 2), screenMaterial));

  return {
    render(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(screenScene, screenCamera);
    },
  };
}

function start() {
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
  renderer.setClearColor(0x000000, 1);
  integerScale();
  window.addEventListener("resize", integerScale);

  const scene = new Scene();
  const { playerMesh, mapW, mapH } = buildCity(scene);

  const camera = new PerspectiveCamera(15, VIEW_W / VIEW_H, NEAR, FAR);
  camera.up.set(0, 0, -1);
  lockPixelProjection(camera);

  const presenter = createPresenter(renderer);
  const player = { x: PLAYER_START_X, z: PLAYER_START_Z };
  const half = PLAYER_SIZE / 2;

  let fps = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    let x = 0;
    let z = 0;
    if (held.has("KeyW") || held.has("ArrowUp")) z -= 1;
    if (held.has("KeyS") || held.has("ArrowDown")) z += 1;
    if (held.has("KeyA") || held.has("ArrowLeft")) x -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) x += 1;
    if (x !== 0 || z !== 0) {
      const length = Math.hypot(x, z);
      player.x += (x / length) * PLAYER_SPEED * dt;
      player.z += (z / length) * PLAYER_SPEED * dt;
    }
    player.x = clamp(player.x, half, mapW - half);
    player.z = clamp(player.z, half, mapH - half);

    const snappedX = Math.round(player.x);
    const snappedZ = Math.round(player.z);
    playerMesh.position.x = snappedX;
    playerMesh.position.z = snappedZ;
    playerMesh.position.y = half;

    const camX = clamp(snappedX, VIEW_W / 2, mapW - VIEW_W / 2);
    const camZ = clamp(snappedZ, VIEW_H / 2, mapH - VIEW_H / 2);
    camera.position.set(camX, CAMERA_HEIGHT, camZ);
    camera.lookAt(camX, 0, camZ);

    presenter.render(scene, camera);

    const instant = 1 / Math.max(dt, 1 / 240);
    fps = fps === 0 ? instant : fps + (instant - fps) * 0.1;
    fpsEl.textContent = `FPS ${Math.round(fps)}`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (!MOVE.has(event.code)) return;
  held.add(event.code);
  event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  held.delete(event.code);
});

window.addEventListener("blur", () => held.clear());

try {
  start();
} catch (error) {
  showError(error instanceof Error ? error.message : "The game failed to start.");
}
