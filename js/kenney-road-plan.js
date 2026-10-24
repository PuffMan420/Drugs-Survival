// West-of-canal roads, one Kenney piece across the whole asphalt sheet.
// Avenues in the map are a few tiles wide (usually 2, 3, or 5, not 6).
// One straight per road-width sits on the centerline. A crossing is one
// cross, T, or corner sized to that intersection.

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
// Straights slide this far under a junction so the seam does not crack.
const TUCK = 0.12;

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
  let parts = [{ lo, hi, slackLo: 0, slackHi: 0 }];
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

// Squares of width W along [lo, hi). Slack is how far a junction can hide overhang.
function placeRun(lo, hi, width, slackLo, slackHi) {
  const length = hi - lo;
  if (length <= 0.05 || width <= 0) return [];
  const roomLo = lo - slackLo;
  const roomHi = hi + slackHi;
  const room = roomHi - roomLo;
  let count = Math.ceil(length / width - 1e-6);
  if (count * width > room + 1e-4) count = Math.floor((room + 1e-4) / width);
  if (count < 1) return [];
  const cover = count * width;
  let left = lo + (length - cover) / 2;
  const minLeft = roomLo;
  const maxLeft = roomHi - cover;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;
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

  const hRibbons = ribbonsFor(true);
  const vRibbons = ribbonsFor(false);
  const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) + 1;
  const raw = [];
  for (const h of hRibbons) {
    for (const v of vRibbons) {
      // The crossing is the full width of each road, not just the columns
      // where both ribbons happened to have a sample.
      if (h.a1 < v.p0 - 1 || h.a0 > v.p1 + 1) continue;
      if (v.a1 < h.p0 - 1 || v.a0 > h.p1 + 1) continue;
      const x0 = v.p0;
      const x1 = v.p1;
      const z0 = h.p0;
      const z1 = h.p1;
      let road = false;
      for (let z = z0; z <= z1 && !road; z += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (westRoad(x, z)) {
            road = true;
            break;
          }
        }
      }
      if (!road) continue;
      raw.push({ x0, x1, z0, z1, h, v });
    }
  }

  const junctions = [];
  for (const box of raw) {
    const hit = junctions.find((item) => item.x0 <= box.x1 && box.x0 <= item.x1 && item.z0 <= box.z1 && box.z0 <= item.z1);
    if (!hit) {
      junctions.push({ ...box, ribbonsH: [box.h], ribbonsV: [box.v] });
      continue;
    }
    hit.x0 = Math.min(hit.x0, box.x0);
    hit.x1 = Math.max(hit.x1, box.x1);
    hit.z0 = Math.min(hit.z0, box.z0);
    hit.z1 = Math.max(hit.z1, box.z1);
    if (!hit.ribbonsH.includes(box.h)) hit.ribbonsH.push(box.h);
    if (!hit.ribbonsV.includes(box.v)) hit.ribbonsV.push(box.v);
  }
  const reaches = (rib, lo, hi, start, end, before) => {
    const width = rib.p1 - rib.p0 + 1;
    const shared = overlaps(rib.p0, rib.p1, lo, hi);
    if (shared < Math.min(width, hi - lo + 1) - 1) return false;
    if (before) return rib.a0 < start && rib.a1 >= start - 2;
    return rib.a1 > end && rib.a0 <= end + 2;
  };
  for (const box of junctions) {
    box.west = hRibbons.some((rib) => reaches(rib, box.z0, box.z1, box.x0, box.x1, true));
    box.east = hRibbons.some((rib) => reaches(rib, box.z0, box.z1, box.x0, box.x1, false));
    box.north = vRibbons.some((rib) => reaches(rib, box.x0, box.x1, box.z0, box.z1, true));
    box.south = vRibbons.some((rib) => reaches(rib, box.x0, box.x1, box.z0, box.z1, false));
  }

  const placements = [];
  for (const box of junctions) {
    const choice = pieceForArms(box.north, box.east, box.south, box.west);
    if (!choice) continue;
    const bw = box.x1 - box.x0 + 1;
    const bh = box.z1 - box.z0 + 1;
    const scale = Math.max(bw, bh);
    placements.push({
      piece: choice.piece,
      turn: choice.turn,
      x: (box.x0 + box.x1 + 1) / 2,
      z: (box.z0 + box.z1 + 1) / 2,
      scale,
      y: 0.02,
    });
    box.scale = scale;
    box.cx = (box.x0 + box.x1 + 1) / 2;
    box.cz = (box.z0 + box.z1 + 1) / 2;
  }

  const blocksFor = (rib) => {
    const blocks = [];
    for (const box of junctions) {
      if (!box.scale) continue;
      const mine = rib.horizontal ? box.ribbonsH.includes(rib) : box.ribbonsV.includes(rib);
      if (!mine) continue;
      const center = rib.horizontal ? box.cx : box.cz;
      const half = box.scale / 2;
      // Tuck under the junction, and stop short of its center so the
      // opposite arm cannot occupy the same asphalt.
      const slack = Math.max(0, half - TUCK - 0.2);
      blocks.push({ lo: center - half + TUCK, hi: center + half - TUCK, slack });
    }
    return blocks;
  };

  const addStraights = (rib) => {
    const width = rib.p1 - rib.p0 + 1;
    const perp = (rib.p0 + rib.p1 + 1) / 2;
    const parts = subtractRange(rib.a0, rib.a1 + 1, blocksFor(rib));
    for (const part of parts) {
      const centers = placeRun(part.lo, part.hi, width, part.slackLo, part.slackHi);
      for (const center of centers) {
        placements.push({
          piece: "straight",
          turn: rib.horizontal ? 0 : 1,
          x: rib.horizontal ? center : perp,
          z: rib.horizontal ? perp : center,
          scale: width,
          y: 0,
        });
      }
    }
  };
  for (const rib of hRibbons) addStraights(rib);
  for (const rib of vRibbons) addStraights(rib);

  const kept = [];
  const straights = placements.filter((item) => item.piece === "straight")
    .sort((a, b) => b.scale - a.scale || a.turn - b.turn);
  const others = placements.filter((item) => item.piece !== "straight");
  for (const item of straights) {
    const clash = kept.some((other) => {
      if (other.turn !== item.turn) return false;
      const overlapX = (item.scale + other.scale) / 2 - Math.abs(item.x - other.x);
      const overlapZ = (item.scale + other.scale) / 2 - Math.abs(item.z - other.z);
      return overlapX > 0.35 && overlapZ > 0.35;
    });
    if (!clash) kept.push(item);
  }
  placements.length = 0;
  placements.push(...others, ...kept);

  const covered = new Uint8Array(cols * rows);
  for (const item of placements) {
    const half = item.scale / 2;
    const x0 = Math.max(0, Math.floor(item.x - half + 1e-4));
    const x1 = Math.min(cols - 1, Math.ceil(item.x + half - 1e-4) - 1);
    const z0 = Math.max(0, Math.floor(item.z - half + 1e-4));
    const z1 = Math.min(rows - 1, Math.ceil(item.z + half - 1e-4) - 1);
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        if (Math.abs(cx - item.x) > half + 1e-4 || Math.abs(cz - item.z) > half + 1e-4) continue;
        if (!westRoad(x, z)) continue;
        covered[z * cols + x] = 1;
      }
    }
  }

  return {
    count: placements.length,
    placements,
    covers(x, z) {
      if (x < 0 || z < 0 || x >= cols || z >= rows) return false;
      return covered[z * cols + x] === 1;
    },
  };
}
