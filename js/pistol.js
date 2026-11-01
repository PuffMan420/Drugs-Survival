import {
  BAT_EULER,
  BAT_HAND,
  BAT_HIT,
  BAT_SCALE,
  BAT_SWING,
  batHits,
  freshBatWear,
  meleePlaybackRate,
  stepBatWear,
} from "./bat.js";
import {
  GRAVITY,
  PUNCH_POSE,
  RELEASE,
  THROW_REACH,
  aimTarget,
  arcPoint,
  flightTime,
  nextWeapon,
  pickBottle,
  throwVelocity,
  carContains,
  carRayHit,
  BOTTLES,
} from "./bottle.js";
import { TILE } from "./constants.js";
import { nextPunch, punchHits, punchTiming } from "./punch.js";
import { aimChord, pistolPose } from "./pose-layers.js";
import { aimAlongStick, isTouchScreen, syncGunButtons } from "./touch-ui.js";
import {
  Audio,
  AudioLoader,
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MAG = 12;
const SHOT_TIME = 0.2;
// Long enough for the forearm recoil to read, short enough to retrigger on the next shot.
const SHOT_POSE = 0.4;
const RELOAD_TIME = 1.67;
// A left click while the right button is held can drop the right-button bit for one event.
const AIM_CHORD = 120;
const AIM_TAU = 0.08;
const FLASH_LIFE = 0.18;
const PUFF_FRAME = 0.035;
const SPLASH_HOLD = 0.07;
const SPLASH_FADE = 0.16;
// One third of the blood puff (36 * 0.7 * 0.6), gone in 0.3 s.
const CAR_HIT_SCALE = (36 * 0.7 * 0.6) / 3;
const CAR_HIT_LIFE = 0.3;

const raycaster = new Raycaster();
const ndc = new Vector2();
const muzzlePos = new Vector3();
const pedBox = new Box3();
const pedHit = new Vector3();
const flightPos = new Vector3();
const flightQuat = new Quaternion();
const flightScale = new Vector3();
// Same footprint the player uses. A scene raycast is not used: it walks every instanced road.
const PED_REACH = 16;
const PED_REACH_SQ = PED_REACH * PED_REACH;
// Same placement scale as the road batches: a piece is 4 tiles on a side.
const PIECE = TILE * 4;

function loadTexture(url) {
  const loader = new TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      resolve(texture);
    }, undefined, reject);
  });
}

function urls(folder, names) {
  return names.map((name) => new URL(`../assets/${folder}/${name}`, import.meta.url).href);
}

