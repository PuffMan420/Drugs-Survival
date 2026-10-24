// West-of-canal roads. Every road is one 2-lane Kenney piece, 4 tiles wide.
// The piece is centered on the old sheet. Asphalt is the middle 60% of the
// model, so each direction's lane sits 0.6 tiles off that center. Anything
// the old road had beyond those 4 tiles is left as sidewalk.
// A bend is the curved turn tile (road-bend). A three-way meeting is a T.
// A four-way meeting is a cross. The roundabout model is 3 by 3 of the same
// module, so at this scale it would be a 12-tile circle and is not used.
// Straights run up to the junction and stop. Pieces of one avenue share a
// centerline, and a curb of sidewalk can sit under the piece.
// The ring (lanes 1/2 and 5/6, median 4/8) is four lanes: two of these
// two-lane pieces side by side. Their sidewalks meet on the median.

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
const JUNCTION_TUCK = 0.08;
const WALK = new Set(["s", "n", "p", "c", "l"]);

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
  // road: a west driving tile. soft: sidewalk, shoulder, or a bank tile
  // between two west roads. block: Midtown, or anything else.
  const columnKind = (horizontal, along, p0, p1) => {
    let road = false;
    let soft = false;
    const pLo = Math.floor(p0);
    const pHi = Math.ceil(p1);
    for (let p = pLo; p <= pHi; p += 1) {
      const xx = horizontal ? along : p;
      const zz = horizontal ? p : along;
      const cell = at(xx, zz);
      if (westRoad(xx, zz)) road = true;
      else if (cell === "~" || SHOULDER.has(cell) || WALK.has(cell)) soft = true;
    }
    if (road) return "road";
    if (soft) return "soft";
    return "block";
  };

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
      // The run before it steps through a crossing. A short run that sits
      // inside another road is a lane marker, not its own street.
      rib.coreA0 = rib.a0;
      rib.coreA1 = rib.a1;
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
  // A short ribbon that lives inside a crossing is a lane marker, not a street.
  function isLaneMarker(rib, others) {
    const length = rib.coreA1 - rib.coreA0 + 1;
    if (length <= 0 || length >= 10) return false;
    const perp = centerOf(rib);
    let inside = 0;
    for (let i = rib.coreA0; i <= rib.coreA1; i += 1) {
      const hit = others.some((other) => i >= other.p0 && i <= other.p1 && perp >= other.a0 - 2 && perp <= other.a1 + 2);
      if (hit) inside += 1;
    }
    return inside * 2 >= length;
  }
  function mergeRibbons(list) {
    const items = list.map((rib) => ({
      horizontal: rib.horizontal,
      p0: rib.p0,
      p1: rib.p1,
      a0: rib.a0,
      a1: rib.a1,
      coreA0: rib.coreA0,
      coreA1: rib.coreA1,
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
          a.coreA0 = Math.min(a.coreA0, b.coreA0);
          a.coreA1 = Math.max(a.coreA1, b.coreA1);
          items.splice(j, 1);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return items;
  }

  // Two pieces of one avenue often sit a fraction of a tile apart, or stop
  // with a curb of sidewalk between them. Share one centerline so a sidewalk
  // cannot cut across the mouth. A real crossing keeps the two approaches as
  // separate runs; a curb with no crossing becomes one run.
  function alongGap(a, b) {
    if (a.a1 < b.a0) return { gap: b.a0 - a.a1 - 1, lo: a.a1 + 1, hi: b.a0 - 1 };
    if (b.a1 < a.a0) return { gap: a.a0 - b.a1 - 1, lo: b.a1 + 1, hi: a.a0 - 1 };
    return { gap: -1, lo: 0, hi: -1 };
  }
  function gapPassable(a, b) {
    const { gap, lo, hi } = alongGap(a, b);
    if (gap < 0) return false;
    if (gap === 0) return true;
    const p0 = Math.min(a.p0, b.p0);
    const p1 = Math.max(a.p1, b.p1);
    let walks = 0;
    for (let i = lo; i <= hi; i += 1) {
      let road = false;
      let walk = false;
      for (let p = p0; p <= p1; p += 1) {
        const xx = a.horizontal ? i : p;
        const zz = a.horizontal ? p : i;
        if (westRoad(xx, zz)) road = true;
        else if (westOfCanal(xx, zz) && WALK.has(at(xx, zz))) walk = true;
      }
      if (road) continue;
      if (walk) {
        walks += 1;
        continue;
      }
      return false;
    }
    return walks <= 3;
  }
  function crossingBetween(a, b, perp) {
    const { lo, hi } = alongGap(a, b);
    const mid = (centerOf(a) + centerOf(b)) / 2;
    return perp.some((other) => {
      const pc = centerOf(other);
      if (pc < lo - 1 || pc > hi + 1) return false;
      return mid >= other.a0 - 2 && mid <= other.a1 + 3;
    });
  }
  function stitchRibbons(list, perp) {
    const items = list.map((rib) => ({ ...rib, origin: centerOf(rib) }));
    let guard = 0;
    let changed = true;
    while (changed && guard < 8) {
      changed = false;
      guard += 1;
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          const { gap } = alongGap(a, b);
          if (gap < 0 || gap > 8) continue;
          const apart = Math.abs(centerOf(a) - centerOf(b));
          const spanGap = Math.max(a.p0, b.p0) - Math.min(a.p1, b.p1);
          if (spanGap > 2 || apart > 1.5) continue;
          if (isLaneMarker(a, perp) || isLaneMarker(b, perp)) continue;
          const crossing = crossingBetween(a, b, perp);
          const p0 = Math.min(a.p0, b.p0);
          const p1 = Math.max(a.p1, b.p1);
          const next = (p0 + p1 + 1) / 2;
          if (Math.abs(next - a.origin) > 1.25 || Math.abs(next - b.origin) > 1.25) continue;
          if (crossing) {
            if (a.p0 === p0 && a.p1 === p1 && b.p0 === p0 && b.p1 === p1) continue;
            a.p0 = p0;
            a.p1 = p1;
            b.p0 = p0;
            b.p1 = p1;
            changed = true;
            continue;
          }
          if (apart <= 1.0 && gap <= 4 && gapPassable(a, b)) {
            a.p0 = p0;
            a.p1 = p1;
            a.a0 = Math.min(a.a0, b.a0);
            a.a1 = Math.max(a.a1, b.a1);
            a.coreA0 = Math.min(a.coreA0, b.coreA0);
            a.coreA1 = Math.max(a.coreA1, b.coreA1);
            items.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    return items;
  }

  const hMerged = mergeRibbons(ribbonsFor(true));
  const vMerged = mergeRibbons(ribbonsFor(false));
  const hRibbons = stitchRibbons(hMerged, vMerged);
  const vRibbons = stitchRibbons(vMerged, hRibbons);
  // How far two road ends may sit apart and still share a corner, T, or cross.
  // A 4-tile piece can touch another road whose ribbon ends a piece-width away.
  const JOIN = 4;
  const half = ROAD_TILES / 2;
  const intervalGap = (a0, a1, b0, b1) => {
    if (a1 < b0) return b0 - a1;
    if (b1 < a0) return a0 - b1;
    return 0;
  };
  // An arm is a lane seed of this road, past the junction, with road tiles
  // all the way there. Seeds of a neighboring street do not count.
  const seedPast = (horizontal, crossAt, p0, p1, sign) => {
    const seeds = horizontal ? H_SEED : V_SEED;
    const start = Math.round(crossAt + sign * (half + 2));
    const edge = Math.round(crossAt + sign * half);
    for (let step = 0; step < 8; step += 1) {
      const along = start + sign * step;
      let found = false;
      for (let p = p0; p <= p1; p += 1) {
        const xx = horizontal ? along : p;
        const zz = horizontal ? p : along;
        if (seeds.has(at(xx, zz)) && westRoad(xx, zz)) {
          found = true;
          break;
        }
      }
      if (!found) continue;
      const a = Math.min(edge, along);
      const b = Math.max(edge, along);
      let open = true;
      let soft = 0;
      for (let i = a; i <= b; i += 1) {
        const kind = columnKind(horizontal, i, p0, p1);
        if (kind === "road") continue;
        if (kind === "soft" && soft < 3) {
          soft += 1;
          continue;
        }
        open = false;
        break;
      }
      if (open) return true;
    }
    return false;
  };
  const raw = [];
  for (const h of hRibbons) {
    for (const v of vRibbons) {
      const cx = centerOf(v);
      const cz = centerOf(h);
      const gX = intervalGap(h.a0, h.a1 + 1, cx - half, cx + half);
      const gZ = intervalGap(v.a0, v.a1 + 1, cz - half, cz + half);
      if (gX > JOIN || gZ > JOIN) continue;
      // Tiles of this road that sit outside the crossing road. A lane marker
      // inside the crossing is not its own arm.
      const protrude = (core0, core1, span0, span1, sign) => {
        if (sign < 0) return Math.max(0, Math.min(core1, span0 - 1) - core0 + 1);
        return Math.max(0, core1 - Math.max(core0, span1 + 1) + 1);
      };
      const arm = (horizontal, crossAt, rib, span0, span1, sign) => {
        const others = horizontal ? vRibbons : hRibbons;
        if (isLaneMarker(rib, others)) return false;
        if (!seedPast(horizontal, crossAt, rib.p0, rib.p1, sign)) return false;
        // A stub of two tiles still has a straight drawn up to the piece.
        // Closing that side puts the piece's sidewalk across the stub.
        return protrude(rib.a0, rib.a1, span0, span1, sign) >= 2;
      };
      const box = {
        cx,
        cz,
        h,
        v,
        west: arm(true, cx, h, v.p0, v.p1, -1),
        east: arm(true, cx, h, v.p0, v.p1, 1),
        north: arm(false, cz, v, h.p0, h.p1, -1),
        south: arm(false, cz, v, h.p0, h.p1, 1),
      };
      raw.push(box);
    }
  }

  const junctions = [];
  for (const box of raw) {
    const hit = junctions.find((item) => Math.abs(item.cx - box.cx) < 3 && Math.abs(item.cz - box.cz) < 3);
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

  // A ribbon's a0/a1 walk through a crossing so the roads can meet. The
  // straight has to cover that walk too, and stop on the junction piece.
  // coreA0/coreA1 skip the walk, which left a gap in front of the corner.
  const REACH = 6;
  const centerlineOpen = (rib, from, to) => {
    const perp = Math.round(centerOf(rib));
    const a = Math.floor(Math.min(from, to));
    const b = Math.ceil(Math.max(from, to));
    let soft = 0;
    for (let i = a; i <= b; i += 1) {
      const kind = columnKind(rib.horizontal, i, perp - 1, perp + 1);
      if (kind === "road") continue;
      if (kind === "soft" && soft < 3) {
        soft += 1;
        continue;
      }
      return false;
    }
    return true;
  };
  const blocksFor = (rib) => {
    const blocks = [];
    const perp = centerOf(rib);
    for (const box of liveJunctions) {
      const along = rib.horizontal ? box.cx : box.cz;
      const other = rib.horizontal ? box.cz : box.cx;
      if (Math.abs(other - perp) > 2.5) continue;
      if (along < rib.a0 - REACH || along > rib.a1 + 1 + REACH) continue;
      if ((along < rib.a0 || along > rib.a1 + 1) && !centerlineOpen(rib, along, along < rib.a0 ? rib.a0 : rib.a1)) continue;
      const half = ROAD_TILES / 2;
      blocks.push({
        lo: along - half + SEAM,
        hi: along + half - SEAM,
        slack: JUNCTION_TUCK,
      });
    }
    return blocks;
  };

  const buriedInCrossing = (rib) => isLaneMarker(rib, rib.horizontal ? vRibbons : hRibbons);
  const addStraights = (rib) => {
    if (buriedInCrossing(rib)) return;
    const perp = centerOf(rib);
    let lo = rib.a0;
    let hi = rib.a1 + 1;
    const blocks = blocksFor(rib);
    let growLo = null;
    let growHi = null;
    for (const block of blocks) {
      if (block.lo >= hi && block.lo - hi <= REACH && centerlineOpen(rib, hi, block.lo) && (growHi == null || block.lo < growHi)) growHi = block.lo;
      if (block.hi <= lo && lo - block.hi <= REACH && centerlineOpen(rib, block.hi, lo) && (growLo == null || block.hi > growLo)) growLo = block.hi;
    }
    if (growHi != null) hi = growHi;
    if (growLo != null) lo = growLo;
    const parts = subtractRange(lo, hi, blocks);
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
      return Math.abs(item[along] - other[along]) < 0.75;
    });
    if (!clash) kept.push(item);
  }
  placements.length = 0;
  placements.push(...kept);

  // The ring is drawn as one piece on the median. Replace that piece with
  // two copies, one on each carriageway, so the sidewalks form the median.
  const shift = ROAD_TILES / 2;
  const widened = [];
  const spansBoth = (item, a, b) => {
    const half = item.scale / 2;
    const x0 = Math.floor(item.x - half);
    const x1 = Math.floor(item.x + half - 1e-4);
    const z0 = Math.floor(item.z - half);
    const z1 = Math.floor(item.z + half - 1e-4);
    let hasA = false;
    let hasB = false;
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = at(x, z);
        if (cell === a) hasA = true;
        else if (cell === b) hasB = true;
      }
    }
    return hasA && hasB;
  };
  for (const item of placements) {
    const across = spansBoth(item, "1", "2");
    const along = spansBoth(item, "5", "6");
    if (across && !along) {
      widened.push({ ...item, z: item.z - shift });
      widened.push({ ...item, z: item.z + shift });
    } else if (along && !across) {
      widened.push({ ...item, x: item.x - shift });
      widened.push({ ...item, x: item.x + shift });
    } else {
      widened.push(item);
    }
  }
  placements.length = 0;
  placements.push(...widened);

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
      // West of the canal stays bare ground: no old asphalt and no sidewalk strips.
      if (westOfCanal(x, z)) return "skip";
      return "paint";
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
      let ribbonCenter = centerOf(rib);
      const cell = at(tx, tz);
      // Ring lanes sit on the paired pieces, not on the median between them.
      if (cell === "1" || cell === "2" || cell === "5" || cell === "6") {
        const perp = horizontal ? tz + 0.5 : tx + 0.5;
        ribbonCenter += (perp < ribbonCenter ? -1 : 1) * shift;
      }
      const center = ribbonCenter * TILE;
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

// A building whose footprint sits on the asphalt is moved off the piece.
// Houses that only meet the outer sidewalk stay where they are. A neighbor
// is shoved one tile when that is what gets the building off the asphalt.
export function clearBuildingsFromRoads(map, plan) {
  const pieces = plan.placements;
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= map.cols || z >= map.rows) return "~";
    return map.ground[z][x];
  };
  const overlap = (b, half) => {
    let best = null;
    for (const piece of pieces) {
      const ox = Math.min(b.x + b.w, piece.x + half) - Math.max(b.x, piece.x - half);
      const oz = Math.min(b.z + b.d, piece.z + half) - Math.max(b.z, piece.z - half);
      if (ox <= 0.05 || oz <= 0.05) continue;
      const area = ox * oz;
      if (!best || area > best.area) best = { piece, ox, oz, area };
    }
    return best;
  };
  const occupants = (b, ignore) => map.buildings.filter((other) => {
    if (other === ignore) return false;
    const ox = Math.min(b.x + b.w, other.x + other.w) - Math.max(b.x, other.x);
    const oz = Math.min(b.z + b.d, other.z + other.d) - Math.max(b.z, other.z);
    return ox > 0 && oz > 0;
  });
  const groundOk = (b) => {
    if (b.x < 0 || b.z < 0 || b.x + b.w > map.cols || b.z + b.d > map.rows) return false;
    if (!westOfCanal(b.x + b.w / 2, b.z + b.d / 2)) return false;
    for (let z = Math.floor(b.z); z < b.z + b.d; z += 1) {
      for (let x = Math.floor(b.x); x < b.x + b.w; x += 1) {
        if (at(x, z) === "~") return false;
      }
    }
    return true;
  };
  const padHits = (b, piece, pad) => {
    const ox = Math.min(b.x + b.w, piece.x + pad) - Math.max(b.x, piece.x - pad);
    const oz = Math.min(b.z + b.d, piece.z + pad) - Math.max(b.z, piece.z - pad);
    return ox > 0.05 && oz > 0.05;
  };
  // Off the driving asphalt everywhere, and a gap past the piece being left.
  // Touching some other piece's outer sidewalk is allowed.
  const place = (building, x, z, piece, allowShove) => {
    const trial = { ...building, x, z };
    const clear = (b) => !overlap(b, 1.2) && !padHits(b, piece, ROAD_TILES / 2 + 0.75);
    if (!groundOk(trial) || !clear(trial)) return false;
    const blockers = occupants(trial, building);
    if (blockers.length === 0) {
      building.x = x;
      building.z = z;
      return true;
    }
    if (!allowShove || blockers.length > 2) return false;
    const dx = Math.sign(x - building.x);
    const dz = Math.sign(z - building.z);
    if (dx !== 0 && dz !== 0) return false;
    const shifts = [];
    for (const blocker of blockers) {
      let nx = blocker.x;
      let nz = blocker.z;
      let steps = 0;
      while (steps < 8) {
        const moved = { ...blocker, x: nx, z: nz };
        const ox = Math.min(trial.x + trial.w, moved.x + moved.w) - Math.max(trial.x, moved.x);
        const oz = Math.min(trial.z + trial.d, moved.z + moved.d) - Math.max(trial.z, moved.z);
        if (ox <= 0 || oz <= 0) break;
        nx += dx;
        nz += dz;
        steps += 1;
      }
      const moved = { ...blocker, x: nx, z: nz };
      const still = Math.min(trial.x + trial.w, moved.x + moved.w) - Math.max(trial.x, moved.x);
      const stillZ = Math.min(trial.z + trial.d, moved.z + moved.d) - Math.max(trial.z, moved.z);
      if (steps === 0 || (still > 0 && stillZ > 0)) return false;
      if (!groundOk(moved) || !clear(moved)) return false;
      const extra = occupants(moved, blocker).filter((other) => other !== building && !blockers.includes(other));
      if (extra.length > 0) return false;
      shifts.push({ blocker, x: nx, z: nz });
    }
    for (let i = 0; i < shifts.length; i += 1) {
      for (let j = i + 1; j < shifts.length; j += 1) {
        const a = shifts[i];
        const b = shifts[j];
        const ox = Math.min(a.x + a.blocker.w, b.x + b.blocker.w) - Math.max(a.x, b.x);
        const oz = Math.min(a.z + a.blocker.d, b.z + b.blocker.d) - Math.max(a.z, b.z);
        if (ox > 0 && oz > 0) return false;
      }
    }
    for (const shift of shifts) {
      shift.blocker.x = shift.x;
      shift.blocker.z = shift.z;
    }
    building.x = x;
    building.z = z;
    return true;
  };

  // Off the whole mesh first, with a small gap when a lot is open. A flush
  // edge is accepted only when the block between two roads cannot hold a gap.
  // Buildings that merely graze the outer sidewalk are left where they are.
  const onRoad = (b) => {
    const asphalt = overlap(b, 1.2);
    if (asphalt) return asphalt;
    const mesh = overlap(b, ROAD_TILES / 2);
    if (mesh && Math.min(mesh.ox, mesh.oz) > 0.55) return mesh;
    return null;
  };
  const slide = (building, hit, steps) => {
    const awayX = building.x + building.w / 2 >= hit.piece.x ? 1 : -1;
    const awayZ = building.z + building.d / 2 >= hit.piece.z ? 1 : -1;
    const alongZ = hit.oz <= hit.ox;
    const primary = alongZ ? [[0, awayZ], [0, -awayZ]] : [[awayX, 0], [-awayX, 0]];
    const secondary = alongZ ? [[awayX, 0], [-awayX, 0]] : [[0, awayZ], [0, -awayZ]];
    for (let step = 1; step <= steps; step += 1) {
      for (const [dx, dz] of [...primary, ...secondary]) {
        if (place(building, building.x + dx * step, building.z + dz * step, hit.piece, true)) return true;
      }
    }
    return false;
  };

  for (let pass = 0; pass < 24; pass += 1) {
    let moved = false;
    const pending = map.buildings.filter((b) => westOfCanal(b.x, b.z) && onRoad(b));
    pending.sort((a, b) => (b.w * b.d) - (a.w * a.d));
    for (const building of pending) {
      const hit = onRoad(building);
      if (!hit) continue;
      if (slide(building, hit, 12)) moved = true;
    }
    if (!moved) break;
  }
}
