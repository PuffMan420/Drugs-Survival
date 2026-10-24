// West-of-canal roads. Every road is one 2-lane Kenney piece, 4 tiles wide.
// The piece is centered on the old sheet. Asphalt is the middle 60% of the
// model, so each direction's lane sits 0.6 tiles off that center. Anything
// the old road had beyond those 4 tiles is left as sidewalk.

import { TILE } from "./constants.js";

const H_SEED = new Set(["H", "h", "1", "2", "4"]);
const V_SEED = new Set(["V", "v", "5", "6", "8"]);
const SHOULDER = new Set(["+", "X"]);
const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8"]);

const RIVER = [
  [78, 0],
  [92, 34],
  [60, 76],
  [86, 116],
  [54, 154],
  [98, 188],
  [136, 216],
];
const BANK = 4.6;
const MAX_GAP = 14;
const MAX_WIDTH = 16;
const ROAD_TILES = 4;
// Middle of one asphalt lane. The model keeps asphalt inside 30% of center.
const LANE_TILES = 0.15 * ROAD_TILES;
const JUNCTION_Y = 0.004;
// Straights cross the junction edge by this much so the seam does not crack.
// The model's sidewalk is the outer 10% (0.4 tiles). A deeper tuck lets the
// straight's sidewalk run across the other road's mouth.
const SEAM = 0.04;
const JUNCTION_TUCK = 0.25;

function riverX(z) {
  if (z <= RIVER[0][1]) return RIVER[0][0];
  const last = RIVER[RIVER.length - 1];
  if (z >= last[1]) return last[0];
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    const [x0, z0] = RIVER[i];
    const [x1, z1] = RIVER[i + 1];
    if (z < z0 || z > z1) continue;
    const t = (z - z0) / (z1 - z0 || 1);
    return x0 + (x1 - x0) * t;
  }
  return last[0];
}

export function westOfCanal(x, z) {
  return x + 0.5 < riverX(z) - BANK;
}

function pieceForArms(north, east, south, west) {
  const mask = `${north ? "N" : ""}${east ? "E" : ""}${south ? "S" : ""}${west ? "W" : ""}`;
  if (mask === "NESW") return { piece: "cross", turn: 0 };
  if (mask.length === 3) {
    const turn = { ESW: 0, NES: 1, NEW: 2, NSW: 3 }[mask];
    return turn == null ? null : { piece: "tee", turn };
  }
  const turn = { SW: 0, ES: 1, NE: 2, NW: 3 }[mask];
  return turn == null ? null : { piece: "corner", turn };
}

function subtractRange(lo, hi, blocks) {
  let parts = [{ lo, hi, slackLo: 2, slackHi: 2 }];
  for (const block of blocks) {
    const next = [];
    for (const part of parts) {
      if (block.hi <= part.lo || block.lo >= part.hi) {
        next.push(part);
        continue;
      }
      if (block.lo > part.lo) {
        next.push({ lo: part.lo, hi: block.lo, slackLo: part.slackLo, slackHi: block.slack });
      }
      if (block.hi < part.hi) {
        next.push({ lo: block.hi, hi: part.hi, slackLo: block.slack, slackHi: part.slackHi });
      }
    }
    parts = next;
  }
  return parts;
}

// Squares of width W along [lo, hi). Junction ends use a small tuck. Pieces may
// overlap along the road so the run still meets both mouths; callers lift
// every other piece so the overlap does not flicker.
function placeRun(lo, hi, width, slackLo, slackHi) {
  const length = hi - lo;
  if (length <= 0.05 || width <= 0) return [];
  const pinLo = slackLo < 1;
  const pinHi = slackHi < 1;
  const roomLo = lo - slackLo;
  const roomHi = hi + slackHi;
  let count = Math.ceil(length / width - 1e-6);
  if (count < 1) count = 1;
  // Open ends can only hold so many pieces. Junction ends may overlap instead.
  if (!pinLo || !pinHi) {
    const room = roomHi - roomLo;
    if (count * width > room + 1e-4) count = Math.floor((room + 1e-4) / width);
    if (count < 1) return [];
  }

  if (pinLo && pinHi) {
    const centers = [];
    if (count === 1) {
      // One piece between two mouths. If it cannot sit in the gap without
      // running across a mouth, leave the gap to the junction pieces.
      const need = (width - length) / 2;
      if (need > slackLo + 1e-4) return [];
      let left = lo + (length - width) / 2;
      if (left < roomLo) left = roomLo;
      if (left > roomHi - width) left = roomHi - width;
      centers.push(left + width / 2);
      return centers;
    }
    const first = lo + width / 2;
    const last = hi - width / 2;
    for (let i = 0; i < count; i += 1) {
      centers.push(first + (last - first) * (i / (count - 1)));
    }
    return centers;
  }

  const cover = count * width;
  let left = lo + (length - cover) / 2;
  if (pinLo) left = lo;
  if (pinHi) left = hi - cover;
  if (left < roomLo) left = roomLo;
  if (left > roomHi - cover) left = roomHi - cover;
  const centers = [];
  for (let i = 0; i < count; i += 1) centers.push(left + (i + 0.5) * width);
  return centers;
}

