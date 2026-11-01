// Melee bat. Clean until a kill, then BloodAndGrime holds, then a slow
// blend into Grime. Grime stays. The swing lasts 1.5 s and the hand is
// furthest forward at the 0.5 s hit. It starts and ends on the hip carry.

export const BAT_SCALE = 0.024;
// Hand local: +Y runs wrist to knuckles, +X toward the pinky, -Z is the palm.
// The mesh +Y is the barrel, from the knob (negative) to the tip. The fist sits
// on the handle just past the knob, and the barrel leaves through the pinky.
export const BAT_HAND = [0.02, 0.2, -0.02];
export const BAT_EULER = [0, 0, -Math.PI / 2];
// Jog speed ratio is 1, sprint is 1.4. The hang blends in across this gap.
export const BAT_RUN_START = 1.12;
export const BAT_RUN_SPAN = 0.22;
// Offsets from the hips, in character space: right, up, forward.
// Carry is the hip hold. Hang is the relaxed run. The swing returns to carry.
const BAT_CARRY = {
  // Right hand at the belt. The barrel lies across the front, toward his left.
  hand: [0.24, 0.22, 0.32],
  barrel: [-0.995, -0.02, 0.08],
  knuckles: [0.08, 0.55, 0.83],
  pole: [0.25, -0.15, -1],
};
const BAT_HANG = {
  hand: [0.28, 0.02, 0.22],
  barrel: [0.04, -0.74, 0.67],
  knuckles: [0.82, 0.2, -0.12],
  pole: [1, -0.1, -0.35],
};
// Arm swing. The hit at 0.5 s reaches forward. 0 and 1.5 s are the belt carry.
const BAT_SWING_KEYS = [
  { t: 0, ...BAT_CARRY },
  { t: 0.22, hand: [0.48, 0.48, -0.18], barrel: [0.2, 0.55, -0.8], knuckles: [0.1, 0.95, 0.1], pole: [1, 0.2, -0.4] },
  { t: 0.5, hand: [0.12, 0.28, 0.58], barrel: [-0.15, -0.04, 0.99], knuckles: [0.05, 1, 0.1], pole: [0.8, 0.1, -0.3] },
  { t: 0.9, hand: [-0.12, 0.32, 0.28], barrel: [-0.9, 0.08, 0.25], knuckles: [0.05, 0.9, 0.2], pole: [0.4, 0.2, -0.6] },
  { t: 1.5, ...BAT_CARRY },
];
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

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function blendHold(a, b, t) {
  return {
    hand: lerp3(a.hand, b.hand, t),
    barrel: lerp3(a.barrel, b.barrel, t),
    knuckles: lerp3(a.knuckles, b.knuckles, t),
    pole: lerp3(a.pole || [1, 0.15, -0.45], b.pole || [1, 0.15, -0.45], t),
  };
}

// swingAge is seconds into Sword timing, or negative when he is not swinging.
// speedRatio is ground speed / PLAYER_SPEED. Sprint blends into the hang.
export function batHoldPose(swingAge, speedRatio) {
  if (swingAge >= 0 && swingAge < BAT_SWING) {
    const keys = BAT_SWING_KEYS;
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1].t < swingAge) i += 1;
    const a = keys[i];
    const b = keys[Math.min(keys.length - 1, i + 1)];
    const span = b.t - a.t || 1;
    const t = Math.min(1, Math.max(0, (swingAge - a.t) / span));
    return blendHold(a, b, t);
  }
  const u = Math.min(1, Math.max(0, (speedRatio - BAT_RUN_START) / BAT_RUN_SPAN));
  return blendHold(BAT_CARRY, BAT_HANG, u * u * (3 - 2 * u));
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
