// Hold-Q manual camera yaw. Pure state, so unit tests can drive it without a browser.

import { CAMERA_YAW_MOUSE, CAMERA_YAW_PAUSE } from "./constants.js";

export function wrapAngle(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

export function isTypingTarget(target) {
  const tag = target && target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

// movementX wins when the browser provides it; otherwise use clientX minus the last sample.
export function pointerDelta(movementX, clientX, lastClientX) {
  if (Number.isFinite(movementX)) return movementX;
  if (Number.isFinite(clientX) && Number.isFinite(lastClientX)) return clientX - lastClientX;
  return 0;
}

export function createManualYaw({ mouse = CAMERA_YAW_MOUSE, pause = CAMERA_YAW_PAUSE } = {}) {
  let held = false;
  let releasedAt = null;

  return {
    get held() {
      return held;
    },

    // Start a hold. Typing or build mode leaves the state alone.
    press({ typing = false, blocked = false } = {}) {
      if (typing || blocked) return false;
      held = true;
      releasedAt = null;
      return true;
    },

    release(now) {
      if (!held) return false;
      held = false;
      releasedAt = now;
      return true;
    },

    // Window blur must not leave Q stuck on.
    blur(now) {
      return this.release(now);
    },

    paused(now) {
      if (held) return true;
      if (releasedAt == null) return false;
      return now - releasedAt < pause;
    },

    mouseDelta(movementX) {
      if (!held || !Number.isFinite(movementX) || movementX === 0) return 0;
      return movementX * mouse;
    },

    applyMouse(yaw, movementX) {
      const delta = this.mouseDelta(movementX);
      if (delta === 0) return yaw;
      return wrapAngle(yaw + delta);
    },
  };
}
