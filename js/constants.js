export const TILE = 48;
// 12.5% nearer than the first camera distance (2800). The framed ground shrinks by the same amount.
export const CAMERA_DISTANCE = 0.875;
// Polar angle from straight up. 20 degrees toward south, so south walls show a little.
export const CAMERA_ANGLE = 20 * Math.PI / 180;
// Distance from the player. The previous camera sat 2800*0.875 above the ground
// at 15 degrees off straight down, so its range was that height / cos(15°).
// The 840×472.5 frame is measured at this distance, which keeps the ground
// around the player the same size. About 2.9% more ground shows at 20 degrees.
export const CAMERA_RADIUS = (2800 * CAMERA_DISTANCE) / Math.cos(15 * Math.PI / 180);
// The camera still frames the original 960×540 view at this distance: 840×472.5.
const WORLD_W = 960;
const WORLD_H = 540;
export const GROUND_W = WORLD_W * CAMERA_DISTANCE;
export const GROUND_H = WORLD_H * CAMERA_DISTANCE;
export const PLAYER_SIZE = 32;
// The live speed is player.js SPEED: a brisk 80 units per second.
export const PLAYER_SPEED = 80;
export const CHUNK = 20;
