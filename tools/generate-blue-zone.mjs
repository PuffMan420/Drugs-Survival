// Seeded blue-zone filler. Reads the road grid, writes the lot list and placements.
// Seed 20261114. Reruns match. Does not edit island-map.json.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TILE = 48;
const SEED = 20261114;
const HOUSE = 41.86;
const KAY = 96;
const FENCE = 18.37;
const RETRO = 192;
const CAR_LONG = 70;
const SETBACK = 0.7;
const GAP = 0.35;

const TEX = "assets/buildings/textured/low/";
const KAYP = "assets/buildings/kaykit/low/";
const SKIN = "assets/buildings/textured/low/skins/";
const PART = "assets/buildings/textured/parts/";
const PROP = "assets/buildings/kaykit/props/";
const RET = "assets/kenney-city/kenney_retro-urban-kit/Models/GLB format/";
const CAR = "assets/cars3d/weathered/";

const GRIMY = ["tagged-beige", "tagged-cream", "tagged-pink", "wrecked-pink", "busted-beige", "stained-cream", "dirty-mustard", "weathered-cream", "dusty-pink", "dusty-beige", "pale-green-gray"];
const CLEAN = ["faded-white"];
const TINTS = [
  { r: 0.76, g: 0.68, b: 0.52 },
  { r: 0.82, g: 0.76, b: 0.62 },
  { r: 0.72, g: 0.64, b: 0.38 },
  { r: 0.72, g: 0.55, b: 0.52 },
  { r: 0.62, g: 0.68, b: 0.55 },
  { r: 0.7, g: 0.48, b: 0.4 },
];

function house(name, skin) {
  return { file: `${TEX}${name}.glb`, skin };
}
function kay(name) {
  return { file: `${KAYP}${name}.glb`, skin: null };
}

