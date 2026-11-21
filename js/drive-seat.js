// The point the player hops toward when getting into a car. Kept free of
// physics so tests can check it without loading Rapier.

// Forward is -Z, left is -X. The hop lands just inside the driver's door,
// at foot height — the figure is then hidden, the same as on main.
export const HOP_SIDE = 0.22;
export const HOP_FORWARD = 0.08;
// Extra lift at mid-hop so the jump reads from the 30-degree camera.
export const HOP_LIFT = 10;

export function localPoint(car, lx, lz) {
  const c = Math.cos(car.angle || 0);
  const s = Math.sin(car.angle || 0);
  return {
    x: car.x + lx * c + lz * s,
    z: car.z - lx * s + lz * c,
    y: car.y == null ? 0.6 : car.y,
  };
}

// Ground-level spot just inside the driver's door.
// doorSide is -1 for local -X (default) and +1 for local +X.
export function hopTarget(car) {
  const w = car.w || 36;
  const h = car.h || 70;
  const y0 = car.y == null ? 0.6 : car.y;
  const side = car.doorSide == null || car.doorSide < 0 ? -1 : 1;
  const pos = localPoint(car, side * w * HOP_SIDE, -h * HOP_FORWARD);
  return { x: pos.x, y: y0, z: pos.z };
}
