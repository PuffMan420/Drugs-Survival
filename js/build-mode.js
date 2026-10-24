import {
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";
import { KITS } from "./kenney-city-catalog.js";

// One Kenney unit is the same 4-tile module as the road pieces already on
// the west bank. Scale is uniform so a building keeps the height in the file.
// The suburban kit asks for nearest filtering; draw it with linear filtering
// and leave the file alone.
const UNIT = 4 * TILE;
const GROUND_Y = 0.2;
const MAP_URL = "./west-map.json";

const catalog = new Map();
for (const kit of KITS) {
  for (const item of kit.files) catalog.set(`${kit.id}/${item.file}`, item);
}

// Registered while this module loads, before main.js binds walking keys.
// On window, capture and bubble listeners share one target, so this has to
// run first and stop the event or S would also walk south.
const keys = {
  enabled: () => false,
  onB: () => {},
  onR: () => {},
  onS: () => {},
};
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyB") {
    event.preventDefault();
    event.stopImmediatePropagation();
    keys.onB();
    return;
  }
  if (!keys.enabled()) return;
  if (event.code !== "KeyR" && event.code !== "KeyS") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "KeyR") keys.onR();
  else keys.onS();
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

export async function createBuildMode({ scene, camera, canvas, map }) {
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
  let selection = null;
  let preview = null;
  let selectToken = 0;
  let hover = null;

  const panel = document.createElement("aside");
  panel.id = "build-panel";
  panel.hidden = true;
  const help = document.createElement("p");
  help.id = "build-help";
  const list = document.createElement("div");
  list.id = "build-kits";
  panel.append(help, list);
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

  function pieceCount() {
    help.dataset.count = String(pieces.length);
  }

  function status(text) {
    const name = selection ? selection.file.replace(/\.glb$/, "") : "nothing picked";
    help.textContent = `${text} ${pieces.length} placed. ${name}, turn ${turn}. Click places, right-click removes, R rotates, S downloads west-map.json. Arrows walk.`;
    pieceCount();
  }

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

  function wrapper(template, spec) {
    const root = new Group();
    root.add(template.clone(true));
    root.scale.setScalar(UNIT);
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
    return { kit: raw.kit, file: raw.file, x: raw.x, z: raw.z, turn: turnValue };
  }

  async function loadSaved() {
    let data = null;
    try {
      const response = await fetch(MAP_URL);
      if (response.ok) data = await response.json();
    } catch {
      data = null;
    }
    const saved = Array.isArray(data?.pieces) ? data.pieces : [];
    for (const raw of saved) {
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
    preview = wrapper(template, { ...spec, turn });
    ghost(preview);
    preview.visible = hover !== null;
    scene.add(preview);
  }

  function select(kit, file) {
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
    if (!preview) return;
    if (!cell) {
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
    const token = selectToken;
    let template = null;
    try {
      template = await loadTemplate(chosen.kit, chosen.file);
    } catch {
      status("That model failed to load.");
      return;
    }
    if (!enabled || token !== selectToken || selection !== chosen) return;
    addPiece({ ...chosen, x: cell.x, z: cell.z, turn: placedTurn }, template);
    status("Placed.");
  }

  function removeRecord(record) {
    const index = pieces.indexOf(record);
    if (index < 0) return false;
    pieces.splice(index, 1);
    for (const child of [...group.children]) {
      if (child.userData.piece === record) child.removeFromParent();
    }
    status("Removed.");
    return true;
  }

  let removedAt = 0;

  function removeAt(event) {
    const now = performance.now();
    if (now - removedAt < 80) return;
    removedAt = now;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(group.children, true);
    for (const item of hits) {
      let node = item.object;
      while (node && node !== group) {
        if (node.userData.piece && removeRecord(node.userData.piece)) return;
        node = node.parent;
      }
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
    const body = `${JSON.stringify({ pieces }, null, 2)}\n`;
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "west-map.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status("Downloaded west-map.json.");
  }

  function setEnabled(next) {
    enabled = next;
    panel.hidden = !enabled;
    if (!enabled) {
      dropPreview();
      hover = null;
      return;
    }
    status("Build mode.");
    if (selection) showPreview().catch(() => status("That model failed to load."));
  }

  keys.enabled = () => enabled;
  keys.onB = () => setEnabled(!enabled);
  keys.onR = () => {
    turn = (turn + 1) % 4;
    if (preview) preview.rotation.y = turn * Math.PI / 2;
    status("Rotated.");
  };
  keys.onS = () => download();

  canvas.addEventListener("pointermove", (event) => {
    if (!enabled) return;
    movePreview(cellAt(event));
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled) return;
    if (event.button === 2) {
      event.preventDefault();
      removeAt(event);
      return;
    }
    if (event.button === 0) place(cellAt(event));
  });

  canvas.addEventListener("contextmenu", (event) => {
    if (!enabled) return;
    event.preventDefault();
    removeAt(event);
  });

  await loadSaved();
  status(enabled ? "Build mode." : "Press B for build mode.");
  return { download, pieceCount: () => pieces.length };
}
