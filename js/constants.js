export const TILE = 48;
// 5% nearer than the first camera distance (2800). The framed ground shrinks by the same amount.
const CAMERA_DISTANCE = 0.95;
// Extra frame on top of CAMERA_DISTANCE. 1 is the view before these scales.
export const FOOT_VIEW = 1.05;
export const CAR_VIEW = 1.20;
// Seconds to ease between the foot and car frames, both ways.
export const VIEW_EASE = 2;
// Polar angle from straight up. 30 degrees toward south, so the south walls show.
export const CAMERA_ANGLE = 30 * Math.PI / 180;
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
