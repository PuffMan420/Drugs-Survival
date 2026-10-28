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

// The lens faces model −X. A quarter turn swaps the axis it looks along.
export function facingAxis(turn) {
  const t = ((turn % 4) + 4) % 4;
  return t % 2 === 0 ? "x" : "z";
}

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

// Mast arm, in world XZ, after turn * 90°. The head hangs this way from the pole.
const ARM = [[0, -1], [-1, 0], [0, 1], [1, 0]];
// Lens normal. Traffic approaching against this direction is the one that sees the lamp.
const LENS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
// Sidewalk, in module units. Asphalt is the inner 0.3; the piece edge is 0.5.
const CAR_POST = 0.38;
const PED_POST = 0.46;

function turnIndex(turn) {
  return ((turn % 4) + 4) % 4;
}

function pointsInward(turn, signX, signZ, role) {
  const dir = role === "car" ? ARM[turnIndex(turn)] : LENS[turnIndex(turn)];
  return dir[0] * signX + dir[1] * signZ < 0;
}

// The two turns that aim a corner post into the crossing. `step` walks to the next one.
export function signalTurn(turn, signX, signZ, role, step = 0) {
  const valid = [0, 1, 2, 3].filter((t) => pointsInward(t, signX, signZ, role));
  const current = turnIndex(turn);
  if (valid.length === 0) return current;
  let index = valid.indexOf(current);
  if (index < 0) {
    let best = 4;
    index = 0;
    for (let i = 0; i < valid.length; i += 1) {
      const delta = Math.min((valid[i] - current + 4) % 4, (current - valid[i] + 4) % 4);
      if (delta < best) {
        best = delta;
        index = i;
      }
    }
  }
  const hop = ((step % valid.length) + valid.length) % valid.length;
  return valid[(index + hop) % valid.length];
}

// Move a signal onto the sidewalk corner of the nearest crossing, off the asphalt.
// Null when the click is not at a crossing. Car and pedestrian posts share a
// corner without stacking: the car post is closer in, so its arm can reach the lane.
export function snapSignalCorner(piece, junctions, role) {
  const placed = linkSignal(piece, junctions);
  const junction = placed.junction;
  if (!junction) return null;
  let dx = placed.x - junction.x;
  let dz = placed.z - junction.z;
  const limit = junction.half * 1.6;
  if (dx * dx + dz * dz > limit * limit) return null;
  let signX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  let signZ = dz === 0 ? 0 : (dz > 0 ? 1 : -1);
  if (signX === 0 || signZ === 0) {
    const options = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const hit = options.find(([sx, sz]) => (
      (signX === 0 || sx === signX)
      && (signZ === 0 || sz === signZ)
      && pointsInward(piece.turn || 0, sx, sz, role)
    ));
    signX = hit ? hit[0] : (signX || 1);
    signZ = hit ? hit[1] : (signZ || 1);
  }
  const along = role === "ped" ? PED_POST : CAR_POST;
  const offset = along * junction.half * 2;
  const x = Math.round(((junction.x + signX * offset) / TILE - 0.5) * 1000) / 1000;
  const z = Math.round(((junction.z + signZ * offset) / TILE - 0.5) * 1000) / 1000;
  return {
    x,
    z,
    turn: signalTurn(piece.turn || 0, signX, signZ, role, 0),
    signX,
    signZ,
  };
}

// Distance the car centre may still travel before its nose meets the entry
// plane. Null once the centre is inside, or when nothing is ahead on this axis.
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
    const gap = Math.max(0, edgeDist - nose);
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
