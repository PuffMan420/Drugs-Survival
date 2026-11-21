// Street-drug pickups: meth and FULE bags on the sidewalk, used on contact.
// All tunable numbers live at the top of this file. Distances are world units
// (one tile = 48, a sedan is about 71 long). Times are seconds.

export const TILE = 48;

// A sedan is about 71 units long, roughly 4.7 m, so 1 m is about 15 units.
export const DRUG_METER = 15;

// How far from the spawn tile centre bags may be placed (~40 m).
export const DRUG_SPAWN_RADIUS = 40 * DRUG_METER;
// Walk-over radius (~1.2 m). Only while on foot.
export const DRUG_PICKUP_RADIUS = 1.2 * DRUG_METER;
// Seconds before a used bag comes back at the same spot.
export const DRUG_RESPAWN = 60;
export const DRUG_COUNT_METH = 4;
export const DRUG_COUNT_FULE = 4;
// Keep bags at least this far apart, and this far from the player spawn.
export const DRUG_MIN_SEPARATION = TILE;
export const DRUG_MIN_SPAWN_DIST = TILE * 1.5;
// Preferred distance from spawn, so bags sit on the nearby sidewalks, in view.
export const DRUG_PLACE_DIST = 160;

export const METH_ID = "meth";
export const FULE_ID = "fule";
export const METH_SPEED = 1.25;
export const METH_DURATION = 120;
export const METH_REGEN_PER_SECOND = 3;
export const FULE_SPEED = 1.4;
export const FULE_DURATION = 60;

export const METH_NAME = "METH";
export const FULE_NAME = "FULE";
export const METH_EFFECT = "SPEED BOOST + HEALTH REGEN";
export const FULE_EFFECT = "SPEED BOOST";
export const METH_SIDE = "Side effect: tiny penis";
export const FULE_SIDE = "Side effect: tiny penis";
export const METH_LINE = "METH! Speed + health regen. Side effect: tiny penis.";
export const FULE_LINE = "FULE! Big speed. Side effect: tiny penis.";
export const DRUG_TOAST_SECONDS = 3;

// Pickup clips. Missing files must stay quiet until Ted drops them in.
export const DRUG_SOUNDS = {
  meth: "assets/sounds/drugs/meth-pickup.mp3",
  fule: "assets/sounds/drugs/fule-pickup.mp3",
};

// The HIGH orb is filled to 100 when a buff starts and drains with that buff.
export const DRUG_HIGH_FULL = 100;

// A point counts as sidewalk when the foot height is at least this much
// above the asphalt (the Kenney curb is a bit more than 1 unit high).
export const SIDEWALK_LIFT = 0.9;
// Grid step when hunting sidewalk spots around spawn.
export const DRUG_SAMPLE_STEP = 16;

export const BAG_HEIGHT = 18;
export const BAG_HOVER = 8;
export const BAG_BOB = 1.4;
export const BAG_BOB_SPEED = 2.4;
export const BAG_SPIN = 0.85;
export const GLOW_SIZE = 20;
export const GLOW_OPACITY = 0.45;
export const METH_GLOW = 0x4ec8ff;
export const FULE_GLOW = 0xffe07a;

export const METH_FILE = "assets/drugs/meth.png";
export const FULE_FILE = "assets/drugs/fule.png";

export function createDrugBuffs() {
  return { meth: 0, fule: 0 };
}

export function drugLine(kind) {
  if (kind === METH_ID) return METH_LINE;
  if (kind === FULE_ID) return FULE_LINE;
  return "";
}

export function drugName(kind) {
  if (kind === METH_ID) return METH_NAME;
  if (kind === FULE_ID) return FULE_NAME;
  return "";
}

export function drugEffect(kind) {
  if (kind === METH_ID) return METH_EFFECT;
  if (kind === FULE_ID) return FULE_EFFECT;
  return "";
}

export function drugSide(kind) {
  if (kind === METH_ID) return METH_SIDE;
  if (kind === FULE_ID) return FULE_SIDE;
  return "";
}

export function drugIcon(kind) {
  if (kind === METH_ID) return METH_FILE;
  if (kind === FULE_ID) return FULE_FILE;
  return "";
}

export function drugSound(kind) {
  return (DRUG_SOUNDS && DRUG_SOUNDS[kind]) || "";
}

