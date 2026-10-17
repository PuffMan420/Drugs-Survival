// Turns the waterfront segments into straight runs, 45° diag tiles, and corner pieces.
// Art is 5 px per world unit. Straight coping repeats every 288 units. A diag tile is
// 384 units on a side. Corner pieces are 192 units, with the bend at the centre.

const DIAG_MAX = 2.4;

// Image directions (x right, y down) of the two bank arms leaving the centre.
// Away-directions of a 45° bend sit about 135° apart; a square bend sits at 90°.
// arms leave the centre. land is the image direction (x right, y down) toward dry ground.
// The 45° outer sheet has land on the clear side of both arms (up, and up-right).
const ART = {
  outer90: { arms: [[-1, 0], [0, 1]], land: [[0, -1], [1, 0]] },
  inner90: { arms: [[-1, 0], [0, -1]], land: [[0, -1], [-1, 0]] },
  outer: { arms: [[-1, 0], [Math.SQRT1_2, Math.SQRT1_2]], land: [[0, -1], [Math.SQRT1_2, -Math.SQRT1_2]] },
  inner: { arms: [[-1, 0], [Math.SQRT1_2, -Math.SQRT1_2]], land: [[0, -1], [-Math.SQRT1_2, -Math.SQRT1_2]] },
};

function unit(x, z) {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function rot90(x, z) {
  // 90° clockwise where +z is image-down.
  return [-z, x];
}

function segmentKind(seg) {
  const dx = seg.bx - seg.ax;
  const dz = seg.bz - seg.az;
  const len = Math.hypot(dx, dz) || 1;
  const ax = Math.abs(dx) / len;
  const az = Math.abs(dz) / len;
  const minor = Math.min(ax, az);
  const major = Math.max(ax, az);
  if (minor < 0.2) return "axis";
  if (minor / major > 0.5) return "diag";
  return "other";
}

function keyOf(x, z) {
  return `${Math.round(x * 50) / 50},${Math.round(z * 50) / 50}`;
}

function solve(art, w1, w2) {
  const arms = art.arms;
  const det = arms[0][0] * arms[1][1] - arms[0][1] * arms[1][0];
  if (Math.abs(det) < 1e-3) return null;
  const uDir = [
    (arms[1][1] * w1[0] - arms[0][1] * w2[0]) / det,
    (arms[1][1] * w1[1] - arms[0][1] * w2[1]) / det,
  ];
  const vDir = [
    (-arms[1][0] * w1[0] + arms[0][0] * w2[0]) / det,
    (-arms[1][0] * w1[1] + arms[0][0] * w2[1]) / det,
  ];
  const spun = rot90(uDir[0], uDir[1]);
  const err = Math.hypot(spun[0] - vDir[0], spun[1] - vDir[1]);
  const lenU = Math.hypot(uDir[0], uDir[1]);
  if (err > 0.25 || Math.abs(lenU - 1) > 0.25) return null;
  return { uDir: unit(uDir[0], uDir[1]), vDir: unit(vDir[0], vDir[1]) };
}

function landFaces(art, hit, n1, n2) {
  const world = (image) => {
    const x = image[0] * hit.uDir[0] + image[1] * hit.vDir[0];
    const z = image[0] * hit.uDir[1] + image[1] * hit.vDir[1];
    const len = Math.hypot(x, z) || 1;
    return [x / len, z / len];
  };
  const a = world(art.land[0]);
  const b = world(art.land[1]);
  return a[0] * n1[0] + a[1] * n1[1] > 0.45 && b[0] * n2[0] + b[1] * n2[1] > 0.45;
}

function orient(kinds, w1, n1, w2, n2) {
  for (const kind of kinds) {
    const art = ART[kind];
    const first = solve(art, w1, w2);
    if (first && landFaces(art, first, n1, n2)) return { kind, ...first };
    const second = solve(art, w2, w1);
    if (second && landFaces(art, second, n2, n1)) return { kind, ...second };
  }
  return null;
}

function armAway(seg, x, z) {
  const mx = (seg.ax + seg.bx) / 2;
  const mz = (seg.az + seg.bz) / 2;
  return unit(mx - x, mz - z);
}

function intersect(a, b) {
  const dax = a.bx - a.ax;
  const daz = a.bz - a.az;
  const dbx = b.bx - b.ax;
  const dbz = b.bz - b.az;
  const det = dax * dbz - daz * dbx;
  if (Math.abs(det) < 1e-4) return null;
  const t = ((b.ax - a.ax) * dbz - (b.az - a.az) * dbx) / det;
  return [a.ax + dax * t, a.az + daz * t];
}

function angleBetween(a, b) {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1]));
  return Math.acos(dot) * 180 / Math.PI;
}

