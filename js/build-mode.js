import {
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AO_SKIP_LAYER, TILE } from "./constants.js";
import { KITS } from "./kenney-city-catalog.js";
import { roadKey, roadRecord } from "./kenney-roads.js";

// One Kenney unit is the same 4-tile module as the road pieces already on
// the west bank. Scale is uniform so a building keeps the height in the file.
// The suburban kit asks for nearest filtering; draw it with linear filtering
// and leave the file alone.
const UNIT = 4 * TILE;
const GROUND_Y = 0.2;
const MAP_URL = "./west-map.json";
const STORAGE_KEY = "west-map";
const SCALE_STEP = 0.25;
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;
const VIEW_MIN = 0.5;
const VIEW_MAX = 3;

const catalog = new Map();
for (const kit of KITS) {
  for (const item of kit.files) catalog.set(`${kit.id}/${item.file}`, item);
}

// Registered while this module loads, before main.js binds walking keys.
// On window, capture and bubble listeners share one target, so this has to
// run first and stop the event. S stays free so it can walk south.
// Swedish layout: the + key grows the piece and 0 shrinks it.
function brushScale(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (event.key === "+" || event.code === "NumpadAdd") return 1;
  if (event.key === "0") return -1;
  return 0;
}

const keys = {
  enabled: () => false,
  onB: () => {},
  onR: () => {},
  onP: () => {},
  onX: () => {},
  onF: () => {},
  onScale: () => {},
};
let searchInput = null;
window.addEventListener("keydown", (event) => {
  // Keys typed into the piece search must not walk, save, rotate, resize, or mirror.
  if (searchInput && event.target === searchInput) return;
  if (event.repeat) return;
  if (event.code === "KeyB") {
    event.preventDefault();
    event.stopImmediatePropagation();
    keys.onB();
    return;
  }
  if (!keys.enabled()) return;
  const direction = brushScale(event);
  if (event.code !== "KeyR" && event.code !== "KeyP" && event.code !== "KeyX" && event.code !== "KeyF" && direction === 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "KeyR") keys.onR();
  else if (event.code === "KeyP") keys.onP();
  else if (event.code === "KeyX") keys.onX();
  else if (event.code === "KeyF") keys.onF();
  else keys.onScale(direction);
}, true);

function modelUrl(path) {
  return new URL(`../${path}`, import.meta.url).href;
}

function linearize(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
        const tex = mat[key];
        if (!tex) continue;
        tex.magFilter = LinearFilter;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
      }
    }
  });
}

function ghost(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.transparent = true;
      copy.opacity = 0.55;
      copy.depthWrite = false;
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = false;
    obj.receiveShadow = false;
    // The preview is transparent. The occlusion pass would otherwise treat it as solid.
    obj.layers.set(AO_SKIP_LAYER);
  });
}

function disposeGhost(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) mat.dispose();
  });
  root.removeFromParent();
}

function layoutFrom(data) {
  return {
    pieces: Array.isArray(data?.pieces) ? data.pieces : [],
    removedRoads: Array.isArray(data?.removedRoads) ? data.removedRoads : [],
  };
}

function readStoredLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return layoutFrom(data);
  } catch {
    return null;
  }
}

