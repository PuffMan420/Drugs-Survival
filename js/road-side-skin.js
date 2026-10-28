// UVs for the skinned road-side pieces. The Kenney mesh is wider on the
// negative-Z side and, on the entry and exit, that curb flares back to the
// straight-road width. A straight projection (v = z + 0.5) would push the
// wide curb off the texture. This keeps the straight skin's curb band on
// the real curb and leaves the positive half identical to road-straight.

const GUTTER = 0.25;

function curbBand(y, outer) {
  const d = Math.min(1, Math.max(0, (0.02 - y) * 5));
  return outer ? d : 0.1 - d;
}

// Bottom lip of the negative curb, one sample per x, outermost z.
export function outerCurbSamples(points) {
  const byX = new Map();
  for (const point of points) {
    if (point.y > 0.001 || point.z >= 0) continue;
    const prev = byX.get(point.x);
    if (prev == null || point.z < prev) byX.set(point.x, point.z);
  }
  return [...byX.entries()].sort((a, b) => a[0] - b[0]);
}

export function distanceToOuterCurb(x, z, samples) {
  if (samples.length === 0) return Math.abs(z + 0.5);
  let best = Infinity;
  const last = samples.length - 1;
  for (let i = 0; i < last; i += 1) {
    const [x0, z0] = samples[i];
    const [x1, z1] = samples[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / len2));
    const px = x0 + t * dx;
    const pz = z0 + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) best = dist;
  }
  if (last === 0) {
    const [x0, z0] = samples[0];
    best = Math.hypot(x - x0, z - z0);
  }
  return best;
}

// u runs along the piece. v = 0 is the outer negative curb. The lip, the
// inner curb and the gutter are 0, 0.1 and 0.2 off that curve, which is the
// straight skin's concrete band and the asphalt just inside it. Past the
// gutter, v = z + 0.5, so the centre line stays on z = 0 and the positive
// curb matches road-straight. A Z-facing wall sweeps the same 10% band.
export function sideRoadUV(x, y, z, nz, minX, maxX, samples) {
  const span = maxX - minX || 1;
  const u = (x - minX) / span;
  if (Math.abs(nz) > 0.5) {
    const dist = z < 0 ? distanceToOuterCurb(x, z, samples) : 0;
    const outer = z < 0 ? dist < 0.05 : Math.abs(Math.abs(z) - 0.5) < 1e-3;
    const edge = curbBand(y, outer);
    return [u, z < 0 ? edge : 1 - edge];
  }
  if (z < 0) {
    const dist = distanceToOuterCurb(x, z, samples);
    if (dist <= GUTTER) return [u, dist];
  }
  return [u, z + 0.5];
}
