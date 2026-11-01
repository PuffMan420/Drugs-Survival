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
export function pistolPose({ armed, busy, reloading, shooting, aiming, weapon = "pistol" }) {
  if (!armed || busy) return "";
  if (weapon === "bottle") return shooting ? "punchCross" : "";
  if (reloading) return "pistolReload";
  if (shooting) return "pistolShoot";
  if (aiming) return "pistolAim";
  // Held, but not aiming: Idle_Loop / Walk / Jog / Sprint carry the gun.
  return "";
}

export function legsWhileAiming(pose, moving) {
  // The cross is the throw. Its legs never play; the gait does, including a stand.
  if (pose === "punchCross") return true;
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
