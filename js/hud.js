// On-screen HUD. Positions come from assets/hud_export/layout.json, which is
// the export from UI/HUD/hud_export. A 1920x1080 layout is stretched to the
// game picture, and that picture grows and shrinks with the window.

const REF_W = 1920;
const REF_H = 1080;
const rootUrl = new URL("../assets/hud_export/", import.meta.url);

const disabledWanted = new Map();
let mixWanted = false;
let mixEl = null;
const disabledEls = new Map();
let healthFill = null;
let drugFill = null;
let healthFrac = [0, 0, 1, 1];
let drugFrac = [0, 0, 1, 1];
let hudRoot = null;
let canvas = null;

function place(el, x, y, w, h) {
  el.style.left = `${(x / REF_W) * 100}%`;
  el.style.top = `${(y / REF_H) * 100}%`;
  el.style.width = `${(w / REF_W) * 100}%`;
  el.style.height = `${(h / REF_H) * 100}%`;
}

function makeImage(file) {
  const el = document.createElement("img");
  el.className = "hud-layer";
  el.alt = "";
  el.draggable = false;
  el.decoding = "async";
  el.src = new URL(file, rootUrl).href;
  return el;
}

function addImage(file, x, y, w, h) {
  const el = makeImage(file);
  place(el, x, y, w, h);
  hudRoot.append(el);
  return el;
}

function fillFrame(el) {
  el.style.left = "0";
  el.style.top = "0";
  el.style.width = "100%";
  el.style.height = "100%";
}

function unit(value) {
  const n = Number(value);
  if (!(n > 0)) return 0;
  if (n >= 100) return 1;
  return n / 100;
}

// The fill picture is clipped to the glass, then from the top, so the
// remaining band sits on the bottom of the orb.
function paintFill(img, frac, value) {
  if (!img) return;
  const level = unit(value);
  const top = frac[1] + (1 - level) * (frac[3] - frac[1]);
  const clip = `inset(${top * 100}% ${(1 - frac[2]) * 100}% ${(1 - frac[3]) * 100}% ${frac[0] * 100}%)`;
  if (img.dataset.clip === clip) return;
  img.dataset.clip = clip;
  img.style.clipPath = clip;
}

function followCanvas() {
  if (!canvas || !hudRoot) return;
  const rect = canvas.getBoundingClientRect();
  hudRoot.style.left = `${rect.left}px`;
  hudRoot.style.top = `${rect.top}px`;
  hudRoot.style.width = `${rect.width}px`;
  hudRoot.style.height = `${rect.height}px`;
}

function installStyle() {
  if (document.getElementById("hud-style")) return;
  const style = document.createElement("style");
  style.id = "hud-style";
  style.textContent = `
    #game-hud {
      position: fixed;
      z-index: 3;
      overflow: hidden;
      pointer-events: none;
      user-select: none;
      container-type: size;
    }
    #game-hud .hud-layer {
      position: absolute;
      display: block;
      max-width: none;
      object-fit: fill;
    }
    #game-hud [hidden] {
      display: none;
    }
    #hud-high {
      position: absolute;
      margin: 0;
      color: #f3e6c0;
      font: 700 2.05cqh/1 Georgia, "Times New Roman", serif;
      letter-spacing: 0.16em;
      text-shadow: 0 2px 2px #000, 0 0 8px #000;
      transform: translate(-50%, 0);
      white-space: nowrap;
    }
  `;
  document.head.append(style);
}

function addMinimap(entry) {
  const box = document.createElement("div");
  box.className = "hud-minimap hud-layer";
  place(box, entry.x, entry.y, entry.w, entry.h);
  const back = makeImage(entry.layers[0]);
  const frame = makeImage(entry.layers[1]);
  fillFrame(back);
  fillFrame(frame);
  const map = document.getElementById("minimap");
  box.append(back);
  if (map) box.append(map);
  box.append(frame);
  hudRoot.append(box);
}

function addOrb(entry) {
  addImage(entry.layers[0], entry.x, entry.y, entry.w, entry.h);
  const fill = addImage(entry.layers[1], entry.x, entry.y, entry.w, entry.h);
  if (entry.danger_line && entry.danger_line.file) {
    addImage(entry.danger_line.file, entry.x, entry.y, entry.w, entry.h);
  }
  addImage(entry.layers[2], entry.x, entry.y, entry.w, entry.h);
  return { fill, frac: entry.fill_box_frac || [0, 0, 1, 1] };
}

