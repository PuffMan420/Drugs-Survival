import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  LoopOnce,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { dropHeadScaleTracks, shrinkHead } from "./head-scale.js";
import { GROUND_H, GROUND_W, PLAYER_SPEED, TILE } from "./constants.js";
import { walkableCells } from "./pedestrian-walk.js";

// Same height fit as the player, including both extra 10% bumps and another 5%, so these figures stand with him.
const SEDAN_LENGTH = 71;
const SCALE_BUMP = 1.15 * 1.1 * 1.1 * 1.05;
const FEET_Y = 0.6;
const FADE = 0.12;
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

// Muted clothing colors. Shirt, pants, and shoes are picked independently.
const CLOTHES = [
  0x8a8a8a, // grey
  0xc4b49a, // beige
  0x2c3e5a, // navy
  0x6b4a32, // brown
  0x6b6a3e, // olive
  0x232323, // black
  0x2f4a34, // dark green
  0x6e2e3c, // wine red
  0x8eafc4, // light blue
  0xe6dcc8, // cream
  0xb5a36a, // khaki
  0x3e4246, // charcoal
  0x8d4b32, // rust
  0x3d5270, // denim blue
  0xb89a45, // mustard
  0xc5c5c2, // light grey
  0x5c5c5c, // dark grey
  0x3f2c22, // dark brown
  0x6a2a2a, // dark red
  0x4a6b5c, // teal grey
  0x7a5c7a, // dusty purple
  0x3a2e4a, // dark plum
  0xa65f4a, // terracotta
  0x5f7a4a, // moss green
  0x9a8a5a, // sand
  0x4a5a7a, // slate blue
  0xb07a5a, // camel
  0x7a3a4a, // burgundy
  0x5a7a8a, // steel blue
  0xd0b890, // tan
  0x2a3a3a, // dark teal
  0x8a6a8a, // mauve
  0x6a7a5a, // sage
  0xa04030, // brick red
  0x305070, // petrol blue
  0xc08040, // ochre
  0x50405a, // aubergine
  0x90a0a8, // pale steel
  0x1e2a40, // midnight blue
];

// One atlas, one material. These bones own the shirt, pants, and shoe islands.
const SHIRT_BONES = new Set([
  "Chest", "UpperChest", "Spine",
  "LeftArm", "RightArm", "LeftShoulder", "RightShoulder",
  "LeftForeArm", "RightForeArm",
]);
const PANTS_BONES = new Set([
  "Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg",
]);
const SHOE_BONES = new Set([
  "LeftFoot", "RightFoot", "LeftToes", "RightToes",
]);

const CLOTH_UNIFORMS = `
uniform vec3 pedShirtColor;
uniform vec3 pedPantsColor;
uniform vec3 pedShoeColor;
uniform sampler2D pedClothMask;
`;
const CLOTH_TINT = `
{
  vec3 pedMask = texture2D(pedClothMask, vMapUv).rgb;
  float pedAmount = clamp(pedMask.r + pedMask.g + pedMask.b, 0.0, 1.0);
  float pedLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float pedShade = clamp(pedLuma / 0.45, 0.25, 1.35);
  vec3 pedTint = pedShirtColor * pedMask.r + pedPantsColor * pedMask.g + pedShoeColor * pedMask.b;
  diffuseColor.rgb = mix(diffuseColor.rgb, pedTint * pedShade, pedAmount);
}
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

const CLOTH_COLORS = CLOTHES.map((hex) => new Color(hex));

function clothColor(salt) {
  return CLOTH_COLORS[Math.floor(unitHash(salt) * CLOTH_COLORS.length)];
}

function boneGroup(name) {
  if (SHIRT_BONES.has(name)) return 0;
  if (PANTS_BONES.has(name)) return 1;
  if (SHOE_BONES.has(name)) return 2;
  return 3;
}

function bodyMesh(root) {
  let found = null;
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh || obj.name.startsWith("Bun")) return;
    if (!found) found = obj;
  });
  if (!found) throw new Error("The pedestrian is missing a body.");
  return found;
}

function clothMask(root) {
  const mesh = bodyMesh(root);
  const geometry = mesh.geometry;
  const uv = geometry.attributes.uv;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const index = geometry.index;
  const bones = mesh.skeleton.bones;
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const image = source.map.image;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fills = ["rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)"];
  const width = canvas.width;
  const height = canvas.height;
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const score = [0, 0, 0, 0];
    const points = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index.getX(triangle + corner);
      let bestChannel = 0;
      for (let channel = 1; channel < 4; channel += 1) {
        if (skinWeight.getComponent(vertex, channel) > skinWeight.getComponent(vertex, bestChannel)) {
          bestChannel = channel;
        }
      }
      const bone = bones[Math.round(skinIndex.getComponent(vertex, bestChannel))];
      score[boneGroup(bone.name)] += skinWeight.getComponent(vertex, bestChannel);
      points.push([
        uv.getX(vertex) * width,
        uv.getY(vertex) * height,
      ]);
    }
    let group = 0;
    for (let i = 1; i < 4; i += 1) if (score[i] > score[group]) group = i;
    if (group > 2) continue;
    ctx.fillStyle = fills[group];
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const clothMaterials = new Map();

function sharedClothMaterial(base, mask, shirt, pants, shoes) {
  const key = `${base.uuid}:${shirt.getHexString()}:${pants.getHexString()}:${shoes.getHexString()}`;
  const cached = clothMaterials.get(key);
  if (cached) return cached;
  const material = base.clone();
  material.userData = { cloth: { shirt, pants, shoes } };
  material.onBeforeCompile = (shader) => {
    const cloth = material.userData.cloth;
    shader.uniforms.pedShirtColor = { value: cloth.shirt };
    shader.uniforms.pedPantsColor = { value: cloth.pants };
    shader.uniforms.pedShoeColor = { value: cloth.shoes };
    shader.uniforms.pedClothMask = { value: mask };
    shader.fragmentShader = CLOTH_UNIFORMS + shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n${CLOTH_TINT}`,
    );
  };
  material.customProgramCacheKey = () => `ped-cloth-${key}`;
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
    // the stride rate that was just applied.
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
  // Same root-scale measurement as the player. This is his rig.
  // v15's root is 1.0. Measure at 1.05/1.134, as he does, so the restored
  // scale lands on his height.
  const root = model.getObjectByName("Root");
  const fileScale = root ? root.scale.x : 1;
  if (root) root.scale.setScalar(1.05 / 1.134);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = (SEDAN_LENGTH / 3) * SCALE_BUMP / height;
  model.scale.setScalar(scale);
  if (root) root.scale.setScalar(fileScale);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  // Same order as the player: the height fit has already run.
  shrinkHead(model);
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

