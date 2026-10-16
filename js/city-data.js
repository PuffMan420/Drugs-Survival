// World layout for the single test chunk.
// 1 world unit = 1 pixel on the ground in the 960×540 view. Each block is 48px.

export const TILE = 48;
export const COLS = 32;
export const ROWS = 24;

// Two-tile roads. The middle cross is where the player starts.
export const ROAD_COLS = [0, 14, 30];
export const ROAD_ROWS = [0, 11, 22];

export const PLAYER_START_X = 15 * TILE;
export const PLAYER_START_Z = 12 * TILE;
export const PLAYER_SIZE = 32;
export const PLAYER_SPEED = 180;

export const BUILDINGS = [
  { tx: 6, tz: 6, w: 4, d: 3, h: 3, wall: "#c4a574", roof: "#8b7048" },
  { tx: 10, tz: 6, w: 2, d: 3, h: 6, wall: "#a35448", roof: "#6c342c" },
  { tx: 4, tz: 4, w: 3, d: 2, h: 3, wall: "#7e8b78", roof: "#55604f" },
  { tx: 17, tz: 6, w: 4, d: 3, h: 4, wall: "#b7b1a4", roof: "#7c776c" },
  { tx: 23, tz: 6, w: 1, d: 3, h: 7, wall: "#8d6a86", roof: "#5c4458" },
  { tx: 25, tz: 6, w: 3, d: 3, h: 4, wall: "#c4895a", roof: "#8a5c38" },
  { tx: 6, tz: 14, w: 4, d: 3, h: 3, wall: "#6d7c8a", roof: "#46525e" },
  { tx: 10, tz: 14, w: 2, d: 2, h: 5, wall: "#6a4e6e", roof: "#432f46" },
  { tx: 6, tz: 18, w: 5, d: 2, h: 2, wall: "#a67c52", roof: "#735536" },
  { tx: 17, tz: 14, w: 3, d: 3, h: 4, wall: "#b85a45", roof: "#7d3b2c" },
  { tx: 21, tz: 14, w: 3, d: 2, h: 2, wall: "#8a8f72", roof: "#5c614c" },
  { tx: 18, tz: 18, w: 2, d: 2, h: 6, wall: "#9a4038", roof: "#642824" },
];

export function isRoadCol(tx) {
  return ROAD_COLS.some((start) => tx === start || tx === start + 1);
}

export function isRoadRow(tz) {
  return ROAD_ROWS.some((start) => tz === start || tz === start + 1);
}

// 'road' | 'sidewalk' | 'lot'
export function tileKind(tx, tz) {
  if (tx < 0 || tz < 0 || tx >= COLS || tz >= ROWS) return "out";
  if (isRoadCol(tx) || isRoadRow(tz)) return "road";
  const besideRoad =
    isRoadCol(tx - 1) || isRoadCol(tx + 1) || isRoadRow(tz - 1) || isRoadRow(tz + 1);
  return besideRoad ? "sidewalk" : "lot";
}

export function validateBuildings(buildings = BUILDINGS) {
  const occupied = new Set();
  for (const building of buildings) {
    if (building.w < 1 || building.d < 1 || building.h < 1) {
      throw new Error("building has an empty footprint");
    }
    for (let tz = building.tz; tz < building.tz + building.d; tz += 1) {
      for (let tx = building.tx; tx < building.tx + building.w; tx += 1) {
        const kind = tileKind(tx, tz);
        if (kind !== "lot") {
          throw new Error(`building sits on ${kind} at ${tx},${tz}`);
        }
        const key = `${tx},${tz}`;
        if (occupied.has(key)) throw new Error(`buildings overlap at ${key}`);
        occupied.add(key);
      }
    }
  }
}
