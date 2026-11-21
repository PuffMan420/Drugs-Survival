// On-screen HUD. Positions come from assets/hud_export/layout.json, which is
// the export from UI/HUD/hud_export. A 1920x1080 layout is stretched to the
// game picture, and that picture grows and shrinks with the window.

import {
  DRUG_TOAST_SECONDS,
  FULE_FILE,
  FULE_ID,
  METH_FILE,
  METH_ID,
  drugEffect,
  drugIcon,
  drugName,
  drugSide,
  formatDrugChip,
} from "./drugs.js";

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
let cashEl = null;
let stockEl = null;
let promptEl = null;
let shownCash = null;
let shownStock = null;
let shownPrompt = null;
let messageText = "";
let messageUntil = 0;
let promptText = "";
let toastEl = null;
let toastUntil = 0;
let popEl = null;
let popIcon = null;
let popName = null;
let popEffect = null;
let popSide = null;
let popUntil = 0;
let popFadeUntil = 0;
let chipsEl = null;
let shownChips = "";
let starEls = [];
let shownStars = null;

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
    #game-hud .hud-text {
      position: absolute;
      margin: 0;
      color: #f3e6c0;
      font: 700 2.6cqh/1 Georgia, "Times New Roman", serif;
      letter-spacing: 0.06em;
      text-shadow: 0 2px 2px #000, 0 0 8px #000;
      white-space: nowrap;
      transform: translate(0, -50%);
    }
    #game-hud #hud-stock {
      font-size: 2.1cqh;
    }
    #game-hud #hud-prompt {
      font-size: 2.1cqh;
    }
    #game-hud [hidden] {
      display: none;
    }
    #hud-toast {
      display: none;
    }
    #hud-drug-pop {
      position: absolute;
      left: 50%;
      top: 9%;
      width: max-content;
      max-width: 36%;
      margin: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 1.4cqh;
      padding: 1.5cqh 3cqh 1.6cqh 1.6cqh;
      background: url("assets/hud_export/misc/quest_tracker.png") center / 100% 100% no-repeat;
      pointer-events: none;
      transform: translate(-50%, 0);
      transform-origin: 50% 50%;
    }
    #hud-drug-pop[hidden] {
      display: none;
    }
    #hud-drug-pop .drug-icon {
      flex: 0 0 auto;
      width: 7.2cqh;
      height: 7.2cqh;
      object-fit: contain;
      filter: drop-shadow(0 1px 2px #000);
    }
    #hud-drug-pop .drug-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35cqh;
    }
    #hud-drug-pop .drug-name,
    #hud-drug-pop .drug-effect,
    #hud-drug-pop .drug-side {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-weight: 700;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 2px #000,
        0 0 8px #000;
    }
    #hud-drug-pop .drug-name {
      font-size: 3.8cqh;
      line-height: 1;
      letter-spacing: 0.14em;
      transform-origin: left center;
    }
    #hud-drug-pop.meth .drug-name {
      color: #9FE4FF;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 2px #000,
        0 0 10px #000,
        0 0 16px rgba(159, 228, 255, 0.9);
    }
    #hud-drug-pop.fule .drug-name {
      color: #FFE9B0;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 2px #000,
        0 0 10px #000,
        0 0 16px rgba(255, 233, 176, 0.8);
    }
    #hud-drug-pop .drug-effect {
      color: #D9C08A;
      font-size: 1.7cqh;
      line-height: 1.15;
      letter-spacing: 0.08em;
    }
    #hud-drug-pop .drug-side {
      color: #E0574A;
      font-size: 1.7cqh;
      line-height: 1.15;
      font-style: italic;
      letter-spacing: 0.08em;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 2px #000,
        0 0 8px #000;
    }
    @keyframes drug-pop-in {
      0% { opacity: 0; transform: translate(-50%, 0) scale(0.62) rotate(-2deg); }
      42% { opacity: 1; transform: translate(-50%, 0) scale(1.12) rotate(1.1deg); }
      58% { transform: translate(-50%, 0) scale(0.96) rotate(-0.7deg); }
      72% { transform: translate(-50%, 0) scale(1.04) translateX(0.5cqh); }
      86% { transform: translate(-50%, 0) scale(0.99) translateX(-0.3cqh); }
      100% { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(0); }
    }
    @keyframes drug-name-pop {
      0% { transform: scale(0.55); }
      45% { transform: scale(1.2); }
      62% { transform: scale(0.94) rotate(-1.4deg); }
      78% { transform: scale(1.07) translateX(0.35cqh); }
      90% { transform: scale(0.99) translateX(-0.2cqh); }
      100% { transform: scale(1) rotate(0); }
    }
    @keyframes drug-pop-out {
      from { opacity: 1; transform: translate(-50%, 0) scale(1); }
      to { opacity: 0; transform: translate(-50%, -1cqh) scale(0.96); }
    }
    #hud-drug-pop.show {
      animation: drug-pop-in 0.48s cubic-bezier(0.2, 1.4, 0.35, 1) both;
    }
    #hud-drug-pop.show .drug-name {
      animation: drug-name-pop 0.55s cubic-bezier(0.2, 1.5, 0.35, 1) both;
    }
    #hud-drug-pop.fade {
      animation: drug-pop-out 0.35s ease forwards;
    }
    #hud-drug-chips {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.45cqh;
      pointer-events: none;
      transform: translate(-50%, -100%);
    }
    #hud-drug-chips[hidden],
    #hud-drug-chips:empty {
      display: none;
    }
    .hud-drug-chip {
      display: flex;
      align-items: center;
      gap: 0.55cqh;
      padding: 0.3cqh 0.85cqh 0.3cqh 0.35cqh;
      background: #6b2288;
      border: 0.32cqh solid #9FE4FF;
      border-radius: 0.35cqh;
      box-shadow: 0 2px 6px #000;
      color: #f3e6c0;
      font: 700 1.65cqh/1 Georgia, "Times New Roman", serif;
      letter-spacing: 0.08em;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 2px #000;
      white-space: nowrap;
    }
    .hud-drug-chip.meth {
      border-color: #9FE4FF;
      box-shadow: 0 2px 6px #000, 0 0 5px rgba(159, 228, 255, 0.55);
    }
    .hud-drug-chip.fule {
      border-color: #FFE9B0;
      box-shadow: 0 2px 6px #000, 0 0 5px rgba(255, 233, 176, 0.55);
    }
    .hud-drug-chip img {
      width: 2.3cqh;
      height: 2.3cqh;
      object-fit: contain;
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
  placeDrugChips(drugBox);

  const prompt = layout.prompt_plate;
  addImage(prompt.file, prompt.x, prompt.y, prompt.w, prompt.h);
  let promptLeft = prompt.x + 20;
  if (prompt.key_hint) {
    const key = prompt.key_hint;
    addImage(key.file, key.x, key.y, key.w, key.h);
    promptLeft = key.x + key.w + 12;
  }
  promptEl = addText("hud-prompt", promptLeft, prompt.y + prompt.h / 2);

  const cash = layout.currency_plate;
  addImage(cash.file, cash.x, cash.y, cash.w, cash.h);
  cashEl = addText("hud-cash", cash.x + cash.h * 0.95, cash.y + cash.h / 2);
  const quest = layout.quest_tracker;
  addImage(quest.file, quest.x, quest.y, quest.w, quest.h);
  stockEl = addText("hud-stock", quest.x + 18, quest.y + 30);
  shownCash = null;
  shownStock = null;
  shownPrompt = null;

  starEls = [];
  shownStars = null;
  for (const star of layout.stars) {
    addImage(star.file_empty, star.x, star.y, star.w, star.h);
    const full = addImage(star.file_full, star.x, star.y, star.w, star.h);
    full.hidden = true;
    starEls.push(full);
  }

  for (const grey of disabled) hudRoot.append(grey);
  const glow = layout.mix_glow;
  mixEl = addImage(glow.file, glow.x, glow.y, glow.w, glow.h);
  mixEl.hidden = !mixWanted;
  for (const key of keys) addImage(key.file, key.x, key.y, key.w, key.h);
}

