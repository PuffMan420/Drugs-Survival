export const TILE = 48;
// 5% nearer than the first camera distance (2800). The framed ground shrinks by the same amount.
const CAMERA_DISTANCE = 0.95;
// Extra frame on top of CAMERA_DISTANCE. 1 is the view before these scales.
export const FOOT_VIEW = 0.80;
export const CAR_VIEW = 1.20;
// Seconds to ease between the foot and car frames, both ways.
export const VIEW_EASE = 2;
// Polar angle from straight up. 30 degrees toward south, so the south walls show.
export const CAMERA_ANGLE = 30 * Math.PI / 180;
// How fast the camera catches the way you walk or drive. Higher is faster.
// 0.30 means a sudden quarter-turn is mostly caught in about 7 seconds. It eases.
export const CAMERA_TURN_SPEED = 0.30;
// How softly the turn starts and stops. Lower is softer (about 1 / seconds to ramp).
export const CAMERA_TURN_SOFT = 1.5;
// Fastest the camera may turn, in radians per second (0.35 is about 20 degrees).
export const CAMERA_TURN_MAX = 0.35;
// On foot, the camera waits this long while you keep walking the same way.
export const CAMERA_TURN_HOLD = 0.4;
// On foot, a sharper change than this counts as a new way, and the wait starts again.
export const CAMERA_TURN_SAME = 35 * Math.PI / 180;
// Slower than this (units per second) counts as standing still, so the camera holds.
export const CAMERA_TURN_MOVE = 15;
// Distance from the player. The 20 degree camera sat (2800 * CAMERA_DISTANCE) / cos(15°)
// away. This radius keeps that same height above the street at 30 degrees,
// so the ground around the player stays the same size and the extra tilt goes into the walls.
const CAMERA_RADIUS_20 = (2800 * CAMERA_DISTANCE) / Math.cos(15 * Math.PI / 180);
export const CAMERA_RADIUS = CAMERA_RADIUS_20 * Math.cos(20 * Math.PI / 180) / Math.cos(CAMERA_ANGLE);
// The camera still frames the original 960×540 view at this distance: 840×472.5.
const WORLD_W = 960;
const WORLD_H = 540;
export const GROUND_W = WORLD_W * CAMERA_DISTANCE;
export const GROUND_H = WORLD_H * CAMERA_DISTANCE;
export const PLAYER_SIZE = 32;
// Brisk walk, 5% faster than 80. player.js uses this on foot.
export const PLAYER_SPEED = 80 * 1.05;
export const CHUNK = 20;
// The main camera draws this layer. Ambient occlusion only reads layer 0,
// so light cards, flat shadow sheets, and the build preview do not darken the ground.
export const AO_SKIP_LAYER = 1;
// If the browser has not given the 3D drawing back this many seconds after
// losing it, the game offers a reload button.
export const CONTEXT_RESTORE_WAIT = 5;
