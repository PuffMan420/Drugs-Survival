// Pistol clips are full-body stands. While he walks, the legs stay on the
// gait and the pistol owns the spine, head, and arms. Hips stay with the
// legs so the stride still reaches the spine.

const LOWER_PREFIXES = [
  "Root",
  "Hips",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "LeftToe",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
  "RightToe",
  "LeftFootIK",
  "LeftFootRoll",
  "LeftFootCtrl",
  "RightFootIK",
  "RightFootRoll",
  "RightFootCtrl",
  // GreenEye uses the Rig_Medium names. GLTFLoader strips dots, so
  // upperleg.l arrives as upperlegl and foot.l arrives as footl.
  "root",
  "hips",
  "upperleg",
  "lowerleg",
  "foot",
  "toes",
  "heelIK",
  "IK-foot",
  "IK-toe",
  "control-foot-roll",
  "control-heel-roll",
  "control-toe-roll",
  "kneeIK",
  // UAL skeleton (Modular characters): root, pelvis, thigh_l, calf_l,
  // foot_l, ball_l and the right side. "root" and "foot" are listed above.
  "pelvis",
  "thigh",
  "calf",
  "ball",
];

const LEG_POSES = new Set(["pistolAim", "pistolShoot", "pistolReload"]);

export function isLowerBone(name) {
  return LOWER_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix));
}

export function splitTrackNames(names) {
  const lower = [];
  const upper = [];
  for (const name of names) {
    const bone = name.split(".")[0];
    (isLowerBone(bone) ? lower : upper).push(name);
  }
  return { lower, upper };
}

// Shoot wins over the held aim so the recoil plays, and the aim pose returns
// when the shot window ends. Reload wins over both.
const UPPER_BODY = new Set([
  "punchCross",
  "punchJab",
  "meleeHook",
  "overhandThrow",
  "consume",
  "swordIdle",
  "swordRegularA",
  "swordRegularB",
  "swordRegularC",
  "swordHeavy",
  "hitChest",
  "hitHead",
  // Two-handed shotgun (Kevin Iglesias rifle aim and shoot, retargeted). The
  // clips only carry the spine, head, and arms, so the gait always keeps the legs.
  // Carry is Kevin's WeaponHold_Rifle01.
  "shotgunHold",
  "shotgunAim",
  "shotgunShoot",
]);

// Jump_Start is 1.33s; speed it up so the hop into a car stays snappy.
export const JUMP_MAX = 0.35;
// After a flinch, wait at least this long before another. Hit_Head is 0.42s.
export const HIT_REACT_COOLDOWN = 0.5;
export const GUN_PRIORITY = new Set(["pistolShoot", "pistolReload", "shotgunShoot"]);

export function clipSpeedForMax(duration, max) {
  const d = Number(duration) || 0;
  const cap = Number(max) || 0;
  if (!(d > cap) || !(cap > 0)) return 1;
  return d / cap;
}

// A flinch does not play on overdose ticks, car hits (those use knockback),
// a gun shot or reload, or while a full-body cue already owns the figure.
export function shouldPlayHit({ source, pose, locked, cooldown }) {
  if (locked) return false;
  if (source === "overdose" || source === "car") return false;
  if (GUN_PRIORITY.has(pose)) return false;
  if (cooldown > 0) return false;
  return true;
}

export function pistolPose({
  armed,
  busy,
  reloading,
  shooting,
  aiming,
  weapon = "pistol",
  punch = "",
  swing = "",
}) {
  if (busy) return "";
  // Empty hands. The jab, the cross, and the hook take the arms. The gait keeps the legs.
  if (weapon === "hands") return shooting ? punch : "";
  if (!armed) return "";
  if (weapon === "bottle") return shooting ? "overhandThrow" : "";
  // Sword idle until a light combo swing or the heavy swing.
  if (weapon === "bat") return shooting ? (swing || "swordRegularA") : "swordIdle";
  // The shotgun stays in both hands on its own clips: carry (also while
  // reloading; the left hand loads shells on top of it), aim, and shoot.
  if (weapon === "shotgun") {
    if (reloading) return "shotgunHold";
    if (shooting) return "shotgunShoot";
    if (aiming) return "shotgunAim";
    return "shotgunHold";
  }
  // Pistol and scorpion share the pistol poses.
  if (reloading) return "pistolReload";
  if (shooting) return "pistolShoot";
  if (aiming) return "pistolAim";
  // Held, but not aiming: Idle_Loop / Walk / Jog / Sprint carry the gun.
  return "";
}

export function legsWhileAiming(pose, moving) {
  // Upper-body clips keep the gait on the legs, including a stand.
  if (UPPER_BODY.has(pose)) return true;
  return moving && LEG_POSES.has(pose);
}

// Left click while right-click is held. A chord can report the right button
// up for one event, so a shot still counts for a short moment after it drops.
export function aimChord({ armed, busy, aiming, right, left, leftWas, sinceRight, hold = 120 }) {
  if (busy) return { aiming, fire: false };
  let next = aiming;
  if (right && armed) next = true;
  const recent = sinceRight >= 0 && sinceRight < hold;
  const fire = Boolean(armed && left && !leftWas && (next || recent));
  if (fire) next = true;
  return { aiming: next, fire };
}

// Which way the feet carry him. Without an aim he walks where he faces, as
// before. While aiming he faces the aim but walks the WASD wish (a strafe);
// with no wish the last direction is kept while speed eases to a stop.
export function moveDirection({ aiming, facing, wishX, wishZ, lastX, lastZ }) {
  if (!aiming) return { x: Math.sin(facing), z: Math.cos(facing) };
  const wish = Math.hypot(wishX, wishZ);
  if (wish > 0.001) return { x: wishX / wish, z: wishZ / wish };
  return { x: lastX, z: lastZ };
}