// "METH 1:47" style clock. Ceil so the last second still shows 0:01.
export function formatDrugClock(seconds) {
  const t = Math.max(0, Math.ceil(Number(seconds) || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDrugChip(kind, seconds) {
  const name = drugName(kind);
  if (!name) return "";
  return `${name} ${formatDrugClock(seconds)}`;
}

export function takeDrug(buffs, kind) {
  if (!buffs) return buffs;
  if (kind === METH_ID) buffs.meth = METH_DURATION;
  else if (kind === FULE_ID) buffs.fule = FULE_DURATION;
  return buffs;
}

export function clearDrugBuffs(buffs) {
  if (!buffs) return buffs;
  buffs.meth = 0;
  buffs.fule = 0;
  return buffs;
}

// Walk and run use the higher of the two active multipliers. No stacking.
export function drugSpeed(buffs) {
  let speed = 1;
  if (buffs && buffs.meth > 0) speed = Math.max(speed, METH_SPEED);
  if (buffs && buffs.fule > 0) speed = Math.max(speed, FULE_SPEED);
  return speed;
}

// HIGH orb level 0–100 from the strongest remaining buff fraction.
export function drugHigh(buffs) {
  let frac = 0;
  if (buffs && buffs.meth > 0) frac = Math.max(frac, buffs.meth / METH_DURATION);
  if (buffs && buffs.fule > 0) frac = Math.max(frac, buffs.fule / FULE_DURATION);
  return frac * DRUG_HIGH_FULL;
}

export function drugActive(buffs) {
  return Boolean(buffs && (buffs.meth > 0 || buffs.fule > 0));
}

// Tick timers. regen is the meth health to add this step (never applied here).
export function stepDrugBuffs(buffs, dt) {
  const step = Math.max(0, Number(dt) || 0);
  let regen = 0;
  if (!buffs) {
    return { regen: 0, speed: 1, high: 0, freezeHigh: false };
  }
  if (buffs.meth > 0) {
    regen = METH_REGEN_PER_SECOND * Math.min(step, buffs.meth);
    buffs.meth = Math.max(0, buffs.meth - step);
  }
  if (buffs.fule > 0) {
    buffs.fule = Math.max(0, buffs.fule - step);
  }
  return {
    regen,
    speed: drugSpeed(buffs),
    high: drugHigh(buffs),
    freezeHigh: drugActive(buffs),
  };
}

export function canPickup(bag, playerX, playerZ, flags) {
  if (!bag || bag.hidden) return false;
  if (flags && (flags.dead || flags.driving)) return false;
  const dx = playerX - bag.x;
  const dz = playerZ - bag.z;
  return dx * dx + dz * dz <= DRUG_PICKUP_RADIUS * DRUG_PICKUP_RADIUS;
}

export function hideBag(bag, now = 0) {
  if (!bag) return bag;
  bag.hidden = true;
  bag.respawnAt = now + DRUG_RESPAWN;
  return bag;
}

export function maybeRespawnBag(bag, now) {
  if (!bag || !bag.hidden) return false;
  if (now < bag.respawnAt) return false;
  bag.hidden = false;
  bag.respawnAt = 0;
  return true;
}

// Pick `count` spots around spawn. Each pass aims at the next compass
// slice and a mid-range distance, so bags are not all on one curb.
export function chooseSpots(candidates, count, minSep = DRUG_MIN_SEPARATION, placeDist = DRUG_PLACE_DIST) {
  const picked = [];
  const sep2 = minSep * minSep;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    const target = -Math.PI + twoPi * ((i + 0.5) / count);
    let best = null;
    let bestScore = Infinity;
    for (const spot of candidates) {
      let ok = true;
      for (const other of picked) {
        const dx = spot.x - other.x;
        const dz = spot.z - other.z;
        if (dx * dx + dz * dz < sep2) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let ang = (spot.angle ?? 0) - target;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const score = Math.abs(ang) * 220 + Math.abs((spot.dist ?? 0) - placeDist);
      if (score < bestScore) {
        best = spot;
        bestScore = score;
      }
    }
    if (best) picked.push(best);
  }
  return picked;
}

export function isSidewalkHeight(footY, streetY, lift = SIDEWALK_LIFT) {
  return footY - streetY >= lift;
}

// Sample a square around spawn and keep raised-sidewalk points far enough
// from the spawn itself. Sorted by angle, then distance, so placement is stable.
export function collectSidewalkSpots(spawn, sample, options = {}) {
  const radius = options.radius ?? DRUG_SPAWN_RADIUS;
  const step = options.step ?? DRUG_SAMPLE_STEP;
  const minDist = options.minDist ?? DRUG_MIN_SPAWN_DIST;
  const lift = options.lift ?? SIDEWALK_LIFT;
  const avoid = options.avoid || [];
  const spots = [];
  const x0 = spawn.x - radius;
  const z0 = spawn.z - radius;
  const x1 = spawn.x + radius;
  const z1 = spawn.z + radius;
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      const dx = x - spawn.x;
      const dz = z - spawn.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dist < minDist) continue;
      let blocked = false;
      for (const item of avoid) {
        const reach = item.radius ?? 0;
        if (Math.hypot(x - item.x, z - item.z) < reach) { blocked = true; break; }
      }
      if (blocked) continue;
      const hit = sample(x, z);
      if (!hit || !isSidewalkHeight(hit.y, hit.streetY, lift)) continue;
      spots.push({ x, y: hit.y, z, dist, angle: Math.atan2(dz, dx) });
    }
  }
  spots.sort((a, b) => (a.angle - b.angle) || (a.dist - b.dist));
  return spots;
}

export function assignBagKinds(spots) {
  const bags = [];
  let meth = 0;
  let fule = 0;
  for (let i = 0; i < spots.length; i += 1) {
    let kind;
    if (meth < DRUG_COUNT_METH && (fule >= DRUG_COUNT_FULE || i % 2 === 0)) kind = METH_ID;
    else if (fule < DRUG_COUNT_FULE) kind = FULE_ID;
    else if (meth < DRUG_COUNT_METH) kind = METH_ID;
    else break;
    if (kind === METH_ID) meth += 1;
    else fule += 1;
    bags.push({
      kind,
      x: spots[i].x,
      y: spots[i].y,
      z: spots[i].z,
      hidden: false,
      respawnAt: 0,
    });
  }
  return bags;
}
