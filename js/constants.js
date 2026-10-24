export const TILE = 48;
// 12.5% nearer than the first tilt height (2800). The framed ground shrinks by the same amount.
export const CAMERA_DISTANCE = 0.875;
export const CAMERA_HEIGHT = 2800 * CAMERA_DISTANCE;
// Degrees off straight down, looking north, so south walls show a little.
export const CAMERA_TILT = 15 * Math.PI / 180;
// The camera still frames the original 960×540 view at this distance: 840×472.5.
const WORLD_W = 960;
const WORLD_H = 540;
export const GROUND_W = WORLD_W * CAMERA_DISTANCE;
export const GROUND_H = WORLD_H * CAMERA_DISTANCE;
export const PLAYER_SIZE = 32;
// The live speed is player.js SPEED: a brisk 80 units per second.
export const PLAYER_SPEED = 80;
export const CHUNK = 20;
