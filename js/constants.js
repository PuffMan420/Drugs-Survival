export const TILE = 48;
export const VIEW_W = 960;
export const VIEW_H = 540;
// 12.5% nearer than the first tilt height (2800). The framed ground shrinks by the same amount.
export const CAMERA_DISTANCE = 0.875;
export const CAMERA_HEIGHT = 2800 * CAMERA_DISTANCE;
// Degrees off straight down, looking north, so south walls show a little.
export const CAMERA_TILT = 12 * Math.PI / 180;
export const GROUND_W = VIEW_W * CAMERA_DISTANCE;
export const GROUND_H = VIEW_H * CAMERA_DISTANCE;
export const PLAYER_SIZE = 32;
export const PLAYER_SPEED = 260;
export const CHUNK = 20;