function addText(id, x, y) {
  const el = document.createElement("p");
  el.id = id;
  el.className = "hud-text";
  el.style.left = `${(x / REF_W) * 100}%`;
  el.style.top = `${(y / REF_H) * 100}%`;
  hudRoot.append(el);
  return el;
}

// A short line on the prompt plate, e.g. "+$42". It wins over the prompt
// until it runs out.
function message(text, seconds = 1.6) {
  messageText = String(text || "");
  messageUntil = performance.now() + seconds * 1000;
}

function assetUrl(file) {
  return new URL(`../${file}`, import.meta.url).href;
}

function placeDrugChips(drugBox) {
  if (!chipsEl || !drugBox) return;
  const cx = drugBox.x + drugBox.w / 2;
  const cy = drugBox.y - 6;
  chipsEl.style.left = `${(cx / REF_W) * 100}%`;
  chipsEl.style.top = `${(cy / REF_H) * 100}%`;
}

function ensureDrugPop() {
  if (popEl || !hudRoot) return;
  popEl = document.createElement("div");
  popEl.id = "hud-drug-pop";
  popEl.hidden = true;
  popIcon = document.createElement("img");
  popIcon.className = "drug-icon";
  popIcon.alt = "";
  popIcon.draggable = false;
  const copy = document.createElement("div");
  copy.className = "drug-copy";
  popName = document.createElement("p");
  popName.className = "drug-name";
  popEffect = document.createElement("p");
  popEffect.className = "drug-effect";
  popSide = document.createElement("p");
  popSide.className = "drug-side";
  copy.append(popName, popEffect, popSide);
  popEl.append(popIcon, copy);
  hudRoot.append(popEl);
}

