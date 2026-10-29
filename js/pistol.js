import {
  Audio,
  AudioLoader,
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
const RELOAD_TIME = 1.67;
const AIM_TAU = 0.08;
const FLASH_LIFE = 0.08;
const PUFF_FRAME = 0.035;
const BODY = 22;

const raycaster = new Raycaster();
const ndc = new Vector2();
const muzzlePos = new Vector3();

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
}) {
  const hand = player.model.getObjectByName("RightHand");
  if (!hand) throw new Error("The player is missing a right hand.");
  const gunGltf = await new GLTFLoader().loadAsync(new URL("../assets/gun/Pistol_1.glb", import.meta.url).href);
  const grip = new Group();
  // Pistol_6 is already scaled by 100, which makes the mesh about 2.4 units
  // long. The figure is 3.8 tall in the same space, so this brings the
  // barrel down to a handgun. Fingers run along the hand bone's +Y.
  grip.scale.setScalar(0.2);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.08, 0.02);
  grip.add(gunGltf.scene);
  hand.add(grip);
  let pistolMesh = null;
  gunGltf.scene.traverse((obj) => {
    if (obj.isMesh) pistolMesh = obj;
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
  flash.scale.set(14, 14, 1);
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
  const shotUrl = new URL("../assets/sound/gunshot.ogg", import.meta.url).href;
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

  let armed = true;
  let aiming = false;
  let aimBlend = 0;
  let pointer = false;
  let mouseX = 0;
  let mouseY = 0;
  let ammo = MAG;
  let shootLeft = 0;
  let reloadLeft = 0;
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
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i += 1) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 4 + Math.random() * 14;
          splatAt(
            hurt.x + Math.cos(ang) * dist,
            hurt.y - 15,
            hurt.z + Math.sin(ang) * dist,
            18 + Math.random() * 10,
          );
        }
      }
    }
    if (ammo === 0) reloadLeft = RELOAD_TIME;
  }

  function pickTarget() {
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    const spot = aimGround();
    const groundT = spot ? origin.distanceTo(spot) : 1200;
    let best = null;
    let bestT = groundT + 40;
    for (const ped of pedestrians.targets()) {
      const y = ped.live.holder.position.y + 12;
      const ox = ped.x - origin.x;
      const oy = y - origin.y;
      const oz = ped.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestT) continue;
      const miss = Math.hypot(ped.x - (origin.x + dir.x * t), y - (origin.y + dir.y * t), ped.z - (origin.z + dir.z * t));
      if (miss > BODY) continue;
      bestT = t;
      best = ped;
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

  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", (event) => {
    onPointer(event);
    if (event.button === 2) {
      if (armed && !busy()) aiming = true;
      event.preventDefault();
    } else if (event.button === 0) {
      fire();
    }
  });
  canvas.addEventListener("wheel", (event) => {
    if (busy()) return;
    armed = !armed;
    aiming = false;
    shootLeft = 0;
    reloadLeft = 0;
    event.preventDefault();
  }, { passive: false });
  window.addEventListener("pointerup", (event) => {
    if (event.button === 2) aiming = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.code !== "KeyR") return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!armed || busy() || reloadLeft > 0 || ammo >= MAG) return;
    reloadLeft = RELOAD_TIME;
    shootLeft = 0;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer = false;
  });

  return {
    pre() {
      const off = busy() || !armed;
      grip.visible = armed;
      if (off) aiming = false;
      const spot = armed && !busy() && pointer ? aimGround() : null;
      if (aiming && spot) player.aimAt(spot.x, spot.z);
      else player.clearAim();
      let pose = "";
      if (armed && !busy() && reloadLeft > 0) pose = "pistolReload";
      else if (armed && !busy() && shootLeft > 0) pose = "pistolShoot";
      else if (aiming) pose = "pistolAim";
      else if (armed && player.speed < 1) pose = "pistolIdle";
      player.forcePose(pose);
    },
    update(dt) {
      const step = Math.max(0, dt);
      if (shootLeft > 0) shootLeft = Math.max(0, shootLeft - step);
      if (reloadLeft > 0) {
        reloadLeft = Math.max(0, reloadLeft - step);
        if (reloadLeft === 0) ammo = MAG;
      }
      const want = aiming ? 1 : 0;
      aimBlend += (want - aimBlend) * (1 - Math.exp(-step / AIM_TAU));
      const show = armed && pointer && !busy();
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
        const pool = splatAt(corpse.x, corpse.y, corpse.z, 12);
        pools.push({ mesh: pool, age: 0 });
      }
      for (const pool of pools) {
        pool.age += step;
        const grow = Math.min(1, pool.age / 2.4);
        pool.mesh.scale.setScalar(12 + grow * 28);
      }
    },
  };
}
