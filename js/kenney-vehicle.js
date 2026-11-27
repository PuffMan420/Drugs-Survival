// Arcade vehicle from Kenney's Starter Kit Racing (Godot), ported for the car
// the player drives. The script below follows scripts/vehicle.gd and the
// sphere on scenes/vehicle.tscn (mass 1000, radius 0.5, friction 5, rough,
// gravity scale 1.5, linear damp 0.1, angular damp 4).
//
// https://github.com/KenneyNL/Starter-Kit-Racing
//
// MIT License
//
// Copyright (c) 2023 Kenney
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { isBulkyCar } from "./car-kind.js";
import { handlingClassFor, handlingFor } from "./car-handling.js";

// The sphere settles near 11 m/s. This city's roads are tuned around 180 units/s.
export const METERS_TO_WORLD = 180 / 11;

const SPHERE_RADIUS = 0.5;
const SPHERE_MASS = 1000;
const SPHERE_INERTIA = 0.4 * SPHERE_MASS * SPHERE_RADIUS * SPHERE_RADIUS;
const GRAVITY = 9.8 * 1.5;
const FRICTION = 5;
const IMPULSE_DENOM = 1 / SPHERE_MASS + (SPHERE_RADIUS * SPHERE_RADIUS) / SPHERE_INERTIA;
// Per-class traction, spool, steer, and speed live in js/car-handling.js.
// The live sedan row matches the numbers that used to sit here.
const DRIVE_FORCE = 100;
// Four gears across the cruise. Each upshift starts lower than the gear before
// it peaked, then climbs again. The rates stay under 1 so the loop sounds deeper.
const GEARS = [
  { at: 0, lo: 0.36, hi: 0.52 },
  { at: 70, lo: 0.40, hi: 0.58 },
  { at: 114, lo: 0.42, hi: 0.64 },
  { at: 156, lo: 0.44, hi: 0.76 },
];
// Same shift points, about a fourth lower, for the heavy bodies.
const BULKY_GEARS = [
  { at: 0, lo: 0.27, hi: 0.39 },
  { at: 70, lo: 0.30, hi: 0.44 },
  { at: 114, lo: 0.32, hi: 0.48 },
  { at: 156, lo: 0.33, hi: 0.56 },
];
export const ENGINE_LOWPASS = 1100;
export const BULKY_LOWPASS = 680;
// Traffic uses the same loop, about 10 dB under the player's -28..-16 curve.
const TRAFFIC_DB_IDLE = -38;
const TRAFFIC_DB_CRUISE = -26;
export const TRAFFIC_VOICES = 4;
export const TRAFFIC_NEAR = 160;
export const TRAFFIC_FAR = 520;
const GEAR_DROP = 16;
const GEAR_HOLD = 0.22;
const PITCH_TOP_SPEED = 188;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, weight) {
  const t = clamp(weight, 0, 1);
  return from + (to - from) * t;
}

function lerpAngle(from, to, weight) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * clamp(weight, 0, 1);
}

function sign(value) {
  if (value < 0) return -1;
  if (value > 0) return 1;
  return 0;
}

