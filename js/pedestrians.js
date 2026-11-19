import {
  AnimationMixer,
  Color,
  DoubleSide,
  Group,
  LoopOnce,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { carContact, carVelocity } from "./car-strike.js";
import {
  COP_MODEL,
  PED_MODELS,
  fitCharacter,
  matteMaterials,
  mergeFigure,
  modelUrl,
} from "./characters.js";
import { dropHeadScaleTracks, shrinkHead } from "./head-scale.js";
import { createRagdolls } from "./ped-ragdoll.js";
import { GROUND_H, GROUND_W, PLAYER_SPEED, TILE } from "./constants.js";
import { PED_LOOK_HEX, pedLookIndex } from "./ped-looks.js";
import { walkableCells } from "./pedestrian-walk.js";

// Same height fit as the player (fitCharacter), so these figures stand with him.
const FEET_Y = 0.6;
const FADE = 0.12;
// Capsules, parent before child so a bone is written after the one it hangs from.
// UAL bone names. The skeleton has no bone past the head, so the head
// capsule runs neck to head and swings the head with it.
const RAGDOLL_BONES = [
  ["torso", "pelvis", "spine_03"],
  ["head", "neck_01", "Head"],
  ["leftArm", "upperarm_l", "lowerarm_l"],
  ["leftFore", "lowerarm_l", "hand_l"],
  ["rightArm", "upperarm_r", "lowerarm_r"],
  ["rightFore", "lowerarm_r", "hand_r"],
  ["leftThigh", "thigh_l", "calf_l"],
  ["leftShin", "calf_l", "foot_l"],
  ["rightThigh", "thigh_r", "calf_r"],
  ["rightShin", "calf_r", "foot_r"],
];
// The clips are in-place. Ground speed is the same reference the player uses
// for that clip, and playback is ground / reference, so the feet do not slide.
const GAIT_SPEED = {
  idle: 0,
  walk: PLAYER_SPEED * 0.5,
  jog: PLAYER_SPEED,
  sprint: PLAYER_SPEED * 1.4,
};
const GAITS = ["idle", "walk", "jog", "sprint"];
const REACTIONS = ["hitChest", "hitHead", "death"];
const CLIP_NAMES = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  hitChest: "Hit_Chest",
  hitHead: "Hit_Head",
  death: "Death01",
};
const CROWD = 1200;
const BLOCK = 6;
// Starting hit points. A fist takes two hits; a bat, pistol, bottle, or a fast car takes one.
const PED_HP = 2;
// Damage used when hurt() is not given an amount (bat, pistol, bottle, run-over).
const KILL_DAMAGE = 2;
// How far a gunshot scare reaches, and how long those people sprint away.
const PANIC_RANGE = 900;
const PANIC_TIME = 6;
// Cars slower than this (world units per second) shove past without ragdolling anyone.
const RUNOVER_SPEED = 40;

// The camera sits close to straight down, so the crown and the outfit are
// what separate a person from the player. These looks recolor the shirt,
// pants, shoes, hair and skin parts of the Modular figures.
const PED_LOOKS = PED_LOOK_HEX.map((row) => ({
  shirt: new Color(row.shirt),
  pants: new Color(row.pants),
  shoes: new Color(row.shoes),
  hair: new Color(row.hair),
  skin: new Color(row.skin),
}));

// Police outfit for police.js cops: dark blue shirt and trousers.
const COP_LOOK = {
  shirt: new Color(0x1f2f66),
  pants: new Color(0x141b38),
  shoes: new Color(0x0d0d0d),
  hair: new Color(0x1a1a1a),
  skin: new Color(0xd7a67a),
};
let copSalt = 50000;
// prototypes[] index of the cop body (COP_MODEL in js/characters.js).
const COP_PROTO = PED_MODELS.length;

