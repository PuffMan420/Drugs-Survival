// A moving car against one pedestrian. Boxes only: no scene raycasts.
// Traffic cruises near 108 and corners near 46. Under this, a brush does nothing.
export const CAR_KILL_SPEED = 36;
const PED_BODY = 8;
const CAR_LEVEL = 36;
const GROUND_Y = 0.6;

export function carVelocity(car, driven) {
  if (!car) return null;
  if (car.held) {
    if (!driven) return null;
    const dirX = driven.vx || 0;
    const dirZ = driven.vz || 0;
    const speed = Math.hypot(dirX, dirZ);
    if (!(speed > CAR_KILL_SPEED)) return null;
    return { dirX, dirZ };
  }
  const speed = car.speed || 0;
  if (!(speed > CAR_KILL_SPEED)) return null;
  const angle = car.angle || 0;
  return { dirX: -Math.sin(angle), dirZ: -Math.cos(angle) };
}

export function carReachesPed(car, x, z, y) {
  const carY = car.y == null ? GROUND_Y : car.y;
  if (y != null && Math.abs(carY - y) > CAR_LEVEL) return false;
  const hx = (car.w || 36) / 2 + PED_BODY;
  const hz = (car.h || 70) / 2 + PED_BODY;
  const ox = x - car.x;
  const oz = z - car.z;
  if (ox * ox + oz * oz > hx * hx + hz * hz) return false;
  const angle = car.angle || 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  return Math.abs(lx) <= hx && Math.abs(lz) <= hz;
}
