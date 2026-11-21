import {
  Box3,
  BufferAttribute,
  DoubleSide,
  Group,
  MeshLambertMaterial,
  SkinnedMesh,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Quaternius Ultimate Modular characters (CC0) on the Universal Animation
// Library 1 skeleton (UAL bone names: root, pelvis, spine_01..03, neck_01,
// Head, clavicle/upperarm/lowerarm/hand_l/_r, thigh/calf/foot/ball_l/_r).
// Every file carries the same UAL1 clips under the same names.
// The player is MainCharacter_v1 in the Medium + leaf style. Crowd and cops stay on the modular files.
export const PLAYER_MODEL = "../06 Player Character/Main Character/MainCharacter_v1_medium_leaf_v3.glb";
export const PED_MODELS = [
  "../06 Player Character/Modular/men_Casual_Hoodie_UAL.glb",
  "../06 Player Character/Modular/women_Casual_UAL.glb",
];
// Cop bodies: Vera's dusty police, approved by Ted. Index 0 is the normal
// cop with the helmet, index 1 the cowboy-hat cop (police.js picks one per
// cop, see COP_COWBOY_CHANCE). Cops keep the files' own colors and dust;
// they are not recolored like the crowd.
export const COP_MODELS = [
  "../06 Player Character/Modular/cop_v1d_vera1_UAL.glb",
  "../06 Player Character/Modular/cop_v2f_vera1_UAL.glb",
];
// Bat_Shoulder, Bat_Hang and Bat_Swing on the UAL skeleton (clips only).
export const BAT_CLIPS_MODEL = "../06 Player Character/Modular/ual-bat.glb";
export const UAL2_CLIPS_MODEL = "../assets/player/ual2-clips.glb";
// Two-handed shotgun carry, aim and shoot: Kevin Iglesias "Human Soldier
// Animations FREE" WeaponHold_Rifle01, Rifle_Aim01 and Rifle_Aim01_Shoot01
// as Shotgun_Hold, Shotgun_Aim, Shotgun_Shoot (royalty-free, no resale of the
// raw files), retargeted onto the UAL skeleton and baked to plain keyframes.
// Spine, head, and arm bones only; the file has no mesh.
export const SHOTGUN_CLIPS_MODEL = "../assets/player/shotgun-clips.glb";

export function modelUrl(path) {
  return new URL(path, import.meta.url).href;
}

// Standing (bind pose) height in car units, sole to crown. This is what the
// old player measured in game (sedan 71 long), so punch reach, sell range
// and car hits keep their tuning.
export const CHARACTER_HEIGHT = 37.35;

export const RIGHT_HAND = "hand_r";
// Pistol, bottle and bat offsets were tuned in the old hand's frame: +Y wrist
// to knuckles, +X toward the pinky, -Z the palm, one unit = 9.92 car units.
// The UAL hand has the fingers on +Y and the pinky on -Z, so a quarter turn
// about Y and this scale give the same frame.
const HAND_UNIT = 9.92;
const HAND_TURN_Y = Math.PI / 2;

// Vera: matte, not wet. As shipped the files are metalness 0.4, roughness ~0.4.
export const CLOTH_METALNESS = 0;
export const CLOTH_ROUGHNESS = 0.87;

// Color slots a look can replace. KEEP stays the file's own color.
export const SLOT = { shirt: 0, pants: 1, shoes: 2, skin: 3, hair: 4, keep: 9 };

function slotFor(partName, materialName) {
  const part = partName.toLowerCase();
  const mat = materialName.toLowerCase();
  if (mat === "skin") return SLOT.skin;
  if (mat.includes("black") || mat.includes("visor") || mat.includes("eye") || mat === "brown") return SLOT.keep;
  if (part.includes("head")) {
    if (mat === "hair" || mat === "hair_blond") return SLOT.hair;
    if (mat === "swat") return SLOT.shirt;
    return SLOT.keep;
  }
  if (part.includes("body")) return SLOT.shirt;
  if (part.includes("legs")) return SLOT.pants;
  // The hoodie man's soles are White; the rest of a shoe takes the look.
  if (part.includes("feet")) return mat === "white" ? SLOT.keep : SLOT.shoes;
  return SLOT.keep;
}

export function matteMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if ("metalness" in material) material.metalness = CLOTH_METALNESS;
      if ("roughness" in material) material.roughness = CLOTH_ROUGHNESS;
    }
  });
}

