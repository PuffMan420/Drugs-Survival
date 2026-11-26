// Pump shotgun. Five pellets in a cone, then a kick that eases back.
// Hand local: +Y runs wrist to knuckles, +X toward the pinky, -Z is the palm.
// Mesh (shotgun.glb): the barrel tip is +X (x 2.18), the brown stock is the
// back (x -2.73..-1.25, the butt drops toward -Y), the pump is the brown part
// at x 0..1.1 and the top is +Y. SHOTGUN_EULER is the pistol's turn: mesh +X
// to hand +Y (barrel out past the knuckles) and mesh +Y to hand -X (top up,
// grip side down through the fist), so the gun stands upright in the hand
// like the pistol and the SMG instead of lying on its side.

export const SHOTGUN_PELLETS = 5;
export const SHOTGUN_PELLET_DAMAGE = 1;
export const SHOTGUN_RANGE = 144;
// Widest angle a pellet can leave the aim line, in degrees.
export const SHOTGUN_SPREAD_DEG = 20;
export const SHOTGUN_FIRE_DELAY = 1.0;
export const SHOTGUN_MAG = 6;
// Half a second longer than the pistol / Scorpion reload (1.67s).
export const SHOTGUN_RELOAD_TIME = 2.17;
// Shot variants, heavier then extra-heavy, picked at random like other gun clips.
export const SHOTGUN_SOUND_FILES = ["shotgun-shot-1.mp3", "shotgun-shot-2.mp3"];
export const SHOTGUN_SOUND_VOLUME = 0.4;
export const SHOTGUN_RELOAD_SOUND_FILES = ["shotgun-reload.mp3"];
export const SHOTGUN_RELOAD_SOUND_VOLUME = 0.35;
// Closing-rack variants, picked at random when a shotgun reload actually finishes.
export const SHOTGUN_RELOAD_END_SOUND_FILES = ["shotgun-reload-end-1.mp3", "shotgun-reload-end-2.mp3"];
export const SHOTGUN_RELOAD_END_SOUND_VOLUME = 0.3;
// Pump-rack variants, played when the pump starts moving after a shot.
export const SHOTGUN_PUMP_SOUND_FILES = ["shotgun-pump-1.mp3", "shotgun-pump-2.mp3"];
export const SHOTGUN_PUMP_SOUND_VOLUME = 0.3;
// Never picks the last clip if another one is available (same as reloads / crashes).
export function pickShotgunClip(lastIndex, count, random = Math.random()) {
  const n = Math.max(1, count | 0);
  if (n === 1) return 0;
  if (lastIndex == null || lastIndex < 0 || lastIndex >= n) {
    return Math.floor(random * n) % n;
  }
  const skip = Math.floor(random * (n - 1)) % (n - 1);
  return skip >= lastIndex ? skip + 1 : skip;
}
export const SHOTGUN_KICK_BACK = 0.35;
export const SHOTGUN_KICK_UP_DEG = 22;
export const SHOTGUN_KICK_RETURN = 0.25;
// The fist closes on the wrist of the stock (mesh x ~ -1.4), just behind the
// receiver, so the stock runs back along the forearm and the barrel forward.
export const SHOTGUN_HAND = [0.02, 0.59, -0.09];
export const SHOTGUN_EULER = [0, 0, Math.PI / 2];
export const SHOTGUN_SCALE = 0.32;
// Mesh space, before SHOTGUN_EULER. The flash sits at the barrel tip.
export const SHOTGUN_MUZZLE = [2.15, 0.02, 0];
// Ted: "way too small, 40% thicker and 25% longer at least", then "10% thicker".
// The mesh grows 1.25x along its length (mesh X, muzzle to stock) and
// 1.54x (1.4 x 1.1) across (mesh Y and Z).
export const SHOTGUN_LENGTH_SCALE = 1.25;
export const SHOTGUN_THICK_SCALE = 1.54;
// Mesh space: the middle of the stock wrist the fist closes on. The bigger mesh
// grows around this point so the grip stays in the hand; the muzzle (a child of
// the mesh, at SHOTGUN_MUZZLE) moves out with the longer barrel by itself.
export const SHOTGUN_GRIP = [-1.4, -0.04, 0];
// Mesh space: the underside of the brown pump (x 0.22..1.12, bottom y -0.12)
// where the left palm presses in the two-handed hold.
export const SHOTGUN_PUMP = [0.67, -0.12, -0.015];
// Two-handed hold (aim and shoot, see player.js shotgunAim / shotgunShoot):
// the gun turns about the right fist so the pump points at the left palm of
// the rifle clip, then a small left-arm reach puts the palm on the pump. It
// blends in with the clip's weight, so the one-handed carry and the reload
// keep the old hold.
// The palm sits this many hand lengths (wrist to middle knuckle) off the hand
// bone's middle, on the palm side.
export const SHOTGUN_PALM_OFFSET = 0.3;
// Share of the kick on the two-handed hold. The shoot clip already recoils
// both arms, so the gun only adds a little and the left hand stays on the pump.
export const SHOTGUN_RIFLE_KICK = 0.35;
// Pump after every shot: the brown pump (split off the stock at load, see
// pistol.js) slides back toward the receiver and forward again, and the left
// hand rides on it. Mesh units along -X. Back by the time the shell flies
// (0.3s after the shot), home well inside SHOTGUN_FIRE_DELAY.
export const SHOTGUN_PUMP_TRAVEL = 0.45;
export const SHOTGUN_PUMP_START = 0.16;
export const SHOTGUN_PUMP_BACK = 0.13;
export const SHOTGUN_PUMP_HOLD = 0.04;
export const SHOTGUN_PUMP_FORWARD = 0.14;
// Mesh x of the brown that belongs to the pump; the stock ends at -1.25.
export const SHOTGUN_PUMP_MIN_X = -0.5;
// 0 at rest, 1 fully racked back.
export function pumpSlide(age) {
  const a = Number(age) - SHOTGUN_PUMP_START;
  if (!(a > 0)) return 0;
  const ease = (t) => t * t * (3 - 2 * t);
  if (a < SHOTGUN_PUMP_BACK) return ease(a / SHOTGUN_PUMP_BACK);
  const hold = a - SHOTGUN_PUMP_BACK;
  if (hold < SHOTGUN_PUMP_HOLD) return 1;
  const back = hold - SHOTGUN_PUMP_HOLD;
  if (back < SHOTGUN_PUMP_FORWARD) return 1 - ease(back / SHOTGUN_PUMP_FORWARD);
  return 0;
}

