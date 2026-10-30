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
  Object3D,
  PlaneGeometry,
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

const raycaster = new Raycaster();
const ndc = new Vector2();
const muzzlePos = new Vector3();
const pedBox = new Box3();
const pedHit = new Vector3();

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
  const gunGltf = await new GLTFLoader().loadAsync(new URL("../assets/gun/Pistol_1.glb", import.meta.url).href);
  const grip = new Group();
  // Pistol_6 is already scaled by 100, which makes the mesh about 2.4 units
  // long. The figure is 3.8 tall in the same space, so this brings the
  // barrel down to a handgun. Fingers run along the hand bone's +Y.
  grip.scale.setScalar(0.25);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.08, 0.02);
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

  const flash = new Sprite(new SpriteMaterial({
    map: flashTextures[0],
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  flash.scale.set(22, 22, 1);
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
  const splatGeo = new PlaneGeometry(1, 1);
  splatGeo.rotateX(-Math.PI / 2);
  const decals = [];
  const pools = [];

  const shot = new Audio(listener);
  const shotUrl = new URL("../assets/sound/pistol-shot.mp3", import.meta.url).href;
  new AudioLoader().load(shotUrl, (buffer) => {
    shot.setBuffer(buffer);
    shot.setLoop(false);
    shot.setVolume(0.4);
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

  // Empty hands until a scroll. One gesture equips or holsters, not a burst of toggles.
  let armed = false;
  let wheelAt = 0;
  let aiming = false;
  let aimBlend = 0;
  let pointer = false;
  let mouseX = 0;
  let mouseY = 0;
  let ammo = MAG;
  let shootLeft = 0;
  let poseLeft = 0;
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
    sprite.scale.set(36, 36, 1);
    sprite.renderOrder = 3;
    scene.add(sprite);
    puffs.push({ sprite, frame: 0, age: 0 });
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

  function fire() {
    if (!armed || busy() || !aiming || reloadLeft > 0 || shootLeft > 0 || ammo <= 0) return;
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
    if (hit) {
      const from = player.mesh.position;
      const hurt = pedestrians.hurt(hit.ped, hit.ped.x - from.x, hit.ped.z - from.z);
      if (hurt) {
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
    return best ? { ped: best } : null;
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
        if (!armed) return;
        aiming = true;
        rightAt = performance.now();
        event.preventDefault();
      } else if (event.button === 0) {
        fire();
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
      armed,
      busy: blocked,
      aiming: held,
      right,
      left,
      leftWas,
      sinceRight: now - rightAt,
      hold: AIM_CHORD,
    });
    if (!blocked) aiming = chord.aiming;
    if (chord.fire) fire();
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
    armed = !armed;
    aiming = false;
    shootLeft = 0;
    poseLeft = 0;
    reloadLeft = 0;
  }, { capture: true, passive: false });
  window.addEventListener("pointerup", noteButtons, true);
  window.addEventListener("contextmenu", (event) => event.preventDefault(), true);
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.code !== "KeyR") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!armed || busy() || reloadLeft > 0 || ammo >= MAG) return;
    reloadLeft = RELOAD_TIME;
    shootLeft = 0;
  });
  window.addEventListener("blur", () => {
    aiming = false;
    pointer = false;
  });

  return {
    get armed() {
      return armed;
    },
    get aiming() {
      return aiming;
    },
    // Tap once to hold aim, tap again to release. Same flag as the right button.
    toggleAim() {
      if (!armed || busy()) return false;
      aiming = !aiming;
      return aiming;
    },
    // Same shot as a left click. fire() already ignores it unless he is aiming.
    shoot() {
      fire();
    },
    pre() {
      const off = busy() || !armed;
      grip.visible = armed;
      if (off) aiming = false;
      if (isTouchScreen()) {
        syncGunButtons(armed);
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
        const spot = armed && !busy() && pointer ? aimGround() : null;
        if (aiming && spot) player.aimAt(spot.x, spot.z);
        else player.clearAim();
      }
      player.forcePose(pistolPose({
        armed,
        busy: busy(),
        reloading: reloadLeft > 0,
        shooting: poseLeft > 0,
        aiming,
        speed: player.speed,
      }));
    },
    update(dt) {
      const step = Math.max(0, dt);
      if (shootLeft > 0) shootLeft = Math.max(0, shootLeft - step);
      if (poseLeft > 0) poseLeft = Math.max(0, poseLeft - step);
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
