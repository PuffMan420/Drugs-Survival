// GPU-cheap 24h cycle. No Three.js, no allocations on the hot path: pass
// the same `out` object each time and read its fields.
// Lighting reuses the existing directional sun (moon at night), hemisphere,
// fog / clear color, and instanced car glow sprites. No extra lights.

import { parseLookPreview } from "./look-preview.js";

export const CYCLE_SECONDS = 1440;
export const CYCLE_START_HOUR = 11;
export const MIN_ELEVATION_DEG = 25;

const MIN_EL = MIN_ELEVATION_DEG * Math.PI / 180;
const MIN_Y = Math.sin(MIN_EL);
const MIN_XZ = Math.cos(MIN_EL);

const DAY_DIR = normalize([-0.4, 0.92, -0.58]);
const AFTERNOON_DIR = normalize([-0.86, 0.42, -0.18]);

// Keyframes. hour 24 matches hour 0 so wrap is a straight lerp.
// Directions stay in the northern sky so shadows fall toward the camera.
const KEYS = [
  // Late night, cool and readable.
  key(0, azel(10, 36), 0xc5d2e8, 0.22, 0x8ea0b8, 0x3a4554, 0.50, 0x3f4c5e, 1800, 7200, 1.08),
  key(3, azel(25, 34), 0xc5d2e8, 0.20, 0x8496b0, 0x384352, 0.48, 0x3c495b, 1800, 7200, 1.08),
  // First light, still cool.
  key(5.25, azel(55, 28), 0xd8c8c0, 0.22, 0xb08e8a, 0x4a4548, 0.50, 0x5a555c, 1900, 7600, 1.06),
  // Sunrise: warm gold, long shadows, elevation stays at the 25° floor.
  key(6.5, azel(85, 25), 0xffb068, 0.40, 0xffc8a8, 0x8a6a58, 0.54, 0xc8a890, 2000, 8000, 1.05),
  key(8, azel(50, 40), 0xffe0b8, 0.52, 0xffeedc, 0x7e6c5c, 0.54, 0xc8b8a4, 2000, 8000, 1.05),
  // 11:00 start: bright late morning, close to the familiar daytime sun.
  key(11, azel(-28, 50), 0xffd8b0, 0.58, 0xfff2e4, 0x7a6a58, 0.55, 0xc6bba8, 2000, 8000, 1.05),
  // Midday: exact current day direction and colours.
  key(12, DAY_DIR, 0xffd4a6, 0.60, 0xfff2e4, 0x7a6a58, 0.55, 0xc6bba8, 2000, 8000, 1.05),
  key(13.5, azel(-42, 50), 0xffd0a0, 0.58, 0xffefe0, 0x7a6a58, 0.55, 0xc6bba8, 2000, 8000, 1.05),
  // Afternoon into golden sunset. 18.5 uses the current low west sun.
  key(16, azel(-62, 36), 0xffc080, 0.48, 0xffe4cc, 0x8a7060, 0.56, 0xcbb39a, 2000, 8200, 1.05),
  key(18, AFTERNOON_DIR, 0xffa24a, 0.42, 0xffd0b0, 0xa07050, 0.56, 0xd4a878, 2000, 8600, 1.05),
  key(18.5, AFTERNOON_DIR, 0xff8e3a, 0.40, 0xffc49a, 0xa06848, 0.55, 0xd49a68, 2000, 8800, 1.04),
  // Dusk: sun dies, fill stays up so the street does not go black.
  key(19.5, azel(-100, 26), 0xff7a40, 0.22, 0xc09090, 0x5a4858, 0.50, 0x6a5870, 1900, 7600, 1.06),
  // Night: cool moonlit blue-slate, headlights take over the sparkle.
  key(21, azel(-20, 38), 0xc5d2e8, 0.24, 0x8ea0b8, 0x3c4656, 0.50, 0x425060, 1800, 7200, 1.08),
  key(23, azel(0, 36), 0xc5d2e8, 0.22, 0x8ea0b8, 0x3a4554, 0.50, 0x3f4c5e, 1800, 7200, 1.08),
  key(24, azel(10, 36), 0xc5d2e8, 0.22, 0x8ea0b8, 0x3a4554, 0.50, 0x3f4c5e, 1800, 7200, 1.08),
];

const OUT = emptySample();

function normalize(raw) {
  const length = Math.hypot(raw[0], raw[1], raw[2]) || 1;
  return [raw[0] / length, raw[1] / length, raw[2] / length];
}

// az 0 = north (-Z), 90 = east (+X), -90 = west (-X). el is degrees above the horizon.
function azel(azDeg, elDeg) {
  const el = Math.max(MIN_ELEVATION_DEG, elDeg) * Math.PI / 180;
  const az = azDeg * Math.PI / 180;
  const c = Math.cos(el);
  return normalize([Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c]);
}

function rgb(hex) {
  return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
}

function key(hour, dir, sunHex, sunI, skyHex, groundHex, hemiI, fogHex, fogNear, fogFar, exposure) {
  return {
    hour,
    dir,
    sun: rgb(sunHex),
    sunI,
    sky: rgb(skyHex),
    ground: rgb(groundHex),
    hemiI,
    fog: rgb(fogHex),
    fogNear,
    fogFar,
    exposure,
  };
}