export async function createPistol({
  scene,
  player,
  camera,
  canvas,
  listener,
  pedestrians,
  traffic,
  blocked,
  stick = null,
}) {
  const hand = player.model.getObjectByName("RightHand");
  if (!hand) throw new Error("The player is missing a right hand.");
  const loader = new GLTFLoader();
  const gunGltf = await loader.loadAsync(new URL("../assets/gun/Pistol_1.glb", import.meta.url).href);
  const grip = new Group();
  // Hand-local: +Y is wrist to knuckles, +X toward the pinky, -Z is the palm.
  // 0.85 fits the gun on the larger hand. Bottles stay on handRoot.
  grip.scale.setScalar(0.25 * 1.5 * 0.85);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.205, -0.089);
  grip.add(gunGltf.scene);
  hand.add(grip);
  let pistolMesh = null;
  gunGltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    pistolMesh = obj;
  });
  const muzzle = new Object3D();
  muzzle.position.set(0.021, 0, 0);
  pistolMesh.add(muzzle);

  const handRoot = new Group();
  // Bottles stand on their base at this point. 1.5 grows them along the
  // fingers, the same bump as the pistol, and the throw copies this scale.
  handRoot.scale.setScalar(1.5);
  handRoot.position.set(0, 0.08, 0.02);
  hand.add(handRoot);
  const bottleModels = [];
  for (const kind of BOTTLES) {
    const gltf = await loader.loadAsync(new URL(`../assets/bottle/${kind.file}`, import.meta.url).href);
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      // The file's UVs are OpenGL-up. flipY puts brown, purple, and yellow on the liquids.
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat && mat.map) {
          mat.map.flipY = true;
          mat.map.needsUpdate = true;
        }
      }
    });
    gltf.scene.visible = false;
    handRoot.add(gltf.scene);
    const splats = await Promise.all(kind.splats.map((name) => (
      loadTexture(new URL(`../assets/bottle/splat/${name}`, import.meta.url).href)
    )));
    bottleModels.push({ kind, model: gltf.scene, splats });
  }

  const batUrl = new URL("../assets/bat/bat.glb", import.meta.url).href;
  const [batGltf, batClean, batBlood, batGrime] = await Promise.all([
    loader.loadAsync(batUrl),
    loadTexture(new URL("../assets/bat/clean.png", import.meta.url).href),
    loadTexture(new URL("../assets/bat/blood.png", import.meta.url).href),
    loadTexture(new URL("../assets/bat/grime.png", import.meta.url).href),
  ]);
  for (const texture of [batClean, batBlood, batGrime]) {
    texture.flipY = false;
    texture.needsUpdate = true;
  }
  const batMix = { value: 0 };
  const batMap2 = { value: batGrime };
  const batMaterial = new MeshLambertMaterial({ map: batClean, side: DoubleSide });
  batMaterial.customProgramCacheKey = () => "bat-wear-1";
  batMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.batMix = batMix;
    shader.uniforms.batMap2 = batMap2;
    if (!shader.fragmentShader.includes("#include <map_fragment>")) {
      console.error("Bat wear shader could not find map_fragment");
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_pars_fragment>",
        "#include <map_pars_fragment>\nuniform sampler2D batMap2;\nuniform float batMix;\n",
      )
      .replace(
        "#include <map_fragment>",
        [
          "#ifdef USE_MAP",
          "	vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
          "	vec4 sampledGrime = texture2D( batMap2, vMapUv );",
          "	sampledDiffuseColor = mix( sampledDiffuseColor, sampledGrime, batMix );",
          "	diffuseColor *= sampledDiffuseColor;",
          "#endif",
        ].join("\n"),
      );
  };
  const batRoot = new Group();
  batRoot.scale.setScalar(BAT_SCALE);
  batRoot.position.set(BAT_HAND[0], BAT_HAND[1], BAT_HAND[2]);
  batRoot.rotation.set(BAT_EULER[0], BAT_EULER[1], BAT_EULER[2]);
  batRoot.visible = false;
  batGltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    const previous = obj.material;
    obj.material = batMaterial;
    const list = Array.isArray(previous) ? previous : [previous];
    for (const mat of list) {
      if (mat && mat !== batMaterial && mat.dispose) mat.dispose();
    }
  });
  batRoot.add(batGltf.scene);
  hand.add(batRoot);
  let wear = freshBatWear();
  let swinging = false;
  let swingAge = 0;
  let didHit = false;

  const flashTextures = await Promise.all(urls("flash", [
    "flash00.png", "flash01.png", "flash02.png", "flash03.png", "flash04.png",
    "flash05.png", "flash06.png", "flash07.png", "flash08.png",
  ]).map(loadTexture));
  const puffTextures = await Promise.all(urls("blood-puff", [
    "Fart_fart00.png", "Fart_fart01.png", "Fart_fart02.png", "Fart_fart03.png",
    "Fart_fart04.png", "Fart_fart05.png", "Fart_fart06.png", "Fart_fart07.png",
    "Fart_fart08.png",
  ]).map(loadTexture));
  const splatTextures = await Promise.all(urls("splat", [
    "splat1.png", "splat2.png", "splat3.png", "splat4.png", "splat5.png",
  ]).map(loadTexture));
  const carHitTextures = await Promise.all(urls("car-hit", [
    "car-hit-1.png", "car-hit-2.png", "car-hit-3.png",
    "car-hit-4.png", "car-hit-5.png", "car-hit-6.png",
  ]).map(loadTexture));

  const flash = new Sprite(new SpriteMaterial({
    map: flashTextures[0],
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  flash.scale.set(22 * 0.6 * 0.6, 22 * 0.6 * 0.6, 1);
  flash.visible = false;
  flash.renderOrder = 3;
  scene.add(flash);
  let flashIndex = 0;
  let flashLife = 0;

  const puffMaterial = new SpriteMaterial({
    map: puffTextures[0],
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const puffs = [];
  const carHits = [];
  const splatGeo = new PlaneGeometry(1, 1);
  splatGeo.rotateX(-Math.PI / 2);
  const decals = [];
  const pools = [];

  const breakBuffers = [];
  const breakVoices = [0, 1, 2, 3].map(() => new Audio(listener));
  for (const name of ["hit1.ogg", "hit2.ogg", "hit3.ogg", "hit4.ogg"]) {
    const url = new URL(`../assets/bottle/hit/${name}`, import.meta.url).href;
    new AudioLoader().load(url, (buffer) => {
      breakBuffers.push(buffer);
    });
  }
  const stainMaterials = new Map();
  const flights = [];
  const splashes = [];

  const shot = new Audio(listener);
  const shotUrl = new URL("../assets/sound/pistol-shot.mp3", import.meta.url).href;
  new AudioLoader().load(shotUrl, (buffer) => {
    shot.setBuffer(buffer);
    shot.setLoop(false);
    shot.setVolume(0.4);
  });
  const meleeHit = new Audio(listener);
  let meleeReady = false;
  const meleeUrl = new URL("../assets/sound/melee-hit.ogg", import.meta.url).href;
  new AudioLoader().load(meleeUrl, (buffer) => {
    meleeHit.setBuffer(buffer);
    meleeHit.setLoop(false);
    meleeHit.setVolume(1);
    meleeReady = true;
  }, undefined, (error) => {
    console.error("The melee hit sound failed to load", error);
  });

  const crosshair = document.createElement("div");
  crosshair.id = "crosshair";
  const big = document.createElement("img");
  big.src = new URL("../assets/crosshair/crosshair-big.png", import.meta.url).href;
  big.alt = "";
  const small = document.createElement("img");
  small.src = new URL("../assets/crosshair/crosshair-small.png", import.meta.url).href;
  small.alt = "";
  crosshair.append(big, small);
  crosshair.hidden = true;
  document.body.append(crosshair);
  // Focus the view as soon as the gun exists, so the first wheel or click is
  // a game event and not a click that only wakes the page.
  canvas.tabIndex = 0;
  const focusGame = () => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
  };
  focusGame();
  window.addEventListener("pointerover", (event) => {
    if (event.target === canvas) focusGame();
  }, true);

  // Hands, then the pistol, then the bottle, then the bat. One wheel notch is one step.
  let weapon = "hands";
  let handIndex = 0;
  let handHidden = false;
  let pending = null;
  let wheelAt = 0;

  function holding() {
    return weapon !== "hands";
  }

  function cycleWeapon() {
    if (busy()) return weapon;
    weapon = nextWeapon(weapon);
    aiming = false;
    aimDir = null;
    shootLeft = 0;
    poseLeft = 0;
    reloadLeft = 0;
    swinging = false;
    swingAge = 0;
    didHit = false;
    punching = false;
    pending = null;
    handHidden = false;
    if (weapon === "bottle") {
      const picked = pickBottle();
      handIndex = Math.max(0, BOTTLES.findIndex((item) => item.id === picked.id));
    }
    return weapon;
  }
  let aiming = false;
  let aimBlend = 0;
  let pointer = false;
  let mouseX = 0;
  let mouseY = 0;
  let ammo = MAG;
  let shootLeft = 0;
  let poseLeft = 0;
  let punchName = "";
  let punching = false;
  let punchAge = 0;
  let punchHitAt = 0;
  let punchPose = 0;
  let didPunch = false;
  let reloadLeft = 0;
  let leftWas = false;
  let rightAt = -1e9;
  // Stick direction while aiming on a phone. The mouse keeps using the cursor ray.
  let aimDir = null;
  const ground = new Vector3();

  function busy() {
    return blocked() || !player.mesh.visible;
  }

  function playShot() {
    if (!shot.buffer) return;
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    try {
      if (shot.isPlaying) shot.stop();
      shot.play();
    } catch (error) {
      console.error("The gunshot failed to play", error);
    }
  }

  function puffAt(x, y, z) {
    const sprite = new Sprite(puffMaterial.clone());
    sprite.position.set(x, y, z);
    sprite.scale.set(36 * 0.7 * 0.6, 36 * 0.7 * 0.6, 1);
    sprite.renderOrder = 3;
    scene.add(sprite);
    puffs.push({ sprite, frame: 0, age: 0 });
  }

  function carHitAt(x, y, z) {
    const material = new SpriteMaterial({
      map: carHitTextures[Math.floor(Math.random() * carHitTextures.length)],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(CAR_HIT_SCALE, CAR_HIT_SCALE, 1);
    sprite.renderOrder = 3;
    scene.add(sprite);
    carHits.push({ sprite, age: 0 });
  }

  function nearestCar(ray) {
    if (!traffic || !traffic.cars) return null;
    const list = traffic.cars();
    let best = null;
    for (let i = 0; i < list.length; i += 1) {
      const hit = carRayHit(ray.origin, ray.direction, list[i]);
      if (!hit || (best && hit.t >= best.t)) continue;
      best = hit;
    }
    return best;
  }

  function splatAt(x, y, z, size) {
    const material = new MeshBasicMaterial({
      map: splatTextures[Math.floor(Math.random() * splatTextures.length)],
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      toneMapped: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(splatGeo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(size);
    mesh.renderOrder = 2;
    scene.add(mesh);
    decals.push(mesh);
    return mesh;
  }

  function showHeld() {
    grip.visible = weapon === "pistol";
    batRoot.visible = weapon === "bat";
    const showBottle = weapon === "bottle" && !handHidden;
    for (let i = 0; i < bottleModels.length; i += 1) {
      bottleModels[i].model.visible = showBottle && i === handIndex;
    }
  }

  function playBreak() {
    if (breakBuffers.length === 0) return;
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    const buffer = breakBuffers[Math.floor(Math.random() * breakBuffers.length)];
    const voice = breakVoices.find((item) => !item.isPlaying) || breakVoices[0];
    try {
      if (voice.isPlaying) voice.stop();
      voice.setBuffer(buffer);
      voice.setLoop(false);
      voice.setVolume(0.4);
      voice.play();
    } catch (error) {
      console.error("The bottle break failed to play", error);
    }
  }

  function liquidMap(index) {
    const textures = bottleModels[index].splats;
    return textures[Math.floor(Math.random() * textures.length)];
  }

  function splashAt(x, y, z, map) {
    const material = new SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new Sprite(material);
    sprite.position.set(x, y + 8, z);
    sprite.scale.set(22, 22, 1);
    sprite.renderOrder = 3;
    sprite.userData.bottleFx = true;
    sprite.raycast = () => {};
    scene.add(sprite);
    splashes.push({ sprite, age: 0 });
  }

  function stainMaterial(map) {
    let material = stainMaterials.get(map);
    if (material) return material;
    material = new MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      toneMapped: false,
      side: DoubleSide,
    });
    stainMaterials.set(map, material);
    return material;
  }

  function stainAt(x, y, z, map) {
    const mesh = new Mesh(splatGeo, stainMaterial(map));
    mesh.position.set(x, y + 0.2, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(5);
    mesh.renderOrder = 2;
    mesh.userData.bottleFx = true;
    mesh.raycast = () => {};
    scene.add(mesh);
  }

  function breakBottle(flight, point) {
    flight.mesh.removeFromParent();
    const map = liquidMap(flight.index);
    playBreak();
    splashAt(point.x, point.y, point.z, map);
    stainAt(point.x, flight.groundY, point.z, map);
  }

  function hitsPed(point) {
    if (!pedestrians || !pedestrians.targets) return false;
    const list = pedestrians.targets();
    for (let i = 0; i < list.length; i += 1) {
      const ped = list[i];
      const dx = point.x - ped.x;
      const dz = point.z - ped.z;
      if (dx * dx + dz * dz > PED_REACH_SQ) continue;
      const feet = ped.live ? ped.live.holder.position.y : point.y;
      if (point.y < feet - 4 || point.y > feet + 40) continue;
      return true;
    }
    return false;
  }

  function hitsCar(point) {
    if (!traffic || !traffic.cars) return false;
    const list = traffic.cars();
    for (let i = 0; i < list.length; i += 1) {
      if (carContains(point.x, point.y, point.z, list[i])) return true;
    }
    return false;
  }

  function hitsWall(point) {
    const build = scene.getObjectByName("build");
    if (!build) return false;
    let found = false;
    build.traverse((obj) => {
      if (found) return;
      const records = obj.userData && obj.userData.records;
      const single = obj.userData && obj.userData.piece;
      const list = records && records.length ? records : (single ? [single] : null);
      if (!list) return;
      const file = list[0].file || "";
      if (!file || file.startsWith("road")) return;
      for (let i = 0; i < list.length; i += 1) {
        const record = list[i];
        const scale = record.scale || 1;
        const cx = (record.x + 0.5) * TILE;
        const cz = (record.z + 0.5) * TILE;
        const reach = PIECE * 0.5 * scale;
        if (Math.abs(point.x - cx) > reach || Math.abs(point.z - cz) > reach) continue;
        if (point.y < -2 || point.y > PIECE * scale) continue;
        found = true;
        return;
      }
    });
    return found;
  }

  function throwTarget() {
    const origin = player.mesh.position;
    if (isTouchScreen()) {
      const dir = aimDir && Math.hypot(aimDir.x, aimDir.z) > 0
        ? aimDir
        : { x: player.dirX, z: player.dirZ };
      const mag = Math.hypot(dir.x, dir.z) || 1;
      return {
        x: origin.x + (dir.x / mag) * THROW_REACH,
        y: origin.y,
        z: origin.z + (dir.z / mag) * THROW_REACH,
      };
    }
    const spot = aimGround();
    if (!spot) {
      return aimTarget(origin, {
        x: origin.x + player.dirX * THROW_REACH,
        y: origin.y,
        z: origin.z + player.dirZ * THROW_REACH,
      });
    }
    return aimTarget(origin, spot);
  }

  function releaseBottle() {
    const index = pending.index;
    const target = pending.target;
    pending = null;
    const src = bottleModels[index].model;
    src.visible = true;
    src.updateWorldMatrix(true, true);
    const flight = src.clone(true);
    flight.traverse((obj) => {
      obj.frustumCulled = false;
      obj.userData.bottleFx = true;
      obj.raycast = () => {};
    });
    flight.userData.bottleFx = true;
    src.getWorldPosition(flightPos);
    src.getWorldQuaternion(flightQuat);
    src.getWorldScale(flightScale);
    flight.position.copy(flightPos);
    flight.quaternion.copy(flightQuat);
    flight.scale.copy(flightScale);
    flight.visible = true;
    scene.add(flight);
    const picked = pickBottle();
    handIndex = Math.max(0, BOTTLES.findIndex((item) => item.id === picked.id));
    handHidden = true;
    const start = { x: flight.position.x, y: flight.position.y, z: flight.position.z };
    const dist = Math.hypot(target.x - start.x, target.z - start.z);
    const time = flightTime(dist);
    flights.push({
      mesh: flight,
      index,
      start,
      velocity: throwVelocity(start, target, time, GRAVITY),
      time,
      age: 0,
      groundY: target.y,
    });
  }

  function bleed(hurt) {
    puffAt(hurt.x, hurt.y, hurt.z);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 8;
      splatAt(
        hurt.x + Math.cos(ang) * dist,
        hurt.ground,
        hurt.z + Math.sin(ang) * dist,
        6 + Math.random() * 4,
      );
    }
  }

  function beginSwing() {
    if (poseLeft > 0 || swinging) return;
    poseLeft = BAT_SWING;
    swinging = true;
    swingAge = 0;
    didHit = false;
    player.kickPose("swordAttack");
  }

  function playMeleeHit() {
    if (!meleeReady) return;
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    try {
      if (meleeHit.isPlaying) meleeHit.stop();
      meleeHit.setLoop(false);
      meleeHit.setVolume(1);
      meleeHit.setPlaybackRate(meleePlaybackRate(Math.random()));
      meleeHit.play();
    } catch (error) {
      console.error("The melee hit failed to play", error);
    }
  }

  function strikeBat() {
    const from = player.mesh.position;
    const dirX = player.dirX;
    const dirZ = player.dirZ;
    let killed = false;
    let connected = false;
    for (const ped of pedestrians.targets()) {
      if (!batHits(from.x, from.z, dirX, dirZ, ped.x, ped.z)) continue;
      const hurt = pedestrians.hurt(ped, ped.x - from.x, ped.z - from.z);
      if (!hurt) continue;
      killed = true;
      connected = true;
      bleed(hurt);
    }
    if (connected) playMeleeHit();
    return killed;
  }

  function beginPunch() {
    if (busy() || weapon !== "hands" || punching) return;
    punchName = nextPunch(punchName);
    const timing = punchTiming(punchName);
    punching = true;
    punchAge = 0;
    punchHitAt = timing.hit;
    punchPose = timing.pose;
    didPunch = false;
    poseLeft = timing.pose;
    player.kickPose(punchName);
  }

  function strikePunch() {
    const from = player.mesh.position;
    const dirX = player.dirX;
    const dirZ = player.dirZ;
    let connected = false;
    for (const ped of pedestrians.targets()) {
      if (!punchHits(from.x, from.z, dirX, dirZ, ped.x, ped.z)) continue;
      const hurt = pedestrians.hurt(ped, ped.x - from.x, ped.z - from.z);
      if (!hurt) continue;
      connected = true;
      bleed(hurt);
    }
    if (connected) playMeleeHit();
  }

  function beginThrow() {
    if (poseLeft > 0 || pending) return;
    const picked = pickBottle();
    handIndex = Math.max(0, BOTTLES.findIndex((item) => item.id === picked.id));
    handHidden = false;
    pending = { age: 0, target: throwTarget(), index: handIndex };
    poseLeft = PUNCH_POSE;
    player.kickPose("punchCross");
  }

  function stepFlights(step) {
    for (let i = flights.length - 1; i >= 0; i -= 1) {
      const flight = flights[i];
      flight.age += step;
      const t = Math.min(flight.time, flight.age);
      const point = arcPoint(flight.start, flight.velocity, t, GRAVITY);
      flight.mesh.position.set(point.x, point.y, point.z);
      flight.mesh.rotateZ(step * 9);
      if (hitsPed(point) || hitsCar(point) || hitsWall(point) || flight.age >= flight.time) {
        breakBottle(flight, point);
        flights.splice(i, 1);
      }
    }
  }

  function fire() {
    if (!holding() || busy()) return;
    if (weapon === "bat") {
      beginSwing();
      return;
    }
    if (!aiming) return;
    if (weapon === "bottle") {
      beginThrow();
      return;
    }
    if (reloadLeft > 0 || shootLeft > 0 || ammo <= 0) return;
    ammo -= 1;
    shootLeft = SHOT_TIME;
    poseLeft = SHOT_POSE;
    player.kickPose("pistolShoot");
    flashIndex = (flashIndex + 1) % flashTextures.length;
    flash.material.map = flashTextures[flashIndex];
    flash.material.needsUpdate = true;
    muzzle.getWorldPosition(muzzlePos);
    flash.position.copy(muzzlePos);
    flash.visible = true;
    flashLife = FLASH_LIFE;
    playShot();
    traffic.scare(player.mesh.position.x, player.mesh.position.z);
    const hit = pickTarget();
    const car = nearestCar(raycaster.ray);
    if (car && !(hit && hit.t <= car.t)) {
      carHitAt(car.x, car.y, car.z);
    } else if (hit) {
      const from = player.mesh.position;
      const hurt = pedestrians.hurt(hit.ped, hit.ped.x - from.x, hit.ped.z - from.z);
      if (hurt) bleed(hurt);
    }
    if (ammo === 0) reloadLeft = RELOAD_TIME;
  }

  function pickTarget() {
    // Same idea as three.js webgl_decals: a ray from the cursor, then the
    // first thing that ray actually meets. Here that is the pedestrian's box.
    // On a phone the joystick is the cursor, so the ray leaves the chest
    // along that direction. A mouse still uses the cursor.
    const ray = raycaster.ray;
    const aimMag = aimDir ? Math.hypot(aimDir.x, aimDir.z) : 0;
    if (aimDir && aimMag > 0) {
      ray.origin.set(player.mesh.position.x, player.mesh.position.y + 2, player.mesh.position.z);
      ray.direction.set(aimDir.x / aimMag, 0, aimDir.z / aimMag);
    } else {
      raycaster.setFromCamera(ndc, camera);
    }
    let best = null;
    let bestT = Infinity;
    for (const ped of pedestrians.targets()) {
      ped.live.holder.updateWorldMatrix(true, true);
      pedBox.setFromObject(ped.live.holder);
      if (!ray.intersectBox(pedBox, pedHit)) continue;
      const t = pedHit.distanceTo(ray.origin);
      if (t < bestT) {
        bestT = t;
        best = ped;
      }
    }
    return best ? { ped: best, t: bestT } : null;
  }

  function aimGround() {
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    if (Math.abs(dir.y) < 1e-5) return null;
    const t = (player.mesh.position.y - origin.y) / dir.y;
    if (t < 0) return null;
    ground.set(origin.x + dir.x * t, player.mesh.position.y, origin.z + dir.z * t);
    return ground;
  }

  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX;
    mouseY = event.clientY;
    pointer = mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
    ndc.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((mouseY - rect.top) / rect.height) * 2 + 1;
  }

  // Window capture, not the canvas alone. The letterbox around the view is the
  // page, and a wheel or click there never reached the canvas listeners.
  function noteButtons(event) {
    // A finger is the AIM and SHOOT buttons, not a mouse click. Those buttons
    // call toggleAim and shoot. A mouse still holds right-click and left-clicks.
    if (event.pointerType === "touch") return;
    onPointer(event);
    if (typeof event.buttons !== "number") {
      if (event.type === "pointerup" && event.button === 2) aiming = false;
      if (event.type !== "pointerdown" || busy()) return;
      if (event.button === 2) {
        if (!holding()) return;
        aiming = true;
        rightAt = performance.now();
        event.preventDefault();
      } else if (event.button === 0) {
        if (weapon === "hands") beginPunch();
        else fire();
      }
      return;
    }
    const now = performance.now();
    const right = (event.buttons & 2) !== 0;
    const left = (event.buttons & 1) !== 0;
    const blocked = busy();
    if (right) rightAt = now;
    let held = aiming;
    if (!blocked) {
      if (event.type === "pointerup" && !right) held = false;
      else if (event.type === "pointermove" && !right && !left) held = false;
    }
    const chord = aimChord({
      armed: holding(),
      busy: blocked,
      aiming: held,
      right,
      left,
      leftWas,
      sinceRight: now - rightAt,
      hold: AIM_CHORD,
    });
    if (!blocked) aiming = chord.aiming;
    if (!blocked && weapon === "hands" && left && !leftWas) beginPunch();
    else {
      const batClick = !blocked && weapon === "bat" && left && !leftWas;
      if (chord.fire || batClick) fire();
    }
    leftWas = left;
    if (event.button === 2) event.preventDefault();
  }

  window.addEventListener("pointermove", noteButtons, true);
  window.addEventListener("pointerdown", noteButtons, true);
  window.addEventListener("wheel", (event) => {
    if (busy()) return;
    if (Math.abs(event.deltaY) < 1 && Math.abs(event.deltaX) < 1) return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelAt) return;
    wheelAt = now + 350;
    cycleWeapon();
  }, { capture: true, passive: false });
  window.addEventListener("pointerup", noteButtons, true);
  window.addEventListener("contextmenu", (event) => event.preventDefault(), true);
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.code !== "KeyR") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (weapon !== "pistol" || busy() || reloadLeft > 0 || ammo >= MAG) return;
    reloadLeft = RELOAD_TIME;
    shootLeft = 0;
  });
  window.addEventListener("blur", () => {
    aiming = false;
    pointer = false;
  });

  return {
    get armed() {
      return holding();
    },
    get weapon() {
      return weapon;
    },
    cycle() {
      return cycleWeapon();
    },
    get aiming() {
      return aiming;
    },
    // Tap once to hold aim, tap again to release. Same flag as the right button.
    toggleAim() {
      if (!holding() || busy()) return false;
      aiming = !aiming;
      return aiming;
    },
    // Empty hands punch. The bat swings on this press. The pistol and the bottle still need aim.
    shoot() {
      if (weapon === "hands") {
        beginPunch();
        return;
      }
      fire();
    },
    pre() {
      const off = busy() || !holding();
      showHeld();
      if (off) {
        aiming = false;
        pending = null;
      }
      if (busy() && weapon === "hands") {
        punching = false;
        poseLeft = 0;
      }
      if (isTouchScreen()) {
        syncGunButtons(holding());
        if (aiming && stick && stick.active) {
          const along = aimAlongStick(player.mesh.position.x, player.mesh.position.z, stick.x, stick.z);
          if (along) {
            player.aimAt(along.x, along.z);
            aimDir = { x: stick.x, z: stick.z };
          }
        } else if (!aiming) {
          aimDir = null;
          player.clearAim();
        }
      } else {
        const spot = holding() && !busy() && pointer ? aimGround() : null;
        if (aiming && spot) player.aimAt(spot.x, spot.z);
        else player.clearAim();
      }
      player.holdPistol(weapon === "pistol" && holding() && !busy());
      player.forcePose(pistolPose({
        armed: holding(),
        busy: busy(),
        reloading: reloadLeft > 0,
        shooting: poseLeft > 0,
        aiming,
        speed: player.speed,
        weapon,
        punch: punchName,
      }));
    },
    update(dt) {
      const step = Math.max(0, dt);
      if (shootLeft > 0) shootLeft = Math.max(0, shootLeft - step);
      if (poseLeft > 0) poseLeft = Math.max(0, poseLeft - step);
      let killed = false;
      if (swinging && weapon === "bat") {
        const prev = swingAge;
        swingAge += step;
        if (!didHit && prev < BAT_HIT && swingAge >= BAT_HIT) {
          didHit = true;
          killed = strikeBat();
        }
        if (swingAge >= BAT_SWING) swinging = false;
      } else if (swinging) {
        swinging = false;
      }
      wear = stepBatWear(wear, step, killed);
      batMix.value = wear.mix;
      if (wear.stage !== "clean" && batMaterial.map !== batBlood) batMaterial.map = batBlood;
      if (punching && weapon === "hands") {
        const prev = punchAge;
        punchAge += step;
        if (!didPunch && prev < punchHitAt && punchAge >= punchHitAt) {
          didPunch = true;
          strikePunch();
        }
        if (punchAge >= punchPose) punching = false;
      } else if (punching) {
        punching = false;
      }
      if (pending) {
        pending.age += step;
        if (weapon !== "bottle" || busy()) pending = null;
        else if (pending.age >= RELEASE) releaseBottle();
      }
      if (weapon === "bottle" && handHidden && poseLeft === 0) handHidden = false;
      showHeld();
      stepFlights(step);
      if (reloadLeft > 0) {
        reloadLeft = Math.max(0, reloadLeft - step);
        if (reloadLeft === 0) ammo = MAG;
      }
      const want = aiming ? 1 : 0;
      aimBlend += (want - aimBlend) * (1 - Math.exp(-step / AIM_TAU));
      canvas.style.cursor = busy() ? "" : "none";
      const show = pointer && !busy();
      crosshair.hidden = !show;
      if (show) {
        crosshair.style.left = `${mouseX}px`;
        crosshair.style.top = `${mouseY}px`;
        const scale = 1 - aimBlend * 0.42;
        crosshair.style.transform = `translate(-50%, -50%) scale(${scale})`;
        small.style.opacity = String(aimBlend);
        big.style.opacity = String(1 - aimBlend);
      }
      if (flashLife > 0) {
        flashLife -= step;
        muzzle.getWorldPosition(flash.position);
        if (flashLife <= 0) flash.visible = false;
      }
      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const splash = splashes[i];
        splash.age += step;
        const fade = splash.age < SPLASH_HOLD
          ? 1
          : 1 - (splash.age - SPLASH_HOLD) / SPLASH_FADE;
        splash.sprite.material.opacity = Math.max(0, fade);
        if (splash.age >= SPLASH_HOLD + SPLASH_FADE) {
          splash.sprite.removeFromParent();
          splash.sprite.material.dispose();
          splashes.splice(i, 1);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const puff = puffs[i];
        puff.age += step;
        const frame = Math.min(puffTextures.length - 1, Math.floor(puff.age / PUFF_FRAME));
        if (puff.sprite.material.map !== puffTextures[frame]) {
          puff.sprite.material.map = puffTextures[frame];
        }
        if (puff.age > puffTextures.length * PUFF_FRAME) {
          puff.sprite.removeFromParent();
          puff.sprite.material.dispose();
          puffs.splice(i, 1);
        }
      }
      for (let i = carHits.length - 1; i >= 0; i -= 1) {
        const mark = carHits[i];
        mark.age += step;
        mark.sprite.material.opacity = Math.max(0, 1 - mark.age / CAR_HIT_LIFE);
        if (mark.age >= CAR_HIT_LIFE) {
          mark.sprite.removeFromParent();
          mark.sprite.material.dispose();
          carHits.splice(i, 1);
        }
      }
      for (const corpse of pedestrians.freshCorpses()) {
        const pool = splatAt(corpse.x, corpse.y, corpse.z, 4);
        pools.push({ mesh: pool, age: 0 });
      }
      for (const pool of pools) {
        pool.age += step;
        const grow = Math.min(1, pool.age / 2.4);
        pool.mesh.scale.setScalar(4 + grow * 7);
      }
    },
  };
}