// A textured part (the player's leaf print) keeps its picture: a matte,
// see-through Lambert with the file's own map, on the same skeleton.
function texturedPartMaterial(source) {
  return new MeshLambertMaterial({
    map: source.map,
    color: source.color.clone(),
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    fog: false,
    side: DoubleSide,
  });
}

// One skinned mesh per figure instead of ten: each part's color goes into a
// vertex color, and its slot into pedSlot, so a pedestrian is one draw call.
// If a part has its own vertex colors (COLOR_0), those times the material
// color are used. Parts with a texture stay out of the merge as their own
// skinned mesh, so the picture still shows.
export function mergeFigure(root, material) {
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (source && source.map) {
      obj.material = texturedPartMaterial(source);
      obj.frustumCulled = false;
      obj.renderOrder = 2;
      return;
    }
    parts.push(obj);
  });
  if (!parts.length) throw new Error("The character file has no skinned mesh.");
  const first = parts[0];
  const geometries = parts.map((mesh) => {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const partName = mesh.parent && !mesh.parent.isBone && mesh.parent !== root && mesh.parent.name
      ? mesh.parent.name
      : mesh.name;
    const geometry = mesh.geometry.clone();
    // COLOR_0 may be vec3 or vec4 and normalized bytes or shorts; getX/Y/Z
    // return plain floats either way, and alpha is dropped.
    const own = geometry.attributes.color || null;
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "skinIndex", "skinWeight"].includes(name)) geometry.deleteAttribute(name);
    }
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const slots = new Float32Array(count);
    const color = source.color;
    const slot = slotFor(partName, source.name || "");
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = own ? own.getX(i) * color.r : color.r;
      colors[i * 3 + 1] = own ? own.getY(i) * color.g : color.g;
      colors[i * 3 + 2] = own ? own.getZ(i) * color.b : color.b;
      slots[i] = slot;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setAttribute("pedSlot", new BufferAttribute(slots, 1));
    geometry.morphAttributes = {};
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("The character parts could not be merged.");
  const mesh = new SkinnedMesh(merged, material);
  mesh.name = "figure";
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const part of parts) {
    const holder = part.parent;
    part.removeFromParent();
    part.geometry.dispose();
    if (holder && holder !== first.parent && !holder.isBone && holder.children.length === 0) {
      holder.removeFromParent();
    }
  }
  mesh.frustumCulled = false;
  return mesh;
}

const vertex = new Vector3();

// Sole to crown with the skin applied, in the current pose.
export function posedBounds(root) {
  root.updateMatrixWorld(true);
  const box = new Box3();
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    const position = obj.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      obj.getVertexPosition(i, vertex);
      vertex.applyMatrix4(obj.matrixWorld);
      box.expandByPoint(vertex);
    }
  });
  return box;
}

// Scales the bind pose to CHARACTER_HEIGHT and stands the soles on y = 0.
export function fitCharacter(model, height = CHARACTER_HEIGHT) {
  model.scale.setScalar(1);
  model.position.set(0, 0, 0);
  const bounds = posedBounds(model);
  const measured = Math.max(0.001, bounds.max.y - bounds.min.y);
  model.scale.setScalar(height / measured);
  const fitted = posedBounds(model);
  model.position.y -= fitted.min.y;
  model.updateMatrixWorld(true);
}

// A child of the right hand in the old hand frame, for pistol, bottle and bat.
export function handSocket(model) {
  const hand = model.getObjectByName(RIGHT_HAND);
  if (!hand) return null;
  if (hand.userData.socket) return hand.userData.socket;
  model.updateMatrixWorld(true);
  // Relative to the figure's holder, so moving or scaling the holder later
  // does not change the socket.
  const scale = new Vector3();
  const outer = new Vector3(1, 1, 1);
  hand.getWorldScale(scale);
  if (model.parent) model.parent.getWorldScale(outer);
  const socket = new Group();
  socket.name = "hand_r_socket";
  socket.rotation.y = HAND_TURN_Y;
  socket.scale.setScalar(HAND_UNIT / Math.max(1e-6, scale.x / outer.x));
  hand.add(socket);
  hand.userData.socket = socket;
  return socket;
}

// Arm bones on one side, fingers included: clavicle_l, upperarm_l, ... pinky_03_l.
const ARM_PARTS = ["clavicle", "upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky"];
export function isArmBone(name, side) {
  return name.endsWith(`_${side}`) && ARM_PARTS.some((part) => name.startsWith(part));
}