export async function createPedestrians(scene, map, pieces = [], feetAt = null) {
  const loader = new GLTFLoader();
  const graph = sidewalkGraph(map, pieces);
  // feetAt reads the sidewalk lip from the road meshes. The cast shadow is
  // on this holder, so it rises with the feet.
  function sole(x, z) {
    return feetAt ? feetAt(x, z, FEET_Y) : FEET_Y;
  }
  const { span } = graph;
  let gltf;
  try {
    gltf = await loader.loadAsync(new URL("../assets/player/gubbe.glb", import.meta.url).href);
  } catch {
    throw new Error("The pedestrian rig failed to load.");
  }
  const clips = {};
  for (const [key, name] of Object.entries(CLIP_NAMES)) {
    clips[key] = clipNamed(gltf.animations, name);
  }
  // Head.scale is a rest hold at 1, and the mixer would write it back
  // over the smaller head.
  dropHeadScaleTracks(clips);
  const template = gltf.scene;
  const mask = clothMask(template);
  litMaterials(template);
  fitModel(template);
  const prototypes = [{
    template,
    clips,
    mask,
    material: bodyMesh(template).material,
  }];

  const tiles = crowdTiles(graph.cells, graph.neighbors);
  const people = [];
  const pools = prototypes.map(() => []);
  for (let index = 0; index < tiles.length; index += 1) {
    const proto = index % prototypes.length;
    const [tx, tz] = tiles[index];
    const open = graph.neighbors(tx, tz);
    const preferred = open[Math.floor(unitHash(index + 7) * open.length)] || [0, 0];
    const home = centerOf(tx, tz, span);
    const calm = unitHash(index + 19) < 0.3 ? "jog" : "walk";
    people.push({
      proto,
      shirt: clothColor(index * 3 + 1),
      pants: clothColor(index * 3 + 2),
      shoes: clothColor(index * 3 + 3),
      vary: 0.85 + unitHash(index + 11) * 0.3,
      salt: index + 3,
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
    mesh.material = sharedClothMaterial(
      prototype.material,
      prototype.mask,
      ped.shirt,
      ped.pants,
      ped.shoes,
    );
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
    const live = ped.live;
    ped.live = null;
    live.holder.removeFromParent();
    live.mixer.stopAllAction();
    pools[ped.proto].push(live);
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

  return {
    targets() {
      const list = [];
      for (const ped of people) {
        if (ped.live && !ped.dead) list.push(ped);
      }
      return list;
    },
    hurt(ped, dirX, dirZ) {
      if (!ped || ped.dead || !ped.live) return null;
      ped.dead = true;
      ped.settled = false;
      ped.pooled = false;
      ped.phase = "hit";
      ped.phaseTime = 0;
      ped.hitClip = Math.random() < 0.5 ? "hitChest" : "hitHead";
      const len = Math.hypot(dirX, dirZ) || 1;
      ped.vx = (dirX / len) * 40;
      ped.vz = (dirZ / len) * 40;
      showClip(ped, ped.hitClip);
      return {
        x: ped.x,
        z: ped.z,
        y: ped.live.holder.position.y + 16,
        ground: sole(ped.x, ped.z) + 0.35,
      };
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
    setPanic(value) {
      const next = Boolean(value);
      if (next === panic) return;
      panic = next;
      for (const ped of people) {
        if (ped.dead) continue;
        showClip(ped, panic ? "sprint" : ped.calm);
      }
    },
    update(dt, playerX, playerZ, spanW = GROUND_W, spanH = GROUND_H) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      const enter = viewRect(playerX, playerZ, enterMargin, spanW, spanH);
      const leave = viewRect(playerX, playerZ, leaveMargin, spanW, spanH);
      for (const ped of people) {
        if (ped.live && ped.dead) {
          fall(ped, step);
          continue;
        }
        if (ped.live && !inRect(ped, leave)) {
          release(ped);
          continue;
        }
        if (!ped.live && inRect(ped, enter)) acquire(ped);
        if (!ped.live) continue;
        steer(ped, playerX, playerZ);
        const moving = ped.dx !== 0 || ped.dz !== 0;
        const gait = moving ? (panic ? "sprint" : ped.calm) : "idle";
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
