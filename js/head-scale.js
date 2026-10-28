import { PropertyBinding } from "three";

// Every Kenney figure in this game uses the same rig. Head is the child of
// Neck. Ears are vertices on the body mesh weighted to Head. The player's
// bun is a second skinned mesh weighted only to Head, so it follows this
// scale instead of being resized on its own.
const HEAD_BONE = "Head";
const HEAD_SCALE = 0.95;

function isHeadScaleTrack(track) {
  const parsed = PropertyBinding.parseTrackName(track.name);
  return parsed.nodeName === HEAD_BONE && parsed.propertyName === "scale";
}

// Idle, walk, and run each hold Head.scale at 1, 1, 1 with a two-key STEP
// track. The mixer writes that on update, which would pop the head back to
// full size. The keys are a rest hold, not motion, so the track is removed.
// Head rotation and translation stay. Neck is left alone. Head_end keeps
// its own scale of 1, so the end bone is not shrunk a second time.
export function dropHeadScaleTracks(clips) {
  const list = Array.isArray(clips) ? clips : Object.values(clips);
  for (const clip of list) {
    if (!clip || !clip.tracks) continue;
    for (let i = clip.tracks.length - 1; i >= 0; i -= 1) {
      if (isHeadScaleTrack(clip.tracks[i])) clip.tracks.splice(i, 1);
    }
  }
}

// Sets the scale. It does not multiply, so a second call stays at 0.95.
// Call this after the height fit. The fit measures the unscaled head, and
// a smaller crown would make SCALE_BUMP grow the whole body.
export function shrinkHead(model) {
  let found = false;
  model.traverse((obj) => {
    if (!obj.isBone || obj.name !== HEAD_BONE) return;
    obj.scale.setScalar(HEAD_SCALE);
    found = true;
  });
  if (!found) throw new Error("Character is missing the Head bone.");
}