export function planQuayDraw(segments) {
  const tagged = segments.map((seg) => ({
    ...seg,
    len: Math.hypot(seg.bx - seg.ax, seg.bz - seg.az),
    shape: segmentKind(seg),
    skip: false,
  }));
  const at = new Map();
  const touch = (x, z, seg) => {
    const key = keyOf(x, z);
    if (!at.has(key)) at.set(key, []);
    at.get(key).push(seg);
  };
  for (const seg of tagged) {
    touch(seg.ax, seg.az, seg);
    touch(seg.bx, seg.bz, seg);
  }
  const neighbor = (seg, x, z) => (at.get(keyOf(x, z)) || []).find((other) => other !== seg);

  const corners = [];
  const wallCorners = [];
  const suppressed = new Set();

  for (const seg of tagged) {
    if (seg.shape !== "diag" || seg.len > DIAG_MAX || !seg.soft) continue;
    const prev = neighbor(seg, seg.ax, seg.az);
    const next = neighbor(seg, seg.bx, seg.bz);
    if (!prev || !next || prev.shape === "diag" || next.shape === "diag") continue;
    const point = intersect(prev, next);
    if (!point) continue;
    const w1 = armAway(prev, point[0], point[1]);
    const w2 = armAway(next, point[0], point[1]);
    if (Math.abs(angleBetween(w1, w2) - 90) > 25) continue;
    const placed = orient(["outer90", "inner90"], w1, [prev.nx, prev.nz], w2, [next.nx, next.nz]);
    if (!placed) continue;
    seg.skip = true;
    suppressed.add(keyOf(seg.ax, seg.az));
    suppressed.add(keyOf(seg.bx, seg.bz));
    corners.push({ x: point[0], z: point[1], trim: 0, ...placed });
  }

  for (const [key, list] of at) {
    if (suppressed.has(key) || list.length !== 2) continue;
    const [a, b] = list;
    if (a.skip || b.skip) continue;
    const [x, z] = key.split(",").map(Number);
    const w1 = armAway(a, x, z);
    const w2 = armAway(b, x, z);
    const turn = angleBetween(w1, w2);
    const n1 = [a.nx, a.nz];
    const n2 = [b.nx, b.nz];
    // Pier tips are wood. The concrete corner sheets stay off them; the wall
    // texture closes the gap instead. Every other bend can use a corner sheet.
    if (a.dock && b.dock) {
      if (turn > 70 && turn < 110) {
        wallCorners.push({ x, z, nx: n1[0], nz: n1[1], mx: n2[0], mz: n2[1] });
      }
      continue;
    }
    let placed = null;
    if (turn > 70 && turn < 110) placed = orient(["outer90", "inner90"], w1, n1, w2, n2);
    else if (turn > 115 && turn < 155) placed = orient(["outer", "inner"], w1, n1, w2, n2);
    if (!placed) continue;
    corners.push({ x, z, trim: 0.85, ...placed });
  }

  const trimFor = (x, z) => {
    let trim = 0;
    for (const corner of corners) {
      if (Math.hypot(corner.x - x, corner.z - z) < 0.2) trim = Math.max(trim, corner.trim);
    }
    return trim;
  };

  const strips = [];
  const diags = [];
  for (const seg of tagged) {
    if (seg.skip || seg.len < 0.08) continue;
    const keepDiag = seg.shape === "diag" && seg.soft;
    const aTrim = trimFor(seg.ax, seg.az);
    const bTrim = trimFor(seg.bx, seg.bz);
    if (aTrim + bTrim + 0.2 >= seg.len) continue;
    const dx = (seg.bx - seg.ax) / seg.len;
    const dz = (seg.bz - seg.az) / seg.len;
    const drawn = {
      ax: seg.ax + dx * aTrim,
      az: seg.az + dz * aTrim,
      bx: seg.bx - dx * bTrim,
      bz: seg.bz - dz * bTrim,
      nx: seg.nx,
      nz: seg.nz,
      soft: seg.soft,
      dock: seg.dock,
    };
    if (keepDiag) diags.push(drawn);
    else strips.push(drawn);
  }

  return { strips, diags, corners, wallCorners };
}
