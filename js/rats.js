// Rare roaming rats. The pack is loaded once and cloned. They have no
// animation, so a short scurry, a pause, and a flee are done in code.

import { Box3, Group, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";
import { tileAt } from "./city.js";
import { walkableCells } from "./pedestrian-walk.js";

const PACK_URL = new URL("../assets/props/rats/cartoon_low_poly_rat_pack.glb", import.meta.url).href;
const RAT_NAMES = ["Rat1", "Rat2", "Rat3"];
// The pack is about 1 unit tall and 2.5 units long. The player is about 35
// units tall. Scale 8 makes a rat about a quarter of his height, small next
// to him, but still readable from the gameplay camera.
const RAT_SCALE = 8;
const MAX_RATS = 2;
const SPAWN_MIN = 120;
const SPAWN_MAX = 300;
const FAST_SPAWN_MIN = 1;
const FAST_SPAWN_MAX = 3;
const SCURRY_MIN = 6;
const SCURRY_MAX = 10;
const HARD_CAP = 25;
const SCURRY_SPEED = 90;
const FLEE_SPEED = 140;
const PAUSE_MIN = 0.35;
const PAUSE_MAX = 1.1;
const BOB = 0.28;
const WOBBLE = 0.22;
const PATH_STEPS_MIN = 3;
const PATH_STEPS_MAX = 6;

export const ratsFast = new URLSearchParams(window.location.search).get("rats") === "fast";

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[(Math.random() * list.length) | 0];
}

function keyOf(tx, tz) {
  return tx + "," + tz;
}

function tileOf(x, z) {
  return { tx: Math.floor(x / TILE), tz: Math.floor(z / TILE) };
}

function centerOf(tx, tz) {
  return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE };
}

function inRect(x, z, rect) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function preparePack(sceneRoot) {
  sceneRoot.updateMatrixWorld(true);
  const box = new Box3();
  const templates = [];
  for (const name of RAT_NAMES) {
    const node = sceneRoot.getObjectByName(name);
    if (!node) continue;
    node.updateWorldMatrix(true, true);
    const prototype = new Group();
    prototype.name = name;
    const clone = node.clone(true);
    // Keep the Sketchfab parent rotation, then drop the pack layout offset.
    clone.matrix.copy(node.matrixWorld);
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    clone.position.set(0, 0, 0);
    prototype.add(clone);
    prototype.updateMatrixWorld(true);
    box.setFromObject(prototype);
    clone.position.x -= (box.min.x + box.max.x) / 2;
    clone.position.z -= (box.min.z + box.max.z) / 2;
    clone.position.y -= box.min.y;
    prototype.scale.setScalar(RAT_SCALE);
    prototype.updateMatrixWorld(true);
    box.setFromObject(prototype);
    prototype.userData.size = {
      x: box.max.x - box.min.x,
      y: box.max.y - box.min.y,
      z: box.max.z - box.min.z,
    };
    prototype.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.map) {
          mat.map.colorSpace = SRGBColorSpace;
          mat.map.magFilter = LinearFilter;
          mat.map.minFilter = LinearMipmapLinearFilter;
          mat.map.generateMipmaps = true;
          mat.map.needsUpdate = true;
        }
      }
    });
    templates.push(prototype);
  }
  return templates;
}

function collectBuildingRects(scene, map) {
  const rects = [];
  for (const building of map.buildings || []) {
    if (!(building.w > 0) || !(building.d > 0)) continue;
    rects.push({
      minX: building.x * TILE,
      maxX: (building.x + building.w) * TILE,
      minZ: building.z * TILE,
      maxZ: (building.z + building.d) * TILE,
    });
  }
  const house = scene.getObjectByName("textured-test-house");
  if (house) {
    const box = new Box3().setFromObject(house);
    if (box && Number.isFinite(box.min.x)) {
      rects.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    }
  }
  const zones = scene.getObjectByName("zone-buildings");
  if (zones) {
    for (const child of zones.children) {
      const box = new Box3().setFromObject(child);
      if (!box || !Number.isFinite(box.min.x)) continue;
      rects.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    }
  }
  return rects;
}

