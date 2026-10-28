// One integer hash and one set of cell letters. Copies of these had drifted.

// Old downtown letters. Medians 4 and 8 are road, and traffic never drives them.
const ROAD_LETTERS = ["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"];

export const ROAD = new Set(ROAD_LETTERS);
export const DRIVEN_ROAD = new Set(ROAD_LETTERS.filter((cell) => cell !== "4" && cell !== "8"));
export const WALK = new Set(["s", "n", "p", "c", "l"]);
// Island ground people can walk. "l" is land, "g" is park, "p" is beach. Water is "~".
export const LAND = new Set(["l", "g", "p"]);

export function tileHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}