// pedSlot (see mergeFigure): 0 shirt, 1 pants, 2 shoes, 3 skin, 4 hair,
// anything else keeps the file's own color.
const CLOTH_UNIFORMS = `
attribute float pedSlot;
uniform vec3 pedShirtColor;
uniform vec3 pedPantsColor;
uniform vec3 pedShoeColor;
uniform vec3 pedHairColor;
uniform vec3 pedSkinColor;
`;
const CLOTH_TINT = `
#ifdef USE_COLOR
  if (pedSlot < 0.5) vColor.rgb = pedShirtColor;
  else if (pedSlot < 1.5) vColor.rgb = pedPantsColor;
  else if (pedSlot < 2.5) vColor.rgb = pedShoeColor;
  else if (pedSlot < 3.5) vColor.rgb = pedSkinColor;
  else if (pedSlot < 4.5) vColor.rgb = pedHairColor;
#endif
`;

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

function bodyMesh(root) {
  const found = root.getObjectByName("figure");
  if (!found) throw new Error("The pedestrian is missing a body.");
  return found;
}

const clothMaterials = new Map();

function sharedClothMaterial(base, worn) {
  const key = [
    base.uuid,
    worn.shirt.getHexString(),
    worn.pants.getHexString(),
    worn.shoes.getHexString(),
    worn.hair.getHexString(),
    worn.skin.getHexString(),
  ].join(":");
  const cached = clothMaterials.get(key);
  if (cached) return cached;
  const material = base.clone();
  material.userData = { cloth: worn };
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    MeshLambertMaterial.prototype.onBeforeCompile.call(this, shader, renderer);
    const cloth = material.userData.cloth;
    shader.uniforms.pedShirtColor = { value: cloth.shirt };
    shader.uniforms.pedPantsColor = { value: cloth.pants };
    shader.uniforms.pedShoeColor = { value: cloth.shoes };
    shader.uniforms.pedHairColor = { value: cloth.hair };
    shader.uniforms.pedSkinColor = { value: cloth.skin };
    shader.vertexShader = CLOTH_UNIFORMS + shader.vertexShader.replace(
      "#include <color_vertex>",
      `#include <color_vertex>\n${CLOTH_TINT}`,
    );
  };
  material.customProgramCacheKey = () => "ped-cloth-slots|deeper-cast-shadow";
  clothMaterials.set(key, material);
  return material;
}

function bindActions(mixer, clips) {
  const actions = {};
  for (const name of Object.keys(CLIP_NAMES)) {
    const action = mixer.clipAction(clips[name]);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.play();
    actions[name] = action;
  }
  for (const name of REACTIONS) {
    actions[name].setLoop(LoopOnce, 1);
    actions[name].clampWhenFinished = true;
    actions[name].paused = true;
    actions[name].setEffectiveWeight(0);
  }
  return actions;
}

function showClip(ped, name) {
  if (name === ped.playing) return;
  const live = ped.live;
  if (live) {
    const from = live.actions[ped.playing];
    const to = live.actions[name];
    const once = REACTIONS.includes(name);
    to.paused = false;
    to.enabled = true;
    to.setEffectiveTimeScale(once || name === "idle" ? 1 : ped.vary);
    to.setEffectiveWeight(1);
    if (once) to.time = 0;
    // Warp rewrites timeScale when the fade ends, so the walk would leave
    // the stride rate that was just applied. crossFadeTo only changes weight.
    // A stopped action is not sampled, so the bones stay on the bind pose.
    to.play();
    from.crossFadeTo(to, FADE, false);
  }
  ped.playing = name;
}

