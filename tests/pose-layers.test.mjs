import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { aimChord, isLowerBone, legsWhileAiming, pistolPose, splitTrackNames } from "../js/pose-layers.js";

test("legs and feet stay on the lower layer, and the gun arm stays on the upper", () => {
  assert.equal(isLowerBone("Hips"), true);
  assert.equal(isLowerBone("HipsCtrl"), true);
  assert.equal(isLowerBone("LeftUpLeg"), true);
  assert.equal(isLowerBone("LeftFootRollCtrl"), true);
  assert.equal(isLowerBone("RightToes_end"), true);
  assert.equal(isLowerBone("Spine"), false);
  assert.equal(isLowerBone("UpperChest"), false);
  assert.equal(isLowerBone("RightArm"), false);
  assert.equal(isLowerBone("RightForeArm"), false);
  assert.equal(isLowerBone("RightHand"), false);
  assert.equal(isLowerBone("Head"), false);
});

test("a shot while aiming plays the shoot pose, then aim returns", () => {
  const aimed = { armed: true, busy: false, reloading: false, shooting: false, aiming: true, speed: 80 };
  assert.equal(pistolPose(aimed), "pistolAim");
  assert.equal(pistolPose({ ...aimed, shooting: true }), "pistolShoot");
  assert.equal(pistolPose({ ...aimed, shooting: true, reloading: true }), "pistolReload");
  assert.equal(pistolPose({ ...aimed, aiming: false, speed: 0 }), "");
  assert.equal(pistolPose({ ...aimed, aiming: false, speed: 40 }), "");
  assert.equal(pistolPose({ ...aimed, weapon: "bottle" }), "");
  assert.equal(pistolPose({ ...aimed, weapon: "bottle", shooting: true }), "punchCross");
  assert.equal(pistolPose({ ...aimed, weapon: "bat", aiming: false }), "swordIdle");
  assert.equal(pistolPose({ ...aimed, weapon: "bat", aiming: true }), "swordIdle");
  assert.equal(pistolPose({ ...aimed, weapon: "bat", shooting: true }), "swordAttack");
  assert.equal(pistolPose({ ...aimed, weapon: "bat", shooting: true, reloading: true }), "swordAttack");
  const bare = { armed: false, busy: false, reloading: false, shooting: false, aiming: false, weapon: "hands" };
  assert.equal(pistolPose(bare), "");
  assert.equal(pistolPose({ ...bare, shooting: true, punch: "punchJab" }), "punchJab");
  assert.equal(pistolPose({ ...bare, shooting: true, punch: "punchCross" }), "punchCross");
  assert.equal(pistolPose({ ...bare, busy: true, shooting: true, punch: "punchJab" }), "");
});

test("a left click fires while right-click is held, and once just after it drops", () => {
  const base = { armed: true, busy: false, aiming: true, right: true, left: true, leftWas: false, sinceRight: 0 };
  assert.equal(aimChord(base).fire, true);
  assert.equal(aimChord({ ...base, leftWas: true }).fire, false);
  assert.equal(aimChord({ ...base, right: false, aiming: false, sinceRight: 40 }).fire, true);
  assert.equal(aimChord({ ...base, right: false, aiming: false, sinceRight: 400 }).fire, false);
  assert.equal(aimChord({ ...base, armed: false }).fire, false);
  assert.equal(aimChord({ ...base, busy: true }).fire, false);
});

test("moving while aiming, shooting, or reloading keeps the gait on the legs", () => {
  assert.equal(legsWhileAiming("pistolAim", true), true);
  assert.equal(legsWhileAiming("pistolShoot", true), true);
  assert.equal(legsWhileAiming("pistolReload", true), true);
  assert.equal(legsWhileAiming("pistolAim", false), false);
  assert.equal(legsWhileAiming("pistolIdle", true), false);
  assert.equal(legsWhileAiming("", true), false);
  assert.equal(legsWhileAiming("punchCross", true), true);
  assert.equal(legsWhileAiming("punchCross", false), true);
  assert.equal(legsWhileAiming("swordIdle", true), false);
  assert.equal(legsWhileAiming("swordAttack", true), false);
  assert.equal(legsWhileAiming("punchJab", true), true);
  assert.equal(legsWhileAiming("punchJab", false), true);
});

function glbTrackNames(path, clipName) {
  const data = readFileSync(path);
  const jsonLength = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
  const nodes = doc.nodes.map((node) => node.name || "");
  const clip = doc.animations.find((item) => item.name === clipName);
  return clip.channels.map((channel) => `${nodes[channel.target.node]}.${channel.target.path}`);
}

test("the gubbe walk and aim clips both have legs and arms to split", () => {
  for (const clipName of ["Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Punch_Cross", "Punch_Jab"]) {
    const names = glbTrackNames(new URL("../assets/player/gubbe.glb", import.meta.url), clipName);
    const split = splitTrackNames(names);
    assert.ok(split.lower.some((name) => name.startsWith("LeftUpLeg.")), clipName);
    assert.ok(split.upper.some((name) => name.startsWith("RightForeArm.")), clipName);
    assert.equal(split.lower.length + split.upper.length, names.length, clipName);
  }
});