const LOTS = [
  lot("L01", 45, 51, 152, 167, "terrace", "south", ["south", "west"], [house("building_1Story_RoundRoof", "weathered-cream"), house("building_2Story_Slim", "tagged-beige"), house("building_2Story_Sidehouse", "dirty-mustard")]),
  lot("L02", 61, 63, 168, 199, "alley", "east", ["east"], []),
  lot("L03", 65, 75, 152, 166, "boarded", "south", ["south", "east"], [house("building_2Story_Columns", "stained-cream"), house("building_1Story", "wrecked-pink")]),
  lot("L04", 76, 86, 152, 166, "fenced", "south", ["south"], [house("building_2Story_2", "dusty-pink"), house("building_3Story_Small", "pale-green-gray")]),
  lot("L05", 87, 95, 158, 166, "terrace", "south", ["south"], [house("building_2Story_Balcony", "tagged-cream"), house("building_1Story_RoundRoof", "dirty-mustard")]),
  lot("L06", 45, 51, 173, 199, "terrace", "west", ["west", "east"], [house("building_2Story_Stairs", "busted-beige"), house("building_3Story_Slim", "weathered-cream"), house("building_2Story_Double", "stained-cream")]),
  lot("L07", 69, 79, 173, 199, "terrace", "west", ["west", "east", "north"], [house("building_2Story_Wide", "dusty-beige"), house("building_1Story", "tagged-beige"), house("building_2Story_Center", "wrecked-pink"), house("building_3Story_Balcony", "dirty-mustard")]),
  lot("L08", 85, 95, 173, 199, "market", "east", ["east", "north", "west"], [house("building_1Story_Sign", "tagged-cream"), house("building_4Story", "dusty-beige"), house("building_2Story_RoundRoof", "busted-beige"), house("building_2Story_Sign", "stained-cream")]),
  lot("L09", 229, 239, 152, 167, "terrace", "south", ["south", "west"], [house("building_2Story_Wide_2Doors", "tagged-pink"), kay("building_A"), house("building_1Story", "pale-green-gray")]),
  lot("L10", 205, 223, 173, 199, "estate", "north", ["north", "west", "east"], [house("building_4Story_Center", "dusty-beige"), house("building_2Story_Columns", "tagged-beige"), kay("building_C")]),
  lot("L11", 229, 239, 173, 199, "terrace", "west", ["west", "east"], [kay("building_B"), house("building_3Story_Small", "wrecked-pink"), house("building_2Story_Stairs", "weathered-cream")]),
  lot("L12", 181, 194, 157, 167, "terrace", "south", ["south", "north"], [kay("building_E"), house("building_2Story_Double", "dirty-mustard")]),
  lot("L13", 195, 208, 157, 167, "terrace", "south", ["south", "north"], [house("building_2Story_Wide_2Doors", "tagged-cream"), house("building_1Story_RoundRoof", "stained-cream")]),
  lot("L14", 209, 223, 157, 167, "terrace", "south", ["south", "north"], [kay("building_F"), house("building_2Story_Balcony", "stained-cream")]),
  lot("L15a", 101, 115, 157, 170, "terrace", "north", ["north"], [house("building_2Story", "tagged-beige"), house("building_1Story", "dusty-pink"), house("building_3Story_Slim", "busted-beige")]),
  lot("L15b", 116, 130, 157, 170, "estate", "north", ["north"], [house("building_2Story_2", "weathered-cream"), house("building_4Story_Wide_2Doors", "dusty-beige")]),
  lot("L15c", 131, 145, 157, 170, "waste", "north", ["north"], []),
  lot("L15d", 146, 160, 157, 170, "terrace", "north", ["north"], [kay("building_G"), house("building_2Story_Sidehouse", "tagged-pink")]),
  lot("L15e", 161, 175, 157, 170, "terrace", "north", ["north"], [house("building_2Story_Center", "dirty-mustard"), kay("building_H")]),
  lot("L16a", 101, 115, 171, 185, "terrace", "west", ["west", "east"], [house("building_2Story_Columns", "wrecked-pink"), house("building_1Story_GableRoof", "tagged-cream")]),
  lot("L16b", 116, 130, 171, 185, "waste", "west", ["west"], []),
  lot("L16c", 131, 145, 171, 185, "cluster", "west", ["west", "east"], [house("building_2Story_Slim", "dusty-pink"), house("building_3Story_Small", "tagged-beige"), house("building_1Story_RoundRoof", "busted-beige")]),
  lot("L16d", 146, 160, 171, 185, "waste", "west", ["west"], []),
  lot("L16e", 161, 175, 171, 185, "cluster", "east", ["east", "west"], [house("building_2Story_Stairs", "tagged-cream"), kay("building_D")]),
  lot("L17a", 101, 115, 186, 199, "terrace", "south", ["south", "east"], [house("building_2Story_Wide", "stained-cream"), house("building_1Story", "weathered-cream")]),
  lot("L17b", 116, 130, 186, 199, "estate", "south", ["south"], [house("building_4Story", "tagged-beige")]),
  lot("L17c", 131, 145, 186, 199, "terrace", "south", ["south", "north"], [house("building_2Story_Double", "dusty-pink"), house("building_2Story_RoundRoof", "dirty-mustard")]),
  lot("L17d", 146, 160, 186, 199, "waste", "south", ["south"], []),
  lot("L17e", 161, 175, 186, 199, "estate", "south", ["south"], [kay("building_E_6f")]),
  lot("L18a", 176, 187, 173, 199, "cluster", "east", ["east", "west"], [house("building_2Story_Slim", "pale-green-gray")]),
  lot("L18b", 188, 199, 173, 199, "estate", "east", ["east", "west"], [kay("building_D_8f"), house("building_2Story_Balcony", "busted-beige")]),
  lot("L19", 69, 79, 205, 229, "kept", "west", ["west", "east"], [house("building_2Story_Wide_2Doors", "tagged-pink"), house("building_3Story_Slim", "dusty-beige"), house("building_2Story_Center", "wrecked-pink")]),
  lot("L20", 85, 95, 205, 215, "terrace", "west", ["west", "east"], [house("building_2Story_GableRoof", "stained-cream"), house("building_1Story", "busted-beige"), house("building_2Story_2", "tagged-beige")]),
  lot("L21a", 101, 115, 205, 215, "terrace", "north", ["north", "south"], [house("building_2Story_Columns", "dirty-mustard"), kay("building_C")]),
  lot("L21b", 116, 130, 205, 215, "terrace", "north", ["north", "south"], [house("building_1Story_RoundRoof", "tagged-pink"), house("building_3Story_Small", "weathered-cream")]),
  lot("L21c", 131, 145, 205, 215, "waste", "north", ["north"], []),
  lot("L21d", 146, 160, 205, 215, "estate", "north", ["north"], [house("building_4Story_Wide_2Doors_Roof", "dusty-beige")]),
  lot("L21e", 161, 175, 205, 215, "terrace", "north", ["north", "south"], [house("building_2Story_Sidehouse", "busted-beige"), house("building_2Story_Stairs", "dusty-pink")]),
  lot("L22", 181, 199, 205, 215, "estate", "east", ["east", "west"], [kay("building_G_6f"), house("building_2Story_Wide", "tagged-cream")]),
  lot("L23", 205, 223, 205, 215, "terrace", "north", ["north", "south"], [house("building_2Story_Double", "pale-green-gray"), house("building_1Story_GableRoof", "faded-white"), kay("building_B")]),
  lot("L24", 229, 239, 205, 215, "terrace", "west", ["west", "east"], [house("building_3Story_Balcony", "dirty-mustard"), house("building_2Story", "wrecked-pink")]),
  lot("L25a", 101, 115, 221, 231, "cluster", "south", ["south", "north"], [house("building_2Story_Slim", "tagged-beige")]),
  lot("L25b", 116, 130, 221, 231, "terrace", "south", ["south", "north"], [house("building_1Story", "dusty-pink"), house("building_2Story_RoundRoof", "busted-beige")]),
  lot("L25c", 131, 145, 221, 231, "terrace", "south", ["south", "north"], [kay("building_E"), house("building_2Story_Center", "stained-cream")]),
  lot("L25d", 146, 160, 221, 231, "waste", "south", ["south"], []),
  lot("L25e", 161, 175, 221, 231, "terrace", "south", ["south", "north"], [house("building_3Story_Slim", "tagged-pink"), house("building_2Story_Balcony", "weathered-cream")]),
  lot("L26", 176, 199, 217, 231, "cluster", "east", ["east", "south"], [house("building_2Story_Wide_2Doors", "dirty-mustard"), kay("building_F"), house("building_1Story_RoundRoof", "tagged-cream")]),
  lot("L27", 85, 95, 221, 251, "terrace", "south", ["south", "north", "west", "east"], [house("building_2Story_Columns", "wrecked-pink"), house("building_3Story_Small", "dusty-beige"), house("building_1Story", "tagged-pink"), house("building_2Story", "faded-white")]),
  lot("L28", 205, 223, 221, 231, "terrace", "north", ["north", "south"], [house("building_2Story_2", "busted-beige"), kay("building_D"), house("building_1Story", "weathered-cream")]),
  lot("L29", 229, 239, 221, 231, "terrace", "west", ["west", "east"], [house("building_3Story_Balcony", "dusty-pink"), house("building_2Story_Wide", "tagged-beige")]),
  lot("L30", 69, 79, 235, 247, "kept", "south", ["south"], []),
  lot("L31", 61, 63, 221, 251, "alley", "east", ["east"], []),
  lot("L32a", 101, 115, 237, 251, "terrace", "north", ["north", "south"], [house("building_2Story", "stained-cream"), house("building_1Story_RoundRoof", "dirty-mustard")]),
  lot("L32b", 116, 130, 237, 251, "estate", "north", ["north"], [kay("building_E_8f")]),
  lot("L32c", 131, 145, 237, 251, "terrace", "north", ["north", "south"], [house("building_2Story_Sidehouse", "tagged-cream"), house("building_3Story_Small", "busted-beige")]),
  lot("L32d", 146, 160, 237, 251, "terrace", "north", ["north", "south"], [house("building_2Story_Double", "wrecked-pink"), house("building_1Story", "dusty-beige")]),
  lot("L32e", 161, 175, 237, 251, "waste", "north", ["north"], []),
  lot("L33", 181, 199, 237, 251, "estate", "east", ["east", "west"], [house("building_4Story_Wide_2Doors", "dusty-beige"), house("building_2Story_Wide", "tagged-pink")]),
  lot("L34", 205, 221, 237, 251, "estate", "north", ["north", "south"], [kay("building_D_6f"), house("building_2Story_Center", "pale-green-gray")]),
  lot("L35", 222, 239, 237, 251, "estate", "north", ["north", "east"], [house("building_6Story_Stack", "weathered-cream"), kay("building_G_8f")]),
  lot("L36", 61, 63, 205, 215, "alley", "east", ["east"], []),
];

function lot(id, x0, x1, z0, z1, kind, face, faces, buildings) {
  return {
    id, x0, x1, z0, z1, kind, face, faces, buildings,
    width: x1 - x0 + 1,
    depth: z1 - z0 + 1,
    centroid: { x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2 },
    kept: id === "L19" || id === "L30",
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let h = SEED;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function glbBounds(abs) {
  const buf = fs.readFileSync(abs);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const acc = json.accessors || [];
  const nodes = json.nodes || [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  function add(meshIndex, ox, oy, oz, sx, sy, sz) {
    const mesh = json.meshes?.[meshIndex];
    if (!mesh) return;
    for (const prim of mesh.primitives || []) {
      const a = acc[prim.attributes?.POSITION];
      if (!a?.min || !a?.max) continue;
      const xs = [a.min[0] * sx, a.max[0] * sx];
      const ys = [a.min[1] * sy, a.max[1] * sy];
      const zs = [a.min[2] * sz, a.max[2] * sz];
      const lo = [ox + Math.min(...xs), oy + Math.min(...ys), oz + Math.min(...zs)];
      const hi = [ox + Math.max(...xs), oy + Math.max(...ys), oz + Math.max(...zs)];
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], lo[i]);
        max[i] = Math.max(max[i], hi[i]);
      }
    }
  }
  function walk(index, ox, oy, oz) {
    const node = nodes[index];
    if (!node) return;
    const t = node.translation || [0, 0, 0];
    const s = node.scale || [1, 1, 1];
    const x = ox + t[0];
    const y = oy + t[1];
    const z = oz + t[2];
    if (node.mesh != null) add(node.mesh, x, y, z, s[0], s[1], s[2]);
    for (const child of node.children || []) walk(child, x, y, z);
  }
  const scene = json.scenes?.[json.scene || 0];
  for (const index of scene?.nodes || [0]) walk(index, 0, 0, 0);
  if (!Number.isFinite(min[0])) return { w: 1, h: 1, d: 1 };
  return { w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] };
}