export async function createRats(scene, map, pieces = [], feetAt = null, camera = null) {
  const view = { playerX: 0, playerZ: 0, camX: 0, camZ: 0, halfW: 400, halfH: 250, ready: false };
  const state = {
    loaded: false,
    fast: ratsFast,
    error: null,
    hold: false,
    active: [],
    pool: [],
    wait: ratsFast ? rand(FAST_SPAWN_MIN, FAST_SPAWN_MAX) : rand(SPAWN_MIN, SPAWN_MAX),
    templates: [],
  };

  const stub = {
    fast: ratsFast,
    update() {},
    forceSpawn() {
      return false;
    },
    holdSpawns() {},
    debug() {
      return {
        loaded: state.loaded,
        fast: ratsFast,
        error: state.error,
        active: 0,
        sceneVisible: 0,
        nextSpawn: state.wait,
        rats: [],
      };
    },
  };

  let templates;
  try {
    const gltf = await new GLTFLoader().loadAsync(PACK_URL);
    templates = preparePack(gltf.scene);
    if (templates.length === 0) throw new Error("The rat pack has no Rat1, Rat2, or Rat3 meshes.");
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    console.warn("Rats failed to load", error);
    return stub;
  }

  state.loaded = true;
  state.templates = templates;
  const cells = walkableCells(map, pieces);
  const walkable = new Set(cells.map(([tx, tz]) => keyOf(tx, tz)));
  const rects = collectBuildingRects(scene, map);
  const projected = new Vector3();
  const root = new Group();
  root.name = "rats";
  scene.add(root);

  function groundY(x, z) {
    return feetAt ? feetAt(x, z) : 0.6;
  }

  function allowed(x, z) {
    if (tileAt(map, x, z) === "~") return false;
    const { tx, tz } = tileOf(x, z);
    if (!walkable.has(keyOf(tx, tz))) return false;
    for (const rect of rects) {
      if (inRect(x, z, rect)) return false;
    }
    return true;
  }

  function snapWalkable(x, z, reach = 8) {
    if (allowed(x, z)) return { x, z };
    const start = tileOf(x, z);
    for (let radius = 0; radius <= reach; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const spot = centerOf(start.tx + dx, start.tz + dz);
          if (allowed(spot.x, spot.z)) return spot;
        }
      }
    }
    return null;
  }

  function visibleCount() {
    let n = 0;
    for (const child of root.children) {
      if (child.visible) n += 1;
    }
    return n;
  }

  function takeHolder(name) {
    const ready = state.pool.findIndex((item) => item.name === name);
    if (ready >= 0) {
      const item = state.pool.splice(ready, 1)[0];
      if (!item.holder.parent) root.add(item.holder);
      item.holder.visible = true;
      return item;
    }
    const template = templates.find((item) => item.name === name) || pick(templates);
    const holder = new Group();
    holder.name = "rat";
    const actor = template.clone(true);
    actor.name = template.name;
    holder.add(actor);
    root.add(holder);
    return { name: template.name, holder, actor };
  }

  function release(rat) {
    rat.holder.visible = false;
    state.pool.push({ name: rat.name, holder: rat.holder, actor: rat.actor });
  }

  function nextPoint(from, heading, steps) {
    const path = [];
    let x = from.x;
    let z = from.z;
    let yaw = heading;
    for (let i = 0; i < steps; i += 1) {
      yaw += rand(-0.4, 0.4);
      const ahead = snapWalkable(x + Math.sin(yaw) * TILE, z + Math.cos(yaw) * TILE, 3);
      if (!ahead) break;
      path.push(ahead);
      x = ahead.x;
      z = ahead.z;
    }
    return path;
  }

  function cellsInBand(cx, cz, minD, maxD) {
    const found = [];
    for (const [tx, tz] of cells) {
      const spot = centerOf(tx, tz);
      const dist = Math.hypot(spot.x - cx, spot.z - cz);
      if (dist < minD || dist > maxD) continue;
      if (!allowed(spot.x, spot.z)) continue;
      found.push(spot);
    }
    return found;
  }

  function spawnOne(playerX, playerZ, camX, camZ, halfW, halfH, inView) {
    if (state.active.length >= MAX_RATS) return false;
    let start = null;
    if (inView) {
      const near = Math.max(36, Math.min(halfW, halfH) * 0.18);
      const far = Math.max(near + 24, Math.min(halfW, halfH) * 0.45);
      const band = cellsInBand(playerX, playerZ, near, far);
      start = band.length ? pick(band) : snapWalkable(playerX, playerZ + 60, 8);
    } else {
      const reach = Math.max(halfW, halfH);
      const band = cellsInBand(camX, camZ, reach * 0.88, reach * 1.18);
      start = band.length ? pick(band) : null;
      if (!start) {
        const heading = rand(0, Math.PI * 2);
        start = snapWalkable(camX + Math.sin(heading) * reach, camZ + Math.cos(heading) * reach, 12);
      }
    }
    if (!start) return false;
    // Scurry somewhat toward the view centre so an edge spawn comes into frame.
    const toward = Math.atan2(camX - start.x, camZ - start.z);
    const pathHeading = inView ? rand(0, Math.PI * 2) : toward + rand(-0.5, 0.5);
    const path = nextPoint(start, pathHeading, (PATH_STEPS_MIN + Math.random() * (PATH_STEPS_MAX - PATH_STEPS_MIN + 1)) | 0);
    const live = takeHolder(pick(RAT_NAMES));
    const y = groundY(start.x, start.z);
    live.holder.visible = true;
    live.holder.position.set(start.x, y, start.z);
    live.holder.rotation.y = path.length ? Math.atan2(path[0].x - start.x, path[0].z - start.z) : 0;
    live.actor.position.y = 0;
    const pauseAt = path.length > 1 && Math.random() < 0.7 ? 1 + ((Math.random() * (path.length - 1)) | 0) : -1;
    state.active.push({
      name: live.name,
      holder: live.holder,
      actor: live.actor,
      x: start.x,
      z: start.z,
      path,
      pathIndex: 0,
      mode: path.length ? "scurry" : "flee",
      age: 0,
      pause: 0,
      pauseAt,
      scurryFor: rand(SCURRY_MIN, SCURRY_MAX),
      heading: live.holder.rotation.y || Math.atan2(start.x - playerX, start.z - playerZ),
      bob: rand(0, Math.PI * 2),
    });
    return true;
  }

  function spawnWave(playerX, playerZ, camX, camZ, halfW, halfH, inView, count) {
    const want = Math.max(0, Math.min(MAX_RATS - state.active.length, count));
    let made = 0;
    for (let i = 0; i < want; i += 1) {
      if (spawnOne(playerX, playerZ, camX, camZ, halfW, halfH, inView)) made += 1;
    }
    return made;
  }

  function armWait() {
    state.wait = ratsFast ? rand(FAST_SPAWN_MIN, FAST_SPAWN_MAX) : rand(SPAWN_MIN, SPAWN_MAX);
  }

  function onScreen(x, z, camX, camZ, halfW, halfH, pad = 0) {
    if (!(halfW > 0) || !(halfH > 0)) return false;
    return Math.abs(x - camX) <= halfW + pad && Math.abs(z - camZ) <= halfH + pad;
  }

  function startFlee(rat, playerX, playerZ) {
    if (rat.mode === "flee") return;
    rat.mode = "flee";
    rat.pause = 0;
    rat.heading = Math.atan2(rat.x - playerX, rat.z - playerZ);
  }

  function stepRat(rat, dt, playerX, playerZ, camX, camZ, halfW, halfH) {
    rat.age += dt;
    rat.bob += dt * 22;
    if (rat.age >= HARD_CAP) {
      release(rat);
      return false;
    }
    if (rat.mode !== "flee" && (rat.age >= rat.scurryFor || rat.pathIndex >= rat.path.length)) {
      startFlee(rat, playerX, playerZ);
    }
    if (rat.mode === "flee" && !onScreen(rat.x, rat.z, camX, camZ, halfW, halfH, 8)) {
      release(rat);
      return false;
    }
    if (rat.mode === "pause") {
      rat.pause -= dt;
      rat.actor.position.y = Math.sin(rat.bob * 0.35) * BOB * 0.25;
      if (rat.pause <= 0) {
        if (rat.pathIndex >= rat.path.length || rat.age >= rat.scurryFor) startFlee(rat, playerX, playerZ);
        else rat.mode = "scurry";
      }
      rat.holder.position.y = groundY(rat.x, rat.z);
      return true;
    }
    const speed = rat.mode === "flee" ? FLEE_SPEED : SCURRY_SPEED;
    let tx;
    let tz;
    if (rat.mode === "flee") {
      tx = rat.x + Math.sin(rat.heading) * 80;
      tz = rat.z + Math.cos(rat.heading) * 80;
      const blocked = !allowed(rat.x + Math.sin(rat.heading) * 8, rat.z + Math.cos(rat.heading) * 8);
      if (blocked) rat.heading += 0.9;
    } else {
      const goal = rat.path[rat.pathIndex];
      tx = goal.x;
      tz = goal.z;
    }
    const dx = tx - rat.x;
    const dz = tz - rat.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      if (rat.mode === "scurry") {
        rat.pathIndex += 1;
        if (rat.pathIndex === rat.pauseAt && rat.age < rat.scurryFor) {
          rat.mode = "pause";
          rat.pause = rand(PAUSE_MIN, PAUSE_MAX);
        } else if (rat.pathIndex >= rat.path.length) {
          startFlee(rat, playerX, playerZ);
        }
      }
    } else {
      const step = Math.min(dist, speed * dt);
      rat.x += (dx / dist) * step;
      rat.z += (dz / dist) * step;
      rat.heading = Math.atan2(dx, dz);
    }
    const moving = rat.mode !== "pause";
    rat.holder.position.set(rat.x, groundY(rat.x, rat.z), rat.z);
    rat.holder.rotation.y = rat.heading + (moving ? Math.sin(rat.bob * 0.85) * WOBBLE : 0);
    rat.actor.position.y = moving ? Math.abs(Math.sin(rat.bob)) * BOB : 0;
    if (rat.mode === "flee" && !onScreen(rat.x, rat.z, camX, camZ, halfW, halfH, 8)) {
      release(rat);
      return false;
    }
    return true;
  }

  return {
    fast: ratsFast,
    update(dt, playerX, playerZ, camX, camZ, halfW, halfH) {
      if (!state.loaded) return;
      view.playerX = playerX;
      view.playerZ = playerZ;
      view.camX = camX;
      view.camZ = camZ;
      view.halfW = halfW;
      view.halfH = halfH;
      view.ready = true;
      const kept = [];
      for (const rat of state.active) {
        if (stepRat(rat, dt, playerX, playerZ, camX, camZ, halfW, halfH)) kept.push(rat);
      }
      state.active = kept;
      if (state.hold || state.active.length >= MAX_RATS) return;
      state.wait -= dt;
      if (state.wait > 0) return;
      const count = Math.random() < 0.55 ? 1 : 2;
      spawnWave(playerX, playerZ, camX, camZ, halfW, halfH, false, count);
      armWait();
    },
    forceSpawn(opts = {}) {
      if (!state.loaded) return false;
      const playerX = opts.playerX ?? view.playerX;
      const playerZ = opts.playerZ ?? view.playerZ;
      const camX = opts.camX ?? view.camX;
      const camZ = opts.camZ ?? view.camZ;
      const halfW = opts.halfW ?? view.halfW;
      const halfH = opts.halfH ?? view.halfH;
      const count = opts.count ?? 1;
      const made = spawnWave(playerX, playerZ, camX, camZ, halfW, halfH, opts.inView !== false, count);
      return made > 0;
    },
    holdSpawns(on = true) {
      state.hold = on === true;
    },
    step(dt) {
      this.update(dt, view.playerX, view.playerZ, view.camX, view.camZ, view.halfW, view.halfH);
    },
    debug() {
      return {
        loaded: state.loaded,
        fast: ratsFast,
        error: state.error,
        hold: state.hold,
        active: state.active.length,
        sceneVisible: visibleCount(),
        sceneChildren: root.children.length,
        nextSpawn: Math.max(0, state.wait),
        view: { halfW: view.halfW, halfH: view.halfH, ready: view.ready },
        models: templates.map((item) => item.name),
        sizes: templates.map((item) => ({ name: item.name, ...(item.userData.size || {}) })),
        rats: state.active.map((rat) => {
          const info = {
            name: rat.name,
            x: rat.x,
            z: rat.z,
            y: rat.holder.position.y,
            mode: rat.mode,
            age: rat.age,
            visible: rat.holder.visible,
          };
          rat.holder.updateMatrixWorld(true);
          const liveBox = new Box3().setFromObject(rat.holder);
          info.w = liveBox.max.x - liveBox.min.x;
          info.h = liveBox.max.y - liveBox.min.y;
          info.d = liveBox.max.z - liveBox.min.z;
          if (camera) {
            projected.set(rat.x, rat.holder.position.y + 1.2, rat.z).project(camera);
            info.sx = (projected.x * 0.5 + 0.5);
            info.sy = (-projected.y * 0.5 + 0.5);
          }
          return info;
        }),
      };
    },
  };
}