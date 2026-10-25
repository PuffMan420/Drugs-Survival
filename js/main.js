import {
  AdditiveBlending,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  MeshLambertMaterial,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import {
  AO_SKIP_LAYER,
  CAMERA_ANGLE,
  CAMERA_RADIUS,
  GROUND_H,
  GROUND_W,
  PLAYER_SIZE,
  TILE,
} from "./constants.js";
import { createTraffic } from "./cars.js";
import { buildCity, tileAt, tileCenter, updateChunks } from "./city.js";
import { createPedestrians } from "./pedestrians.js";
import { createGlow } from "./glow.js";
import { createMinimap } from "./minimap.js";
import { createPlayer } from "./player.js";
import { createBuildMode, loadWestMap } from "./build-mode.js";
import { roadKey } from "./kenney-roads.js";
import { westOfCanal } from "./kenney-road-plan.js";

const NEAR = 10;
const FAR = 6000;
// Lambert shades by irradiance / PI. These scales keep sunlit streets about as
// bright as the old unlit materials, with the hemisphere doing most of the work.
const LAMBERT = Math.PI;
// Same northwest sun as the painted building shadows, so the real shadows
// fall southeast, which is the lower right of this north-facing view.
const SUN_X = -0.4;
const SUN_Y = 1.25;
const SUN_Z = -0.58;
const SUN_DISTANCE = 1800;
const sunLength = Math.hypot(SUN_X, SUN_Y, SUN_Z);
const SUN_DIR = [SUN_X / sunLength, SUN_Y / sunLength, SUN_Z / sunLength];

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

let composer = null;

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
  fpsEl.hidden = true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function frameCenter(value, half, mapSize) {
  if (!(half > 0) || mapSize <= half * 2) return mapSize / 2;
  return clamp(value, half, mapSize - half);
}

function lockPixelProjection(camera) {
  const apply = () => {
    // The center ray is CAMERA_RADIUS long and meets the ground at the player.
    // Frame the smaller ground rectangle there so the 12.5% closer view stays
    // even across the same 840×472.5 world.
    const view = camera.userData.viewScale > 0 ? camera.userData.viewScale : 1;
    const scale = (camera.near / CAMERA_RADIUS) * view;
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
  // at the window's own pixels, with devicePixelRatio capped at 2. The
  // occlusion targets use this same drawing-buffer size.
  const unit = Math.min(window.innerWidth / 16, window.innerHeight / 9);
  const width = Math.max(1, Math.round(unit * 16));
  const height = Math.max(1, Math.round(width * 9 / 16));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
  }
}

const litMaterials = new WeakMap();

function litVersion(material) {
  const cached = litMaterials.get(material);
  if (cached) return cached;
  const lit = new MeshLambertMaterial({
    name: material.name,
    map: material.map,
    color: material.color.clone(),
    vertexColors: material.vertexColors,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    premultipliedAlpha: material.premultipliedAlpha,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    fog: material.fog,
    toneMapped: false,
  });
  litMaterials.set(material, lit);
  return lit;
}

function risesAboveGround(mesh) {
  const geometry = mesh.geometry;
  if (!geometry) return false;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;
  const height = box.max.y - box.min.y;
  // Streets stay receivers. Walls, trees, and raised roofs cast.
  return height >= 8 || box.min.y >= 6;
}

function lightMesh(mesh, options = {}) {
  if (mesh.userData.lit !== true) {
    mesh.userData.lit = true;
    const source = mesh.material;
    const list = Array.isArray(source) ? source : [source];
    let changed = false;
    const converted = list.map((material) => {
      if (material && material.isMeshBasicMaterial) {
        changed = true;
        return litVersion(material);
      }
      return material;
    });
    if (changed) {
      const lit = Array.isArray(source) ? converted : converted[0];
      if (options.forwardMap && !Array.isArray(source) && lit !== source) {
        // The walker still assigns frames on the material it created.
        Object.defineProperty(source, "map", {
          configurable: true,
          get() {
            return lit.map;
          },
          set(value) {
            lit.map = value;
          },
        });
      }
      mesh.material = lit;
      const geometry = mesh.geometry;
      if (geometry && !geometry.getAttribute("normal")) {
        const position = geometry.getAttribute("position");
        if (position && position.count > 0) geometry.computeVertexNormals();
      }
    }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const shader = Boolean(material && material.isShaderMaterial);
    const decal = Boolean(material && material.transparent && material.depthWrite === false);
    mesh.userData.casts = options.cast === true || (!shader && !decal && risesAboveGround(mesh));
    mesh.userData.receives = !shader;
  }
  mesh.castShadow = mesh.userData.casts === true;
  mesh.receiveShadow = mesh.userData.receives === true;
}

function lightVisibleCity(chunks) {
  for (const chunk of chunks) {
    if (!chunk.group.visible) {
      if (chunk.group.userData.wasLit !== true) continue;
      chunk.group.traverse((obj) => {
        if (obj.isMesh) obj.castShadow = false;
      });
      chunk.group.userData.wasLit = false;
      continue;
    }
    chunk.group.traverse((obj) => {
      if (obj.isMesh) lightMesh(obj);
    });
    chunk.group.userData.wasLit = true;
  }
}

function createSun(scene) {
  const hemi = new HemisphereLight(0xfff8f2, 0xe9eef3, LAMBERT * 1.02);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffe2b5, LAMBERT * 0.24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 2;
  sun.shadow.intensity = 1;
  const extent = 1200;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 4200;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

function placeSun(sun, camX, camZ) {
  sun.position.set(
    camX + SUN_DIR[0] * SUN_DISTANCE,
    SUN_DIR[1] * SUN_DISTANCE,
    camZ + SUN_DIR[2] * SUN_DISTANCE,
  );
  sun.target.position.set(camX, 0, camZ);
}

function skipsAmbientOcclusion(material) {
  if (!material) return false;
  if (material.isShaderMaterial) return true;
  if (material.blending === AdditiveBlending) return true;
  return material.transparent === true && material.depthWrite === false;
}

function omitFromAmbientOcclusion(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const source = obj.material;
    const list = Array.isArray(source) ? source : [source];
    if (list.some(skipsAmbientOcclusion)) obj.layers.set(AO_SKIP_LAYER);
  });
}

