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
