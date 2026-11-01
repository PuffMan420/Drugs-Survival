// Melee bat. Clean until a kill, then BloodAndGrime holds, then a slow
// blend into Grime. Grime stays. The swing is Sword_Attack: the right hand
// is furthest from its start at 0.5 s, and the clip lasts 1.5 s.

export const BAT_SCALE = 0.024;
// Hand local: +Y runs wrist to knuckles, -Z is the palm. The mesh +Y is the barrel.
// The fist sits on the handle. XYZ euler turns the barrel up and slightly back
// over the shoulder in Sword_Idle, and forward at the Sword_Attack hit (0.5 s).
export const BAT_HAND = [0, 0.16, -0.06];
export const BAT_EULER = [2.10431, -0.400945, 0.230927];
export const BAT_HIT = 0.5;
export const BAT_SWING = 1.5;
// One tile forward, and a narrow gate so a ped beside him is not in front.
export const BAT_REACH = 48;
export const BAT_SIDE = 18;
export const BAT_BLOOD_HOLD = 5;
export const BAT_GRIME_FADE = 10;

export function freshBatWear() {
  return { stage: "clean", clock: 0, mix: 0 };
}

// Smoothstep. Slope is 0 at both ends, so the blend starts slowly.
export function batEaseIn(t) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

// killed restarts the blood hold unless the bat has already settled on grime.
// A step that passes the hold spends the leftover time on the fade.
export function stepBatWear(state, dt, killed = false) {
  if (killed && state.stage !== "grime") {
    return { stage: "blood", clock: 0, mix: 0 };
  }
  if (state.stage === "clean" || state.stage === "grime") {
    return { stage: state.stage, clock: state.clock, mix: state.mix };
  }
  let time = state.clock + Math.max(0, dt);
  if (state.stage === "blood") {
    if (time < BAT_BLOOD_HOLD) return { stage: "blood", clock: time, mix: 0 };
    time -= BAT_BLOOD_HOLD;
  }
  if (time >= BAT_GRIME_FADE) return { stage: "grime", clock: 0, mix: 1 };
  return { stage: "fade", clock: time, mix: batEaseIn(time / BAT_GRIME_FADE) };
}

// Mesh +Y after BAT_EULER, in hand space. Three.js rotation order XYZ.
export function batBarrelAxis() {
  const [x, y, z] = BAT_EULER;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const y1 = cx;
  const z1 = sx;
  const x2 = sy * z1;
  const y2 = y1;
  const z2 = cy * z1;
  return [cz * x2 - sz * y2, sz * x2 + cz * y2, z2];
}

// Playback rate for a melee hit. unit is 0..1, and the result stays within 5%.
export function meleePlaybackRate(unit) {
  const u = Math.min(1, Math.max(0, unit));
  return 1 + (u - 0.5) * 0.1;
}

// dirX/dirZ is the way he faces, a unit vector. along is forward, lateral is sideways.
export function batHits(px, pz, dirX, dirZ, x, z, reach = BAT_REACH, side = BAT_SIDE) {
  const dx = x - px;
  const dz = z - pz;
  const along = dx * dirX + dz * dirZ;
  if (along < 0 || along > reach) return false;
  const lateral = dirX * dz - dirZ * dx;
  return Math.abs(lateral) <= side;
}