export async function loadWestMap() {
  const stored = readStoredLayout();
  if (stored) return stored;
  let data = null;
  try {
    const response = await fetch(MAP_URL);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  return layoutFrom(data);
}

export async function createBuildMode({ scene, camera, canvas, map, saved = null, roads = null }) {
  const group = new Group();
  group.name = "west-build";
  scene.add(group);

  const loader = new GLTFLoader();
  const templates = new Map();
  const pieces = [];
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();

  let enabled = false;
  let turn = 0;
  let scale = 1;
  let mirror = false;
  let selection = null;
  let preview = null;
  let carrying = null;
  let selectToken = 0;
  let hover = null;
  let pointerAt = null;

  const panel = document.createElement("aside");
  panel.id = "build-panel";
  panel.hidden = true;
  const info = document.createElement("p");
  info.id = "build-info";
  info.textContent = "BUILD MODE\nClick = place\nClick placed piece = move\nX = remove\nR = rotate\n+ / 0 = bigger / smaller\nF = mirror\nP = save\nWASD = walk\nSearch = type to find pieces\nMouse wheel = zoom";
  const search = document.createElement("input");
  search.id = "build-search";
  search.type = "search";
  search.placeholder = "Search pieces";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.setAttribute("aria-label", "Search pieces");
  searchInput = search;
  search.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  search.addEventListener("input", () => filterPieces());
  const list = document.createElement("div");
  list.id = "build-kits";
  panel.append(info, search, list);
  document.body.append(panel);

  for (const kit of KITS) {
    const heading = document.createElement("h2");
    heading.textContent = kit.label;
    list.append(heading);
    for (const item of kit.files) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.file.replace(/\.glb$/, "");
      button.dataset.kit = kit.id;
      button.dataset.file = item.file;
      button.addEventListener("click", () => {
        select(kit.id, item.file);
      });
      list.append(button);
    }
  }

  function filterPieces() {
    const query = search.value.trim().toLowerCase();
    let heading = null;
    let shown = 0;
    for (const child of list.children) {
      if (child.tagName === "H2") {
        if (heading) heading.hidden = shown === 0;
        heading = child;
        shown = 0;
        continue;
      }
      const match = query === "" || child.textContent.toLowerCase().includes(query);
      child.hidden = !match;
      if (match) shown += 1;
    }
    if (heading) heading.hidden = shown === 0;
  }

  function status() {}

  function loadTemplate(kit, file) {
    const key = `${kit}/${file}`;
    const item = catalog.get(key);
    if (!item) return Promise.reject(new Error(`Unknown piece ${key}`));
    const cached = templates.get(key);
    if (cached?.isObject3D) return Promise.resolve(cached);
    if (cached) return cached;
    const pending = loader.loadAsync(modelUrl(item.url)).then((gltf) => {
      linearize(gltf.scene);
      templates.set(key, gltf.scene);
      return gltf.scene;
    }).catch((error) => {
      if (templates.get(key) === pending) templates.delete(key);
      throw error;
    });
    templates.set(key, pending);
    return pending;
  }

  function applyScale(root, pieceScale, flipped) {
    const size = UNIT * pieceScale;
    root.scale.set(flipped ? -size : size, size, size);
  }

  function wrapper(template, spec) {
    const root = new Group();
    root.add(template.clone(true));
    applyScale(root, spec.scale ?? 1, spec.mirror === true);
    root.position.set((spec.x + 0.5) * TILE, GROUND_Y, (spec.z + 0.5) * TILE);
    root.rotation.y = spec.turn * Math.PI / 2;
    return root;
  }

  function addPiece(spec, template) {
    if (!template?.isObject3D) return null;
    const record = {
      kit: spec.kit,
      file: spec.file,
      x: spec.x,
      z: spec.z,
      turn: spec.turn,
      scale: spec.scale ?? 1,
      mirror: spec.mirror === true,
    };
    const root = wrapper(template, record);
    root.userData.piece = record;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    group.add(root);
    pieces.push(record);
    return root;
  }

  function normalize(raw) {
    if (!raw || typeof raw.kit !== "string" || typeof raw.file !== "string") return null;
    if (!catalog.has(`${raw.kit}/${raw.file}`)) return null;
    if (!Number.isInteger(raw.x) || !Number.isInteger(raw.z) || !Number.isInteger(raw.turn)) return null;
    if (raw.x < 0 || raw.z < 0 || raw.x >= map.cols || raw.z >= map.rows) return null;
    const turnValue = ((raw.turn % 4) + 4) % 4;
    const scaleValue = raw.scale == null ? 1 : Number(raw.scale);
    if (!Number.isFinite(scaleValue) || scaleValue <= 0) return null;
    return {
      kit: raw.kit,
      file: raw.file,
      x: raw.x,
      z: raw.z,
      turn: turnValue,
      scale: Math.round(scaleValue * 1000) / 1000,
      mirror: raw.mirror === true,
    };
  }

  const layout = saved || await loadWestMap();
  const removedRoads = [];
  const removedKeys = new Set();
  for (const raw of layout.removedRoads) {
    const record = roadRecord(raw);
    if (!record) continue;
    const key = roadKey(record);
    if (removedKeys.has(key)) continue;
    removedKeys.add(key);
    removedRoads.push(record);
  }

  async function loadSaved() {
    for (const raw of layout.pieces) {
      const spec = normalize(raw);
      if (!spec) continue;
      let template = null;
      try {
        template = await loadTemplate(spec.kit, spec.file);
      } catch {
        continue;
      }
      addPiece(spec, template);
    }
  }

  function dropPreview() {
    if (!preview) return;
    disposeGhost(preview);
    preview = null;
  }

  function clearSelection() {
    selection = null;
    for (const button of list.querySelectorAll("button")) button.classList.remove("is-selected");
    selectToken += 1;
    dropPreview();
  }

  function rootFor(record) {
    for (const child of group.children) {
      if (child.userData.piece === record) return child;
    }
    return null;
  }

  function moveCarried(cell) {
    if (!carrying || !cell) return;
    carrying.record.x = cell.x;
    carrying.record.z = cell.z;
    carrying.root.position.set((cell.x + 0.5) * TILE, GROUND_Y, (cell.z + 0.5) * TILE);
  }

  function dropCarried(cell) {
    if (!carrying) return;
    moveCarried(cell);
    carrying = null;
  }

  function pickUp(record, cell) {
    const root = rootFor(record);
    if (!root) return;
    carrying = { record, root };
    if (preview) preview.visible = false;
    moveCarried(cell);
  }

  async function showPreview() {
    const token = selectToken;
    if (!enabled || !selection) {
      dropPreview();
      return;
    }
    const template = await loadTemplate(selection.kit, selection.file);
    if (token !== selectToken || !enabled || !selection) return;
    dropPreview();
    const spec = hover || { x: 0, z: 0, turn };
    preview = wrapper(template, { ...spec, turn, scale, mirror });
    ghost(preview);
    preview.visible = hover !== null;
    scene.add(preview);
  }

  function select(kit, file) {
    if (carrying) dropCarried(hover);
    selection = { kit, file };
    for (const button of list.querySelectorAll("button")) {
      button.classList.toggle("is-selected", button.dataset.kit === kit && button.dataset.file === file);
    }
    const selected = list.querySelector("button.is-selected");
    selected?.scrollIntoView({ block: "nearest" });
    selectToken += 1;
    status("Build mode.");
    showPreview().catch(() => {
      status("That model failed to load.");
    });
  }

  function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(ground, hit)) return null;
    const x = Math.floor(hit.x / TILE);
    const z = Math.floor(hit.z / TILE);
    if (x < 0 || z < 0 || x >= map.cols || z >= map.rows) return null;
    return { x, z };
  }

  function movePreview(cell) {
    hover = cell;
    if (carrying) moveCarried(cell);
    if (!preview) return;
    if (!cell || carrying) {
      preview.visible = false;
      return;
    }
    preview.visible = true;
    preview.position.set((cell.x + 0.5) * TILE, GROUND_Y, (cell.z + 0.5) * TILE);
    preview.rotation.y = turn * Math.PI / 2;
  }

  async function place(cell) {
    if (!enabled || !selection || !cell) return;
    const chosen = selection;
    const placedTurn = turn;
    const placedScale = scale;
    const placedMirror = mirror;
    const token = selectToken;
    clearSelection();
    let template = null;
    try {
      template = await loadTemplate(chosen.kit, chosen.file);
    } catch {
      status("That model failed to load.");
      return;
    }
    if (!enabled || selectToken !== token + 1) return;
    addPiece({ ...chosen, x: cell.x, z: cell.z, turn: placedTurn, scale: placedScale, mirror: placedMirror }, template);
    status("Placed.");
  }

  function removeRecord(record) {
    const index = pieces.indexOf(record);
    if (index < 0) return false;
    pieces.splice(index, 1);
    if (carrying?.record === record) carrying = null;
    for (const child of [...group.children]) {
      if (child.userData.piece === record) child.removeFromParent();
    }
    status("Removed.");
    return true;
  }

  let removedAt = 0;
  const hiddenRoad = new Matrix4().makeTranslation(0, -1000, 0);

  function rememberRoad(record) {
    const savedRoad = roadRecord(record);
    if (!savedRoad) return;
    const key = roadKey(savedRoad);
    if (removedKeys.has(key)) return;
    removedKeys.add(key);
    removedRoads.push(savedRoad);
  }

  function pieceHit() {
    const hits = raycaster.intersectObjects(group.children, true);
    for (const item of hits) {
      let node = item.object;
      while (node && node !== group) {
        if (node.userData.piece) return { record: node.userData.piece, distance: item.distance };
        node = node.parent;
      }
    }
    return null;
  }

  function roadHit() {
    if (!roads) return null;
    const hits = raycaster.intersectObjects(roads.children, true);
    for (const item of hits) {
      const list = item.object.userData.pieces;
      const record = list?.[item.instanceId];
      if (!record || record.removed) continue;
      return { mesh: item.object, index: item.instanceId, record, distance: item.distance };
    }
    return null;
  }

  function removeAt(event) {
    const now = performance.now();
    if (now - removedAt < 80) return;
    removedAt = now;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const piece = pieceHit();
    const road = roadHit();
    if (piece && (!road || piece.distance <= road.distance)) {
      removeRecord(piece.record);
      return;
    }
    if (road) {
      road.record.removed = true;
      road.mesh.setMatrixAt(road.index, hiddenRoad);
      road.mesh.instanceMatrix.needsUpdate = true;
      rememberRoad(road.record);
      status("Removed road.");
      return;
    }
    const cell = cellAt(event);
    if (!cell) return;
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      if (pieces[i].x === cell.x && pieces[i].z === cell.z) {
        removeRecord(pieces[i]);
        return;
      }
    }
  }

  function download() {
    const body = `${JSON.stringify({ pieces, removedRoads }, null, 2)}\n`;
    try {
      localStorage.setItem(STORAGE_KEY, body);
    } catch {
      // The file download below still runs when storage is blocked.
    }
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "west-map.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status("Downloaded west-map.json.");
  }

  function setViewScale(next) {
    const current = Number.isFinite(next) && next > 0 ? next : 1;
    camera.userData.viewScale = Math.min(VIEW_MAX, Math.max(VIEW_MIN, current));
    camera.updateProjectionMatrix();
  }

  function wheelPixels(event) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  function setEnabled(next) {
    enabled = next;
    panel.hidden = !enabled;
    if (!enabled) {
      dropCarried(hover);
      dropPreview();
      hover = null;
      setViewScale(1);
      return;
    }
    status("Build mode.");
    if (selection) showPreview().catch(() => status("That model failed to load."));
  }

  function stepScale(direction) {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((scale + direction * SCALE_STEP) * 100) / 100));
    if (next === scale) return;
    scale = next;
    if (preview) applyScale(preview, scale, mirror);
    status(direction > 0 ? "Bigger." : "Smaller.");
  }

  keys.enabled = () => enabled;
  keys.onB = () => setEnabled(!enabled);
  keys.onR = () => {
    turn = (turn + 1) % 4;
    if (preview) preview.rotation.y = turn * Math.PI / 2;
    status("Rotated.");
  };
  keys.onF = () => {
    mirror = !mirror;
    if (preview) applyScale(preview, scale, mirror);
  };
  keys.onP = () => download();
  keys.onX = () => {
    if (!pointerAt) return;
    removeAt(pointerAt);
  };
  keys.onScale = (direction) => stepScale(direction);

  canvas.addEventListener("pointermove", (event) => {
    pointerAt = { clientX: event.clientX, clientY: event.clientY };
    if (!enabled) return;
    movePreview(cellAt(event));
  });
  canvas.addEventListener("pointerleave", () => {
    pointerAt = null;
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled) return;
    if (event.button === 2) {
      event.preventDefault();
      removeAt(event);
      return;
    }
    if (event.button !== 0) return;
    const cell = cellAt(event);
    if (carrying) {
      dropCarried(cell);
      return;
    }
    if (!selection) {
      const piece = pieceHit();
      if (piece) {
        pickUp(piece.record, cell);
        return;
      }
    }
    place(cell);
  });

  canvas.addEventListener("wheel", (event) => {
    if (!enabled) return;
    event.preventDefault();
    const current = camera.userData.viewScale > 0 ? camera.userData.viewScale : 1;
    setViewScale(current * Math.exp(wheelPixels(event) * 0.0015));
  }, { passive: false });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!enabled) return;
    removeAt(event);
  });

  await loadSaved();
  status(enabled ? "Build mode." : "Press B for build mode.");
  return { download, pieceCount: () => pieces.length };
}
