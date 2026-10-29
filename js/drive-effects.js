// Drift smoke and engine/skid loops for the player car, plus a short pool of
// quieter engine loops for the nearest traffic. Particle layout and
// the curves are the TrailLeft / TrailRight GPUParticles3D on
// scenes/vehicle.tscn in Kenney's Starter Kit Racing. The sounds are that
// kit's engine.ogg and skid.ogg (CC0; skid by Landeplage).
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

import {
  Audio,
  AudioListener,
  AudioLoader,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { AO_SKIP_LAYER } from "./constants.js";
import {
  BULKY_LOWPASS,
  ENGINE_LOWPASS,
  nearestTraffic,
  trafficEngine,
  TRAFFIC_VOICES,
} from "./kenney-vehicle.js";

// Truck underside in vehicle-truck-yellow.glb spans about this many metres.
const KENNEY_LENGTH = 1.714;
const LIFE = 0.5;
const PER_SIDE = 32;
const SPAWN_RATE = PER_SIDE / LIFE;
// ParticleProcessMaterial color (0.3696, 0.3738, 0.42).
const SMOKE_COLOR = 0x5e5f6b;

const ALPHA_CURVE = [
  { x: 0, y: 0, out: 0 },
  { x: 0.503968, y: 1, inn: 0, out: 0 },
  { x: 1, y: 0, inn: 0 },
];
const SCALE_CURVE = [
  { x: 0, y: 0.5, out: 0 },
  { x: 0.5, y: 1, inn: 0, out: 0 },
  { x: 1, y: 0.2, inn: 0.5 },
];

function curve(points, t) {
  const time = Math.min(1, Math.max(0, t));
  let index = 0;
  while (index < points.length - 2 && points[index + 1].x < time) index += 1;
  const a = points[index];
  const b = points[index + 1];
  const span = b.x - a.x || 1;
  const u = (time - a.x) / span;
  const uu = u * u;
  const uuu = uu * u;
  const h00 = 2 * uuu - 3 * uu + 1;
  const h10 = uuu - 2 * uu + u;
  const h01 = -2 * uuu + 3 * uu;
  const h11 = uuu - uu;
  return h00 * a.y + h10 * (a.out || 0) * span + h01 * b.y + h11 * (b.inn || 0) * span;
}

function loadSound(loader, audio, url, label, status) {
  loader.load(url, (buffer) => {
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(0);
    status[label] = "ready";
    console.info(`Kenney ${label} sound loaded`);
  }, undefined, (error) => {
    status[label] = "error";
    console.error(`Kenney ${label} sound failed to load`, error);
  });
}

export function createDriveEffects(scene, camera) {
  const listener = new AudioListener();
  camera.add(listener);
  const loader = new AudioLoader();
  const engine = new Audio(listener);
  const skid = new Audio(listener);
  // Keeps the lowered playback range from coming through thin and bright.
  const engineLowpass = listener.context.createBiquadFilter();
  engineLowpass.type = "lowpass";
  engineLowpass.frequency.value = ENGINE_LOWPASS;
  engineLowpass.Q.value = 0.55;
  engine.setFilter(engineLowpass);
  const trafficVoices = [];
  for (let i = 0; i < TRAFFIC_VOICES; i += 1) {
    const audio = new Audio(listener);
    const filter = listener.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = ENGINE_LOWPASS;
    filter.Q.value = 0.55;
    audio.setFilter(filter);
    trafficVoices.push({ audio, filter, id: null, pitch: 0.36, gain: 0 });
  }
  const status = { engine: "loading", skid: "loading", smoke: "loading" };
  const engineUrl = new URL("../assets/kenney-racing/engine.ogg", import.meta.url).href;
  const skidUrl = new URL("../assets/kenney-racing/skid.ogg", import.meta.url).href;
  const mapUrl = new URL("../assets/kenney-racing/smoke.png", import.meta.url).href;
  loader.load(engineUrl, (buffer) => {
    engine.setBuffer(buffer);
    engine.setLoop(true);
    engine.setVolume(0);
    for (const slot of trafficVoices) {
      slot.audio.setBuffer(buffer);
      slot.audio.setLoop(true);
      slot.audio.setVolume(0);
    }
    status.engine = "ready";
    console.info("Kenney engine sound loaded");
  }, undefined, (error) => {
    status.engine = "error";
    console.error("Kenney engine sound failed to load", error);
  });
  loadSound(loader, skid, skidUrl, "skid", status);

  const base = new SpriteMaterial({
    color: SMOKE_COLOR,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  let textureReady = false;
  const pool = [];
  for (let i = 0; i < PER_SIDE * 2; i += 1) {
    const material = base.clone();
    const sprite = new Sprite(material);
    sprite.visible = false;
    sprite.frustumCulled = false;
    sprite.renderOrder = 3;
    sprite.layers.set(AO_SKIP_LAYER);
    sprite.userData.life = 0;
    scene.add(sprite);
    pool.push(sprite);
  }
  new TextureLoader().load(mapUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    base.map = texture;
    for (const sprite of pool) {
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
    }
    textureReady = true;
    status.smoke = "ready";
    console.info("Kenney drift smoke loaded");
  }, undefined, (error) => {
    status.smoke = "error";
    console.error("Kenney drift smoke failed to load", error);
  });

  let cursor = 0;
  let spawnLeft = 0;
  let spawnRight = 0;
  let playing = false;
  let resumeAt = 0;

  function emitOne(sample, side) {
    const sprite = pool[cursor];
    cursor = (cursor + 1) % pool.length;
    const length = sample.h || 70;
    const scale = length / KENNEY_LENGTH;
    const lx = side * 0.25 * scale;
    const lz = 0.35 * scale;
    const c = Math.cos(sample.angle || 0);
    const s = Math.sin(sample.angle || 0);
    sprite.position.set(
      sample.x + lx * c + lz * s,
      (sample.y || 0.6) + 0.05 * scale,
      sample.z - lx * s + lz * c,
    );
    sprite.userData.life = LIFE;
    sprite.userData.size = (0.25 + Math.random() * 0.25) * scale;
    sprite.material.rotation = (Math.random() * 180 - 90) * Math.PI / 180;
    sprite.visible = textureReady;
  }

  function silence() {
    playing = false;
    spawnLeft = 0;
    spawnRight = 0;
    if (engine.isPlaying) engine.stop();
    if (skid.isPlaying) skid.stop();
    for (const sprite of pool) {
      sprite.visible = false;
      sprite.userData.life = 0;
    }
  }

  async function voice(audio, gain, pitch) {
    if (!audio.buffer) return;
    const context = audio.context;
    if (context.state === "suspended") {
      const now = performance.now();
      if (now < resumeAt) return;
      resumeAt = now + 1000;
      try {
        await context.resume();
      } catch {
        return;
      }
      if (context.state === "suspended") return;
    }
    try {
      if (!audio.isPlaying) audio.play();
      audio.setVolume(Math.max(0, gain));
      audio.setPlaybackRate(Math.max(0.05, pitch));
    } catch (error) {
      console.error("Kenney sound failed to play", error);
    }
  }

  function shape(filter, bulky) {
    filter.frequency.value = bulky ? BULKY_LOWPASS : ENGINE_LOWPASS;
    filter.Q.value = bulky ? 0.9 : 0.55;
  }

  function updateTraffic(dt, cars, x, z) {
    const heard = nearestTraffic(cars, x, z);
    const used = new Set();
    const step = Math.max(0, dt);
    const pitchBlend = 1 - Math.exp(-9 * step);
    const gainBlend = 1 - Math.exp(-5 * step);
    for (const slot of trafficVoices) {
      const match = slot.id == null ? null : heard.find((car) => car.id === slot.id);
      if (!match) {
        slot.id = null;
        slot.gain = 0;
        if (slot.audio.isPlaying) slot.audio.stop();
        continue;
      }
      used.add(slot.id);
      const target = trafficEngine(match.speed, match.bulky);
      slot.pitch += (target.enginePitch - slot.pitch) * pitchBlend;
      const want = target.engineGain * match.falloff;
      slot.gain += (want - slot.gain) * gainBlend;
      shape(slot.filter, match.bulky);
      voice(slot.audio, slot.gain, slot.pitch);
    }
    for (const car of heard) {
      if (used.has(car.id)) continue;
      const slot = trafficVoices.find((entry) => entry.id == null);
      if (!slot) continue;
      const target = trafficEngine(car.speed, car.bulky);
      slot.id = car.id;
      slot.pitch = target.enginePitch;
      slot.gain = target.engineGain * car.falloff;
      shape(slot.filter, car.bulky);
      voice(slot.audio, slot.gain, slot.pitch);
      used.add(car.id);
    }
  }

  function update(dt, sample, cars, hearX, hearZ) {
    updateTraffic(dt, cars, hearX || 0, hearZ || 0);
    if (!sample) {
      if (playing) silence();
      return;
    }
    playing = true;
    shape(engineLowpass, sample.bulky);
    voice(engine, sample.engineGain, sample.enginePitch);
    voice(skid, sample.skidGain, sample.skidPitch);
    const step = Math.max(0, dt);
    if (sample.emit) {
      spawnLeft += SPAWN_RATE * step;
      spawnRight += SPAWN_RATE * step;
      while (spawnLeft >= 1) {
        emitOne(sample, -1);
        spawnLeft -= 1;
      }
      while (spawnRight >= 1) {
        emitOne(sample, 1);
        spawnRight -= 1;
      }
    }
    for (const sprite of pool) {
      if (sprite.userData.life <= 0) continue;
      sprite.userData.life -= step;
      if (sprite.userData.life <= 0) {
        sprite.visible = false;
        continue;
      }
      const age = 1 - sprite.userData.life / LIFE;
      const size = sprite.userData.size * curve(SCALE_CURVE, age);
      sprite.scale.set(size, size, 1);
      sprite.material.opacity = Math.max(0, curve(ALPHA_CURVE, age));
      sprite.visible = textureReady;
    }
  }

  return {
    update,
    silence,
    status,
    listener,
  };
}
