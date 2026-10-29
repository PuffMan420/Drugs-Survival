// Junction phases for built roads. A crossroad or T has two axes. One axis
// is green, then yellow, then both axes stay red for a short gap, then the
// other axis takes a turn. Cars use the same clock the placed lights read.

import { TILE } from "./constants.js";
import { junctionKind } from "./built-lanes.js";

export const SIGNAL_GREEN = 6;
export const SIGNAL_YELLOW = 2;
export const SIGNAL_ALL_RED = 1;

const HALF = SIGNAL_GREEN + SIGNAL_YELLOW + SIGNAL_ALL_RED;
const MODULE = 4 * TILE;

export function signalPeriod() {
  return HALF * 2;
}

function axisPhase(local) {
  if (local < SIGNAL_GREEN) return "green";
  if (local < SIGNAL_GREEN + SIGNAL_YELLOW) return "yellow";
  return "red";
}

// offset shifts a junction so neighbours do not flip together.
export function phaseAt(time, offset = 0) {
  const period = signalPeriod();
  let t = (time + offset) % period;
  if (t < 0) t += period;
  if (t < HALF) return { x: axisPhase(t), z: "red" };
  return { x: "red", z: axisPhase(t - HALF) };
}

// Pedestrian lamps show the opposite of the car lamp on the same axis.
// Yellow is still "cars have the road", so the pedestrian stays red.
export function pedPhase(carPhase) {
  return carPhase === "red" ? "green" : "red";
}

// The glass faces model −X. rotation.y = turn * π/2, so turn 0 looks west,
// 1 south, 2 east, 3 north. Traffic coming at that face travels on one axis,
// and the opposite face of the same street is the same axis.
const LENS_AXIS = ["x", "z", "x", "z"];

export function facingAxis(turn) {
  const t = ((turn % 4) + 4) % 4;
  return LENS_AXIS[t];
}

// road-straight-stop paints the white bar 0.16 of a module before the end
// that meets the crossing, which is before the crosswalk. World distance
// is this times the module size (2 * half).
export const SIGNAL_STOP_INSET = 0.16;

let clock = 0;

export function advanceSignalClock(dt) {
  if (Number.isFinite(dt) && dt > 0) clock += dt;
}

export function signalNow() {
  return clock;
}

export function setSignalTime(time) {
  clock = Number.isFinite(time) ? time : 0;
}

function junctionOffset(x, z) {
  const period = signalPeriod();
  let h = Math.imul(Math.round(x) | 0, 374761393) ^ Math.imul(Math.round(z) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) % period;
}

// World centre matches built-lanes: the piece origin is the module centre.
export function detectJunctions(pieces) {
  const list = Array.isArray(pieces) ? pieces : [];
  const junctions = [];
  for (const piece of list) {
    if (!piece || piece.kit !== "roads" || !junctionKind(piece.file)) continue;
    if (!Number.isFinite(piece.x) || !Number.isFinite(piece.z)) continue;
    const scale = piece.scale == null ? 1 : Number(piece.scale);
    if (!Number.isFinite(scale) || scale <= 0) continue;
    const size = MODULE * scale;
    const x = (piece.x + 0.5) * TILE;
    const z = (piece.z + 0.5) * TILE;
    junctions.push({
      id: junctions.length,
      x,
      z,
      half: size / 2,
      offset: junctionOffset(x, z),
    });
  }
  return junctions;
}

export function linkSignal(piece, junctions) {
  const x = (piece.x + 0.5) * TILE;
  const z = (piece.z + 0.5) * TILE;
  let best = null;
  let bestD = Infinity;
  const list = junctions || [];
  for (let i = 0; i < list.length; i += 1) {
    const junction = list[i];
    const dx = junction.x - x;
    const dz = junction.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = junction;
    }
  }
  return { junction: best, axis: facingAxis(piece.turn || 0), x, z };
}

// Distance the car centre may still travel before its nose meets the stop
// line. Null once the centre is inside the crossing, or when nothing is ahead.
export function signalApproach(car, junctions, time) {
  if (!junctions || junctions.length === 0) return null;
  const span = Math.hypot(car.hx, car.hz);
  if (span < 1e-3) return null;
  const dirX = car.hx / span;
  const dirZ = car.hz / span;
  const axis = Math.abs(dirX) >= Math.abs(dirZ) ? "x" : "z";
  const nose = (car.length > 0 ? car.length : 70) / 2;
  let best = null;
  for (let i = 0; i < junctions.length; i += 1) {
    const junction = junctions[i];
    // Already in the box, including a car whose heading has swung toward the
    // cross street. It clears. It does not pick up the far curb as a new line.
    if (Math.abs(car.x - junction.x) <= junction.half && Math.abs(car.z - junction.z) <= junction.half) {
      continue;
    }
    // The lamp belongs to the lane that enters. Past the centre the car is
    // leaving on the way out, and the left-hand lane is that road's outgoing
    // lane, so a red here must not hold either of them.
    const along = dirX * (car.x - junction.x) + dirZ * (car.z - junction.z);
    if (along > 0) continue;
    const side = (car.x - junction.x) * -dirZ + (car.z - junction.z) * dirX;
    if (side < -8) continue;
    let edgeDist;
    if (axis === "x") {
      if (Math.abs(car.z - junction.z) > junction.half + 12) continue;
      edgeDist = dirX >= 0
        ? (junction.x - junction.half) - car.x
        : car.x - (junction.x + junction.half);
    } else {
      if (Math.abs(car.x - junction.x) > junction.half + 12) continue;
      edgeDist = dirZ >= 0
        ? (junction.z - junction.half) - car.z
        : car.z - (junction.z + junction.half);
    }
    if (edgeDist < 0) continue;
    const lineDist = edgeDist - SIGNAL_STOP_INSET * junction.half * 2;
    // Nose already past the bar but centre still outside: hold at the bar.
    // Clamping here is what keeps a car from creeping past the line.
    const gap = Math.max(0, lineDist - nose);
    if (best && gap >= best.gap) continue;
    const phase = phaseAt(time, junction.offset)[axis];
    best = { gap, stop: phase !== "green", phase, axis };
  }
  return best;
}

// Null when the car is too fast to stop in `gap`. Otherwise the speed that
// still finishes exactly at the line under constant braking.
export function signalSpeedCap(speed, gap, brake) {
  if (!(brake > 0)) return null;
  const room = Math.max(0, gap);
  // One frame of travel, so a car already braking on the curve is not
  // released just because a step left it a little short of the line.
  const slack = Math.max(1, Math.abs(speed) * 0.08);
  const needed = (speed * speed) / (2 * brake);
  if (needed > room + slack) return null;
  return Math.sqrt(2 * brake * room);
}
