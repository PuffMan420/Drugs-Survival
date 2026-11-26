// Scorpion SMG. Full auto. It uses the pistol aim, shoot, and reload poses.
// Hand local: +Y runs wrist to knuckles, +X toward the pinky, -Z is the palm.
// Mesh (scorpion.glb): the barrel tip is at -Z (z -2.4), the brown grip
// (Brown_SMG05) hangs toward -Y at the back (z 1.1..2.2), the magazine hangs
// in front of it at z ~ -0.7 and the sights are on top (+Y).
// SMG_EULER (three.js XYZ) turns mesh -Z to hand +Y (barrel out past the
// knuckles), mesh -Y to hand +X (grip down through the fist toward the pinky,
// like the pistol) and mesh +X to hand +Z.

export const SMG_DAMAGE = 1;
export const SMG_RANGE = 240;
export const SMG_FIRE_RATE = 12;
export const SMG_MAG = 20;
// Widest angle a bullet can leave the aim line, in degrees.
export const SMG_SPREAD_DEG = 2.5;
// The fist closes on the upper half of the brown grip, where the pistol grip sits.
export const SMG_HAND = [-0.2, 0.5, -0.09];
export const SMG_EULER = [Math.PI / 2, 0, Math.PI / 2];
export const SMG_SCALE = 0.22;
// Mesh space, before SMG_EULER. The flash sits at the barrel tip.
export const SMG_MUZZLE = [0, 0.05, -2.4];
