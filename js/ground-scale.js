// Integer scales snap to an axis-aligned NxN block of cells. Odd sizes stay
// centered on the cell. Even sizes shift half a cell toward +x and +z so the
// edges sit on the grid. In-between 0.25 steps stay centered and can sit off it.
import { TILE } from "./constants.js";

export function groundSnapOffset(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.round(n);
  if (whole <= 0 || Math.abs(n - whole) > 1e-6) return 0;
  return whole % 2 === 0 ? 0.5 : 0;
}

export function groundWorldCenter(x, z, scale) {
  const snap = groundSnapOffset(scale);
  return {
    x: (Number(x) + 0.5 + snap) * TILE,
    z: (Number(z) + 0.5 + snap) * TILE,
  };
}

// Shift + the scale key jumps to the next whole size for ground tiles.
export function nextWholeScale(current, direction, min = 0.25, max = 4) {
  const n = Number(current);
  const value = Number.isFinite(n) && n > 0 ? n : 1;
  const whole = Math.round(value);
  const isWhole = Math.abs(value - whole) < 1e-6;
  if (!(direction > 0 || direction < 0)) return value;
  let next = direction > 0
    ? (isWhole ? whole + 1 : Math.ceil(value))
    : (isWhole ? whole - 1 : Math.floor(value));
  if (next < 1) return value < 1 ? value : 1;
  if (next > max) return Math.min(max, value);
  if (next < min) return Math.max(min, value);
  return next;
}
