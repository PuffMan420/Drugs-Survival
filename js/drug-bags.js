// World bags and buff hook for the street drugs in drugs.js.
// A camera-facing sprite bobs and spins; a faint glow sits on the sidewalk.

import {
  AdditiveBlending,
  Audio,
  AudioLoader,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
} from "three";
import { AO_SKIP_LAYER } from "./constants.js";
import { healPlayer } from "./player-health.js";
import {
  BAG_BOB,
  BAG_BOB_SPEED,
  BAG_HEIGHT,
  BAG_HOVER,
  BAG_SPIN,
  DRUG_COUNT_FULE,
  DRUG_COUNT_METH,
  DRUG_MIN_SEPARATION,
  FULE_FILE,
  FULE_GLOW,
  FULE_ID,
  GLOW_OPACITY,
  GLOW_SIZE,
  METH_FILE,
  METH_GLOW,
  METH_ID,
  assignBagKinds,
  canPickup,
  chooseSpots,
  clearDrugBuffs,
  collectSidewalkSpots,
  createDrugBuffs,
  drugSound,
  drugSpeed,
  hideBag,
  maybeRespawnBag,
  stepDrugBuffs,
  takeDrug,
} from "./drugs.js";

const glowGeometry = new CircleGeometry(0.5, 24);
glowGeometry.rotateX(-Math.PI / 2);

function textureUrl(file) {
  return new URL(`../${file}`, import.meta.url).href;
}