const boundsCache = new Map();
function boundsOf(file) {
  if (boundsCache.has(file)) return boundsCache.get(file);
  const value = glbBounds(path.join(root, file));
  boundsCache.set(file, value);
  return value;
}

function isCar(file) {
  return file.includes("cars3d/weathered/");
}
function isRetro(file) {
  return file.includes("kenney_retro-urban-kit");
}
function unitFor(file, scale = 1) {
  if (isCar(file)) {
    const box = boundsOf(file);
    const long = Math.max(box.w, box.d, 0.001);
    return CAR_LONG / long;
  }
  if (file.includes("/fences/")) return FENCE;
  if (file.includes("/kaykit/")) return KAY;
  if (isRetro(file)) return RETRO;
  if (file.endsWith(".glb") && !file.includes("/buildings/") && !file.includes("/fences/")) return TILE;
  return HOUSE;
}

function yawFor(face) {
  if (face === "south") return 0;
  if (face === "east") return Math.PI / 2;
  if (face === "west") return -Math.PI / 2;
  return Math.PI;
}

function storyOf(file) {
  return file.includes("1Story") ? "1story" : "2story";
}

function skinFile(file, name) {
  if (!name) return null;
  return `${SKIN}${storyOf(file)}-${name}.jpg`;
}

function sharesEdge(a, b) {
  const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const xGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1;
  const zGap = Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1) - 1;
  return (xGap >= 0 && xGap <= 2 && zOverlap >= 2) || (zGap >= 0 && zGap <= 2 && xOverlap >= 2);
}

function filesOf(entry) {
  return entry.buildings.map((item) => item.file);
}

const MESHES = [...new Set(LOTS.flatMap((entry) => filesOf(entry)))];