function emptySample() {
  return {
    hour: 0,
    dirX: 0,
    dirY: 1,
    dirZ: 0,
    sunR: 1,
    sunG: 1,
    sunB: 1,
    sunIntensity: 0.6,
    hemiSkyR: 1,
    hemiSkyG: 1,
    hemiSkyB: 1,
    hemiGroundR: 1,
    hemiGroundG: 1,
    hemiGroundB: 1,
    hemiIntensity: 0.55,
    fogR: 1,
    fogG: 1,
    fogB: 1,
    fogNear: 2000,
    fogFar: 8000,
    exposure: 1.05,
    shadowFar: 4200,
    nightFactor: 0,
    glowScale: 1,
    lampEmissive: 0.55,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(outR, outG, outB, a, b, t, target) {
  target[outR] = lerp(a[0], b[0], t);
  target[outG] = lerp(a[1], b[1], t);
  target[outB] = lerp(a[2], b[2], t);
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// 0 by day, 1 at night, smooth ramps around dusk and dawn.
export function nightFactorAt(hour) {
  const h = wrapHour(hour);
  if (h >= 20.5 || h <= 5) return 1;
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h > 17.5 && h < 20.5) return clamp01((h - 17.5) / 3);
  return clamp01(1 - (h - 5) / 2.5);
}

export function wrapHour(hour) {
  const n = Number(hour);
  if (!Number.isFinite(n)) return 0;
  const wrapped = n % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

export function stepCycleHour(hour, dt, duration = CYCLE_SECONDS) {
  const span = duration > 0 ? duration : CYCLE_SECONDS;
  return wrapHour((Number(hour) || 0) + (Number(dt) || 0) * (24 / span));
}

export function parseDayNight(search) {
  const query = typeof search === "string" && search.startsWith("?") ? search.slice(1) : (search || "");
  const params = new URLSearchParams(query);
  const timeRaw = params.get("time");
  if (timeRaw != null && timeRaw !== "") {
    const hour = Number(timeRaw);
    if (Number.isFinite(hour)) return { mode: "lock", hour: wrapHour(hour) };
  }
  if (params.get("cycle") === "off") return { mode: "lock", hour: 12 };
  const preview = parseLookPreview(typeof search === "string" ? search : `?${query}`);
  if (preview) return { mode: "legacy", afternoon: preview.afternoon === true };
  return { mode: "cycle", hour: CYCLE_START_HOUR, duration: CYCLE_SECONDS };
}

function liftDir(x, y, z, out) {
  const length = Math.hypot(x, y, z) || 1;
  let nx = x / length;
  let ny = y / length;
  let nz = z / length;
  if (ny < MIN_Y) {
    const horiz = Math.hypot(nx, nz) || 1;
    nx = (nx / horiz) * MIN_XZ;
    nz = (nz / horiz) * MIN_XZ;
    ny = MIN_Y;
  }
  out.dirX = nx;
  out.dirY = ny;
  out.dirZ = nz;
}

function writeKey(out, frame, hour, night) {
  liftDir(frame.dir[0], frame.dir[1], frame.dir[2], out);
  out.hour = hour;
  out.sunR = frame.sun[0];
  out.sunG = frame.sun[1];
  out.sunB = frame.sun[2];
  out.sunIntensity = frame.sunI;
  out.hemiSkyR = frame.sky[0];
  out.hemiSkyG = frame.sky[1];
  out.hemiSkyB = frame.sky[2];
  out.hemiGroundR = frame.ground[0];
  out.hemiGroundG = frame.ground[1];
  out.hemiGroundB = frame.ground[2];
  out.hemiIntensity = frame.hemiI;
  out.fogR = frame.fog[0];
  out.fogG = frame.fog[1];
  out.fogB = frame.fog[2];
  out.fogNear = frame.fogNear;
  out.fogFar = frame.fogFar;
  out.exposure = frame.exposure;
  finishSample(out, night);
}

function finishSample(out, night) {
  const low = clamp01((DAY_DIR[1] - out.dirY) / Math.max(1e-6, DAY_DIR[1] - MIN_Y));
  out.shadowFar = lerp(4200, 6400, low);
  out.nightFactor = night;
  // Dim in the day so night lamps actually read as lights, not as a constant glow.
  out.glowScale = lerp(0.28, 2.4, night);
  out.lampEmissive = lerp(0.12, 1.5, night);
}

export function sampleDayNight(hour, out = OUT) {
  const target = out || OUT;
  const h = wrapHour(hour);
  const night = nightFactorAt(h);
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1].hour <= h) i += 1;
  const a = KEYS[i];
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const span = b.hour - a.hour;
  const t = span > 0 ? (h - a.hour) / span : 0;
  if (t <= 0) {
    writeKey(target, a, h, night);
    return target;
  }
  if (t >= 1) {
    writeKey(target, b, h, night);
    return target;
  }
  liftDir(
    lerp(a.dir[0], b.dir[0], t),
    lerp(a.dir[1], b.dir[1], t),
    lerp(a.dir[2], b.dir[2], t),
    target,
  );
  target.hour = h;
  lerpRgb("sunR", "sunG", "sunB", a.sun, b.sun, t, target);
  target.sunIntensity = lerp(a.sunI, b.sunI, t);
  lerpRgb("hemiSkyR", "hemiSkyG", "hemiSkyB", a.sky, b.sky, t, target);
  lerpRgb("hemiGroundR", "hemiGroundG", "hemiGroundB", a.ground, b.ground, t, target);
  target.hemiIntensity = lerp(a.hemiI, b.hemiI, t);
  lerpRgb("fogR", "fogG", "fogB", a.fog, b.fog, t, target);
  target.fogNear = lerp(a.fogNear, b.fogNear, t);
  target.fogFar = lerp(a.fogFar, b.fogFar, t);
  target.exposure = lerp(a.exposure, b.exposure, t);
  finishSample(target, night);
  return target;
}
