import { Matrix4, Quaternion, Vector3 } from "three";

// Poses the right arm so the fist is on the bat handle. The gait still owns
// the rest of the body. Character axes: model -X is his right, +Y up, +Z forward.

const hips = new Vector3();
const shoulder = new Vector3();
const elbowNow = new Vector3();
const wristNow = new Vector3();
const handTarget = new Vector3();
const elbow = new Vector3();
const forward = new Vector3();
const up = new Vector3();
const right = new Vector3();
const barrel = new Vector3();
const knuckles = new Vector3();
const axisX = new Vector3();
const axisY = new Vector3();
const axisZ = new Vector3();
const pole = new Vector3();
const hint = new Vector3();
const parentQ = new Quaternion();
const worldQ = new Quaternion();
const basis = new Matrix4();

function reject(from, along, out) {
  return out.copy(from).addScaledVector(along, -from.dot(along));
}

function basisQuat(xDir, yHint, out) {
  axisX.copy(xDir).normalize();
  reject(yHint, axisX, axisY);
  if (axisY.lengthSq() < 1e-8) axisY.crossVectors(up, axisX);
  if (axisY.lengthSq() < 1e-8) axisY.crossVectors(forward, axisX);
  axisY.normalize();
  axisZ.crossVectors(axisX, axisY).normalize();
  out.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ));
}

function alignY(yDir, zHint, out) {
  axisY.copy(yDir).normalize();
  reject(zHint, axisY, axisZ);
  if (axisZ.lengthSq() < 1e-8) axisZ.crossVectors(axisY, right);
  if (axisZ.lengthSq() < 1e-8) axisZ.set(0, 0, 1);
  axisZ.normalize();
  axisX.crossVectors(axisY, axisZ).normalize();
  axisZ.crossVectors(axisX, axisY).normalize();
  out.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ));
}

function worldToLocal(bone, world) {
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(world));
}

// pose.hand / barrel / knuckles are character-space offsets: right, up, forward.
export function applyBatArm(model, holder, pose) {
  const hand = model.getObjectByName("RightHand");
  const fore = hand && hand.parent;
  const arm = fore && fore.parent;
  const hipBone = model.getObjectByName("Hips");
  if (!hand || !fore || !arm || !hipBone || !holder) return;

  holder.getWorldQuaternion(parentQ);
  right.set(-1, 0, 0).applyQuaternion(parentQ);
  up.set(0, 1, 0).applyQuaternion(parentQ);
  forward.set(0, 0, 1).applyQuaternion(parentQ);
  hipBone.getWorldPosition(hips);
  arm.getWorldPosition(shoulder);
  fore.getWorldPosition(elbowNow);
  hand.getWorldPosition(wristNow);
  const upper = Math.max(0.05, shoulder.distanceTo(elbowNow));
  const lower = Math.max(0.05, elbowNow.distanceTo(wristNow));

  const [hr, hu, hf] = pose.hand;
  handTarget.copy(hips).addScaledVector(right, hr).addScaledVector(up, hu).addScaledVector(forward, hf);
  const reach = upper + lower - 1e-3;
  const minReach = Math.abs(upper - lower) + 1e-3;
  hint.copy(handTarget).sub(shoulder);
  let dist = hint.length();
  if (dist < 1e-5) hint.copy(forward);
  dist = Math.min(reach, Math.max(minReach, dist));
  handTarget.copy(shoulder).addScaledVector(hint.normalize(), dist);

  const [br, bu, bf] = pose.barrel;
  barrel.copy(right).multiplyScalar(br).addScaledVector(up, bu).addScaledVector(forward, bf);
  if (barrel.lengthSq() < 1e-8) barrel.copy(forward);
  const [kr, ku, kf] = pose.knuckles;
  knuckles.copy(right).multiplyScalar(kr).addScaledVector(up, ku).addScaledVector(forward, kf);
  if (knuckles.lengthSq() < 1e-8) knuckles.copy(up);

  const [pr, pu, pf] = pose.pole || [1, 0.15, -0.45];
  pole.copy(right).multiplyScalar(pr).addScaledVector(up, pu).addScaledVector(forward, pf);
  const along = handTarget.clone().sub(shoulder);
  const span = along.length() || 1;
  along.multiplyScalar(1 / span);
  const x = (upper * upper - lower * lower + span * span) / (2 * span);
  const height = Math.sqrt(Math.max(0, upper * upper - x * x));
  hint.copy(pole).addScaledVector(along, -pole.dot(along));
  if (hint.lengthSq() < 1e-8) hint.copy(right);
  hint.normalize();
  elbow.copy(shoulder).addScaledVector(along, x).addScaledVector(hint, height);

  alignY(elbow.clone().sub(shoulder), pole, worldQ);
  worldToLocal(arm, worldQ);
  arm.updateMatrixWorld(true);

  // pose.barrel is the thick end. BAT_EULER sends that end out the thumb (hand -X).
  barrel.negate();
  basisQuat(barrel, knuckles, worldQ);
  const handWorld = worldQ.clone();
  handWorld.setFromRotationMatrix(basis);
  // basisQuat wrote basis. hand +Z is the hint for the wrist twist.
  axisZ.set(basis.elements[8], basis.elements[9], basis.elements[10]);
  alignY(handTarget.clone().sub(elbow), axisZ, worldQ);
  worldToLocal(fore, worldQ);
  fore.updateMatrixWorld(true);

  worldQ.copy(handWorld);
  worldToLocal(hand, worldQ);
  hand.updateMatrixWorld(true);
}
