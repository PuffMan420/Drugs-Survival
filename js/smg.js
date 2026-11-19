// Scorpion SMG. Full auto. It uses the pistol aim, shoot, and reload poses.
// Hand local: +Y runs wrist to knuckles, +X toward the pinky, -Z is the palm.
// The mesh barrel is +Z and the grip hangs toward -Y. The euler turns the
// barrel out through the knuckles and the sights away from the palm.

export const SMG_DAMAGE = 1;
export const SMG_RANGE = 200;
export const SMG_FIRE_RATE = 12;
export const SMG_MAG = 20;
// Widest angle a bullet can leave the aim line, in degrees.
export const SMG_SPREAD_DEG = 6;
export const SMG_HAND = [0, 0.12, -0.04];
export const SMG_EULER = [Math.PI / 2, Math.PI, 0];
export const SMG_SCALE = 0.22;
// Mesh space, before SMG_EULER. The flash sits at the barrel tip.
export const SMG_MUZZLE = [0, 0.15, 2.1];