function repairMeshes() {
  const neighbors = LOTS.map((entry) => LOTS.filter((other) => other !== entry && sharesEdge(entry, other)));
  for (let guard = 0; guard < 40; guard += 1) {
    let changed = false;
    for (let i = 0; i < LOTS.length; i += 1) {
      const entry = LOTS[i];
      const banned = new Set(neighbors[i].flatMap((other) => filesOf(other)));
      for (let b = 0; b < entry.buildings.length; b += 1) {
        const file = entry.buildings[b].file;
        const dupInLot = entry.buildings.some((item, index) => index !== b && item.file === file);
        if (!banned.has(file) && !dupInLot) continue;
        const local = new Set(filesOf(entry));
        const replacement = MESHES.find((candidate) => candidate !== file && !local.has(candidate) && !banned.has(candidate));
        if (!replacement) continue;
        entry.buildings[b] = { ...entry.buildings[b], file: replacement };
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function loadRoads() {
  const map = JSON.parse(fs.readFileSync(path.join(root, "island-map.json"), "utf8"));
  const road = new Set();
  const blocked = [];
  for (const piece of map.pieces || []) {
    if (piece.kit === "roads") {
      const x0 = Math.floor(piece.x - 1.5);
      const x1 = Math.ceil(piece.x + 2.5) - 1;
      const z0 = Math.floor(piece.z - 1.5);
      const z1 = Math.ceil(piece.z + 2.5) - 1;
      for (let z = z0; z <= z1; z += 1) {
        for (let x = x0; x <= x1; x += 1) road.add(`${x},${z}`);
      }
    } else if (piece.z >= 200 && piece.z <= 260 && piece.x >= 55 && piece.x <= 90) {
      blocked.push(piece);
    }
  }
  return { road, blocked };
}

function hitsRoad(road, x0, x1, z0, z1) {
  const a = Math.floor(x0);
  const b = Math.floor(x1 - 0.001);
  const c = Math.floor(z0);
  const d = Math.floor(z1 - 0.001);
  for (let z = c; z <= d; z += 1) {
    for (let x = a; x <= b; x += 1) {
      if (road.has(`${x},${z}`)) return true;
    }
  }
  return false;
}

function inBlue(x0, x1, z0, z1) {
  if (z0 < 152 || x1 > 248) return false;
  if (x0 < 0 || z1 > 264) return false;
  return true;
}

function overlaps(a, b, pad = 0) {
  return a.x1 > b.x0 - pad && a.x0 < b.x1 + pad && a.z1 > b.z0 - pad && a.z0 < b.z1 + pad;
}

function reservedFor(entry) {
  const boxes = [];
  if (entry.id === "L08") boxes.push({ x0: 92, x1: 96, z0: 193, z1: 200 });
  if (entry.id === "L17a") boxes.push({ x0: 101, x1: 105, z0: 196, z1: 200 });
  if (entry.id === "L19") boxes.push({ x0: 66, x1: 82, z0: 223, z1: 232 });
  if (entry.id === "L30") boxes.push({ x0: 67, x1: 81, z0: 241, z1: 248 });
  return boxes;
}

function footprint(file, scale, face) {
  const box = boundsOf(file);
  const unit = unitFor(file);
  const worldW = box.w * unit * scale;
  const worldD = box.d * unit * scale;
  const swap = face === "east" || face === "west";
  return {
    w: (swap ? worldD : worldW) / TILE,
    d: (swap ? worldW : worldD) / TILE,
    h: (box.h * unit * scale) / TILE,
    unit,
  };
}

function mildTint(rng) {
  const swing = (rng() - 0.5) * 0.12;
  return {
    r: Math.round((0.96 + swing) * 1000) / 1000,
    g: Math.round((0.93 + swing * 0.6) * 1000) / 1000,
    b: Math.round((0.88 + swing * 0.3) * 1000) / 1000,
  };
}

function placeBuildings(entry, road, occupied) {
  const rng = mulberry32(hash(entry.id));
  const placed = [];
  const blocks = reservedFor(entry);
  const alley = 1.7;
  function slotOk(box) {
    if (!inBlue(box.x0, box.x1, box.z0, box.z1)) return false;
    if (box.x0 < entry.x0 - 0.05 || box.x1 > entry.x1 + 1.05) return false;
    if (box.z0 < entry.z0 - 0.05 || box.z1 > entry.z1 + 1.05) return false;
    if (hitsRoad(road, box.x0, box.x1, box.z0, box.z1)) return false;
    if (blocks.some((keep) => overlaps(box, keep, 0.05))) return false;
    if (occupied.some((other) => overlaps(box, other, 0.15))) return false;
    return true;
  }
  function push(item, face, scale, cx, cz) {
    const foot = footprint(item.file, scale, face);
    const box = { x0: cx - foot.w / 2, x1: cx + foot.w / 2, z0: cz - foot.d / 2, z1: cz + foot.d / 2, file: item.file, face };
    if (!slotOk(box)) return false;
    const wobble = (rng() * 2 - 1) * (2.4 * Math.PI / 180);
    occupied.push(box);
    placed.push({
      kind: "building",
      file: item.file,
      x: Math.round((cx - 0.5) * 1000) / 1000,
      z: Math.round((cz - 0.5) * 1000) / 1000,
      y: 0,
      yaw: Math.round((yawFor(face) + wobble) * 10000) / 10000,
      scale: Math.round(scale * 1000) / 1000,
      tint: item.skin ? mildTint(rng) : TINTS[Math.floor(rng() * TINTS.length)],
      skin: skinFile(item.file, item.skin),
      lot: entry.id,
      unit: Math.round(foot.unit * 1000) / 1000,
      face,
    });
    return true;
  }
  function scan(face, item, scale, useAlley) {
    const foot = footprint(item.file, scale, face);
    const horizontal = face === "north" || face === "south";
    const span0 = horizontal ? entry.x0 + 0.2 : entry.z0 + 0.2;
    const span1 = horizontal ? entry.x1 + 1 - 0.2 : entry.z1 + 1 - 0.2;
    const edge = face === "south" ? entry.z1 + 1 : face === "north" ? entry.z0 : face === "east" ? entry.x1 + 1 : entry.x0;
    const inward = face === "south" || face === "east" ? -1 : 1;
    const cross = horizontal ? foot.d : foot.w;
    const along = horizontal ? foot.w : foot.d;
    const centerCross = edge + inward * (SETBACK + cross / 2);
    let regions = [{ a: span0, b: span1 }];
    if (useAlley && face === entry.face) {
      regions = regions.flatMap((region) => {
        if (region.b - region.a < along + alley) return [region];
        return [{ a: region.a, b: region.b - alley }];
      });
    }
    const fromEnd = entry.id === "L08" && face === "east";
    for (const region of regions) {
      const start = fromEnd ? region.b - along : region.a;
      const step = fromEnd ? -0.4 : 0.4;
      for (let cursor = start; fromEnd ? cursor >= region.a - 0.02 : cursor + along <= region.b + 0.02; cursor += step) {
        const alongCenter = cursor + along / 2;
        const cx = horizontal ? alongCenter : centerCross;
        const cz = horizontal ? centerCross : alongCenter;
        if (push(item, face, scale, cx, cz)) return true;
      }
    }
    return false;
  }
  entry.buildings.forEach((item, index) => {
    const scale = 0.95 + rng() * 0.13;
    const faces = entry.faces;
    let done = false;
    for (const tryScale of [scale, 0.95]) {
      for (let turn = 0; turn < faces.length && !done; turn += 1) {
        const face = faces[(index + turn) % faces.length];
        if (scan(face, item, tryScale, true)) done = true;
      }
    }
    if (!done) {
      const face = entry.face;
      const cx = (entry.x0 + entry.x1 + 1) / 2;
      const cz = (entry.z0 + entry.z1 + 1) / 2;
      if (!push(item, face, 0.95, cx, cz)) {
        placed.push({ kind: "building", file: item.file, missing: true, lot: entry.id });
      }
    }
  });
  return placed.filter((item) => !item.missing);
}

const FENCES = [
  "assets/fences/metal_fence/gate.glb",
  "assets/fences/metal_fence/metal_fence_gate_with_gate.glb",
  "assets/fences/metal_fence/metalfence_both_sides_no_topbar.glb",
  "assets/fences/metal_fence/metalfence_both_sides_topbar.glb",
  "assets/fences/metal_fence/metalfence_gate_only_sides.glb",
  "assets/fences/metal_fence/metalfence_one_side_no_topbar.glb",
  "assets/fences/metal_fence/metalfence_one_side_topbar.glb",
  "assets/fences/plackard_wall/plackard_broken.glb",
  "assets/fences/plackard_wall/plackard_broken_alt.glb",
  "assets/fences/plackard_wall/plackard_broken_slanted.glb",
  "assets/fences/plackard_wall/plackard_closed.glb",
  "assets/fences/plackard_wall/plackard_closed_full.glb",
  "assets/fences/plackard_wall/plackard_corner.glb",
  "assets/fences/plackard_wall/plackard_corner_closed.glb",
  "assets/fences/plackard_wall/plackard_corner_closed_alt.glb",
  "assets/fences/plackard_wall/plackard_corner_open.glb",
  "assets/fences/plackard_wall/plackard_corner_open_90.glb",
  "assets/fences/plackard_wall/plackard_corner_open_90_alt.glb",
  "assets/fences/plackard_wall/plackard_corner_open_alt.glb",
  "assets/fences/plackard_wall/plackard_open.glb",
  "assets/fences/plackard_wall/plackard_open_alt.glb",
  "assets/fences/plackard_wall/plackard_open_alt2.glb",
  "assets/fences/plackard_wall/plackard_open_patched.glb",
  "assets/fences/plackard_wall/plackard_slab_boken.glb",
  "assets/fences/plackard_wall/plackard_slab_broken_alt.glb",
  "assets/fences/plackard_wall/plackard_slab_chipped.glb",
  "assets/fences/plackard_wall/plackard_slab_chipped_alt.glb",
  "assets/fences/plackard_wall/plackard_slab_full.glb",
  "assets/fences/plackard_wall/plackard_slab_half.glb",
  "assets/fences/plackard_wall/plackard_slab_single.glb",
  "assets/fences/plackard_wall/plackard_slab_wood_patched.glb",
  "assets/fences/low_wooden_fence/wooden_fence_beam.glb",
  "assets/fences/low_wooden_fence/wooden_fence_beam_alt.glb",
  "assets/fences/low_wooden_fence/wooden_fence_beam_alt_2.glb",
  "assets/fences/low_wooden_fence/wooden_fence_broken.glb",
  "assets/fences/low_wooden_fence/wooden_fence_broken_alt.glb",
  "assets/fences/low_wooden_fence/wooden_fence_broken_alt2.glb",
  "assets/fences/low_wooden_fence/wooden_fence_closed.glb",
  "assets/fences/low_wooden_fence/wooden_fence_oen_crossed.glb",
  "assets/fences/low_wooden_fence/wooden_fence_open.glb",
  "assets/fences/low_wooden_fence/wooden_fence_open_alt.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pile.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pole.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pole_alt.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pole_alt_2.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pole_broken_large.glb",
  "assets/fences/low_wooden_fence/wooden_fence_pole_broken_small.glb",
  "assets/fences/brick_fence/brick_Wall_corner.glb",
  "assets/fences/brick_fence/brick_wall.glb",
  "assets/fences/brick_fence/brick_wall_gate.glb",
  "assets/fences/brick_fence/brick_wall_one_overhang.glb",
  "assets/fences/brick_fence/brick_wall_one_overhang_small.glb",
  "assets/fences/brick_fence/brick_wall_pole.glb",
  "assets/fences/brick_fence/brick_wall_small.glb",
  "assets/fences/plaster_wall/gate_handle.glb",
  "assets/fences/plaster_wall/plaster_wall.glb",
  "assets/fences/plaster_wall/plaster_wall_column.glb",
  "assets/fences/plaster_wall/plaster_wall_column_fancy.glb",
  "assets/fences/plaster_wall/plaster_wall_fenced.glb",
  "assets/fences/plaster_wall/plaster_wall_half.glb",
  "assets/fences/plaster_wall/plaster_wall_half_fenced.glb",
  "assets/fences/plaster_wall/plastic_gate_left.glb",
  "assets/fences/plaster_wall/plastic_gate_right.glb",
];

const PARTS = [
  "AC_Unit.glb", "AC_Unitx4.glb", "Balcony.glb", "Bricks_Half.glb", "Bricks_Large.glb",
  "Bricks_LeftStraight.glb", "Bricks_RightStraight.glb", "Bricks_Single.glb", "Bricks_Small.glb",
  "Door1.glb", "Door2.glb", "Door3.glb", "Door4.glb", "Door5.glb", "Door_Double.glb",
  "Door_Window.glb", "Door_Window2.glb", "Pipe_L.glb", "Pipe_Straight.glb", "Pipe_Straight_Short.glb",
  "Staircase.glb", "Stairs_Roof.glb", "Window.glb", "Window_Double.glb", "Window_Double_Roof.glb", "Window_Roof.glb",
].map((name) => PART + name);

const SIGNS = ["Sign_Bakery.glb", "Sign_Barbershop.glb", "Sign_Bookshop.glb", "Sign_Hardware.glb", "Sign_Pharmacy.glb"].map((name) => PART + name);

const RETRO_PROPS = [
  "detail-dumpster-closed.glb", "detail-dumpster-open.glb", "pallet.glb", "pallet-small.glb", "planks.glb",
  "detail-bench.glb", "detail-barrier-strong-damaged.glb", "detail-barrier-type-a.glb", "detail-barrier-type-b.glb",
  "detail-block.glb", "detail-bricks-type-a.glb", "detail-bricks-type-b.glb", "truck-flat.glb", "truck-grey.glb",
].map((name) => RET + name);

const RETRO_PARTS = [
  "balcony-ladder-bottom.glb", "balcony-ladder-top.glb", "balcony-type-a.glb", "detail-awning-small.glb",
  "detail-awning-wide.glb", "detail-cables-type-a.glb", "detail-cables-type-b.glb", "detail-beam.glb",
  "detail-light-double.glb", "detail-light-single.glb", "detail-light-traffic.glb", "roof-metal-poles.glb",
  "roof-metal-type-a.glb", "roof-metal-type-b.glb", "scaffolding-floor.glb", "scaffolding-poles.glb",
  "scaffolding-structure.glb", "wall-broken-type-a.glb", "wall-broken-type-b.glb", "wall-fence.glb",
  "window-small-type-a.glb", "window-small-type-b.glb", "window-wide-type-a.glb", "window-wide-type-b.glb",
  "window-wide-type-c.glb", "window-wide-type-d.glb", "door-type-a.glb", "door-type-b.glb",
].map((name) => RET + name);

const KAY_PROPS = [
  "bench.glb", "box_A.glb", "box_B.glb", "bush.glb", "dumpster.glb", "firehydrant.glb", "streetlight.glb",
  "trafficlight_A.glb", "trafficlight_B.glb", "trafficlight_C.glb", "trash_A.glb", "trash_B.glb", "watertower.glb",
].map((name) => PROP + name);

const COMMON_CARS = ["sedan-L2", "sedan-L3", "hatchback-sports-L2", "suv-L2", "suv-L3", "taxi-L2", "taxi-L3", "van-L2", "van-L3", "delivery-L2", "delivery-L3", "truck-L2", "truck-L3", "sedan-sports-L2", "suv-luxury-L2", "suv-luxury-L3"];
const RARE_CARS = ["ambulance-L3", "police-L3", "firetruck-L3", "garbage-truck-L3"];
const YARD = ["overgrown-grass.glb", "patchy-grass.glb", "bare-dirt.glb", "stained-concrete.glb", "asphalt-oil.glb", "asphalt-worn.glb", "dry-grass.glb", "gravel.glb", "cracked-mud.glb", "muddy-ground.glb", "concrete-dirty.glb", "mossy-concrete.glb"];
const TUFTS = ["tiny-grass-03.glb", "tiny-grass-04.glb", "tiny-grass-05.glb", "tiny-grass-06.glb", "tiny-grass-07.glb", "tiny-grass-08.glb", "tiny-grass-09.glb", "tiny-grass-10.glb", "tiny-grass-11.glb", "tiny-grass-12.glb", "tiny-grass-19.glb"];

let fenceCursor = 0;
let partCursor = 0;
let retroCursor = 0;
let retroPartCursor = 0;
let carCursor = 0;
let rareCursor = 0;
let propCursor = 0;

function take(list, cursorName) {
  const value = list[cursorName.i % list.length];
  cursorName.i += 1;
  return value;
}
const cursors = {
  fence: { i: 0 },
  part: { i: 0 },
  retro: { i: 0 },
  retroPart: { i: 0 },
  car: { i: 0 },
  rare: { i: 0 },
  prop: { i: 0 },
};

function dressRecord(kind, file, entry, cx, cz, yaw, scale, rng) {
  const unit = kind === "ground" ? TILE : unitFor(file);
  const retroScale = isRetro(file) ? Math.min(scale, 0.35) : scale;
  return {
    kind,
    file,
    x: Math.round((cx - 0.5) * 1000) / 1000,
    z: Math.round((cz - 0.5) * 1000) / 1000,
    y: 0,
    yaw: Math.round(yaw * 10000) / 10000,
    scale: Math.round(retroScale * 1000) / 1000,
    tint: kind === "ground" ? mildTint(rng) : (kind === "prop" && isCar(file) ? TINTS[Math.floor(rng() * TINTS.length)] : mildTint(rng)),
    skin: null,
    lot: entry.id,
    unit: Math.round(unit * 1000) / 1000,
    texture: kind === "ground" ? `assets/textures/ground/pieces/${file.replace(".glb", ".png")}` : null,
  };
}

function dressLot(entry, road, occupied, buildings) {
  const rng = mulberry32(hash(`${entry.id}:dress`));
  const out = [];
  const blocks = reservedFor(entry);
  function free(box) {
    if (!inBlue(box.x0, box.x1, box.z0, box.z1)) return false;
    if (box.x0 < entry.x0 + 0.05 || box.x1 > entry.x1 + 0.95) return false;
    if (box.z0 < entry.z0 + 0.05 || box.z1 > entry.z1 + 0.95) return false;
    if (hitsRoad(road, box.x0, box.x1, box.z0, box.z1)) return false;
    if (blocks.some((keep) => overlaps(box, keep, 0.02))) return false;
    if (occupied.some((other) => overlaps(box, other, 0.05))) return false;
    return true;
  }
  function drop(kind, file, face, scale, cx, cz, yawExtra = 0) {
    const unit = kind === "ground" ? TILE : unitFor(file);
    const used = isRetro(file) ? Math.min(scale, 0.35) : scale;
    const box = kind === "ground" ? { w: 1, d: 1 } : boundsOf(file);
    const worldW = box.w * unit * (kind === "ground" ? 1 : used);
    const worldD = box.d * unit * (kind === "ground" ? 1 : used);
    const swap = face === "east" || face === "west";
    const w = (swap ? worldD : worldW) / TILE;
    const d = (swap ? worldW : worldD) / TILE;
    const rect = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
    if (kind !== "ground" && !free(rect)) return false;
    if (kind === "ground" && (hitsRoad(road, rect.x0, rect.x1, rect.z0, rect.z1) || !inBlue(rect.x0, rect.x1, rect.z0, rect.z1))) return false;
    if (kind !== "ground") occupied.push(rect);
    out.push(dressRecord(kind, file, entry, cx, cz, yawFor(face) + yawExtra, scale, rng));
    return true;
  }
  if (entry.id === "L30") {
    drop("prop", `${CAR}sedan-L2.glb`, "south", 1, 70.2, 237.2, 0.12);
    drop("prop", `${CAR}hatchback-sports-L2.glb`, "south", 1, 73.2, 237.3, -0.1);
    drop("prop", `${CAR}van-L3.glb`, "south", 1, 76.4, 237.4, 0.2);
    drop("fence", "assets/fences/metal_fence/metalfence_both_sides_no_topbar.glb", "south", 1, 71.5, 236.3);
    drop("prop", `${PROP}dumpster.glb`, "east", 1, 77.6, 236.5);
    drop("prop", `${PROP}trash_A.glb`, "south", 1, 75.2, 236.4);
  }
  if (entry.id === "L19") {
    drop("prop", `${CAR}sedan-L3.glb`, "west", 1, 74.2, 217.4, 0.08);
    drop("prop", `${PROP}dumpster.glb`, "west", 1, 76.5, 218.2);
    drop("fence", "assets/fences/low_wooden_fence/wooden_fence_broken.glb", "west", 1, 72.4, 216.6);
    drop("prop", `${PROP}bush.glb`, "west", 1, 71.2, 220.2);
  }
  if (entry.id === "L04") {
    drop("fence", "assets/fences/metal_fence/metalfence_both_sides_topbar.glb", "south", 1, 80.2, 163.4);
    drop("ground", "overgrown-grass.glb", "south", 1, 80.2, 164.2);
    drop("prop", `${PROP}bush.glb`, "south", 1, 78.4, 163.8);
  }
  const yard = entry.kind === "alley" || entry.kind === "waste" ? YARD.slice(0, 6) : YARD;
  for (let z = entry.z0; z <= entry.z1; z += 1) {
    for (let x = entry.x0; x <= entry.x1; x += 1) {
      const street =
        (entry.faces.includes("west") && x <= entry.x0) ||
        (entry.faces.includes("east") && x >= entry.x1) ||
        (entry.faces.includes("north") && z <= entry.z0) ||
        (entry.faces.includes("south") && z >= entry.z1);
      if (street && entry.kind !== "alley" && entry.kind !== "waste") continue;
      if ((x + z) % 2 === 1 && entry.width * entry.depth > 40) continue;
      const file = yard[(x * 3 + z + entry.x0) % yard.length];
      drop("ground", file, "south", 1, x + 0.5, z + 0.5);
      if ((x + z) % 9 === 0) drop("ground", TUFTS[(x + z) % TUFTS.length], "south", 1, x + 0.5, z + 0.5);
    }
  }
  const face = entry.face;
  const horizontal = face === "north" || face === "south";
  function nearFace(step) {
    if (face === "south") return { x: entry.x0 + 1.2 + step, z: entry.z1 + 1 - 1.15 };
    if (face === "north") return { x: entry.x0 + 1.2 + step, z: entry.z0 + 1.15 };
    if (face === "east") return { x: entry.x1 + 1 - 1.15, z: entry.z0 + 1.2 + step };
    return { x: entry.x0 + 1.15, z: entry.z0 + 1.2 + step };
  }
  if (entry.kind !== "alley") {
    const carName = entry.kind === "waste" ? `${take(RARE_CARS.concat(COMMON_CARS.filter((name) => name.endsWith("L3"))), cursors.car)}` : take(COMMON_CARS, cursors.car);
    const car = `${CAR}${carName}.glb`;
    const spot = nearFace(1);
    const yawExtra = entry.kind === "waste" ? (rng() - 0.5) * 0.5 : (rng() - 0.5) * 0.08;
    drop("prop", car, face, entry.kind === "waste" ? 0.96 : 1, spot.x, spot.z, yawExtra);
    if (entry.width > 10) {
      const second = `${CAR}${take(COMMON_CARS, cursors.car)}.glb`;
      const spot2 = nearFace(4);
      drop("prop", second, face, 1, spot2.x, spot2.z, (rng() - 0.5) * 0.06);
    }
  }
  const dump = entry.id.charCodeAt(2) % 2 === 0 ? `${PROP}dumpster.glb` : take(RETRO_PROPS, cursors.retro);
  const alleyX = face === "east" || face === "west" ? (entry.x0 + entry.x1) / 2 : entry.x1 - 0.6;
  const alleyZ = face === "north" || face === "south" ? (entry.z0 + entry.z1) / 2 : entry.z1 - 0.6;
  drop("prop", dump, face, 1, alleyX, alleyZ);
  drop("prop", `${PROP}${entry.kind === "waste" ? "trash_B.glb" : "trash_A.glb"}`, face, 1, alleyX + 0.8, alleyZ);
  drop("prop", `${PROP}box_A.glb`, face, 1, alleyX - 0.7, alleyZ + 0.4);
  if (entry.kind === "fenced" || entry.kind === "boarded" || entry.kind === "terrace" || entry.kind === "kept") {
    const fence = entry.kind === "fenced" ? "assets/fences/metal_fence/metalfence_both_sides_topbar.glb" : take(FENCES, cursors.fence);
    const spot = nearFace(0.2);
    drop("fence", fence, face, 1, spot.x, spot.z);
    drop("fence", take(FENCES, cursors.fence), face, 1, nearFace(2.2).x, nearFace(2.2).z);
  }
  if (entry.kind !== "waste") {
    drop("part", take(PARTS, cursors.part), face, 1, (entry.x0 + entry.x1) / 2, (entry.z0 + entry.z1) / 2 + 0.4);
    drop("part", take(RETRO_PARTS, cursors.retroPart), face, 1, (entry.x0 + entry.x1) / 2 + 1.1, (entry.z0 + entry.z1) / 2);
  }
  if (entry.depth >= 16 || entry.kind === "cluster" || entry.kind === "alley") {
    drop("part", `${RET}detail-cables-type-a.glb`, face, 1, (entry.x0 + entry.x1) / 2, (entry.z0 + entry.z1) / 2);
    drop("part", `${RET}detail-cables-type-b.glb`, "east", 1, (entry.x0 + entry.x1) / 2 + 0.4, (entry.z0 + entry.z1) / 2 + 0.6);
  }
  if (entry.id !== "L30" && rng() > 0.22) {
    drop("prop", `${PROP}streetlight.glb`, face, 1, entry.x0 + 0.8, entry.z0 + 0.8);
  }
  if (["L01", "L07", "L08", "L10", "L27", "L35"].includes(entry.id)) {
    drop("prop", `${PROP}firehydrant.glb`, face, 1, entry.x1 - 0.4, entry.z1 - 0.4);
  }
  if (entry.id === "L08") {
    const hardware = `${PART}Sign_Hardware.glb`;
    const spots = [[92.6, 191.0], [93.1, 187.4], [91.4, 190.2], [90.4, 188.6]];
    for (const [sx, sz] of spots) {
      if (drop("part", hardware, "east", 1, sx, sz)) break;
    }
    drop("part", `${PART}Sign_Pharmacy.glb`, "north", 1, 90.2, 175.5);
    drop("fence", "assets/fences/metal_fence/metalfence_both_sides_topbar.glb", "east", 1, 94.4, 189.2);
    drop("fence", "assets/fences/plaster_wall/plaster_wall_fenced.glb", "east", 1, 94.4, 188.2);
    drop("prop", `${PROP}bench.glb`, "south", 1, 93.2, 194.2);
    drop("prop", `${RET}detail-bench.glb`, "south", 1, 91.5, 194.5);
    drop("prop", `${PROP}trafficlight_A.glb`, "south", 1, 93.5, 198.2);
  }
  if (entry.id === "L35") drop("prop", `${PROP}watertower.glb`, "north", 0.8, 230, 244);
  if (entry.id === "L16c" || entry.id === "L25a" || entry.id === "L26") {
    drop("part", `${PART}AC_Unit.glb`, face, 1, buildings[0] ? buildings[0].x + 0.5 : entry.x0 + 2, buildings[0] ? buildings[0].z + 0.5 : entry.z0 + 2);
    drop("part", `${PART}Pipe_Straight.glb`, face, 1, (entry.x0 + entry.x1) / 2, (entry.z0 + entry.z1) / 2);
    drop("part", `${RET}detail-awning-small.glb`, face, 1, nearFace(2).x, nearFace(2).z);
  }
  if (entry.kind === "estate") {
    drop("prop", `${PROP}bush.glb`, face, 1, nearFace(2.5).x, nearFace(2.5).z);
    drop("ground", "overgrown-grass.glb", face, 1, nearFace(2.8).x, nearFace(2.8).z);
    drop("part", `${PART}Balcony.glb`, face, 1, (entry.x0 + entry.x1) / 2, entry.face === "north" ? entry.z0 + 2 : entry.z1 - 1);
  }
  if ((entry.id === "L30" || entry.id === "L19") && out.filter((piece) => piece.kind !== "ground").length < 3) {
    const extras = [
      [`${CAR}sedan-L2.glb`, "prop"],
      [`${CAR}hatchback-sports-L2.glb`, "prop"],
      [`${PROP}dumpster.glb`, "prop"],
      ["assets/fences/metal_fence/metalfence_one_side_topbar.glb", "fence"],
    ];
    let placedExtras = 0;
    for (let z = entry.z0 + 1; z <= entry.z1 - 1 && placedExtras < extras.length; z += 2) {
      for (let x = entry.x0 + 1; x <= entry.x1 - 1 && placedExtras < extras.length; x += 2) {
        const [file, kind] = extras[placedExtras];
        if (drop(kind, file, face, 0.9, x + 0.5, z + 0.5)) placedExtras += 1;
      }
    }
  }
  return out;
}

function pathJoinGround(file) {
  return path.join(root, "assets/textures/ground/pieces", file.replace(".glb", ".png"));
}

function scatterUnused(pieces, road, occupied) {
  const used = (kind) => new Set(pieces.filter((record) => record.kind === kind).map((record) => record.file));
  const cars = [...COMMON_CARS, ...RARE_CARS, "ambulance-L2", "police-L2", "firetruck-L2", "garbage-truck-L2"].map((name) => `${CAR}${name}.glb`);
  const wanted = [
    ...FENCES.map((file) => ({ kind: "fence", file, scale: 1 })),
    ...cars.map((file) => ({ kind: "prop", file, scale: 1 })),
    ...PARTS.map((file) => ({ kind: "part", file, scale: 1 })),
    ...RETRO_PARTS.map((file) => ({ kind: "part", file, scale: 0.3 })),
    ...RETRO_PROPS.map((file) => ({ kind: "prop", file, scale: 0.3 })),
    ...KAY_PROPS.map((file) => ({ kind: "prop", file, scale: 1 })),
  ];
  const seen = {
    fence: used("fence"),
    part: used("part"),
    prop: used("prop"),
  };
  let lotCursor = 0;
  for (const item of wanted) {
    if (seen[item.kind].has(item.file)) continue;
    let placed = false;
    for (let n = 0; n < LOTS.length && !placed; n += 1) {
      const entry = LOTS[(lotCursor + n) % LOTS.length];
      if (entry.kind === "alley" && item.kind === "prop" && item.file.includes("watertower")) continue;
      const rng = mulberry32(hash(`${entry.id}:${item.file}`));
      for (let z = entry.z0 + 1; z <= entry.z1 - 1 && !placed; z += 2) {
        for (let x = entry.x0 + 1; x <= entry.x1 - 1 && !placed; x += 2) {
          const face = entry.face;
          const unit = unitFor(item.file);
          const box = boundsOf(item.file);
          const usedScale = isRetro(item.file) ? Math.min(item.scale, 0.35) : item.scale;
          const swap = face === "east" || face === "west";
          const w = ((swap ? box.d : box.w) * unit * usedScale) / TILE;
          const d = ((swap ? box.w : box.d) * unit * usedScale) / TILE;
          const cx = x + 0.5;
          const cz = z + 0.5;
          const rect = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
          const blocks = reservedFor(entry);
          const ok = inBlue(rect.x0, rect.x1, rect.z0, rect.z1)
            && rect.x0 >= entry.x0 && rect.x1 <= entry.x1 + 1
            && rect.z0 >= entry.z0 && rect.z1 <= entry.z1 + 1
            && !hitsRoad(road, rect.x0, rect.x1, rect.z0, rect.z1)
            && !blocks.some((keep) => overlaps(rect, keep, 0.05))
            && !occupied.some((other) => overlaps(rect, other, 0.08));
          if (!ok) continue;
          occupied.push(rect);
          pieces.push(dressRecord(item.kind, item.file, entry, cx, cz, yawFor(face) + (rng() - 0.5) * 0.08, usedScale, rng));
          seen[item.kind].add(item.file);
          placed = true;
          lotCursor = (lotCursor + n + 1) % LOTS.length;
        }
      }
    }
  }
}

function checkAssets() {
  const files = new Set();
  for (const entry of LOTS) for (const item of entry.buildings) files.add(item.file);
  for (const file of [...FENCES, ...PARTS, ...SIGNS, ...RETRO_PROPS, ...RETRO_PARTS, ...KAY_PROPS]) files.add(file);
  for (const name of [...COMMON_CARS, ...RARE_CARS]) files.add(`${CAR}${name}.glb`);
  for (const name of [...YARD, ...TUFTS, "cracked-pavement.glb", "asphalt-patched.glb", "asphalt-plain.glb", "dried-mud.glb", "pitted-concrete.glb", "concrete-cracked.glb", "grimy-tiles.glb", "tan-cracked-pavement.glb"]) {
    files.add(path.join(root, "assets/textures/ground/pieces", name.replace(".glb", ".png")));
  }
  const missing = [];
  for (const file of files) {
    const abs = file.startsWith("assets/") ? path.join(root, file) : file;
    if (!fs.existsSync(abs)) missing.push(file.replace(root + path.sep, ""));
  }
  if (missing.length) {
    console.error("Missing files", missing.length);
    for (const file of missing) console.error(file);
    process.exit(1);
  }
}

function pieceBox(record) {
  const face = record.face || "south";
  const foot = record.kind === "ground"
    ? { w: record.scale, d: record.scale }
    : footprint(record.file, record.scale, face);
  const cx = record.x + 0.5;
  const cz = record.z + 0.5;
  return { x0: cx - foot.w / 2, x1: cx + foot.w / 2, z0: cz - foot.d / 2, z1: cz + foot.d / 2, file: record.file, lot: record.lot, face, skin: record.skin };
}

function main() {
  if (LOTS.length !== 61) {
    console.error("Expected 61 lots, found", LOTS.length);
    process.exit(1);
  }
  repairMeshes();
  checkAssets();
  const { road } = loadRoads();
  const occupied = [];
  const pieces = [];
  for (const entry of LOTS) {
    const buildings = placeBuildings(entry, road, occupied);
    pieces.push(...buildings);
    pieces.push(...dressLot(entry, road, occupied, buildings));
  }
  scatterUnused(pieces, road, occupied);
  const byLot = new Map(LOTS.map((entry) => [entry.id, { buildings: [], props: 0, ground: 0, fences: 0, parts: 0 }]));
  const violations = [];
  for (const record of pieces) {
    const box = pieceBox(record);
    const bucket = byLot.get(record.lot);
    if (record.kind === "building") bucket.buildings.push(record);
    else if (record.kind === "ground") bucket.ground += 1;
    else if (record.kind === "fence") bucket.fences += 1;
    else if (record.kind === "part") bucket.parts += 1;
    else bucket.props += 1;
    const cx = record.x + 0.5;
    const cz = record.z + 0.5;
    const blue = cz >= 152 && cx < 248;
    const green = cz < 152 && cx >= 220;
    const yellow = cz < 148 && cx < 230;
    const red = cx >= 248;
    const roadHit = hitsRoad(road, box.x0, box.x1, box.z0, box.z1);
    if (!blue || green || yellow || red || roadHit) {
      violations.push({ lot: record.lot, file: record.file, blue, green, yellow, red, roadHit });
    }
  }
  const meshSet = new Set();
  const skinSet = new Set();
  for (const record of pieces) {
    if (record.kind !== "building") continue;
    meshSet.add(record.file);
    if (record.skin) skinSet.add(record.skin);
  }
  const adjacentDupes = [];
  const buildingBoxes = pieces.filter((record) => record.kind === "building").map(pieceBox);
  for (let i = 0; i < buildingBoxes.length; i += 1) {
    for (let j = i + 1; j < buildingBoxes.length; j += 1) {
      const a = buildingBoxes[i];
      const b = buildingBoxes[j];
      if (a.file !== b.file) continue;
      if (!overlaps(a, b, 1.2)) continue;
      adjacentDupes.push(`${a.lot}/${b.lot} ${path.basename(a.file)}`);
    }
  }
  const skinDupes = [];
  for (let i = 0; i < buildingBoxes.length; i += 1) {
    for (let j = i + 1; j < buildingBoxes.length; j += 1) {
      const a = buildingBoxes[i];
      const b = buildingBoxes[j];
      if (!a.skin || a.skin !== b.skin) continue;
      if (!overlaps(a, b, 1.2)) continue;
      skinDupes.push(`${a.lot}/${b.lot} ${path.basename(a.skin)}`);
    }
  }
  let filled = 0;
  const lines = [];
  for (const entry of LOTS) {
    const bucket = byLot.get(entry.id);
    const dressed = bucket.ground + bucket.props + bucket.fences + bucket.parts > 0;
    const ok = entry.buildings.length === 0 ? dressed : bucket.buildings.length > 0 && dressed;
    if (ok) filled += 1;
    const names = bucket.buildings.map((record) => `${path.basename(record.file)}${record.skin ? ":" + path.basename(record.skin, ".jpg") : ""}`);
    lines.push(`${entry.id} ${entry.x0},${entry.z0}-${entry.x1},${entry.z1} ${entry.kind} buildings[${names.join(", ")}] props=${bucket.props} fences=${bucket.fences} parts=${bucket.parts} ground=${bucket.ground} yard=${entry.depth >= 12} alley=${entry.faces.length > 1 || entry.kind === "alley"} market=${entry.kind === "market"}`);
  }
  const lotsDoc = {
    tile: TILE,
    seed: SEED,
    count: LOTS.length,
    lots: LOTS.map((entry) => ({
      id: entry.id,
      x0: entry.x0,
      x1: entry.x1,
      z0: entry.z0,
      z1: entry.z1,
      width: entry.width,
      depth: entry.depth,
      centroid: entry.centroid,
      kind: entry.kind,
      face: entry.face,
      kept: entry.kept,
      buildings: entry.buildings.map((item) => ({ file: item.file, skin: item.skin })),
    })),
  };
  const zoneDoc = { tile: TILE, seed: SEED, pieces };
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data/blue-zone-lots.json"), JSON.stringify(lotsDoc, null, 2));
  fs.writeFileSync(path.join(root, "data/blue-zone.json"), JSON.stringify(zoneDoc));
  console.log(`lots ${filled}/${LOTS.length} filled`);
  console.log(`distinct building meshes ${meshSet.size}`);
  console.log(`distinct skins ${skinSet.size}`);
  console.log(`adjacent mesh dupes ${adjacentDupes.length}`);
  console.log(`adjacent skin dupes ${skinDupes.length}`);
  console.log(`zone/road violations ${violations.length}`);
  console.log(`pieces ${pieces.length}`);
  for (const line of lines) console.log(line);
  if (adjacentDupes.length) console.log(adjacentDupes.slice(0, 30).join("\n"));
  if (violations.length) console.log(JSON.stringify(violations.slice(0, 12), null, 2));
  const expected = 40;
  if (filled !== 61 || meshSet.size < 10 || adjacentDupes.length || violations.length || skinDupes.length) process.exit(1);
  if (meshSet.size < expected) {
    console.error("mesh pool short", meshSet.size, "of", expected);
    process.exit(1);
  }
}

main();