async function loadBagMap(loader, file) {
  const map = await loader.loadAsync(textureUrl(file));
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

function makeGlow(color) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: GLOW_OPACITY,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(glowGeometry, material);
  mesh.scale.set(GLOW_SIZE, 1, GLOW_SIZE);
  mesh.position.y = 0.4;
  mesh.renderOrder = 2;
  mesh.layers.set(AO_SKIP_LAYER);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function makeSprite(map) {
  const image = map.image;
  const aspect = image && image.height ? image.width / image.height : 0.75;
  const material = new SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    alphaTest: 0.12,
    toneMapped: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(BAG_HEIGHT * aspect, BAG_HEIGHT, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 3;
  sprite.layers.set(AO_SKIP_LAYER);
  sprite.frustumCulled = false;
  return { sprite, material, aspect };
}

function loadDrugVoices(listener) {
  const loader = new AudioLoader();
  const voices = {};
  for (const kind of [METH_ID, FULE_ID]) {
    const file = drugSound(kind);
    if (!file) continue;
    const audio = new Audio(listener);
    audio.setLoop(false);
    audio.setVolume(0.7);
    const url = textureUrl(file);
    // Missing clips stay quiet. Do not log; Ted will drop the files later.
    loader.load(url, (buffer) => {
      audio.setBuffer(buffer);
    }, undefined, () => {});
    voices[kind] = audio;
  }
  return voices;
}

function playDrugSound(voices, kind) {
  const audio = voices && voices[kind];
  if (!audio || !audio.buffer) return;
  if (audio.isPlaying) audio.stop();
  audio.play();
}

export async function createDrugBags({
  scene,
  spawn,
  feetY,
  roadHeight,
  onConsume,
  onPickup,
  onToast,
  listener,
  avoid,
}) {
  const loader = new TextureLoader();
  const [methMap, fuleMap] = await Promise.all([
    loadBagMap(loader, METH_FILE),
    loadBagMap(loader, FULE_FILE),
  ]);
  const maps = { [METH_ID]: methMap, [FULE_ID]: fuleMap };
  const glowColors = { [METH_ID]: METH_GLOW, [FULE_ID]: FULE_GLOW };
  const voices = listener ? loadDrugVoices(listener) : null;

  const sample = (x, z) => {
    const roadY = typeof roadHeight === "function" ? roadHeight(x, z) : null;
    const streetY = roadY == null ? 0.6 : roadY;
    const y = typeof feetY === "function" ? feetY(x, z, streetY) : streetY;
    return { y, streetY };
  };

  const needed = DRUG_COUNT_METH + DRUG_COUNT_FULE;
  const search = { avoid };
  let spots = chooseSpots(collectSidewalkSpots(spawn, sample, search), needed);
  if (spots.length < needed) {
    spots = chooseSpots(collectSidewalkSpots(spawn, sample, search), needed, DRUG_MIN_SEPARATION * 0.6);
  }
  const bags = assignBagKinds(spots);
  if (bags.length < needed) {
    console.warn(`Street drugs: placed ${bags.length} bags, wanted ${needed}.`);
  }

  const root = new Group();
  root.name = "street-drugs";
  const visuals = [];
  for (const bag of bags) {
    const holder = new Group();
    holder.position.set(bag.x, bag.y, bag.z);
    const glow = makeGlow(glowColors[bag.kind]);
    const billboard = makeSprite(maps[bag.kind]);
    billboard.sprite.position.y = BAG_HOVER;
    holder.add(glow.mesh, billboard.sprite);
    root.add(holder);
    visuals.push({ bag, holder, glow, billboard, phase: (bag.x + bag.z) * 0.05 });
  }
  scene.add(root);

  const buffs = createDrugBuffs();
  let clock = 0;
  let ownedHigh = false;

  function setVisible(entry, show) {
    entry.holder.visible = show;
  }

  function announce(kind) {
    playDrugSound(voices, kind);
    if (typeof onConsume === "function") onConsume(kind);
    if (typeof onPickup === "function") onPickup(kind);
    else if (typeof onToast === "function") onToast(kind);
  }

  function applyPickup(bag, vitals) {
    if (!bag || (vitals && vitals.dead)) return false;
    takeDrug(buffs, bag.kind);
    hideBag(bag, clock);
    announce(bag.kind);
    return true;
  }

  function syncHigh(vitals, tick) {
    if (!vitals) return;
    vitals.freezeHigh = tick.freezeHigh;
    if (tick.freezeHigh) {
      vitals.high = tick.high;
      ownedHigh = true;
    } else if (ownedHigh) {
      vitals.high = 0;
      ownedHigh = false;
    }
  }

  return {
    root,
    bags() {
      return bags;
    },
    buffs() {
      return buffs;
    },
    speed() {
      return drugSpeed(buffs);
    },
    take(kind, vitals) {
      takeDrug(buffs, kind);
      announce(kind);
      const tick = stepDrugBuffs(buffs, 0);
      syncHigh(vitals, tick);
      return tick;
    },
    clear(vitals) {
      clearDrugBuffs(buffs);
      if (vitals) {
        vitals.freezeHigh = false;
        if (ownedHigh) vitals.high = 0;
      }
      ownedHigh = false;
    },
    update(dt, player, vitals, flags) {
      const step = Math.max(0, Number(dt) || 0);
      clock += step;
      if (flags && flags.dead) {
        clearDrugBuffs(buffs);
      } else if (player && !(flags && flags.driving)) {
        for (const bag of bags) {
          if (canPickup(bag, player.x, player.z, flags)) applyPickup(bag, vitals);
        }
      }
      const tick = stepDrugBuffs(buffs, flags && flags.dead ? 0 : step);
      if (tick.regen > 0 && vitals && !(flags && flags.dead)) {
        healPlayer(vitals, tick.regen);
      }
      syncHigh(vitals, tick);

      for (const entry of visuals) {
        const bag = entry.bag;
        if (maybeRespawnBag(bag, clock)) setVisible(entry, true);
        if (bag.hidden) {
          if (entry.holder.visible) setVisible(entry, false);
          continue;
        }
        const t = clock * BAG_BOB_SPEED + entry.phase;
        entry.billboard.sprite.position.y = BAG_HOVER + Math.sin(t) * BAG_BOB;
        entry.billboard.material.rotation += BAG_SPIN * step;
        entry.glow.material.opacity = GLOW_OPACITY * (0.72 + 0.28 * Math.sin(t * 1.15));
      }
      return tick;
    },
  };
}
