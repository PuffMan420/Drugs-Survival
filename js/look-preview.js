// Preview queries for the southwest corner stills.
// With no query, the play camera and the daytime sun stay as they are.

export const LOOK_DEGREES = [20, 30, 35, 50];
export const LOOK_CORNER = { x: 66, z: 234 };

const DAY_SUN = [-0.4, 0.92, -0.58];
// Lower, from the west, so shadows stretch east across the street.
const AFTERNOON_SUN = [-0.86, 0.42, -0.18];

export function parseLookPreview(search) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const look = params.get("look");
  const afternoon = params.get("light") === "afternoon";
  if (look == null && !afternoon) return null;
  const degrees = look == null ? 30 : Number(look);
  if (!LOOK_DEGREES.includes(degrees)) return null;
  return { degrees, afternoon };
}

// Keep the camera the same height above the street when the tilt changes.
export function previewRadius(phi, cameraRadius, cameraAngle) {
  const height = cameraRadius * Math.cos(cameraAngle);
  return height / Math.cos(phi);
}

export function sunDirection(afternoon) {
  const raw = afternoon ? AFTERNOON_SUN : DAY_SUN;
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  return [raw[0] / length, raw[1] / length, raw[2] / length];
}