function crowdTiles(cells, neighbors) {
  const buckets = new Map();
  for (const [x, z] of cells) {
    const key = `${Math.floor(x / BLOCK)},${Math.floor(z / BLOCK)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push([x, z]);
    else buckets.set(key, [[x, z]]);
  }
  const keys = [...buckets.keys()].sort();
  const skip = new Set();
  const extra = keys.length - CROWD;
  if (extra > 0) {
    for (let i = 0; i < extra; i += 1) {
      skip.add(keys[Math.round(((i + 1) * (keys.length - 1)) / (extra + 1))]);
    }
  }
  const chosen = [];
  const used = new Set();
  function take(cell) {
    const key = `${cell[0]},${cell[1]}`;
    if (used.has(key)) return;
    used.add(key);
    chosen.push(cell);
  }
  for (const key of keys) {
    if (skip.has(key) || chosen.length >= CROWD) continue;
    const [gx, gz] = key.split(",").map(Number);
    const bucket = buckets.get(key);
    const cx = (gx + 0.5) * BLOCK;
    const cz = (gz + 0.5) * BLOCK;
    let best = null;
    let bestDist = Infinity;
    for (const [x, z] of bucket) {
      if (neighbors(x, z).length === 0) continue;
      const dist = (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = [x, z];
      }
    }
    if (best) take(best);
  }
  if (chosen.length < CROWD) {
    for (const [x, z] of cells) {
      if (chosen.length >= CROWD) break;
      if (neighbors(x, z).length === 0) continue;
      take([x, z]);
    }
  }
  return chosen;
}

function figureMaterial() {
  // Lambert has no shine, so the figures stay matte. Colors are per vertex.
  return new MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    toneMapped: false,
    fog: false,
    side: DoubleSide,
  });
}

function prepareTemplate(gltf) {
  const model = gltf.scene;
  matteMaterials(model);
  const figure = mergeFigure(model, figureMaterial());
  figure.castShadow = true;
  figure.receiveShadow = true;
  fitCharacter(model);
  // Same order as the player: the height fit has already run.
  shrinkHead(model);
  return model;
}

function sidewalkGraph(map, pieces) {
  const { cols, rows } = map;
  const span = map.tile || TILE;
  const cells = new Set();
  const list = walkableCells(map, pieces);
  const key = (x, z) => x + z * cols;
  for (const [x, z] of list) cells.add(key(x, z));
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
    throw new Error("No walkable ground was found for a pedestrian.");
  }
  return { span, neighbors, nearest, cells: list };
}

function centerOf(tx, tz, span) {
  return { x: (tx + 0.5) * span, z: (tz + 0.5) * span };
}

function clipNamed(animations, name) {
  const clip = animations.find((item) => item.name === name);
  if (!clip) throw new Error(`The pedestrian rig is missing the ${name} clip.`);
  return clip;
}

const ragPos = new Vector3();
const ragA = new Vector3();
const ragB = new Vector3();
const ragBodyQuat = new Quaternion();
const ragWorldQuat = new Quaternion();
const ragParentQuat = new Quaternion();

function writeBone(bone, worldPos, worldQuat) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  ragPos.copy(worldPos);
  parent.worldToLocal(ragPos);
  parent.getWorldQuaternion(ragParentQuat);
  bone.position.copy(ragPos);
  bone.quaternion.copy(ragParentQuat.invert()).multiply(worldQuat);
  bone.updateMatrix();
}

function resetBones(model) {
  model.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    if (obj.skeleton) obj.skeleton.pose();
    obj.frustumCulled = true;
  });
  shrinkHead(model);
}

export async function createPedestrians(scene, map, pieces = [], feetAt = null, rig = null) {
  const loader = new GLTFLoader();
  const graph = sidewalkGraph(map, pieces);
  // feetAt reads the sidewalk lip from the road meshes. The cast shadow is
  // on this holder, so it rises with the feet.
  function sole(x, z) {
    return feetAt ? feetAt(x, z, FEET_Y) : FEET_Y;
  }
  const ragdolls = rig && rig.physics
    ? createRagdolls(rig.physics, { limit: rig.mobile ? 4 : 8, near: 800 })
    : null;
  const { span } = graph;
  // Crowd bodies first (man, woman), the cop body last. The player's file is
  // the first one, so the browser fetches it once.
  const paths = [...PED_MODELS, COP_MODEL];
  const unique = [...new Set(paths)];
  let loaded;
  try {
    loaded = await Promise.all(unique.map((path) => loader.loadAsync(modelUrl(path))));
  } catch {
    throw new Error("The pedestrian rig failed to load.");
  }
  const files = paths.map((path) => loaded[unique.indexOf(path)]);
  // Every file is on the UAL skeleton with the same bone names, so one set of
  // clips drives them all.
  const clips = {};
  for (const [key, name] of Object.entries(CLIP_NAMES)) {
    clips[key] = clipNamed(files[0].animations, name);
  }
  // Head.scale is a rest hold at 1, and the mixer would write it back
  // over the smaller head.
  dropHeadScaleTracks(clips);
  // A file listed twice (the cop is the crowd man for now) is prepared once
  // and shared; each prototype still has its own pool.
  const prepared = new Map();
  const prototypes = files.map((gltf) => {
    if (!prepared.has(gltf)) prepared.set(gltf, prepareTemplate(gltf));
    const template = prepared.get(gltf);
    return { template, clips, material: bodyMesh(template).material };
  });
  const crowdKinds = PED_MODELS.length;

  const tiles = crowdTiles(graph.cells, graph.neighbors);
  const people = [];
  const pools = prototypes.map(() => []);
  for (let index = 0; index < tiles.length; index += 1) {
    const proto = Math.floor(unitHash(index + 41) * crowdKinds);
    const [tx, tz] = tiles[index];
    const open = graph.neighbors(tx, tz);
    const preferred = open[Math.floor(unitHash(index + 7) * open.length)] || [0, 0];
    const home = centerOf(tx, tz, span);
    const calm = unitHash(index + 19) < 0.3 ? "jog" : "walk";
    people.push({
      proto,
      look: PED_LOOKS[pedLookIndex(index + 3)],
      vary: 0.85 + unitHash(index + 11) * 0.3,
      salt: index + 3,
      hp: PED_HP,
      calm,
      playing: calm,
      live: null,
      dx: preferred[0],
      dz: preferred[1],
      x: home.x,
      z: home.z,
      goalX: home.x + preferred[0] * span,
      goalZ: home.z + preferred[1] * span,
    });
  }

  function acquire(ped) {
    const prototype = prototypes[ped.proto];
    let live = pools[ped.proto].pop();
    if (!live) {
      const model = cloneSkeleton(prototype.template);
      const holder = new Group();
      holder.frustumCulled = false;
      holder.add(model);
      live = {
        holder,
        model,
        mixer: new AnimationMixer(model),
        actions: null,
      };
      live.actions = bindActions(live.mixer, prototype.clips);
    }
    const mesh = bodyMesh(live.model);
    mesh.material = sharedClothMaterial(prototype.material, ped.look);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const name of GAITS) {
      const action = live.actions[name];
      action.enabled = true;
      action.paused = false;
      action.setEffectiveTimeScale(name === "idle" ? 1 : ped.vary);
      action.setEffectiveWeight(name === ped.playing ? 1 : 0);
      action.play();
    }
    for (const name of REACTIONS) {
      const action = live.actions[name];
      action.enabled = true;
      action.paused = true;
      action.setEffectiveWeight(0);
      action.time = 0;
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      // release() stops every clip. Without play() the one-shots stay off the
      // mixer, so a recycled ped's death never writes and the bind pose shows.
      action.play();
    }
    const current = live.actions[ped.playing];
    current.time = unitHash(ped.salt + 29) * prototype.clips[ped.playing].duration;
    live.mixer.update(0);
    live.holder.rotation.y = Math.atan2(ped.dx, ped.dz);
    live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
    scene.add(live.holder);
    ped.live = live;
  }

  function release(ped) {
    pedHist.delete(ped);
    endRagdoll(ped, true);
    if (ped.phase === "react") {
      ped.phase = null;
      ped.phaseTime = 0;
    }
    const live = ped.live;
    ped.live = null;
    live.holder.removeFromParent();
    live.mixer.stopAllAction();
    pools[ped.proto].push(live);
  }

  let panic = false;
  let panicLeft = 0;
  let scareX = 0;
  let scareZ = 0;
  let scareArmed = false;

  function fleeing(ped) {
    if (ped.dead || panicLeft <= 0) return false;
    if (scareArmed) return Math.hypot(ped.x - scareX, ped.z - scareZ) <= PANIC_RANGE;
    return panic;
  }

  function syncPanicClips() {
    for (const ped of people) {
      if (ped.dead || !ped.live) continue;
      if (ped.phase === "react") continue;
      showClip(ped, fleeing(ped) ? "sprint" : ped.calm);
    }
  }

  function setPanic(value) {
    const next = Boolean(value);
    if (next) {
      panic = true;
      scareArmed = false;
      if (panicLeft <= 0) panicLeft = PANIC_TIME;
    } else {
      panic = false;
      panicLeft = 0;
      scareArmed = false;
    }
    syncPanicClips();
  }

  // A gunshot at (x, z). Living peds inside PANIC_RANGE sprint away for PANIC_TIME seconds.
  function scare(x, z) {
    scareX = x;
    scareZ = z;
    scareArmed = true;
    panic = true;
    panicLeft = PANIC_TIME;
    syncPanicClips();
  }

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
    if (!fleeing(ped)) return;
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
      const next = fleeing(ped)
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

  const mapW = map.cols * TILE;
  const mapH = map.rows * TILE;
  const enterMargin = TILE * 2;
  const leaveMargin = TILE * 4;

  function viewRect(playerX, playerZ, margin, spanW = GROUND_W, spanH = GROUND_H) {
    const halfW = spanW / 2;
    const halfH = spanH / 2;
    const camX = Math.min(Math.max(Math.round(playerX), halfW), mapW - halfW);
    const camZ = Math.min(Math.max(Math.round(playerZ), halfH), mapH - halfH);
    return {
      minX: camX - halfW - margin,
      maxX: camX + halfW + margin,
      minZ: camZ - halfH - margin,
      maxZ: camZ + halfH + margin,
    };
  }

  function inRect(ped, rect) {
    return ped.x >= rect.minX && ped.x <= rect.maxX && ped.z >= rect.minZ && ped.z <= rect.maxZ;
  }

  function duration(ped, name) {
    return ped.live.actions[name].getClip().duration;
  }

  // Death01's last key is the body on the ground. Hold that pose. A finished
  // one-shot otherwise drops every bone back to the bind pose.
  function pinDeath(ped) {
    const live = ped.live;
    const death = live.actions.death;
    death.enabled = true;
    death.paused = true;
    death.setEffectiveTimeScale(1);
    death.setEffectiveWeight(1);
    death.time = death.getClip().duration;
    for (const name of GAITS) live.actions[name].setEffectiveWeight(0);
    live.actions.hitChest.setEffectiveWeight(0);
    live.actions.hitHead.setEffectiveWeight(0);
  }

  function fall(ped, step) {
    ped.phaseTime += step;
    if (ped.phase === "hit") {
      ped.x += ped.vx * step;
      ped.z += ped.vz * step;
      ped.vx *= Math.pow(0.08, step);
      ped.vz *= Math.pow(0.08, step);
      if (ped.phaseTime >= duration(ped, ped.hitClip)) {
        ped.phase = "death";
        ped.phaseTime = 0;
        showClip(ped, "death");
      }
    } else if (ped.phase === "death" && ped.phaseTime >= duration(ped, "death")) {
      ped.phase = "down";
      ped.settled = true;
    }
    if (ped.phase === "down") pinDeath(ped);
    const live = ped.live;
    live.mixer.update(step);
    live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
  }

  function hurt(ped, dirX, dirZ, damage = KILL_DAMAGE) {
    if (!ped || ped.dead || !ped.live) return null;
    if (ped.hp == null) ped.hp = PED_HP;
    ped.hp -= damage;
    const len = Math.hypot(dirX, dirZ) || 1;
    const hitClip = Math.random() < 0.5 ? "hitChest" : "hitHead";
    const impact = {
      x: ped.x,
      z: ped.z,
      y: ped.live.holder.position.y + 16,
      ground: sole(ped.x, ped.z) + 0.35,
    };
    // A punch leaves them on 1 HP. Play the hit, then let update() resume walking.
    if (ped.hp > 0) {
      ped.phase = "react";
      ped.phaseTime = 0;
      ped.hitClip = hitClip;
      showClip(ped, hitClip);
      return impact;
    }
    ped.dead = true;
    ped.settled = false;
    ped.pooled = false;
    ped.phase = "hit";
    ped.phaseTime = 0;
    ped.hitClip = hitClip;
    ped.vx = (dirX / len) * 40;
    ped.vz = (dirZ / len) * 40;
    showClip(ped, ped.hitClip);
    return impact;
  }

  function endRagdoll(ped, reset) {
    const doll = ped.ragdoll;
    if (!doll) return;
    if (doll.sim) ragdolls.drop(doll);
    ped.ragdoll = null;
    if (reset && ped.live) resetBones(ped.live.model);
  }

  function measureSegments(model) {
    model.updateMatrixWorld(true);
    const segments = [];
    for (const [id, fromName, toName] of RAGDOLL_BONES) {
      const from = model.getObjectByName(fromName);
      const to = model.getObjectByName(toName);
      if (!from || !to) return null;
      from.getWorldPosition(ragA);
      to.getWorldPosition(ragB);
      const dx = ragB.x - ragA.x;
      const dy = ragB.y - ragA.y;
      const dz = ragB.z - ragA.z;
      const length = Math.hypot(dx, dy, dz);
      if (length < 0.4) return null;
      const radius = Math.min(Math.max(length * 0.22, 1.4), length * 0.42);
      from.getWorldQuaternion(ragWorldQuat);
      segments.push({
        id,
        bone: from,
        x: ragA.x,
        y: ragA.y,
        z: ragA.z,
        dx,
        dy,
        dz,
        length,
        radius,
        qx: ragWorldQuat.x,
        qy: ragWorldQuat.y,
        qz: ragWorldQuat.z,
        qw: ragWorldQuat.w,
      });
    }
    return segments;
  }

  function startRagdoll(ped, kickX, kickZ) {
    if (!ragdolls) return false;
    const model = ped.live.model;
    const segments = measureSegments(model);
    if (!segments) return false;
    const doll = ragdolls.spawn(segments, { x: kickX, z: kickZ });
    const binds = [];
    for (const seg of segments) {
      seg.bone.getWorldQuaternion(ragWorldQuat);
      const part = doll.parts.get(seg.id);
      const q = part.body.rotation();
      binds.push({
        id: seg.id,
        bone: seg.bone,
        restBodyInv: new Quaternion(q.x, q.y, q.z, q.w).invert(),
        restBone: ragWorldQuat.clone(),
      });
    }
    for (const action of Object.values(ped.live.actions)) {
      action.paused = true;
      action.setEffectiveWeight(0);
    }
    model.traverse((obj) => {
      if (obj.isSkinnedMesh) obj.frustumCulled = false;
    });
    ped.ragdoll = doll;
    ped.ragdollBinds = binds;
    ped.dead = true;
    ped.settled = false;
    ped.pooled = false;
    ped.phase = "ragdoll";
    return true;
  }

  function applyRagdoll(ped) {
    const doll = ped.ragdoll;
    if (!doll || !doll.sim) {
      ped.settled = true;
      return;
    }
    const torso = doll.pose("torso");
    if (torso) {
      ped.x = torso.x;
      ped.z = torso.z;
    }
    for (const bind of ped.ragdollBinds) {
      const pose = doll.pose(bind.id);
      if (!pose) continue;
      ragBodyQuat.set(pose.qx, pose.qy, pose.qz, pose.qw);
      ragWorldQuat.copy(ragBodyQuat).multiply(bind.restBodyInv).multiply(bind.restBone);
      ragPos.set(pose.x, pose.y, pose.z);
      writeBone(bind.bone, ragPos, ragWorldQuat);
    }
    if (doll.settled) ped.settled = true;
  }

  const movingCars = [];
  const carHist = new Map();
  const pedHist = new Map();

  function rememberStrike(cars) {
    const seen = new Set();
    if (cars) {
      for (let i = 0; i < cars.length; i += 1) {
        const car = cars[i];
        seen.add(car);
        carHist.set(car, { x: car.x, z: car.z, angle: car.angle || 0 });
      }
    }
    for (const car of carHist.keys()) {
      if (!seen.has(car)) carHist.delete(car);
    }
    for (const ped of people) {
      if (!ped.live || ped.dead) {
        pedHist.delete(ped);
        continue;
      }
      pedHist.set(ped, { x: ped.x, z: ped.z });
    }
  }

  function runOver(cars, driven) {
    let count = 0;
    if (cars) {
      for (let i = 0; i < cars.length; i += 1) {
        const motion = carVelocity(cars[i], driven);
        if (!motion || motion.speed < RUNOVER_SPEED) continue;
        let slot = movingCars[count];
        if (!slot) {
          slot = { car: null, motion: null };
          movingCars[count] = slot;
        }
        slot.car = cars[i];
        slot.motion = motion;
        count += 1;
      }
    }
    for (let i = 0; i < count; i += 1) {
      const slot = movingCars[i];
      const car = slot.car;
      const was = carHist.get(car);
      const jumped = was && Math.hypot(car.x - was.x, car.z - was.z) > 200;
      for (const ped of people) {
        if (!ped.live || ped.dead) continue;
        const prior = pedHist.get(ped);
        const pedJumped = prior && Math.hypot(ped.x - prior.x, ped.z - prior.z) > 100;
        const prev = was && !jumped
          ? {
            x: was.x,
            z: was.z,
            angle: was.angle,
            pedX: prior && !pedJumped ? prior.x : ped.x,
            pedZ: prior && !pedJumped ? prior.z : ped.z,
          }
          : null;
        const y = ped.live.holder.position.y;
        const contact = carContact(car, ped.x, ped.z, y, prev);
        if (!contact) continue;
        ped.x = contact.x;
        ped.z = contact.z;
        ped.live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
        ped.live.holder.updateMatrixWorld(true);
        const kickX = contact.nx * slot.motion.speed + slot.motion.vx;
        const kickZ = contact.nz * slot.motion.speed + slot.motion.vz;
        if (!startRagdoll(ped, kickX, kickZ)) hurt(ped, kickX, kickZ);
      }
    }
    rememberStrike(cars);
  }

  return {
    targets() {
      const list = [];
      for (const ped of people) {
        if (ped.live && !ped.dead) list.push(ped);
      }
      return list;
    },
    hurt,
    runOver,
    // Walking normally: on screen, alive, not ragdolled, not reacting to a
    // hit, and not panicking or fleeing. Only these will buy from the player.
    isCalm(ped) {
      return Boolean(ped && !ped.cop && ped.live && !ped.dead && !ped.ragdoll && !ped.phase && !fleeing(ped));
    },
    // A cop is a pedestrian police.js steers: it sets x, z, dx, dz and
    // copGait each frame; update() only animates it. Hurt like anyone else.
    spawnCop(x, z, hp = PED_HP) {
      copSalt += 1;
      const ped = {
        proto: COP_PROTO,
        look: COP_LOOK,
        vary: 1,
        salt: copSalt,
        hp,
        calm: "jog",
        playing: "idle",
        live: null,
        dx: 0,
        dz: 1,
        x,
        z,
        goalX: x,
        goalZ: z,
        cop: true,
        copGait: "idle",
      };
      people.push(ped);
      acquire(ped);
      return ped;
    },
    removeCop(ped) {
      const index = people.indexOf(ped);
      if (index < 0) return;
      if (ped.live) release(ped);
      people.splice(index, 1);
    },
    freshCorpses() {
      const list = [];
      for (const ped of people) {
        if (!ped.dead || !ped.settled || ped.pooled) continue;
        ped.pooled = true;
        list.push({ x: ped.x, z: ped.z, y: sole(ped.x, ped.z) + 0.2 });
      }
      return list;
    },
    scare,
    setPanic,
    ragdollFocus(x, z) {
      if (!rig || !rig.physicsScene) return;
      const awake = ragdolls && ragdolls.active > 0;
      rig.physicsScene.watch(awake ? x : null, awake ? z : null);
    },
    update(dt, playerX, playerZ, spanW = GROUND_W, spanH = GROUND_H) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      if (panicLeft > 0) {
        panicLeft = Math.max(0, panicLeft - step);
        if (panicLeft === 0) setPanic(false);
      }
      if (ragdolls) ragdolls.maintain(step, playerX, playerZ);
      const enter = viewRect(playerX, playerZ, enterMargin, spanW, spanH);
      const leave = viewRect(playerX, playerZ, leaveMargin, spanW, spanH);
      for (const ped of people) {
        if (ped.live && ped.dead) {
          if (ped.ragdoll) applyRagdoll(ped);
          else fall(ped, step);
          continue;
        }
        if (ped.cop) {
          if (!ped.live) acquire(ped);
          if (ped.phase === "react") {
            ped.phaseTime += step;
            if (ped.phaseTime < duration(ped, ped.hitClip)) {
              ped.live.mixer.update(step);
              ped.live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
              continue;
            }
            ped.phase = null;
            ped.phaseTime = 0;
          }
          const gait = ped.copGait || "idle";
          if (ped.dx !== 0 || ped.dz !== 0) ped.live.holder.rotation.y = Math.atan2(ped.dx, ped.dz);
          showClip(ped, gait);
          // Cops jog at native Jog_Fwd_Loop speed (timeScale 1), same gait as
          // a pedestrian jog, so the feet match COP_SPEED (= PLAYER_SPEED).
          if (!REACTIONS.includes(gait)) {
            ped.live.actions[gait].setEffectiveTimeScale(1);
          }
          ped.live.mixer.update(step);
          ped.live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
          continue;
        }
        if (ped.live && !inRect(ped, leave)) {
          release(ped);
          continue;
        }
        if (!ped.live && inRect(ped, enter)) acquire(ped);
        if (!ped.live) continue;
        // Finish a non-lethal hit in place, then fall through to walking.
        if (ped.phase === "react") {
          ped.phaseTime += step;
          if (ped.phaseTime < duration(ped, ped.hitClip)) {
            ped.live.mixer.update(step);
            ped.live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
            continue;
          }
          ped.phase = null;
          ped.phaseTime = 0;
        }
        steer(ped, playerX, playerZ);
        const moving = ped.dx !== 0 || ped.dz !== 0;
        const gait = moving ? (fleeing(ped) ? "sprint" : ped.calm) : "idle";
        const live = ped.live;
        if (moving) {
          live.holder.rotation.y = Math.atan2(ped.dx, ped.dz);
          advance(ped, GAIT_SPEED[gait] * ped.vary * step, playerX, playerZ);
        }
        showClip(ped, gait);
        if (!REACTIONS.includes(ped.playing)) {
          live.actions[ped.playing].setEffectiveTimeScale(ped.playing === "idle" ? 1 : ped.vary);
        }
        live.mixer.update(step);
        live.holder.position.set(ped.x, sole(ped.x, ped.z), ped.z);
      }
    },
  };
}