function build(layout) {
  addMinimap(layout.minimap);

  const left = layout.panels.left;
  const right = layout.panels.right;
  addImage(left.file, left.x, left.y, left.w, left.h);
  addImage(right.file, right.x, right.y, right.w, right.h);

  const icons = [];
  const disabled = [];
  const keys = [];
  for (const slot of layout.slots) {
    addImage(slot.file, slot.x, slot.y, slot.w, slot.h);
    if (slot.icon) icons.push(slot.icon);
    const grey = makeImage(slot.disabled_file);
    place(grey, slot.x, slot.y, slot.w, slot.h);
    grey.hidden = !disabledWanted.get(slot.slot);
    disabledEls.set(slot.slot, grey);
    disabled.push(grey);
    if (slot.key_hint) keys.push(slot.key_hint);
  }
  for (const icon of icons) addImage(icon.file, icon.x, icon.y, icon.w, icon.h);

  const health = addOrb(layout.orbs.health);
  healthFill = health.fill;
  healthFrac = health.frac;
  const drug = addOrb(layout.orbs.drug_HIGH);
  drugFill = drug.fill;
  drugFrac = drug.frac;

  const drugBox = layout.orbs.drug_HIGH;
  const label = document.createElement("p");
  label.id = "hud-high";
  label.textContent = "HIGH";
  const fillBottom = drugFrac[3];
  label.style.left = `${((drugBox.x + drugBox.w / 2) / REF_W) * 100}%`;
  label.style.top = `${((drugBox.y + drugBox.h * fillBottom) / REF_H) * 100}%`;
  hudRoot.append(label);

  const prompt = layout.prompt_plate;
  addImage(prompt.file, prompt.x, prompt.y, prompt.w, prompt.h);
  if (prompt.key_hint) {
    const key = prompt.key_hint;
    addImage(key.file, key.x, key.y, key.w, key.h);
  }

  const cash = layout.currency_plate;
  addImage(cash.file, cash.x, cash.y, cash.w, cash.h);
  const quest = layout.quest_tracker;
  addImage(quest.file, quest.x, quest.y, quest.w, quest.h);

  for (const star of layout.stars) {
    addImage(star.file_empty, star.x, star.y, star.w, star.h);
  }

  for (const grey of disabled) hudRoot.append(grey);
  const glow = layout.mix_glow;
  mixEl = addImage(glow.file, glow.x, glow.y, glow.w, glow.h);
  mixEl.hidden = !mixWanted;
  for (const key of keys) addImage(key.file, key.x, key.y, key.w, key.h);
}

function setMixGlow(on) {
  mixWanted = !!on;
  if (mixEl) mixEl.hidden = !mixWanted;
}

function setSlotDisabled(slot, on) {
  const id = Number(slot);
  if (on) disabledWanted.set(id, true);
  else disabledWanted.delete(id);
  const grey = disabledEls.get(id);
  if (grey) grey.hidden = !on;
}

function sync(session) {
  followCanvas();
  const player = session && session.player;
  paintFill(healthFill, healthFrac, player ? player.health : 0);
  paintFill(drugFill, drugFrac, player ? player.high : 0);
}

function mount() {
  if (hudRoot) return;
  canvas = document.getElementById("view");
  if (!canvas || !document.body) return;
  installStyle();
  hudRoot = document.createElement("div");
  hudRoot.id = "game-hud";
  document.body.append(hudRoot);
  followCanvas();
  window.addEventListener("resize", followCanvas);
  if (typeof ResizeObserver === "function") {
    const watcher = new ResizeObserver(() => followCanvas());
    watcher.observe(canvas);
  }
  fetch(new URL("layout.json", rootUrl))
    .then((response) => {
      if (!response.ok) throw new Error("HUD layout failed to load.");
      return response.json();
    })
    .then((layout) => {
      build(layout);
      followCanvas();
    })
    .catch((error) => {
      console.warn(error);
    });
}

mount();

export const hud = {
  setMixGlow,
  setSlotDisabled,
  sync,
};
