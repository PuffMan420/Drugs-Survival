import {
  AnimationMixer,
  Box3,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";

// Same height fit as the player, so these figures stand with him.
const SEDAN_LENGTH = 71;
const SCALE_BUMP = 1.15;
const FEET_Y = 0.6;
const FADE = 0.12;
// A walk covers a little under one sidewalk tile per cycle. Run is twice that.
const WALK_SPEED = 36;
const RUN_SPEED = 72;
const NAMES = ["idle", "walk", "run"];

// Sidewalk tiles inside the opening downtown view, one model each.
const STARTS = [
  { file: "ped_criminalMaleA.glb", tx: 121, tz: 91, dx: 0, dz: 1 },
  { file: "ped_humanFemaleA.glb", tx: 121, tz: 97, dx: 0, dz: -1 },
  { file: "ped_skaterFemaleA.glb", tx: 124, tz: 96, dx: 0, dz: -1 },
  { file: "ped_skaterMaleA.glb", tx: 126, tz: 92, dx: 0, dz: 1 },
  { file: "ped_survivorFemaleA.glb", tx: 126, tz: 98, dx: 0, dz: -1 },
  { file: "ped_survivorMaleB.glb", tx: 130, tz: 94, dx: 0, dz: -1 },
];

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function unitHash(n) {
  let h = Math.imul(n | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h >>> 0) / 4294967296;
}

function litMaterials(model) {
  const swapped = new Map();
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const sources = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = sources.map((source) => {
      if (swapped.has(source)) return swapped.get(source);
      const map = source.map ?? null;
      if (map) {
        map.colorSpace = SRGBColorSpace;
        map.magFilter = LinearFilter;
        map.minFilter = LinearMipmapLinearFilter;
        map.generateMipmaps = true;
        map.needsUpdate = true;
      }
      const lit = new MeshLambertMaterial({
        map,
        color: 0xffffff,
        toneMapped: false,
        fog: false,
        side: source.side ?? DoubleSide,
      });
      swapped.set(source, lit);
      source.dispose();
      return lit;
    });
    obj.material = next.length === 1 ? next[0] : next;
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function fitModel(model) {
  // Same root-scale measurement as the player. These files share his rig.
  const root = model.getObjectByName("Root");
  const fileScale = root ? root.scale.x : 1;
  if (root) root.scale.setScalar(1.05);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = (SEDAN_LENGTH / 3) * SCALE_BUMP / height;
  model.scale.setScalar(scale);
  if (root) root.scale.setScalar(fileScale);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
}

function sidewalkGraph(map) {
  const { cols, rows, ground } = map;
  const span = map.tile || TILE;
  const cells = new Set();
  const key = (x, z) => x + z * cols;
  for (let z = 0; z < rows; z += 1) {
    const row = ground[z];
    for (let x = 0; x < cols; x += 1) {
      if (row[x] === "s") cells.add(key(x, z));
    }
  }
  function neighbors(x, z) {
    const found = [];
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      if (cells.has(key(nx, nz))) found.push([dx, dz]);
    }
    return found;
  }
  function nearest(tx, tz) {
    if (cells.has(key(tx, tz))) return [tx, tz];
    for (let radius = 1; radius < 12; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const nx = tx + dx;
          const nz = tz + dz;
          if (cells.has(key(nx, nz))) return [nx, nz];
        }
      }
    }
    throw new Error("No sidewalk was found for a pedestrian.");
  }
  return { span, neighbors, nearest };
}

function centerOf(tx, tz, span) {
  return { x: (tx + 0.5) * span, z: (tz + 0.5) * span };
}

function clipNamed(animations, name) {
  return animations.find((clip) => clip.name === name) || null;
}