function createAmbientOcclusion(renderer, scene, camera) {
  // The beauty pass sees light cards and shadow sheets. The occlusion camera
  // does not, or those flat cards would read as solid geometry.
  camera.layers.enable(AO_SKIP_LAYER);
  const view = camera.clone();
  view.layers.set(0);
  view.updateProjectionMatrix = () => {
    view.projectionMatrix.copy(camera.projectionMatrix);
    view.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  };
  view.updateProjectionMatrix();

  const chain = new EffectComposer(renderer);
  const gl = renderer.getContext();
  const maxSamples = gl.MAX_SAMPLES ? gl.getParameter(gl.MAX_SAMPLES) : 0;
  const samples = maxSamples >= 2 ? Math.min(4, maxSamples) : 0;
  if (samples > 0) {
    // Context antialiasing does not cover the composer's targets. Match it
    // so Kenney edges stay as smooth as the direct render was.
    chain.renderTarget1.samples = samples;
    chain.renderTarget2.samples = samples;
  }

  chain.addPass(new RenderPass(scene, camera));

  const ssao = new SSAOPass(scene, view);
  // three.js's SSAO example uses kernelRadius 8, minDistance 0.005, and
  // maxDistance 0.1 across a near/far span of 600. Those distances are
  // fractions of the span. This camera's span is FAR - NEAR, so the same
  // world distances stay moderate: a few units of depth noise ignored, and
  // occluders beyond about 60 units ignored. The radius is in world units.
  // 20 is a little under half a block, so a wall base or a wheel reads a
  // bit more clearly than at 16, without shading the whole street.
  const exampleSpan = 600;
  const span = FAR - NEAR;
  ssao.kernelRadius = 20;
  ssao.minDistance = 0.005 * exampleSpan / span;
  ssao.maxDistance = 0.1 * exampleSpan / span;
  // Streets are wound downward and drawn double-sided. The normal material
  // flips a back face only when its side is DoubleSide, so the hemisphere
  // stays above the ground instead of darkening every street.
  ssao.normalMaterial.side = DoubleSide;
  // The pass multiplies its mask onto the picture and has no strength
  // control. Open ground stays at 1. A crease of 0.8 becomes 0.68: the
  // doubled darkening, pulled back by 20%.
  const aoStrength = 1.6;
  ssao.copyMaterial.uniforms.strength = { value: aoStrength };
  ssao.copyMaterial.fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      float ao = texture2D(tDiffuse, vUv).r;
      ao = clamp(1.0 - (1.0 - ao) * strength, 0.0, 1.0);
      gl_FragColor = vec4(vec3(ao), 1.0);
    }
  `;
  ssao.copyMaterial.needsUpdate = true;
  chain.addPass(ssao);
  chain.addPass(new OutputPass());

  return {
    composer: chain,
    render() {
      view.position.copy(camera.position);
      view.quaternion.copy(camera.quaternion);
      view.up.copy(camera.up);
      view.updateProjectionMatrix();
      view.updateMatrixWorld();
      const projection = ssao.ssaoMaterial.uniforms.cameraProjectionMatrix.value;
      const inverse = ssao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value;
      projection.copy(camera.projectionMatrix);
      inverse.copy(camera.projectionMatrixInverse);
      chain.render();
    },
  };
}

function blocked(map, x, z) {
  // The square's corners have to stay off water and off building footprints.
  // Roads, sidewalks, parks, docks, and plazas stay open.
  // West of the canal the houses are not built. A "b" tile there is grass
  // with no wall, so it does not stop the player. Water still does.
  const reach = PLAYER_SIZE / 2 - 0.01;
  const samples = [
    [x - reach, z - reach],
    [x + reach, z - reach],
    [x - reach, z + reach],
    [x + reach, z + reach],
  ];
  for (const [sx, sz] of samples) {
    const tile = tileAt(map, sx, sz);
    if (tile === "~") return true;
    if (tile !== "b") continue;
    const tx = Math.floor(sx / TILE);
    const tz = Math.floor(sz / TILE);
    if (westOfCanal(tx, tz)) continue;
    return true;
  }
  return false;
}

async function start() {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  // The occlusion pass renders the scene again for normals. Shadows are
  // already current after the beauty pass, so that second render skips them.
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x102028, 1);
  fitDisplay(renderer);
  window.addEventListener("resize", () => fitDisplay(renderer));

  fpsEl.textContent = "Loading map…";
  const map = await fetch("./data/city.json").then((response) => {
    if (!response.ok) throw new Error("The city map failed to load.");
    return response.json();
  });
  fpsEl.textContent = "Loading saved layout…";
  const savedLayout = await loadWestMap();
  const removedRoadKeys = new Set();
  for (const item of savedLayout.removedRoads) {
    const key = roadKey(item);
    if (key) removedRoadKeys.add(key);
  }
  fpsEl.textContent = "Building city…";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const scene = new Scene();
  const city = await buildCity(scene, map, removedRoadKeys);
  city.playerMesh.removeFromParent();
  city.playerMesh.geometry.dispose();
  for (const material of city.playerMesh.material) material.dispose();
  const playerSprite = await createPlayer();
  scene.add(playerSprite.shadow);
  playerSprite.shadow.visible = false;
  scene.add(playerSprite.mesh);
  lightMesh(playerSprite.mesh, { forwardMap: true, cast: true });
  const traffic = await createTraffic(scene, map);
  const pedestrians = await createPedestrians(scene, map);
  window.pedestrians = pedestrians;
  const glow = createGlow(scene, map);
  const sun = createSun(scene);
  const minimap = createMinimap(map, JUMPS);
  const camera = new PerspectiveCamera(15, GROUND_W / GROUND_H, NEAR, FAR);
  // Screen up stays north. Spherical phi is measured from +Y, so this up is
  // perpendicular to a view aimed CAMERA_ANGLE off straight down.
  const tiltUp = Math.sin(CAMERA_ANGLE);
  const tiltNorth = Math.cos(CAMERA_ANGLE);
  camera.up.set(0, tiltUp, -tiltNorth);
  lockPixelProjection(camera);
  // theta 0 is +Z, which is south. The camera does not orbit.
  const cameraTheta = 0;
  const cameraTarget = new Vector3();
  const origin = tileCenter(map.spawn.x, map.spawn.z);
  const player = { x: origin.x, z: origin.z };
  const half = PLAYER_SIZE / 2;

  await createBuildMode({
    scene,
    camera,
    canvas,
    map,
    saved: savedLayout,
    roads: city.roads,
  });

  omitFromAmbientOcclusion(scene);
  const ambient = createAmbientOcclusion(renderer, scene, camera);
  composer = ambient.composer;
  fitDisplay(renderer);

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
    const view = camera.userData.viewScale > 0 ? camera.userData.viewScale : 1;
    const halfW = (GROUND_W * view) / 2;
    const halfH = (GROUND_H * view) / 2;
    let camX = frameCenter(snappedX, halfW, city.mapW);
    let camZ = frameCenter(snappedZ, halfH, city.mapH);
    traffic.update(dt, camX, camZ, player.x, player.z);
    // A moving car can roll over the square after the step above.
    release();
    player.x = clamp(player.x, half, city.mapW - half);
    player.z = clamp(player.z, half, city.mapH - half);
    snappedX = Math.round(player.x);
    snappedZ = Math.round(player.z);
    playerSprite.update(player.x - previousX, player.z - previousZ, snappedX, snappedZ);
    pedestrians.update(dt, player.x, player.z);
    camX = frameCenter(snappedX, halfW, city.mapW);
    camZ = frameCenter(snappedZ, halfH, city.mapH);
    glow.update(camX, camZ, traffic.lights(camX, camZ));
    camera.position.setFromSphericalCoords(CAMERA_RADIUS, CAMERA_ANGLE, cameraTheta);
    cameraTarget.set(camX, 0, camZ);
    camera.position.add(cameraTarget);
    camera.lookAt(cameraTarget);
    updateChunks(city.chunks, camX, camZ, view);
    lightVisibleCity(city.chunks);
    placeSun(sun, camX, camZ);
    renderer.shadowMap.needsUpdate = true;
    ambient.render();
    minimap.draw(camX, camZ, player.x, player.z, TILE, (GROUND_W * view) / TILE, (GROUND_H * view) / TILE);

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
