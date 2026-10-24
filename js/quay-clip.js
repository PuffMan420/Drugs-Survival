// Concrete quay sheets around places 1, 4 and 7.
// Corner sheets are four tiles across, so a narrow pier mouth stacks two of
// them, and a kept diagonal runs under the sheet beside it. This clips those
// sheets so each stretch of bank is drawn once. Anything that would land on
// a wooden pier is returned separately and drawn under the deck.

const PATROL = [
  [41, 40],
  [40, 126],
  [52, 200],
];
const PATROL_REACH = 36;

function inPatrol(x, z) {
  for (const [sx, sz] of PATROL) {
    const dx = x - sx;
    const dz = z - sz;
    if (dx * dx + dz * dz <= PATROL_REACH * PATROL_REACH) return true;
  }
  return false;
}

function centroid(poly) {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  const n = poly.length || 1;
  return [x / n, z / n];
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

function sideOf(ax, az, bx, bz, p) {
  return (bx - ax) * (p.z - az) - (bz - az) * (p.x - ax);
}

export function clipHalfPlane(poly, ax, az, bx, bz, keepPositive) {
  if (!poly || poly.length === 0) return [];
  const inside = (p) => {
    const s = sideOf(ax, az, bx, bz, p);
    return keepPositive ? s >= -0.05 : s <= 0.05;
  };
  const out = [];
  let prev = poly[poly.length - 1];
  let prevIn = inside(prev);
  for (const cur of poly) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) {
        const sa = sideOf(ax, az, bx, bz, prev);
        const sb = sideOf(ax, az, bx, bz, cur);
        out.push(lerpPoint(prev, cur, sa / (sa - sb || 1e-8)));
      }
      out.push(cur);
    } else if (prevIn) {
      const sa = sideOf(ax, az, bx, bz, prev);
      const sb = sideOf(ax, az, bx, bz, cur);
      out.push(lerpPoint(prev, cur, sa / (sa - sb || 1e-8)));
    }
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

function clipToConvex(subject, cutter) {
  const [cx, cz] = centroid(cutter);
  let out = subject;
  for (let i = 0; i < cutter.length; i += 1) {
    const a = cutter[i];
    const b = cutter[(i + 1) % cutter.length];
    const keepPositive = sideOf(a.x, a.z, b.x, b.z, { x: cx, z: cz }) >= 0;
    out = clipHalfPlane(out, a.x, a.z, b.x, b.z, keepPositive);
    if (out.length < 3) return [];
  }
  return out;
}

export function subtractConvex(subject, cutter) {
  if (!subject || subject.length < 3 || !cutter || cutter.length < 3) return subject ? [subject] : [];
  const [cx, cz] = centroid(cutter);
  let rest = subject;
  const pieces = [];
  for (let i = 0; i < cutter.length; i += 1) {
    const a = cutter[i];
    const b = cutter[(i + 1) % cutter.length];
    const keepPositive = sideOf(a.x, a.z, b.x, b.z, { x: cx, z: cz }) >= 0;
    const outside = clipHalfPlane(rest, a.x, a.z, b.x, b.z, !keepPositive);
    if (outside.length >= 3) pieces.push(outside);
    rest = clipHalfPlane(rest, a.x, a.z, b.x, b.z, keepPositive);
    if (rest.length < 3) break;
  }
  return pieces;
}

function pointInConvex(p, poly) {
  const [cx, cz] = centroid(poly);
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sc = sideOf(a.x, a.z, b.x, b.z, { x: cx, z: cz });
    const sp = sideOf(a.x, a.z, b.x, b.z, p);
    if (sc * sp < -1) return false;
  }
  return true;
}

function overlaps(a, b) {
  if (a.some((p) => pointInConvex(p, b))) return true;
  if (b.some((p) => pointInConvex(p, a))) return true;
  return false;
}

function clipCloser(poly, ax, az, bx, bz) {
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const nx = ax - bx;
  const nz = az - bz;
  const inside = (p) => (p.x - mx) * nx + (p.z - mz) * nz >= -0.05;
  const out = [];
  let prev = poly[poly.length - 1];
  let prevIn = inside(prev);
  for (const cur of poly) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) {
        const sa = (prev.x - mx) * nx + (prev.z - mz) * nz;
        const sb = (cur.x - mx) * nx + (cur.z - mz) * nz;
        out.push(lerpPoint(prev, cur, sa / (sa - sb || 1e-8)));
      }
      out.push(cur);
    } else if (prevIn) {
      const sa = (prev.x - mx) * nx + (prev.z - mz) * nz;
      const sb = (cur.x - mx) * nx + (cur.z - mz) * nz;
      out.push(lerpPoint(prev, cur, sa / (sa - sb || 1e-8)));
    }
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

function area(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) * 0.5;
}

