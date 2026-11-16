import { PLAYER_SPEED } from "./constants.js";

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
export function pistolPose({ armed, busy, reloading, shooting, aiming, weapon = "pistol", punch = "", speed = 0 }) {
  if (busy) return "";
  // Empty hands. The jab and the cross take the arms; the gait keeps the legs.
  if (weapon === "hands") return shooting ? punch : "";
  if (!armed) return "";
  if (weapon === "bottle") return shooting ? "punchCross" : "";
  // One hand on the shoulder, or hanging, until the two-hand swing.
  // Sprint is 1.4 times the jog. The hang starts past the middle of that gap.
  if (weapon === "bat") {
    if (shooting) return "batSwing";
    return speed / PLAYER_SPEED >= 1.2 ? "batHang" : "batShoulder";
  }
  if (reloading) return "pistolReload";
  if (shooting) return "pistolShoot";
  if (aiming) return "pistolAim";
  // Held, but not aiming: Idle_Loop / Walk / Jog / Sprint carry the gun.
  return "";
}

export function legsWhileAiming(pose, moving) {
  // The cross is the throw. Its legs never play; the gait does, including a stand.
  if (pose === "punchCross" || pose === "punchJab") return true;
  if (pose === "batShoulder" || pose === "batHang" || pose === "batSwing") return true;
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
