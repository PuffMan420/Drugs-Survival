// Pump shotgun. Five pellets in a cone, then a kick that eases back.
// Hand local: +Y runs wrist to knuckles, +X toward the pinky, -Z is the palm.
// The mesh barrel is +X and the stock is -X. SHOTGUN_EULER is applied Z, then
// Y, then X, so the barrel leaves through the knuckles.

export const SHOTGUN_PELLETS = 5;
export const SHOTGUN_PELLET_DAMAGE = 1;
export const SHOTGUN_RANGE = 144;
// Widest angle a pellet can leave the aim line, in degrees.
export const SHOTGUN_SPREAD_DEG = 20;
export const SHOTGUN_FIRE_DELAY = 1.0;
export const SHOTGUN_MAG = 6;
export const SHOTGUN_KICK_BACK = 0.15;
export const SHOTGUN_KICK_UP_DEG = 12;
export const SHOTGUN_KICK_RETURN = 0.25;
export const SHOTGUN_HAND = [0, 0.1, -0.03];
export const SHOTGUN_EULER = [0, -Math.PI / 2, Math.PI / 2];
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
