// Unarmed punches. Jab then cross, then jab again. The jab's left forearm is
// furthest from rest at 0.208s. The cross's right forearm first reaches full
// extension at 0.292s. Those are the hits. Each clip then plays out.

export const JAB = "punchJab";
export const CROSS = "punchCross";
export const JAB_HIT = 0.208;
export const CROSS_HIT = 0.292;
export const JAB_POSE = 0.833;
export const CROSS_POSE = 1;
// Arm's length, not a tile. A ped beside him or behind him is out of the fist.
export const PUNCH_REACH = 36;
export const PUNCH_SIDE = 14;

export function nextPunch(current) {
  return current === JAB ? CROSS : JAB;
}

export function punchTiming(name) {
  if (name === CROSS) return { hit: CROSS_HIT, pose: CROSS_POSE };
  return { hit: JAB_HIT, pose: JAB_POSE };
}

// dirX/dirZ is the way he faces, a unit vector.
export function punchHits(px, pz, dirX, dirZ, x, z, reach = PUNCH_REACH, side = PUNCH_SIDE) {
  const dx = x - px;
  const dz = z - pz;
  const along = dx * dirX + dz * dirZ;
  if (along < 0 || along > reach) return false;
  const lateral = dirX * dz - dirZ * dx;
  return Math.abs(lateral) <= side;
}