function remap(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

// Godot dB to a linear gain. -80 dB is the kit's silent skid level.
export function dbToGain(db) {
  return 10 ** (db / 20);
}

// get_axis("left", "right") and get_axis("back", "forward"). Both pressed is 0.
function axes(controls) {
  const left = controls?.left ? 1 : 0;
  const right = controls?.right ? 1 : 0;
  const back = controls?.brake ? 1 : 0;
  const forward = controls?.forward ? 1 : 0;
  return {
    x: right - left,
    z: forward - back,
  };
}

export function createArcadeVehicle(options = {}) {
  const source = options.car ?? options.handling ?? options;
  const handlingClass = handlingClassFor(source);
  const handling = handlingFor(handlingClass);
  const bulky = !!handling.BULKY;
  const gears = bulky ? BULKY_GEARS : GEARS;
  const pullRate = handling.SPOOL;
  const throttleBlend = handling.THROTTLE_BLEND;
  const brakeBlend = handling.BRAKE_BLEND;
  const reverseBlend = handling.REVERSE_BLEND;
  const overrun = handling.OVERRUN;
  const steerCrawl = handling.STEER_CRAWL;
  const steerFast = handling.STEER_FAST;
  const steerFollow = handling.STEER_FOLLOW;
  const driftOn = handling.DRIFT_ON;
  const driftOff = handling.DRIFT_OFF;
  const gripAlign = handling.GRIP_ALIGN;
  const slideAlign = handling.SLIDE_ALIGN;
  const driveForce = DRIVE_FORCE * handling.SPEED;
  let yaw = 0;
  let vx = 0;
  let vz = 0;
  let wx = 0;
  let wy = 0;
  let wz = 0;
  let linearSpeed = 0;
  let drive = 0;
  let angularSpeed = 0;
  let acceleration = 0;
  let lean = 0;
  let inputX = 0;
  let inputZ = 0;
  let engineDb = -28;
  let enginePitch = gears[0].lo;
  let gear = 0;
  let shiftHold = 0;
  let skidDb = -80;
  let skidPitch = 1;
  let drift = 0;
  let emit = false;
  let sliding = false;

  // The rendered heading, so a collision that yaws the body stays the steer reference.
  function syncYaw(next) {
    yaw = next;
  }

  // A wall stole speed. Bleed the sphere so the next push starts from the impact.
  function scalePlanar(factor) {
    const k = clamp(factor, 0, 1);
    vx *= k;
    vz *= k;
    wx *= k;
    wz *= k;
    linearSpeed *= k;
    drive *= k;
  }

  function step(dt, controls, grounded) {
    // vehicle.gd handle_input: keys only stick while the ground ray hits.
    if (grounded) {
      const axis = axes(controls);
      inputX = axis.x;
      inputZ = axis.z;
    }

    let direction = sign(linearSpeed);
    if (direction === 0) direction = Math.abs(inputZ) > 0.1 ? sign(inputZ) : 1;
    const worldBefore = Math.hypot(vx, vz) * METERS_TO_WORLD;
    const steerBasis = Math.max(worldBefore, sliding ? driftOn : 0);
    const steerScale = clamp(steerBasis / driftOn, 0.34, 1);
    // Steer rate eases from STEER_CRAWL to STEER_FAST as speed fills the lock.
    // The wheel follows at STEER_FOLLOW, so a flick does not yaw the car at once.
    const steerRate = lerp(steerCrawl, steerFast, clamp((steerScale - 0.34) / 0.66, 0, 1));
    const targetAngular = -inputX * steerScale * steerRate * direction;
    angularSpeed = lerp(angularSpeed, targetAngular, dt * steerFollow);
    yaw += angularSpeed * dt;

    const targetSpeed = inputZ;
    if (targetSpeed < 0 && linearSpeed > 0.01) linearSpeed = lerp(linearSpeed, 0, dt * brakeBlend);
    else if (targetSpeed < 0) linearSpeed = lerp(linearSpeed, targetSpeed / 2, dt * reverseBlend);
    else linearSpeed = lerp(linearSpeed, targetSpeed, dt * throttleBlend);
    const spool = Math.abs(linearSpeed) + 0.002 < Math.abs(drive) ? overrun : pullRate;
    drive = lerp(drive, linearSpeed, dt * spool);

    const spin = Math.hypot(wx, wy, wz);
    acceleration = lerp(acceleration, linearSpeed + Math.abs(spin * linearSpeed) / 100, dt);

    // Right axis of a yaw whose nose is -Z. Positive drive rolls the sphere
    // toward that nose (the kit adds spin on the model's right axis).
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    wx += -rightX * (drive * driveForce) * dt;
    wz += -rightZ * (drive * driveForce) * dt;

    const angularDamp = Math.max(1 - 4 * dt, 0);
    const linearDamp = Math.max(1 - 0.1 * dt, 0);
    wx *= angularDamp;
    wy *= angularDamp;
    wz *= angularDamp;
    vx *= linearDamp;
    vz *= linearDamp;

    const slipX = vx + SPHERE_RADIUS * wz;
    const slipZ = vz - SPHERE_RADIUS * wx;
    let jx = -slipX / IMPULSE_DENOM;
    let jz = -slipZ / IMPULSE_DENOM;
    const jMag = Math.hypot(jx, jz);
    const jMax = FRICTION * SPHERE_MASS * GRAVITY * dt;
    if (jMag > jMax) {
      jx *= jMax / jMag;
      jz *= jMax / jMag;
    }
    vx += jx / SPHERE_MASS;
    vz += jz / SPHERE_MASS;
    wx += (-SPHERE_RADIUS * jz) / SPHERE_INERTIA;
    wz += (SPHERE_RADIUS * jx) / SPHERE_INERTIA;

    const worldSpeed = Math.hypot(vx, vz) * METERS_TO_WORLD;
    const sharp = Math.abs(inputX) > 0.5;
    if (sharp && worldSpeed > driftOn && Math.abs(drive) > 0.5) sliding = true;
    if (!sharp || worldSpeed < driftOff || Math.abs(drive) < 0.2) sliding = false;
    const align = 1 - Math.exp(-(sliding ? slideAlign : gripAlign) * dt);
    const planar = Math.hypot(vx, vz);
    if (planar > 0.05) {
      const noseX = -Math.sin(yaw);
      const noseZ = -Math.cos(yaw);
      let dir = sign(linearSpeed);
      if (dir === 0) dir = vx * noseX + vz * noseZ >= 0 ? 1 : -1;
      vx = lerp(vx, noseX * planar * dir, align);
      vz = lerp(vz, noseZ * planar * dir, align);
      wx = vz / SPHERE_RADIUS;
      wz = -vx / SPHERE_RADIUS;
    }

    lean = lerpAngle(lean, (-inputX / 5) * linearSpeed, dt * 5);
    let slip = 0;
    if (planar > 0.35) {
      slip = Math.atan2(-vx, -vz) - yaw;
      while (slip > Math.PI) slip -= Math.PI * 2;
      while (slip < -Math.PI) slip += Math.PI * 2;
      slip = Math.abs(slip);
    }
    drift = slip;
    emit = sliding && slip > 0.4;

    const pace = clamp(worldSpeed / 180, 0, 1);
    const throttleFactor = clamp(Math.abs(inputZ), 0, 1);
    const targetVolume = remap(pace * 0.65 + throttleFactor * 0.35, 0, 1, -28, -16);
    engineDb = lerp(engineDb, targetVolume, dt * 5);
    if (gear < gears.length - 1 && worldSpeed >= gears[gear + 1].at) {
      gear += 1;
      shiftHold = GEAR_HOLD;
    } else if (gear > 0 && worldSpeed <= gears[gear].at - GEAR_DROP) {
      gear -= 1;
    }
    const band = gears[gear];
    const bandTop = gear < gears.length - 1 ? gears[gear + 1].at : PITCH_TOP_SPEED;
    if (shiftHold > 0) shiftHold = Math.max(0, shiftHold - dt);
    const ratio = shiftHold > 0 ? 0 : clamp((worldSpeed - band.at) / (bandTop - band.at), 0, 1);
    const targetPitch = lerp(band.lo, band.hi, ratio);
    enginePitch = lerp(enginePitch, targetPitch, dt * 9);

    const skidTarget = emit ? remap(clamp(drift, 0.4, 1.4), 0.4, 1.4, -10, 0) : -80;
    skidPitch = lerp(skidPitch, clamp(Math.abs(linearSpeed), 1, 3), 0.1);
    skidDb = lerp(skidDb, skidTarget, 10 * dt);

    return feel();
  }

  function feel() {
    return {
      vx: vx * METERS_TO_WORLD,
      vz: vz * METERS_TO_WORLD,
      yaw,
      yawRate: angularSpeed,
      linearSpeed,
      acceleration,
      lean,
      drift,
      emit,
      bulky,
      handling: handlingClass,
      lowpass: bulky ? BULKY_LOWPASS : ENGINE_LOWPASS,
      engineGain: dbToGain(engineDb),
      enginePitch,
      skidGain: dbToGain(skidDb),
      skidPitch,
    };
  }

  return { syncYaw, scalePlanar, step, feel };
}

function gearPitch(worldSpeed, gears) {
  const speed = Math.max(0, worldSpeed || 0);
  let gear = 0;
  for (let i = 1; i < gears.length; i += 1) {
    if (speed >= gears[i].at) gear = i;
  }
  const band = gears[gear];
  const bandTop = gear < gears.length - 1 ? gears[gear + 1].at : PITCH_TOP_SPEED;
  const ratio = clamp((speed - band.at) / (bandTop - band.at), 0, 1);
  return lerp(band.lo, band.hi, ratio);
}

// The traffic loop, before distance falloff. Same gear curve as the player car.
export function trafficEngine(worldSpeed, bulky) {
  const heavy = !!bulky;
  const pace = clamp(Math.max(0, worldSpeed || 0) / 180, 0, 1);
  return {
    enginePitch: gearPitch(worldSpeed, heavy ? BULKY_GEARS : GEARS),
    engineGain: dbToGain(remap(pace, 0, 1, TRAFFIC_DB_IDLE, TRAFFIC_DB_CRUISE)),
    lowpass: heavy ? BULKY_LOWPASS : ENGINE_LOWPASS,
  };
}

export function trafficFalloff(dist) {
  if (dist >= TRAFFIC_FAR) return 0;
  if (dist <= TRAFFIC_NEAR) return 1;
  const t = (dist - TRAFFIC_NEAR) / (TRAFFIC_FAR - TRAFFIC_NEAR);
  return (1 - t) * (1 - t);
}

// The nearest moving cars inside the audible radius. Parked cars have no speed.
export function nearestTraffic(cars, x, z, limit = TRAFFIC_VOICES) {
  const heard = [];
  if (!cars) return heard;
  for (const car of cars) {
    if (!car || car.held || car.wrecked || car.speed == null || car.id == null) continue;
    const dist = Math.hypot((car.x || 0) - x, (car.z || 0) - z);
    const falloff = trafficFalloff(dist);
    if (falloff <= 0) continue;
    heard.push({
      id: car.id,
      speed: car.speed,
      bulky: isBulkyCar(car),
      dist,
      falloff,
    });
  }
  heard.sort((a, b) => a.dist - b.dist || a.id - b.id);
  return heard.slice(0, limit);
}