export function planKenneyRoads(map) {
  const { cols, rows, ground } = map;
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };
  const westRoad = (x, z) => ROAD.has(at(x, z)) && westOfCanal(x, z);

  const hBody = Array.from({ length: rows }, () => new Uint8Array(cols));
  const vBody = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, z);
      if (H_SEED.has(cell)) hBody[z][x] = 1;
      if (V_SEED.has(cell)) vBody[z][x] = 1;
    }
  }
  const spread = (body, seeds, vertical) => {
    for (let z = 0; z < rows; z += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (!seeds.has(at(x, z))) continue;
        for (const sign of [-1, 1]) {
          let step = 1;
          while (step < 6) {
            const xx = vertical ? x + sign * step : x;
            const zz = vertical ? z : z + sign * step;
            if (!SHOULDER.has(at(xx, zz))) break;
            body[zz][xx] = 1;
            step += 1;
          }
        }
      }
    }
  };
  spread(hBody, H_SEED, false);
  spread(vBody, V_SEED, true);

  const crosses = (horizontal, along, p0, p1) => {
    const other = horizontal ? vBody : hBody;
    for (let p = p0; p <= p1; p += 1) {
      const xx = horizontal ? along : p;
      const zz = horizontal ? p : along;
      if (other[zz][xx]) return true;
    }
    return false;
  };

  const spanIsRoad = (horizontal, along, p0, p1) => {
    for (let p = p0; p <= p1; p += 1) {
      const xx = horizontal ? along : p;
      const zz = horizontal ? p : along;
      if (!westRoad(xx, zz)) return false;
    }
    return true;
  };

  function ribbonsFor(horizontal) {
    const body = horizontal ? hBody : vBody;
    const limit = horizontal ? cols : rows;
    const perp = horizontal ? rows : cols;
    const active = [];
    for (let along = 0; along < limit; along += 1) {
      const runs = [];
      let p = 0;
      while (p < perp) {
        const xx = horizontal ? along : p;
        const zz = horizontal ? p : along;
        if (!body[zz][xx] || !westRoad(xx, zz)) {
          p += 1;
          continue;
        }
        let p1 = p;
        while (p1 + 1 < perp) {
          const xx2 = horizontal ? along : p1 + 1;
          const zz2 = horizontal ? p1 + 1 : along;
          if (!body[zz2][xx2] || !westRoad(xx2, zz2)) break;
          p1 += 1;
        }
        const width = p1 - p + 1;
        if (width <= MAX_WIDTH && !crosses(horizontal, along, p, p1)) runs.push([p, p1]);
        p = p1 + 1;
      }
      const taken = new Array(runs.length).fill(false);
      const fits = (rib, run) => {
        if (run[1] < rib.anchor0 - 1 || run[0] > rib.anchor1 + 1) return 0;
        const overlap = Math.min(rib.anchor1, run[1]) - Math.max(rib.anchor0, run[0]) + 1;
        const w0 = rib.anchor1 - rib.anchor0 + 1;
        const w1 = run[1] - run[0] + 1;
        if (overlap < Math.min(w0, w1) - 1) return 0;
        if (Math.abs(w0 - w1) > 2) return 0;
        return overlap;
      };
      for (const rib of active) {
        if (rib.done) continue;
        let found = -1;
        let best = 0;
        for (let i = 0; i < runs.length; i += 1) {
          if (taken[i]) continue;
          const score = fits(rib, runs[i]);
          if (score > best) {
            best = score;
            found = i;
          }
        }
        if (found >= 0) {
          if (rib.gap != null) {
            let open = true;
            for (let g = rib.gap; g < along; g += 1) {
              if (!spanIsRoad(horizontal, g, rib.anchor0, rib.anchor1)) {
                open = false;
                break;
              }
            }
            if (!open || along - rib.a1 - 1 > MAX_GAP) {
              rib.done = true;
              continue;
            }
            rib.gaps.push([rib.gap, along - 1]);
            rib.gap = null;
          }
          taken[found] = true;
          rib.a1 = along;
          rib.samples.push(runs[found]);
        } else if (rib.gap == null) {
          rib.gap = along;
        } else if (along - rib.a1 > MAX_GAP) {
          rib.done = true;
        }
      }
      for (let i = 0; i < runs.length; i += 1) {
        if (taken[i]) continue;
        active.push({
          horizontal,
          anchor0: runs[i][0],
          anchor1: runs[i][1],
          p0: runs[i][0],
          p1: runs[i][1],
          a0: along,
          a1: along,
          gap: null,
          gaps: [],
          samples: [runs[i]],
          done: false,
        });
      }
    }
    for (const rib of active) {
      if (rib.samples.length === 0) continue;
      const left = rib.samples.map((span) => span[0]).sort((a, b) => a - b);
      const right = rib.samples.map((span) => span[1]).sort((a, b) => a - b);
      const mid = Math.floor(left.length / 2);
      rib.p0 = left[mid];
      rib.p1 = right[mid];
    }
    for (const rib of active) {
      let guard = 0;
      while (rib.a0 > 0 && guard < MAX_GAP) {
        const next = rib.a0 - 1;
        if (!crosses(horizontal, next, rib.p0, rib.p1) || !spanIsRoad(horizontal, next, rib.p0, rib.p1)) break;
        rib.gaps.push([next, next]);
        rib.a0 = next;
        guard += 1;
      }
      guard = 0;
      while (rib.a1 + 1 < limit && guard < MAX_GAP) {
        const next = rib.a1 + 1;
        if (!crosses(horizontal, next, rib.p0, rib.p1) || !spanIsRoad(horizontal, next, rib.p0, rib.p1)) break;
        rib.gaps.push([next, next]);
        rib.a1 = next;
        guard += 1;
      }
    }
    return active;
  }

  const centerOf = (rib) => (rib.p0 + rib.p1 + 1) / 2;
  function mergeRibbons(list) {
    const items = list.map((rib) => ({
      horizontal: rib.horizontal,
      p0: rib.p0,
      p1: rib.p1,
      a0: rib.a0,
      a1: rib.a1,
    }));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          if (Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) < 0) continue;
          const apart = Math.abs(centerOf(a) - centerOf(b));
          const spanGap = Math.max(a.p0, b.p0) - Math.min(a.p1, b.p1);
          if (apart >= ROAD_TILES - 0.5 && spanGap > 1) continue;
          a.p0 = Math.min(a.p0, b.p0);
          a.p1 = Math.max(a.p1, b.p1);
          a.a0 = Math.min(a.a0, b.a0);
          a.a1 = Math.max(a.a1, b.a1);
          items.splice(j, 1);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return items;
  }

  const hRibbons = mergeRibbons(ribbonsFor(true));
  const vRibbons = mergeRibbons(ribbonsFor(false));
  const raw = [];
  for (const h of hRibbons) {
    for (const v of vRibbons) {
      const cx = centerOf(v);
      const cz = centerOf(h);
      if (cx < h.a0 - 0.5 || cx > h.a1 + 1.5) continue;
      if (cz < v.a0 - 0.5 || cz > v.a1 + 1.5) continue;
      raw.push({
        cx,
        cz,
        h,
        v,
        west: h.a0 < cx - ROAD_TILES / 2,
        east: h.a1 + 1 > cx + ROAD_TILES / 2,
        north: v.a0 < cz - ROAD_TILES / 2,
        south: v.a1 + 1 > cz + ROAD_TILES / 2,
      });
    }
  }

  const junctions = [];
  for (const box of raw) {
    const hit = junctions.find((item) => Math.abs(item.cx - box.cx) < 2.5 && Math.abs(item.cz - box.cz) < 2.5);
    if (!hit) {
      junctions.push({ ...box });
      continue;
    }
    hit.west = hit.west || box.west;
    hit.east = hit.east || box.east;
    hit.north = hit.north || box.north;
    hit.south = hit.south || box.south;
  }

  const placements = [];
  const liveJunctions = [];
  for (const box of junctions) {
    const choice = pieceForArms(box.north, box.east, box.south, box.west);
    if (!choice) continue;
    placements.push({
      piece: choice.piece,
      turn: choice.turn,
      x: box.cx,
      z: box.cz,
      scale: ROAD_TILES,
      y: JUNCTION_Y,
    });
    liveJunctions.push(box);
  }

  const blocksFor = (rib) => {
    const blocks = [];
    const perp = centerOf(rib);
    for (const box of liveJunctions) {
      const along = rib.horizontal ? box.cx : box.cz;
      const other = rib.horizontal ? box.cz : box.cx;
      if (Math.abs(other - perp) > 1.25) continue;
      if (along < rib.a0 - 2 || along > rib.a1 + 3) continue;
      const half = ROAD_TILES / 2;
      blocks.push({
        lo: along - half + SEAM,
        hi: along + half - SEAM,
        slack: JUNCTION_TUCK,
      });
    }
    return blocks;
  };

  const addStraights = (rib) => {
    const perp = centerOf(rib);
    const parts = subtractRange(rib.a0, rib.a1 + 1, blocksFor(rib));
    for (const part of parts) {
      const centers = placeRun(part.lo, part.hi, ROAD_TILES, part.slackLo, part.slackHi);
      centers.forEach((center, index) => {
        placements.push({
          piece: "straight",
          turn: rib.horizontal ? 0 : 1,
          x: rib.horizontal ? center : perp,
          z: rib.horizontal ? perp : center,
          scale: ROAD_TILES,
          // Neighbors along one road overlap. A hair of height keeps the seam quiet.
          y: index % 2 === 0 ? 0 : 0.002,
        });
      });
    }
  };
  for (const rib of hRibbons) addStraights(rib);
  for (const rib of vRibbons) addStraights(rib);

  const kept = [];
  for (const item of placements) {
    if (item.piece !== "straight") {
      kept.push(item);
      continue;
    }
    const clash = kept.some((other) => {
      if (other.piece !== "straight" || other.turn !== item.turn) return false;
      const along = item.turn === 0 ? "x" : "z";
      const perp = item.turn === 0 ? "z" : "x";
      if (Math.abs(item[perp] - other[perp]) > 0.3) return false;
      return Math.abs(item[along] - other[along]) < 2;
    });
    if (!clash) kept.push(item);
  }
  placements.length = 0;
  placements.push(...kept);

  const covered = new Uint8Array(cols * rows);
  const footprint = new Uint8Array(cols * rows);
  for (const item of placements) {
    const half = item.scale / 2;
    const x0 = Math.floor(item.x - half);
    const x1 = Math.floor(item.x + half - 1e-4);
    const z0 = Math.floor(item.z - half);
    const z1 = Math.floor(item.z + half - 1e-4);
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (x < 0 || z < 0 || x >= cols || z >= rows) continue;
        footprint[z * cols + x] = 1;
        if (!westRoad(x, z)) continue;
        const cx = x + 0.5;
        const cz = z + 0.5;
        if (Math.abs(cx - item.x) <= half + 1e-4 && Math.abs(cz - item.z) <= half + 1e-4) {
          covered[z * cols + x] = 1;
        }
      }
    }
  }

  const ribbonAt = (tx, tz, horizontal) => {
    const list = horizontal ? hRibbons : vRibbons;
    const along = horizontal ? tx : tz;
    const perp = horizontal ? tz : tx;
    let best = null;
    for (const rib of list) {
      if (along < rib.a0 - 1 || along > rib.a1 + 1) continue;
      if (perp < rib.p0 - 1 || perp > rib.p1 + 1) continue;
      const dist = Math.abs(perp + 0.5 - centerOf(rib));
      if (!best || dist < best.dist) best = { rib, dist };
    }
    return best ? best.rib : null;
  };

  return {
    count: placements.length,
    placements,
    covers(x, z) {
      if (x < 0 || z < 0 || x >= cols || z >= rows) return false;
      return covered[z * cols + x] === 1;
    },
    roadPaint(x, z) {
      if (!westOfCanal(x, z) || !ROAD.has(at(x, z))) return "paint";
      return covered[z * cols + x] === 1 ? "skip" : "walk";
    },
    contains(x, z) {
      const tx = Math.floor(x / TILE);
      const tz = Math.floor(z / TILE);
      if (tx < 0 || tz < 0 || tx >= cols || tz >= rows) return false;
      return footprint[tz * cols + tx] === 1;
    },
    lanePoint(tx, tz, dx, dz) {
      if (!westOfCanal(tx, tz)) return null;
      const horizontal = dx !== 0;
      const rib = ribbonAt(tx, tz, horizontal);
      if (!rib) return null;
      const center = centerOf(rib) * TILE;
      const offset = LANE_TILES * TILE;
      let sign = 1;
      if (dx > 0) sign = 1;
      else if (dx < 0) sign = -1;
      else if (dz > 0) sign = -1;
      else sign = 1;
      if (horizontal) return { x: (tx + 0.5) * TILE, z: center + sign * offset };
      return { x: center + sign * offset, z: (tz + 0.5) * TILE };
    },
  };
}
