import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
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

// Each file is loaded once. The crowd is cloned from these six.
const FILES = [
  "ped_criminalMaleA.glb",
  "ped_humanFemaleA.glb",
  "ped_skaterFemaleA.glb",
  "ped_skaterMaleA.glb",
  "ped_survivorFemaleA.glb",
  "ped_survivorMaleB.glb",
];
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

function clothColor(salt) {
  const index = Math.floor(unitHash(salt) * CLOTHES.length);
  return new Color(CLOTHES[index]);
}

function boneGroup(name) {
  if (SHIRT_BONES.has(name)) return 0;
  if (PANTS_BONES.has(name)) return 1;
  if (SHOE_BONES.has(name)) return 2;
  return 3;
}

function skinnedMeshOf(root) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.isSkinnedMesh) found = obj;
  });
  return found;
}

function clothMask(root) {
  const mesh = skinnedMeshOf(root);
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

function paintClothes(root, mask, shirt, pants, shoes) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const sources = Array.isArray(obj.material) ? obj.material : [obj.material];
    const painted = sources.map((source) => {
      const material = source.clone();
      material.userData = Object.assign({}, source.userData, {
        cloth: { shirt, pants, shoes },
      });
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
      material.customProgramCacheKey = () => "ped-cloth-1";
      return material;
    });
    obj.material = painted.length === 1 ? painted[0] : painted;
  });
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
  const list = [];
  const key = (x, z) => x + z * cols;
  for (let z = 0; z < rows; z += 1) {
    const row = ground[z];
    for (let x = 0; x < cols; x += 1) {
      if (row[x] === "s") {
        cells.add(key(x, z));
        list.push([x, z]);
      }
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
  return { span, neighbors, nearest, cells: list };
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

  const prototypes = [];
  for (const file of FILES) {
    const url = new URL(`../pedestrians_v15/${file}`, import.meta.url).href;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      throw new Error(`The pedestrian model failed to load: ${file}`);
    }
    const clips = await clipsFor(gltf);
    const template = gltf.scene;
    const mask = clothMask(template);
    litMaterials(template);
    fitModel(template);
    prototypes.push({ file, template, clips, mask });
  }

  const tiles = crowdTiles(graph.cells, graph.neighbors);
  const people = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const prototype = prototypes[index % prototypes.length];
    const model = cloneSkeleton(prototype.template);
    paintClothes(
      model,
      prototype.mask,
      clothColor(index * 3 + 1),
      clothColor(index * 3 + 2),
      clothColor(index * 3 + 3),
    );

    const holder = new Group();
    holder.name = prototype.file;
    holder.frustumCulled = false;
    holder.add(model);
    scene.add(holder);

    const mixer = new AnimationMixer(model);
    const { clips } = prototype;
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

    const [tx, tz] = tiles[index];
    const open = graph.neighbors(tx, tz);
    const preferred = open[Math.floor(unitHash(index + 7) * open.length)] || [0, 0];
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