export async function createPedestrians(scene, map) {
  const loader = new GLTFLoader();
  const graph = sidewalkGraph(map);
  const { span } = graph;
  let donor = null;

  async function clipsFor(gltf) {
    const missing = NAMES.filter((name) => !clipNamed(gltf.animations, name));
    if (missing.length > 0 && !donor) {
      const url = new URL("../assets/player/humanMaleA_v15.glb", import.meta.url).href;
      try {
        donor = await loader.loadAsync(url);
      } catch {
        throw new Error("The player walk clip failed to load.");
      }
    }
    const clips = {};
    for (const name of NAMES) {
      const own = clipNamed(gltf.animations, name);
      if (own) {
        clips[name] = own;
        continue;
      }
      const fallback = donor ? clipNamed(donor.animations, name) : null;
      if (!fallback) throw new Error(`A pedestrian model is missing the ${name} clip.`);
      clips[name] = fallback.clone();
    }
    return clips;
  }

  const people = [];
  for (let index = 0; index < STARTS.length; index += 1) {
    const start = STARTS[index];
    const url = new URL(`../pedestrians_v15/${start.file}`, import.meta.url).href;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      throw new Error(`The pedestrian model failed to load: ${start.file}`);
    }
    const clips = await clipsFor(gltf);
    const model = gltf.scene;
    litMaterials(model);
    fitModel(model);

    const holder = new Group();
    holder.name = start.file;
    holder.frustumCulled = false;
    holder.add(model);
    scene.add(holder);

    const mixer = new AnimationMixer(model);
    const actions = {
      idle: mixer.clipAction(clips.idle),
      walk: mixer.clipAction(clips.walk),
      run: mixer.clipAction(clips.run),
    };
    const vary = 0.85 + unitHash(index + 11) * 0.3;

    function setWeight(action, weight) {
      action.enabled = true;
      action.setEffectiveTimeScale(vary);
      action.setEffectiveWeight(weight);
    }

    function crossFade(from, to) {
      to.paused = false;
      setWeight(to, 1);
      to.time = 0;
      from.crossFadeTo(to, FADE, true);
    }

    setWeight(actions.idle, 0);
    setWeight(actions.walk, 1);
    setWeight(actions.run, 0);
    actions.idle.play();
    actions.walk.play();
    actions.run.play();
    actions.walk.time = unitHash(index + 29) * clips.walk.duration;
    mixer.update(0);

    const [tx, tz] = graph.nearest(start.tx, start.tz);
    const open = graph.neighbors(tx, tz);
    const preferred = open.find(([dx, dz]) => dx === start.dx && dz === start.dz) || open[0] || [0, 0];
    const home = centerOf(tx, tz, span);
    const ped = {
      holder,
      mixer,
      actions,
      vary,
      salt: index + 3,
      playing: "walk",
      dx: preferred[0],
      dz: preferred[1],
      x: home.x,
      z: home.z,
      goalX: home.x + preferred[0] * span,
      goalZ: home.z + preferred[1] * span,
      show(name) {
        if (name === ped.playing) return;
        crossFade(actions[ped.playing], actions[name]);
        ped.playing = name;
      },
    };
    holder.rotation.y = Math.atan2(ped.dx, ped.dz);
    holder.position.set(ped.x, FEET_Y, ped.z);
    people.push(ped);
  }

  let panic = false;

  function bestAway(tx, tz, dx, dz, playerX, playerZ) {
    const options = graph.neighbors(tx, tz);
    let best = null;
    let bestDist = -1;
    for (const [ox, oz] of options) {
      const point = centerOf(tx + ox, tz + oz, span);
      const dist = (point.x - playerX) ** 2 + (point.z - playerZ) ** 2;
      const prefer = ox === dx && oz === dz;
      if (!best || dist > bestDist + 1 || (prefer && dist >= bestDist - 1)) {
        bestDist = dist;
        best = { dx: ox, dz: oz, x: point.x, z: point.z, dist };
      }
    }
    return best;
  }

  function nextWalk(tx, tz, dx, dz, salt) {
    const options = graph.neighbors(tx, tz);
    if (options.length === 0) return null;
    const straight = options.find(([ox, oz]) => ox === dx && oz === dz);
    let pick = straight;
    if (!pick) {
      const turns = options.filter(([ox, oz]) => ox !== -dx || oz !== -dz);
      const pool = turns.length > 0 ? turns : options;
      const index = Math.floor(unitHash((tx * 73856093) ^ (tz * 19349663) ^ (salt * 83492791)) * pool.length);
      pick = pool[index];
    }
    const [ox, oz] = pick;
    const point = centerOf(tx + ox, tz + oz, span);
    return { dx: ox, dz: oz, x: point.x, z: point.z };
  }

  function tileAt(x, z) {
    return [Math.round(x / span - 0.5), Math.round(z / span - 0.5)];
  }

  function steer(ped, playerX, playerZ) {
    if (!panic) return;
    const [tx, tz] = tileAt(ped.x, ped.z);
    const best = bestAway(tx, tz, ped.dx, ped.dz, playerX, playerZ);
    if (!best) return;
    const goalDist = (ped.goalX - playerX) ** 2 + (ped.goalZ - playerZ) ** 2;
    const hereDist = (ped.x - playerX) ** 2 + (ped.z - playerZ) ** 2;
    if (goalDist + 1 < hereDist || best.dist > goalDist + 1) {
      ped.dx = best.dx;
      ped.dz = best.dz;
      ped.goalX = best.x;
      ped.goalZ = best.z;
    }
  }

  function advance(ped, distance, playerX, playerZ) {
    let remain = distance;
    for (let guard = 0; guard < 4 && remain > 0.0001; guard += 1) {
      const gx = ped.goalX - ped.x;
      const gz = ped.goalZ - ped.z;
      const dist = Math.hypot(gx, gz);
      if (dist > 0.05 && dist > remain) {
        ped.x += (gx / dist) * remain;
        ped.z += (gz / dist) * remain;
        return;
      }
      if (dist > 0.05) {
        ped.x = ped.goalX;
        ped.z = ped.goalZ;
        remain -= dist;
      }
      const [tx, tz] = tileAt(ped.x, ped.z);
      const next = panic
        ? bestAway(tx, tz, ped.dx, ped.dz, playerX, playerZ)
        : nextWalk(tx, tz, ped.dx, ped.dz, ped.salt);
      if (!next || (next.x === ped.x && next.z === ped.z)) {
        ped.dx = 0;
        ped.dz = 0;
        return;
      }
      ped.dx = next.dx;
      ped.dz = next.dz;
      ped.goalX = next.x;
      ped.goalZ = next.z;
    }
  }

  return {
    setPanic(value) {
      const next = Boolean(value);
      if (next === panic) return;
      panic = next;
      for (const ped of people) ped.show(panic ? "run" : "walk");
    },
    update(dt, playerX, playerZ) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      for (const ped of people) {
        steer(ped, playerX, playerZ);
        const speed = (panic ? RUN_SPEED : WALK_SPEED) * ped.vary;
        advance(ped, speed * step, playerX, playerZ);
        if (ped.dx !== 0 || ped.dz !== 0) {
          ped.holder.rotation.y = Math.atan2(ped.dx, ped.dz);
          ped.show(panic ? "run" : "walk");
        } else {
          ped.show("idle");
        }
        ped.mixer.update(step);
        ped.holder.position.set(ped.x, FEET_Y, ped.z);
      }
    },
  };
}
