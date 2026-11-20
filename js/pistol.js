import { handSocket } from "./characters.js";
import {
  BAT_COMBO_RESET,
  BAT_EULER,
  BAT_HAND,
  BAT_HEAVY_DAMAGE_MULT,
  BAT_HEAVY_HOLD,
  BAT_HEAVY_REACH,
  BAT_REACH,
  BAT_SCALE,
  BAT_SIDE,
  batComboIndex,
  batHitFraction,
  batHits,
  batSwingName,
  freshBatWear,
  meleePlaybackRate,
  stepBatWear,
} from "./bat.js";
import {
  BAT_CAR_DAMAGE,
  BOTTLE_CAR_DAMAGE,
  PISTOL_CAR_DAMAGE,
  isBulletWorldGroundHit,
  swingHitsCar,
} from "./car-damage.js";
import { damageDealt as playerDamageDealt } from "./player-health.js";
import {
  BOTTLE_RELEASE,
  GRAVITY,
  PUNCH_POSE,
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
import { HOOK, HOOK_DAMAGE_MULT, nextPunch, punchHits, punchTiming } from "./punch.js";
import {
  SMG_DAMAGE,
  SMG_EULER,
  SMG_FIRE_RATE,
  SMG_HAND,
  SMG_MAG,
  SMG_MUZZLE,
  SMG_RANGE,
  SMG_SCALE,
  SMG_SPREAD_DEG,
} from "./smg.js";
import {
  SHOTGUN_EULER,
  SHOTGUN_FIRE_DELAY,
  SHOTGUN_HAND,
  SHOTGUN_KICK_BACK,
  SHOTGUN_KICK_RETURN,
  SHOTGUN_KICK_UP_DEG,
  SHOTGUN_MAG,
  SHOTGUN_MUZZLE,
  SHOTGUN_PELLET_DAMAGE,
  SHOTGUN_PELLETS,
  SHOTGUN_RANGE,
  SHOTGUN_SCALE,
  SHOTGUN_SPREAD_DEG,
  kickBlend,
  spreadFlat,
} from "./shotgun.js";
import {
  FLASH_SCALE_PISTOL,
  FLASH_SCALE_SHOTGUN,
  FLASH_SCALE_SMG,
  HITSTOP_BAT,
  HITSTOP_BAT_HEAVY,
  HITSTOP_BOTTLE,
  HITSTOP_KILL_BONUS,
  HITSTOP_PISTOL_HIT,
  HITSTOP_PUNCH,
  HITSTOP_SHOTGUN_HIT,
  KNOCK_BAT,
  KNOCK_BAT_HEAVY,
  KNOCK_BOTTLE,
  KNOCK_PISTOL,
  KNOCK_PUNCH,
  KNOCK_SHOTGUN_PELLET,
  KNOCK_SMG,
  MUZZLE_LIGHT_DECAY,
  MUZZLE_LIGHT_DISTANCE,
  MUZZLE_LIGHT_INTENSITY,
  MUZZLE_LIGHT_TIME,
  PISTOL_KICK_BACK,
  PISTOL_KICK_RETURN,
  PISTOL_KICK_UP_DEG,
  SHAKE_BAT_HEAVY_HIT,
  SHAKE_BAT_HIT,
  SHAKE_BOTTLE_HIT,
  SHAKE_PISTOL,
  SHAKE_PUNCH_HIT,
  SHAKE_SHOTGUN,
  SHAKE_SMG,
  SHOTGUN_PLAYER_PUSH,
  SMG_KICK_BACK,
  SMG_KICK_RETURN,
  SMG_KICK_SIDE_DEG,
  SMG_KICK_UP_DEG,
  TRACER_POOL,
  TRACER_TIME,
  TRACER_WIDTH,
  addShake,
  crosshairScale,
  feelOn,
  hitStop,
  markHit,
  requestPlayerPush,
} from "./game-feel.js";
import { aimChord, pistolPose } from "./pose-layers.js";
import { menuIsOpen } from "./start-menu.js";
import { aimAlongStick, isTouchScreen, syncGunButtons } from "./touch-ui.js";
import {
  AdditiveBlending,
  Audio,
  AudioLoader,
  Box3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Matrix3,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
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
// Six tiles. Shots farther than this do not hit a person or leave a mark on a car.
const PISTOL_RANGE = 288;
const PISTOL_DAMAGE = 2;
const BAT_DAMAGE = 2;
const BOTTLE_DAMAGE = 2;
// One punch leaves a pedestrian standing; a second punch drops them.
const PUNCH_DAMAGE = 1;
// Long enough for the forearm recoil to read, short enough to retrigger on the next shot.
const SHOT_POSE = 0.4;
const RELOAD_TIME = 1.67;
// Quieter than the gunshot (0.4), so the mag change sits under the action.
const RELOAD_SOUND_VOLUME = 0.35;
const RELOAD_SOUND_FILES = ["pistol-reload-1.ogg", "pistol-reload-2.ogg"];
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

const AIM_CHEST_Y = 18;
const raycaster = new Raycaster();
const ndc = new Vector2();
const muzzlePos = new Vector3();
const aimPoint = new Vector3();
const flatAim = { x: 0, z: 1, dist: 0 };
const pedBox = new Box3();
const pedHit = new Vector3();
const flightPos = new Vector3();
const flightQuat = new Quaternion();
const flightScale = new Vector3();
const worldHitNormal = new Vector3();
const worldHitWorld = new Matrix4();
const worldHitInst = new Matrix4();
const worldHitNormMat = new Matrix3();
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
  onShot = null,
}) {
  // The socket keeps the old hand frame, so the offsets below still fit.
  const hand = handSocket(player.model);
  if (!hand) throw new Error("The player is missing a right hand.");
  // While HIGH, outgoing hits are stronger. Future guns should use dealt() too.
  function dealt(amount) {
    return playerDamageDealt(amount, player.high || 0);
  }
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

  function heldGun(url, scale, hand, euler) {
    return loader.loadAsync(url).then((gltf) => {
      const root = new Group();
      root.scale.setScalar(scale);
      root.position.set(hand[0], hand[1], hand[2]);
      root.rotation.set(euler[0], euler[1], euler[2]);
      root.visible = false;
      gltf.scene.traverse((obj) => {
        if (obj.isMesh) obj.frustumCulled = false;
      });
      root.add(gltf.scene);
      return root;
    });
  }
  const smgUrl = new URL("../assets/gun/scorpion.glb", import.meta.url).href;
  const shotgunUrl = new URL("../assets/gun/shotgun.glb", import.meta.url).href;
  const [smgRoot, shotgunRoot] = await Promise.all([
    heldGun(smgUrl, SMG_SCALE, SMG_HAND, SMG_EULER),
    heldGun(shotgunUrl, SHOTGUN_SCALE, SHOTGUN_HAND, SHOTGUN_EULER),
  ]);
  // Z is applied first so the barrel turns toward the knuckles before the roll.
  shotgunRoot.rotation.order = "ZYX";
  shotgunRoot.rotation.set(SHOTGUN_EULER[0], SHOTGUN_EULER[1], SHOTGUN_EULER[2]);
  const smgMuzzle = new Object3D();
  smgMuzzle.position.set(SMG_MUZZLE[0], SMG_MUZZLE[1], SMG_MUZZLE[2]);
  smgRoot.children[0].add(smgMuzzle);
  const shotgunMuzzle = new Object3D();
  shotgunMuzzle.position.set(SHOTGUN_MUZZLE[0], SHOTGUN_MUZZLE[1], SHOTGUN_MUZZLE[2]);
  shotgunRoot.children[0].add(shotgunMuzzle);
  hand.add(smgRoot);
  hand.add(shotgunRoot);
  let kickAge = SHOTGUN_KICK_RETURN;
  let pistolKick = PISTOL_KICK_RETURN;
  let smgKick = SMG_KICK_RETURN;
  let smgSide = 0;

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
  const FLASH_BASE = 22 * 0.6 * 0.6;
  flash.scale.set(FLASH_BASE, FLASH_BASE, 1);
  flash.visible = false;
  flash.renderOrder = 3;
  scene.add(flash);
  let flashIndex = 0;
  let flashLife = 0;
  const muzzleLight = new PointLight(0xfff1d0, 0, MUZZLE_LIGHT_DISTANCE, MUZZLE_LIGHT_DECAY);
  scene.add(muzzleLight);
  let lightLife = 0;
  const tracerGeo = new BoxGeometry(1, 1, 1);
  tracerGeo.translate(0, 0, 0.5);
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new Mesh(tracerGeo, new MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;
  const shotHit = { ped: false, kill: false };
  let blastPed = null;

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

  const SHOT_VOICES = 4;
  const shotVoices = [];
  for (let i = 0; i < SHOT_VOICES; i += 1) shotVoices.push(new Audio(listener));
  let shotVoice = 0;
  const shotUrl = new URL("../assets/sound/pistol-shot.mp3", import.meta.url).href;
  new AudioLoader().load(shotUrl, (buffer) => {
    for (let i = 0; i < shotVoices.length; i += 1) {
      shotVoices[i].setBuffer(buffer);
      shotVoices[i].setLoop(false);
      shotVoices[i].setVolume(0.4);
    }
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
  const reloadSound = new Audio(listener);
  reloadSound.setLoop(false);
  reloadSound.setVolume(RELOAD_SOUND_VOLUME);
  const reloadBuffers = RELOAD_SOUND_FILES.map(() => null);
  let lastReloadIndex = -1;
  RELOAD_SOUND_FILES.forEach((name, i) => {
    const url = new URL(`../assets/audio/${name}`, import.meta.url).href;
    new AudioLoader().load(url, (buffer) => {
      reloadBuffers[i] = buffer;
    }, undefined, (error) => {
      console.error("The pistol reload sound failed to load:", name, error);
    });
  });

  function pickReloadClip(lastIndex, count, random = Math.random()) {
    const n = Math.max(1, count | 0);
    if (n === 1) return 0;
    if (lastIndex == null || lastIndex < 0 || lastIndex >= n) {
      return Math.floor(random * n) % n;
    }
    const skip = Math.floor(random * (n - 1)) % (n - 1);
    return skip >= lastIndex ? skip + 1 : skip;
  }

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
    if (menuIsOpen()) return;
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
    if (reloadSound.isPlaying) reloadSound.stop();
    reloadLeft = 0;
    swinging = false;
    swingAge = 0;
    didHit = false;
    heavySwing = false;
    batPress = false;
    trigger = false;
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
  const rounds = { pistol: MAG, scorpion: SMG_MAG, shotgun: SHOTGUN_MAG };
  let swingPose = "swordRegularA";
  let swingDur = 0.5;
  let swingHitAt = 0.25;
  let heavySwing = false;
  let comboStep = 0;
  let lastLightAt = -1e9;
  let batPress = false;
  let batPressAt = 0;
  let trigger = false;
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

  function playShot(rate = 1) {
    const voice = shotVoices[shotVoice];
    shotVoice = (shotVoice + 1) % shotVoices.length;
    if (!voice.buffer) return;
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    const playback = (rate > 0 ? rate : 1) * (1 + (Math.random() * 2 - 1) * 0.05);
    try {
      if (voice.isPlaying) voice.stop();
      voice.setPlaybackRate(playback);
      voice.play();
    } catch (error) {
      console.error("The gunshot failed to play", error);
    }
  }

  function playReloadSound() {
    const loaded = [];
    for (let i = 0; i < reloadBuffers.length; i += 1) {
      if (reloadBuffers[i]) loaded.push(i);
    }
    if (loaded.length === 0) return;
    const localLast = loaded.indexOf(lastReloadIndex);
    const pick = loaded[pickReloadClip(localLast < 0 ? -1 : localLast, loaded.length)];
    const master = typeof listener.getMasterVolume === "function" ? listener.getMasterVolume() : 1;
    if (!(master > 0)) return;
    try {
      if (reloadSound.isPlaying) reloadSound.stop();
      reloadSound.setBuffer(reloadBuffers[pick]);
      reloadSound.setVolume(RELOAD_SOUND_VOLUME);
      reloadSound.play();
      lastReloadIndex = pick;
    } catch (error) {
      console.error("The pistol reload sound failed to play", error);
    }
  }

  function beginReload() {
    reloadLeft = RELOAD_TIME;
    playReloadSound();
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
      best = { ...hit, car: list[i] };
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

  function magSize(name = weapon) {
    if (name === "scorpion") return SMG_MAG;
    if (name === "shotgun") return SHOTGUN_MAG;
    return MAG;
  }

  function gunMuzzle() {
    if (weapon === "shotgun") return shotgunMuzzle;
    if (weapon === "scorpion") return smgMuzzle;
    return muzzle;
  }

  function showHeld() {
    grip.visible = weapon === "pistol";
    smgRoot.visible = weapon === "scorpion";
    shotgunRoot.visible = weapon === "shotgun";
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

  function hitPedAt(point) {
    if (!pedestrians || !pedestrians.targets) return null;
    const list = pedestrians.targets();
    for (let i = 0; i < list.length; i += 1) {
      const ped = list[i];
      const dx = point.x - ped.x;
      const dz = point.z - ped.z;
      if (dx * dx + dz * dz > PED_REACH_SQ) continue;
      const feet = ped.live ? ped.live.holder.position.y : point.y;
      if (point.y < feet - 4 || point.y > feet + 40) continue;
      return ped;
    }
    return null;
  }

  function hitsPed(point) {
    return hitPedAt(point) != null;
  }

  function hitsCar(point) {
    return hitCarAt(point) != null;
  }

  function hitCarAt(point) {
    if (!traffic || !traffic.cars) return null;
    const list = traffic.cars();
    for (let i = 0; i < list.length; i += 1) {
      if (carContains(point.x, point.y, point.z, list[i])) return list[i];
    }
    return null;
  }

  function buildRecordFromHit(item) {
    const records = item.object && item.object.userData && item.object.userData.records;
    if (records && item.instanceId != null) return records[item.instanceId] || null;
    let node = item.object;
    while (node) {
      if (node.userData && node.userData.piece) return node.userData.piece;
      if (node.name === "build") break;
      node = node.parent;
    }
    return null;
  }

  function hitNormalY(item) {
    if (!item.face || !item.object) return null;
    worldHitNormal.copy(item.face.normal);
    if (item.object.isInstancedMesh && item.instanceId != null) {
      item.object.getMatrixAt(item.instanceId, worldHitInst);
      worldHitWorld.multiplyMatrices(item.object.matrixWorld, worldHitInst);
    } else {
      worldHitWorld.copy(item.object.matrixWorld);
    }
    worldHitNormMat.getNormalMatrix(worldHitWorld);
    worldHitNormal.applyMatrix3(worldHitNormMat).normalize();
    return worldHitNormal.y;
  }

  // First wall, building, or prop along the aim ray. Ground and street are skipped.
  function nearestWorldHit(range) {
    const build = scene.getObjectByName("build");
    if (!build) return null;
    const from = player.mesh.position;
    const hits = raycaster.intersectObject(build, true);
    for (let i = 0; i < hits.length; i += 1) {
      const item = hits[i];
      if (Math.hypot(item.point.x - from.x, item.point.z - from.z) > range) continue;
      const record = buildRecordFromHit(item);
      const file = record && record.file ? record.file : "";
      if (file.startsWith("road")) continue;
      const groundY = traffic && traffic.roadHeight
        ? (traffic.roadHeight(item.point.x, item.point.z, item.point.y) ?? from.y)
        : from.y;
      if (isBulletWorldGroundHit(hitNormalY(item), item.point.y, groundY)) continue;
      return { x: item.point.x, y: item.point.y, z: item.point.z };
    }
    return null;
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

  function startSwing(name, heavy) {
    if (poseLeft > 0 || swinging) return;
    const dur = player.clipDuration(name);
    if (!(dur > 0)) return;
    heavySwing = heavy;
    swingPose = name;
    swingDur = dur;
    swingHitAt = batHitFraction(name) * dur;
    poseLeft = dur;
    swinging = true;
    swingAge = 0;
    didHit = false;
    player.kickPose(name);
  }

  function beginLight() {
    if (poseLeft > 0 || swinging) return;
    const now = performance.now() / 1000;
    const index = batComboIndex(comboStep, now - lastLightAt, BAT_COMBO_RESET);
    comboStep = (index + 1) % 3;
    lastLightAt = now;
    startSwing(batSwingName(index), false);
  }

  function beginHeavy() {
    startSwing("swordHeavy", true);
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
    shotHit.ped = false;
    shotHit.kill = false;
    const from = player.mesh.position;
    const dirX = player.dirX;
    const dirZ = player.dirZ;
    let killed = false;
    let connected = false;
    for (const ped of pedestrians.targets()) {
      const reach = heavySwing ? BAT_HEAVY_REACH : BAT_REACH;
      if (!batHits(from.x, from.z, dirX, dirZ, ped.x, ped.z, reach, BAT_SIDE)) continue;
      const damage = BAT_DAMAGE * (heavySwing ? BAT_HEAVY_DAMAGE_MULT : 1);
      const hurt = pedestrians.hurt(ped, ped.x - from.x, ped.z - from.z, dealt(damage));
      if (!hurt) continue;
      killed = true;
      connected = true;
      if (ped.dead) shotHit.kill = true;
      pedestrians.shove(ped, ped.x - from.x, ped.z - from.z, heavySwing ? KNOCK_BAT_HEAVY : KNOCK_BAT, heavySwing && ped.dead);
      bleed(hurt);
    }
    if (traffic && traffic.cars && traffic.hit) {
      for (const car of traffic.cars()) {
        const reach = heavySwing ? BAT_HEAVY_REACH : BAT_REACH;
        if (!swingHitsCar(from.x, from.z, dirX, dirZ, car, reach, BAT_SIDE)) continue;
        const result = traffic.hit(car, dealt(BAT_CAR_DAMAGE), "melee");
        if (result && result.damaged) connected = true;
      }
    }
    if (connected) {
      playMeleeHit();
      addShake(heavySwing ? SHAKE_BAT_HEAVY_HIT : SHAKE_BAT_HIT);
      const freeze = heavySwing ? HITSTOP_BAT_HEAVY : HITSTOP_BAT;
      hitStop(freeze + (shotHit.kill ? HITSTOP_KILL_BONUS : 0));
      markHit(shotHit.kill);
    }
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
    shotHit.ped = false;
    shotHit.kill = false;
    const from = player.mesh.position;
    const dirX = player.dirX;
    const dirZ = player.dirZ;
    let connected = false;
    for (const ped of pedestrians.targets()) {
      if (!punchHits(from.x, from.z, dirX, dirZ, ped.x, ped.z)) continue;
      const mult = punchName === HOOK ? HOOK_DAMAGE_MULT : 1;
      const hurt = pedestrians.hurt(ped, ped.x - from.x, ped.z - from.z, dealt(PUNCH_DAMAGE * mult));
      if (!hurt) continue;
      connected = true;
      if (ped.dead) shotHit.kill = true;
      pedestrians.shove(ped, ped.x - from.x, ped.z - from.z, KNOCK_PUNCH, false);
      bleed(hurt);
    }
    if (connected) {
      playMeleeHit();
      addShake(SHAKE_PUNCH_HIT);
      hitStop(HITSTOP_PUNCH + (shotHit.kill ? HITSTOP_KILL_BONUS : 0));
      markHit(shotHit.kill);
    }
  }

  function beginThrow() {
    if (poseLeft > 0 || pending) return;
    const picked = pickBottle();
    handIndex = Math.max(0, BOTTLES.findIndex((item) => item.id === picked.id));
    handHidden = false;
    pending = { age: 0, target: throwTarget(), index: handIndex };
    poseLeft = player.clipDuration("overhandThrow") || PUNCH_POSE;
    player.kickPose("overhandThrow");
  }

  function stepFlights(step) {
    for (let i = flights.length - 1; i >= 0; i -= 1) {
      const flight = flights[i];
      flight.age += step;
      const t = Math.min(flight.time, flight.age);
      const point = arcPoint(flight.start, flight.velocity, t, GRAVITY);
      flight.mesh.position.set(point.x, point.y, point.z);
      flight.mesh.rotateZ(step * 9);
      const pedHit = hitPedAt(point);
      const carHit = pedHit ? null : hitCarAt(point);
      if (pedHit || carHit || hitsWall(point) || flight.age >= flight.time) {
        if (pedHit) {
          const from = player.mesh.position;
          const hurt = pedestrians.hurt(pedHit, pedHit.x - from.x, pedHit.z - from.z, dealt(BOTTLE_DAMAGE));
          if (hurt) {
            bleed(hurt);
            pedestrians.shove(pedHit, pedHit.x - from.x, pedHit.z - from.z, KNOCK_BOTTLE, false);
            addShake(SHAKE_BOTTLE_HIT);
            hitStop(HITSTOP_BOTTLE + (pedHit.dead ? HITSTOP_KILL_BONUS : 0));
            markHit(pedHit.dead);
          }
        } else if (carHit && traffic.hit) {
          traffic.hit(carHit, dealt(BOTTLE_CAR_DAMAGE), "melee");
        }
        breakBottle(flight, point);
        flights.splice(i, 1);
      }
    }
  }

  function showFlash(scale) {
    flashIndex = (flashIndex + 1) % flashTextures.length;
    flash.material.map = flashTextures[flashIndex];
    flash.material.needsUpdate = true;
    gunMuzzle().getWorldPosition(muzzlePos);
    flash.position.copy(muzzlePos);
    const mul = feelOn() ? scale : 1;
    flash.scale.set(FLASH_BASE * mul, FLASH_BASE * mul, 1);
    flash.visible = true;
    flashLife = FLASH_LIFE;
    if (!feelOn()) return;
    lightLife = MUZZLE_LIGHT_TIME;
    muzzleLight.intensity = MUZZLE_LIGHT_INTENSITY;
    muzzleLight.position.copy(muzzlePos);
  }

  function spawnTracer(x, y, z) {
    if (!feelOn()) return;
    const dx = x - muzzlePos.x;
    const dy = y - muzzlePos.y;
    const dz = z - muzzlePos.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const mesh = slot.mesh;
    mesh.position.copy(muzzlePos);
    mesh.lookAt(x, y, z);
    mesh.scale.set(TRACER_WIDTH, TRACER_WIDTH, len);
    mesh.material.opacity = 1;
    mesh.visible = true;
    slot.life = TRACER_TIME;
  }

  function traceMiss(flat, range) {
    spawnTracer(
      muzzlePos.x + flat.x * range,
      muzzlePos.y,
      muzzlePos.z + flat.z * range,
    );
  }

  function scareCrowd() {
    if (onShot) onShot();
    traffic.scare(player.mesh.position.x, player.mesh.position.z);
    if (pedestrians.scare) {
      pedestrians.scare(player.mesh.position.x, player.mesh.position.z);
    }
  }

  function readAim() {
    const ray = aimRay();
    if (aimDir && Math.hypot(aimDir.x, aimDir.z) > 0) {
      flatAim.x = ray.direction.x;
      flatAim.z = ray.direction.z;
      flatAim.dist = 0;
      return flatAim;
    }
    const planeY = player.mesh.position.y + AIM_CHEST_Y;
    const dirY = ray.direction.y;
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    if (Math.abs(dirY) > 1e-8) {
      const t = (planeY - ray.origin.y) / dirY;
      if (t > 0) {
        aimPoint.set(
          ray.origin.x + ray.direction.x * t,
          planeY,
          ray.origin.z + ray.direction.z * t,
        );
        const hx = aimPoint.x - px;
        const hz = aimPoint.z - pz;
        const dist = Math.hypot(hx, hz);
        if (dist > 1e-4) {
          flatAim.x = hx / dist;
          flatAim.z = hz / dist;
          flatAim.dist = dist;
          return flatAim;
        }
      }
    }
    const flat = Math.hypot(ray.direction.x, ray.direction.z) || 1;
    flatAim.x = ray.direction.x / flat;
    flatAim.z = ray.direction.z / flat;
    flatAim.dist = 0;
    return flatAim;
  }

  function spreadShot(aim, origin, spreadDeg) {
    const f = spreadFlat(aim.x, aim.z, spreadDeg);
    const ray = raycaster.ray;
    ray.origin.copy(origin);
    if (aim.dist > 0) {
      aimPoint.set(
        player.mesh.position.x + f.x * aim.dist,
        player.mesh.position.y + AIM_CHEST_Y,
        player.mesh.position.z + f.z * aim.dist,
      );
      aimPoint.sub(origin);
      if (aimPoint.lengthSq() > 1e-8) aimPoint.normalize();
      else aimPoint.set(f.x, 0, f.z);
    } else {
      aimPoint.set(f.x, 0, f.z);
    }
    ray.direction.copy(aimPoint);
    return {
      dir: { x: aimPoint.x, y: aimPoint.y, z: aimPoint.z },
      flat: f,
    };
  }

  function aimRay() {
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
    return ray;
  }

  function boxHit(ped, range) {
    if (!ped || !ped.live) return null;
    const ray = raycaster.ray;
    ped.live.holder.updateWorldMatrix(true, true);
    pedBox.setFromObject(ped.live.holder);
    if (!ray.intersectBox(pedBox, pedHit)) return null;
    const t = pedHit.distanceTo(ray.origin);
    const from = player.mesh.position;
    if (Math.hypot(ped.x - from.x, ped.z - from.z) > range) return null;
    return { ped, t };
  }

  function shootAlong(dir, range, damage, markCar, knock, killBoost, flat) {
    const ray = raycaster.ray;
    ray.direction.set(dir.x, dir.y, dir.z);
    let hit = pickTarget(range);
    if (killBoost && blastPed) {
      const body = boxHit(blastPed, range);
      if (body && (!hit || body.t <= hit.t)) hit = body;
    }
    const car = nearestCar(ray);
    const from = player.mesh.position;
    const carInRange = car && Math.hypot(car.x - from.x, car.z - from.z) <= range;
    if (carInRange && !(hit && hit.t <= car.t)) {
      if (markCar) {
        carHitAt(car.x, car.y, car.z);
        if (traffic.bulletHit && car.car) traffic.bulletHit(car.car, dealt(PISTOL_CAR_DAMAGE), car.x, car.z);
      }
      spawnTracer(car.x, car.y, car.z);
      return "car";
    }
    if (hit) {
      if (killBoost) blastPed = hit.ped;
      const hurt = pedestrians.hurt(hit.ped, hit.ped.x - from.x, hit.ped.z - from.z, dealt(damage));
      const awayX = hit.ped.x - from.x;
      const awayZ = hit.ped.z - from.z;
      if (hurt) {
        bleed(hurt);
        pedestrians.shove(hit.ped, awayX, awayZ, knock, Boolean(killBoost) && hit.ped.dead);
        shotHit.ped = true;
        if (hit.ped.dead) shotHit.kill = true;
        spawnTracer(hurt.x, hurt.y, hurt.z);
      } else if (killBoost && hit.ped.dead) {
        pedestrians.shove(hit.ped, awayX, awayZ, knock, true);
        shotHit.ped = true;
        shotHit.kill = true;
        spawnTracer(hit.ped.x, muzzlePos.y, hit.ped.z);
      } else {
        spawnTracer(hit.ped.x, muzzlePos.y, hit.ped.z);
      }
      return "ped";
    }
    traceMiss(flat, range);
    return "";
  }

  function noteGunHit(kind) {
    if (kind === "car") markHit(false);
    if (!shotHit.ped) return;
    markHit(shotHit.kill);
  }

  function firePistol() {
    if (reloadLeft > 0 || shootLeft > 0 || rounds.pistol <= 0) return;
    rounds.pistol -= 1;
    shootLeft = SHOT_TIME;
    poseLeft = SHOT_POSE;
    player.kickPose("pistolShoot");
    pistolKick = 0;
    shotHit.ped = false;
    shotHit.kill = false;
    const ray = aimRay();
    const dir = { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z };
    const aim = readAim();
    showFlash(FLASH_SCALE_PISTOL);
    addShake(SHAKE_PISTOL);
    playShot(1);
    scareCrowd();
    const kind = shootAlong(dir, PISTOL_RANGE, PISTOL_DAMAGE, true, KNOCK_PISTOL, false, aim);
    if (shotHit.ped) hitStop(HITSTOP_PISTOL_HIT + (shotHit.kill ? HITSTOP_KILL_BONUS : 0));
    noteGunHit(kind);
    if (!kind && traffic.playBulletWorldHitSound) {
      const world = nearestWorldHit(PISTOL_RANGE);
      if (world) traffic.playBulletWorldHitSound(world.x, world.z);
    }
    if (rounds.pistol === 0) beginReload();
  }

  function fireSmg() {
    if (reloadLeft > 0 || shootLeft > 0 || rounds.scorpion <= 0) return;
    rounds.scorpion -= 1;
    shootLeft = 1 / SMG_FIRE_RATE;
    poseLeft = SHOT_POSE;
    player.kickPose("pistolShoot");
    smgKick = 0;
    smgSide = Math.random() * 2 - 1;
    shotHit.ped = false;
    shotHit.kill = false;
    const ray = aimRay();
    const origin = ray.origin.clone();
    const bullet = spreadShot(readAim(), origin, SMG_SPREAD_DEG);
    showFlash(FLASH_SCALE_SMG);
    addShake(SHAKE_SMG);
    playShot(1);
    scareCrowd();
    const kind = shootAlong(bullet.dir, SMG_RANGE, SMG_DAMAGE, true, KNOCK_SMG, false, bullet.flat);
    noteGunHit(kind);
    if (!kind && traffic.playBulletWorldHitSound) {
      const world = nearestWorldHit(SMG_RANGE);
      if (world) traffic.playBulletWorldHitSound(world.x, world.z);
    }
    if (rounds.scorpion === 0) beginReload();
  }

  function fireShotgun() {
    if (reloadLeft > 0 || shootLeft > 0 || rounds.shotgun <= 0) return;
    rounds.shotgun -= 1;
    shootLeft = SHOTGUN_FIRE_DELAY;
    poseLeft = SHOT_POSE;
    player.kickPose("pistolShoot");
    kickAge = 0;
    blastPed = null;
    shotHit.ped = false;
    shotHit.kill = false;
    const ray = aimRay();
    const origin = ray.origin.clone();
    const base = { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z };
    const read = readAim();
    const aim = { x: read.x, z: read.z, dist: read.dist };
    showFlash(FLASH_SCALE_SHOTGUN);
    addShake(SHAKE_SHOTGUN);
    requestPlayerPush(-aim.x, -aim.z, SHOTGUN_PLAYER_PUSH);
    playShot(0.7);
    scareCrowd();
    let any = false;
    let carMarked = false;
    for (let i = 0; i < SHOTGUN_PELLETS; i += 1) {
      const bullet = spreadShot(aim, origin, SHOTGUN_SPREAD_DEG);
      const kind = shootAlong(bullet.dir, SHOTGUN_RANGE, SHOTGUN_PELLET_DAMAGE, !carMarked, KNOCK_SHOTGUN_PELLET, true, bullet.flat);
      if (kind === "car") carMarked = true;
      if (kind) any = true;
    }
    if (shotHit.ped) hitStop(HITSTOP_SHOTGUN_HIT + (shotHit.kill ? HITSTOP_KILL_BONUS : 0));
    if (shotHit.ped || carMarked) markHit(shotHit.kill);
    if (!any && traffic.playBulletWorldHitSound) {
      ray.origin.copy(origin);
      ray.direction.set(base.x, base.y, base.z);
      const world = nearestWorldHit(SHOTGUN_RANGE);
      if (world) traffic.playBulletWorldHitSound(world.x, world.z);
    }
    if (rounds.shotgun === 0) beginReload();
  }

  function fire() {
    if (!holding() || busy()) return;
    if (weapon === "bat") return;
    if (!aiming) return;
    if (weapon === "bottle") {
      beginThrow();
      return;
    }
    if (weapon === "shotgun") {
      fireShotgun();
      return;
    }
    if (weapon === "scorpion") {
      fireSmg();
      return;
    }
    firePistol();
  }

  function pickTarget(range) {
    // Same idea as three.js webgl_decals: a ray from the cursor, then the
    // first thing that ray actually meets. Here that is the pedestrian's box.
    // Range is measured from the player, not the camera (the camera sits far above).
    const ray = raycaster.ray;
    let best = null;
    let bestT = Infinity;
    for (const ped of pedestrians.targets()) {
      ped.live.holder.updateWorldMatrix(true, true);
      pedBox.setFromObject(ped.live.holder);
      if (!ray.intersectBox(pedBox, pedHit)) continue;
      const t = pedHit.distanceTo(ray.origin);
      if (Math.hypot(ped.x - player.mesh.position.x, ped.z - player.mesh.position.z) > range) continue;
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
    if (menuIsOpen()) return;
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
    const leftGun = weapon === "scorpion" || weapon === "shotgun";
    if (!blocked && leftGun && left) aiming = true;
    trigger = !blocked && left;
    if (!blocked && weapon === "hands" && left && !leftWas) beginPunch();
    else if (!blocked && weapon === "bat") {
      if (left && !leftWas) {
        if (poseLeft > 0 || swinging) batPress = false;
        else {
          batPress = true;
          batPressAt = now;
        }
      }
      if (!left && leftWas && batPress) {
        batPress = false;
        const held = (now - batPressAt) / 1000;
        if (held >= BAT_HEAVY_HOLD) beginHeavy();
        else beginLight();
      }
    } else if (chord.fire || (!blocked && leftGun && left && !leftWas)) fire();
    leftWas = left;
    if (event.button === 2) event.preventDefault();
  }

  window.addEventListener("pointermove", noteButtons, true);
  window.addEventListener("pointerdown", noteButtons, true);
  window.addEventListener("wheel", (event) => {
    if (menuIsOpen() || busy()) return;
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
    if (menuIsOpen()) return;
    if (event.repeat || event.code !== "KeyR") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (weapon !== "pistol" && weapon !== "scorpion" && weapon !== "shotgun") return;
    if (busy() || reloadLeft > 0 || rounds[weapon] >= magSize()) return;
    beginReload();
    shootLeft = 0;
  });
  window.addEventListener("blur", () => {
    aiming = false;
    pointer = false;
    trigger = false;
    batPress = false;
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
      if (weapon === "bat") {
        beginLight();
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
        swing: swingPose,
      }));
    },
    update(dt) {
      const step = Math.max(0, dt);
      if (shootLeft > 0) shootLeft = Math.max(0, shootLeft - step);
      if (poseLeft > 0) poseLeft = Math.max(0, poseLeft - step);
      if (kickAge < SHOTGUN_KICK_RETURN) kickAge = Math.min(SHOTGUN_KICK_RETURN, kickAge + step);
      if (pistolKick < PISTOL_KICK_RETURN) pistolKick = Math.min(PISTOL_KICK_RETURN, pistolKick + step);
      if (smgKick < SMG_KICK_RETURN) smgKick = Math.min(SMG_KICK_RETURN, smgKick + step);
      let killed = false;
      if (weapon === "scorpion" && trigger && aiming && !busy()) fireSmg();
      const kick = kickBlend(kickAge);
      shotgunRoot.position.set(
        SHOTGUN_HAND[0],
        SHOTGUN_HAND[1] - kick * SHOTGUN_KICK_BACK,
        SHOTGUN_HAND[2],
      );
      shotgunRoot.rotation.set(
        SHOTGUN_EULER[0] + kick * SHOTGUN_KICK_UP_DEG * Math.PI / 180,
        SHOTGUN_EULER[1],
        SHOTGUN_EULER[2],
      );
      const pistolBlend = kickBlend(pistolKick, PISTOL_KICK_RETURN);
      grip.position.set(0, 0.205 - pistolBlend * PISTOL_KICK_BACK, -0.089);
      grip.rotation.set(pistolBlend * PISTOL_KICK_UP_DEG * Math.PI / 180, 0, Math.PI / 2);
      const smgBlend = kickBlend(smgKick, SMG_KICK_RETURN);
      smgRoot.position.set(
        SMG_HAND[0],
        SMG_HAND[1] - smgBlend * SMG_KICK_BACK,
        SMG_HAND[2],
      );
      smgRoot.rotation.set(
        SMG_EULER[0] + smgBlend * SMG_KICK_UP_DEG * Math.PI / 180,
        SMG_EULER[1],
        SMG_EULER[2] + smgBlend * smgSide * SMG_KICK_SIDE_DEG * Math.PI / 180,
      );
      if (swinging && weapon === "bat") {
        const prev = swingAge;
        swingAge += step;
        if (!didHit && prev < swingHitAt && swingAge >= swingHitAt) {
          didHit = true;
          killed = strikeBat();
        }
        if (swingAge >= swingDur) swinging = false;
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
        else if (pending.age >= (player.clipDuration("overhandThrow") || PUNCH_POSE) * BOTTLE_RELEASE) releaseBottle();
      }
      if (weapon === "bottle" && handHidden && poseLeft === 0) handHidden = false;
      showHeld();
      stepFlights(step);
      if (reloadLeft > 0) {
        reloadLeft = Math.max(0, reloadLeft - step);
        if (reloadLeft === 0 && rounds[weapon] != null) rounds[weapon] = magSize();
      }
      const want = aiming ? 1 : 0;
      aimBlend += (want - aimBlend) * (1 - Math.exp(-step / AIM_TAU));
      canvas.style.cursor = busy() ? "" : "none";
      const show = pointer && !busy();
      crosshair.hidden = !show;
      if (!show) crosshair.style.filter = "";
      if (show) {
        crosshair.style.left = `${mouseX}px`;
        crosshair.style.top = `${mouseY}px`;
        const scale = (1 - aimBlend * 0.42) * crosshairScale();
        crosshair.style.transform = `translate(-50%, -50%) scale(${scale})`;
        crosshair.style.filter = crosshairScale() > 1 ? "sepia(1) saturate(7) hue-rotate(-20deg)" : "";
        small.style.opacity = String(aimBlend);
        big.style.opacity = String(1 - aimBlend);
      }
      if (flashLife > 0) {
        flashLife -= step;
        gunMuzzle().getWorldPosition(flash.position);
        if (flashLife <= 0) flash.visible = false;
      }
      if (lightLife > 0) {
        lightLife -= step;
        if (lightLife <= 0 || !feelOn()) {
          lightLife = 0;
          muzzleLight.intensity = 0;
        } else {
          muzzleLight.intensity = MUZZLE_LIGHT_INTENSITY * (lightLife / MUZZLE_LIGHT_TIME);
          muzzleLight.position.copy(muzzlePos);
        }
      }
      for (let i = 0; i < tracers.length; i += 1) {
        const slot = tracers[i];
        if (slot.life <= 0) continue;
        slot.life -= step;
        if (slot.life <= 0 || !feelOn()) {
          slot.life = 0;
          slot.mesh.visible = false;
        } else {
          slot.mesh.material.opacity = slot.life / TRACER_TIME;
        }
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