function cornerQuad(corner, half) {
  const cx = corner.x * 48;
  const cz = corner.z * 48;
  const ux = corner.uDir[0] * half;
  const uz = corner.uDir[1] * half;
  const vx = corner.vDir[0] * half;
  const vz = corner.vDir[1] * half;
  const p = (su, sv, u, v) => ({
    x: cx + su * ux + sv * vx,
    z: cz + su * uz + sv * vz,
    u,
    v,
  });
  return [p(-1, -1, 0, 0), p(1, -1, 1, 0), p(1, 1, 1, 1), p(-1, 1, 0, 1)];
}

function diagQuad(segment, coping, slope) {
  const lenTiles = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az) || 1;
  const len = lenTiles * 48;
  const sDirX = (segment.bx - segment.ax) / lenTiles;
  const sDirZ = (segment.bz - segment.az) / lenTiles;
  const point = (s, w, u, v) => ({
    x: segment.ax * 48 + sDirX * s + segment.nx * w,
    z: segment.az * 48 + sDirZ * s + segment.nz * w,
    u,
    v,
  });
  return [
    point(0, coping, 0, 0),
    point(len, coping, 1, 0),
    point(len, -slope, 1, 1),
    point(0, -slope, 0, 1),
  ];
}

const rectCache = new WeakMap();

function dockRects(dockIds) {
  if (!dockIds) return [];
  const cached = rectCache.get(dockIds);
  if (cached) return cached;
  const rects = [];
  for (const id of dockIds) {
    const x = id % 1024;
    const z = (id - x) / 1024;
    if (!inPatrol(x, z)) continue;
    rects.push([
      { x: x * 48, z: z * 48, u: 0, v: 0 },
      { x: (x + 1) * 48, z: z * 48, u: 0, v: 0 },
      { x: (x + 1) * 48, z: (z + 1) * 48, u: 0, v: 0 },
      { x: x * 48, z: (z + 1) * 48, u: 0, v: 0 },
    ]);
  }
  rectCache.set(dockIds, rects);
  return rects;
}

export function splitFromDocks(poly, rects) {
  let land = [poly];
  const under = [];
  for (const rect of rects) {
    const next = [];
    for (const part of land) {
      const inside = clipToConvex(part, rect);
      if (inside.length < 3 || area(inside) < 8) {
        next.push(part);
        continue;
      }
      under.push(inside);
      const outside = subtractConvex(part, rect);
      if (outside.length === 0) continue;
      next.push(...outside);
    }
    land = next;
  }
  return { land, under };
}

// Corner sheets inside the patrol are cut so they do not cover one another
// or a diagonal edge. `null` means the corner is outside the patrol and
// should be drawn the original way.
export function fitCornerSheets(draw, dockIds, half, coping, slope) {
  const centers = draw.corners.map((corner) => [corner.x * 48, corner.z * 48]);
  const parts = draw.corners.map((corner) => (
    inPatrol(corner.x, corner.z) ? [cornerQuad(corner, half)] : null
  ));
  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i]) continue;
    for (let j = i + 1; j < parts.length; j += 1) {
      if (!parts[j]) continue;
      const dx = centers[i][0] - centers[j][0];
      const dz = centers[i][1] - centers[j][1];
      if (dx * dx + dz * dz > (half * 2) ** 2) continue;
      let hit = false;
      for (const a of parts[i]) {
        for (const b of parts[j]) {
          if (overlaps(a, b)) hit = true;
        }
      }
      if (!hit) continue;
      const nextI = [];
      const nextJ = [];
      for (const poly of parts[i]) {
        const clipped = clipCloser(poly, centers[i][0], centers[i][1], centers[j][0], centers[j][1]);
        if (clipped.length >= 3) nextI.push(clipped);
      }
      for (const poly of parts[j]) {
        const clipped = clipCloser(poly, centers[j][0], centers[j][1], centers[i][0], centers[i][1]);
        if (clipped.length >= 3) nextJ.push(clipped);
      }
      parts[i] = nextI;
      parts[j] = nextJ;
    }
  }
  const diags = [];
  for (const segment of draw.diags) {
    const mx = (segment.ax + segment.bx) / 2;
    const mz = (segment.az + segment.bz) / 2;
    if (!inPatrol(mx, mz)) continue;
    diags.push(diagQuad(segment, coping, slope));
  }
  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i]) continue;
    for (const diag of diags) {
      const next = [];
      for (const poly of parts[i]) {
        if (!overlaps(poly, diag)) {
          next.push(poly);
          continue;
        }
        next.push(...subtractConvex(poly, diag));
      }
      parts[i] = next;
    }
  }
  const rects = dockRects(dockIds);
  return parts.map((list) => {
    if (!list) return null;
    const land = [];
    const under = [];
    for (const poly of list) {
      const split = splitFromDocks(poly, rects);
      land.push(...split.land);
      under.push(...split.under);
    }
    return { land, under };
  });
}

export function patrolSplit(poly, dockIds, tileX, tileZ) {
  if (!inPatrol(tileX, tileZ)) return null;
  return splitFromDocks(poly, dockRects(dockIds));
}
