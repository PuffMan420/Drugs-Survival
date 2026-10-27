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

// The sphere settles near 11 m/s. This city's roads are tuned around 180 units/s.
export const METERS_TO_WORLD = 180 / 11;

const SPHERE_RADIUS = 0.5;
const SPHERE_MASS = 1000;
const SPHERE_INERTIA = 0.4 * SPHERE_MASS * SPHERE_RADIUS * SPHERE_RADIUS;
const GRAVITY = 9.8 * 1.5;
const FRICTION = 5;
const IMPULSE_DENOM = 1 / SPHERE_MASS + (SPHERE_RADIUS * SPHERE_RADIUS) / SPHERE_INERTIA;

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

export function createArcadeVehicle() {
  let yaw = 0;
  let vx = 0;
  let vz = 0;
  let wx = 0;
  let wy = 0;
  let wz = 0;
  let linearSpeed = 0;
  let angularSpeed = 0;
  let acceleration = 0;
  let lean = 0;
  let inputX = 0;
  let inputZ = 0;
  let engineDb = -15;
  let enginePitch = 0.5;
  let skidDb = -80;
  let skidPitch = 1;
  let drift = 0;
  let emit = false;

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
    const steeringGrip = clamp(Math.abs(linearSpeed), 0.2, 1);
    const targetAngular = -inputX * steeringGrip * 4 * direction;
    angularSpeed = lerp(angularSpeed, targetAngular, dt * 4);
    yaw += angularSpeed * dt;

    const targetSpeed = inputZ;
    if (targetSpeed < 0 && linearSpeed > 0.01) linearSpeed = lerp(linearSpeed, 0, dt * 8);
    else if (targetSpeed < 0) linearSpeed = lerp(linearSpeed, targetSpeed / 2, dt * 2);
    else linearSpeed = lerp(linearSpeed, targetSpeed, dt * 6);

    const spin = Math.hypot(wx, wy, wz);
    acceleration = lerp(acceleration, linearSpeed + Math.abs(spin * linearSpeed) / 100, dt);

    // Right axis of a yaw whose nose is -Z. Positive linear_speed rolls the
    // sphere toward that nose (the kit adds spin on the model's right axis).
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    wx += -rightX * (linearSpeed * 100) * dt;
    wz += -rightZ * (linearSpeed * 100) * dt;

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

    lean = lerpAngle(lean, (-inputX / 5) * linearSpeed, dt * 5);
    drift = Math.abs(linearSpeed - acceleration) + Math.abs(lean) * 2;
    emit = drift > 0.25;

    const speedFactor = clamp(Math.abs(linearSpeed), 0, 1);
    const throttleFactor = clamp(Math.abs(inputZ), 0, 1);
    const targetVolume = remap(speedFactor + throttleFactor * 0.5, 0, 1.5, -15, -5);
    engineDb = lerp(engineDb, targetVolume, dt * 5);
    let targetPitch = remap(speedFactor, 0, 1, 0.5, 3);
    if (throttleFactor > 0.1) targetPitch += 0.2;
    enginePitch = lerp(enginePitch, targetPitch, dt * 2);

    const skidTarget = emit ? remap(clamp(drift, 0.25, 2), 0.25, 2, -10, 0) : -80;
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
      engineGain: dbToGain(engineDb),
      enginePitch,
      skidGain: dbToGain(skidDb),
      skidPitch,
    };
  }

  return { syncYaw, scalePlanar, step, feel };
}