// Carry (idle, walk, run, reload): low ready. Kevin's
// WeaponHold_Rifle01 keeps the body and the shoulders square, and both arms
// reach (arm bones only) to a gun placed in front of him: stock wrist at the
// right front of the chest, barrel forward and down, angled a little across to
// his left so the left hand can reach the pump with the shoulders square.
// Player frame offset from the upper spine (spine_03), car units, +X his left,
// +Z forward.
export const SHOTGUN_CARRY_GRIP = [-1.7, -2.9, 3.6];
export const SHOTGUN_CARRY_YAW_DEG = 30;
export const SHOTGUN_CARRY_PITCH_DEG = 20;
// Mesh x on the pump where the left palm sits in the carry (the aim uses the
// middle of the pump, SHOTGUN_PUMP; the carry holds its back end).
export const SHOTGUN_CARRY_PUMP_X = 0.32;
// Reload: the gun rolls this much so the port under the receiver faces the
// left hand.
export const SHOTGUN_RELOAD_ROLL_DEG = 25;
// Unit grip-to-pump direction of the carry in the player frame.
export function carryDirection(yawDeg = SHOTGUN_CARRY_YAW_DEG, pitchDeg = SHOTGUN_CARRY_PITCH_DEG) {
  const yaw = yawDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

// Reload: the right hand keeps the gun steady in the carry and the left hand
// loads one shell per empty slot through the port under the receiver.
// Mesh space: the loading port, just under the receiver.
export const SHOTGUN_PORT = [-0.75, -0.3, 0];
// Mesh units the left hand drops below the port between shells (fetching the
// next shell right there, not from the hip).
export const SHOTGUN_PORT_DROP = 0.35;
// Where the left hand is during a reload of `shells` shells over `duration`
// seconds, `elapsed` in. away: 0 at the port, 1 a little below it. push: 0..1, the
// thumb pressing the shell in. lead: 0..1, how far it has left the pump.
export function reloadHand(elapsed, duration, shells) {
  const ease = (t) => t * t * (3 - 2 * t);
  const total = Number(duration) > 0 ? Number(duration) : 1;
  const count = Math.max(1, Math.round(Number(shells) || 1));
  const t = Math.min(total, Math.max(0, Number(elapsed) || 0));
  // The first and last 8% slide the hand off the pump and back onto it.
  const edge = total * 0.08;
  const lead = t < edge ? ease(t / edge) : t > total - edge ? ease((total - t) / edge) : 1;
  const body = total - edge * 2;
  const u0 = Math.min(0.9999, Math.max(0, (t - edge) / body)) * count;
  const u = u0 - Math.floor(u0);
  let away = 0;
  let push = 0;
  if (u < 0.35) away = ease(u / 0.35);
  else if (u < 0.45) away = 1;
  else if (u < 0.8) away = 1 - ease((u - 0.45) / 0.35);
  else push = Math.sin(((u - 0.8) / 0.2) * Math.PI);
  // With many shells the trip to the pouch gets shorter so the hand never blurs.
  const reach = Math.min(1, body / count / 0.45);
  return { away: away * lead * reach, push: push * lead, lead, shell: Math.min(count, Math.floor(u0) + 1) };
}

// How much of the kick is still showing. 1 at the shot, 0 when it has eased back.
export function kickBlend(age, duration = SHOTGUN_KICK_RETURN) {
  const limit = duration > 0 ? duration : 1;
  const t = Math.min(1, Math.max(0, age / limit));
  const eased = t * t * (3 - 2 * t);
  return 1 - eased;
}

// One direction inside a cone around the aim. spreadDeg is the widest angle.
export function spreadDirection(x, y, z, spreadDeg, random = Math.random) {
  const len = Math.hypot(x, y, z) || 1;
  const dx = x / len;
  const dy = y / len;
  const dz = z / len;
  const spread = (Number(spreadDeg) * Math.PI) / 180;
  if (!(spread > 0)) return { x: dx, y: dy, z: dz };
  let sx = -dz;
  let sy = 0;
  let sz = dx;
  let side = Math.hypot(sx, sy, sz);
  if (side < 1e-6) {
    sx = 1;
    sy = 0;
    sz = 0;
    side = 1;
  }
  sx /= side;
  sy /= side;
  sz /= side;
  const ux = sy * dz - sz * dy;
  const uy = sz * dx - sx * dz;
  const uz = sx * dy - sy * dx;
  const radius = Math.sqrt(Math.min(1, Math.max(0, random()))) * spread;
  const theta = random() * Math.PI * 2;
  const yaw = Math.cos(theta) * radius;
  const pitch = Math.sin(theta) * radius;
  const ox = dx + sx * yaw + ux * pitch;
  const oy = dy + sy * yaw + uy * pitch;
  const oz = dz + sz * yaw + uz * pitch;
  const out = Math.hypot(ox, oy, oz) || 1;
  return { x: ox / out, y: oy / out, z: oz / out };
}

// Yaw on the ground around the aim. The angle is measured at the player.
export function spreadFlat(x, z, spreadDeg, random = Math.random) {
  const len = Math.hypot(x, z) || 1;
  const ux = x / len;
  const uz = z / len;
  const spread = (Number(spreadDeg) * Math.PI) / 180;
  if (!(spread > 0)) return { x: ux, z: uz };
  const a = (random() * 2 - 1) * spread;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: ux * c - uz * s, z: ux * s + uz * c };
}