function ensureDrugChips() {
  if (chipsEl || !hudRoot) return;
  chipsEl = document.createElement("div");
  chipsEl.id = "hud-drug-chips";
  chipsEl.hidden = true;
  hudRoot.append(chipsEl);
}

// Old one-line toast. The drug pickup uses showDrugPickup instead.
function toast(text, _seconds = 3) {
  if (text === METH_ID || text === FULE_ID) showDrugPickup(text);
}

// Ornate pickup card: name, buff, and side effect. Does not block input.
function showDrugPickup(kind) {
  ensureDrugPop();
  if (!popEl) return;
  const id = kind === FULE_ID ? FULE_ID : METH_ID;
  popEl.classList.remove("show", "fade", "meth", "fule");
  popEl.classList.add(id);
  popIcon.src = assetUrl(drugIcon(id) || (id === FULE_ID ? FULE_FILE : METH_FILE));
  popName.textContent = drugName(id);
  popEffect.textContent = drugEffect(id);
  popSide.textContent = drugSide(id);
  popEl.hidden = false;
  void popEl.offsetWidth;
  popEl.classList.add("show");
  popUntil = performance.now() + DRUG_TOAST_SECONDS * 1000;
  popFadeUntil = 0;
}

function tickDrugPop() {
  if (!popEl || popEl.hidden) return;
  const now = performance.now();
  if (popEl.classList.contains("show") && now >= popUntil) {
    popEl.classList.remove("show");
    popEl.classList.add("fade");
    popFadeUntil = now + 350;
  }
  if (popEl.classList.contains("fade") && now >= popFadeUntil) {
    popEl.hidden = true;
    popEl.classList.remove("fade", "show");
  }
}

// Persistent chips above the HIGH orb, one per active street-drug buff.
function setDrugTimers(buffs) {
  ensureDrugChips();
  if (!chipsEl) return;
  const rows = [];
  if (buffs && buffs.meth > 0) rows.push({ kind: METH_ID, left: buffs.meth });
  if (buffs && buffs.fule > 0) rows.push({ kind: FULE_ID, left: buffs.fule });
  const key = rows.map((row) => formatDrugChip(row.kind, row.left)).join("|");
  if (key === shownChips) return;
  shownChips = key;
  chipsEl.replaceChildren();
  chipsEl.hidden = rows.length === 0;
  for (const row of rows) {
    const chip = document.createElement("div");
    chip.className = `hud-drug-chip ${row.kind}`;
    const icon = document.createElement("img");
    icon.alt = "";
    icon.draggable = false;
    icon.src = assetUrl(drugIcon(row.kind));
    const label = document.createElement("span");
    label.textContent = formatDrugChip(row.kind, row.left);
    chip.append(icon, label);
    chipsEl.append(chip);
  }
}

// The standing hint on the prompt plate, e.g. "Buy weed $20". "" clears it.
function setPrompt(text) {
  promptText = String(text || "");
}

function paintEconomy(player) {
  const cash = player && Number.isFinite(player.cash) ? Math.floor(player.cash) : null;
  const stock = player && Number.isFinite(player.stock) ? player.stock : null;
  if (cashEl && cash !== shownCash) {
    shownCash = cash;
    cashEl.textContent = cash == null ? "" : `$${cash}`;
  }
  if (stockEl && stock !== shownStock) {
    shownStock = stock;
    const max = player && Number.isFinite(player.maxStock) ? `/${player.maxStock}` : "";
    stockEl.textContent = stock == null ? "" : `Weed ${stock}${max}`;
  }
  if (promptEl) {
    const text = performance.now() < messageUntil ? messageText : promptText;
    if (text !== shownPrompt) {
      shownPrompt = text;
      promptEl.textContent = text;
    }
  }
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
  tickDrugPop();
  const player = session && session.player;
  paintFill(healthFill, healthFrac, player ? player.health : 0);
  paintFill(drugFill, drugFrac, player ? player.high : 0);
  paintEconomy(player);
  paintStars(player && Number.isFinite(player.wanted) ? player.wanted : 0);
}

function paintStars(count) {
  if (count === shownStars || starEls.length === 0) return;
  shownStars = count;
  starEls.forEach((el, i) => {
    el.hidden = i >= count;
  });
}

function mount() {
  if (hudRoot) return;
  canvas = document.getElementById("view");
  if (!canvas || !document.body) return;
  installStyle();
  hudRoot = document.createElement("div");
  hudRoot.id = "game-hud";
  document.body.append(hudRoot);
  ensureDrugPop();
  ensureDrugChips();
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
  message,
  toast,
  showDrugPickup,
  setDrugTimers,
  setPrompt,
  setMixGlow,
  setSlotDisabled,
  sync,
};
