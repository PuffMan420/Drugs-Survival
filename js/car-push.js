// A player who overlaps a car used to be stuck: the old test rejected every
// step that still touched the box, and one step is shorter than a car, so
// there was no legal move out. This pushes them to the nearest free spot
// instead, including a slide along the car when a wall blocks the shortest exit.

function carSeparation(px, pz, body, radius) {
  const ox = px - body.x;
  const oz = pz - body.z;
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  const lx = ox * c - oz * s;
  const lz = ox * s + oz * c;
  const hx = body.w / 2;
  const hz = body.h / 2;
  const nearestX = Math.max(-hx, Math.min(hx, lx));
  const nearestZ = Math.max(-hz, Math.min(hz, lz));
  const dx = lx - nearestX;
  const dz = lz - nearestZ;
  const dist = Math.hypot(dx, dz);

  const toWorld = (nx, nz, push) => ({
    x: (nx * c + nz * s) * push,
    z: (-nx * s + nz * c) * push,
    depth: push,
  });

  if (dist > 1e-6) {
    if (dist >= radius) return null;
    return toWorld(dx / dist, dz / dist, radius - dist);
  }

  const left = hx + lx;
  const right = hx - lx;
  const north = hz + lz;
  const south = hz - lz;
  let face = left;
  let nx = -1;
  let nz = 0;
  if (right < face) {
    face = right;
    nx = 1;
    nz = 0;
  }
  if (north < face) {
    face = north;
    nx = 0;
    nz = -1;
  }
  if (south < face) {
    face = south;
    nx = 0;
    nz = 1;
  }
  return toWorld(nx, nz, face + radius);
}

function overlapDepth(px, pz, bodies, radius) {
  let depth = 0;
  for (const body of bodies) {
    const hit = carSeparation(px, pz, body, radius);
    if (hit && hit.depth > depth) depth = hit.depth;
  }
  return depth;
}

function exits(x, z, push) {
  const options = [
    [x + push.x, z + push.z],
    [x + push.x, z],
    [x, z + push.z],
  ];
  const len = Math.hypot(push.x, push.z) || 1;
  const tx = -push.z / len;
  const tz = push.x / len;
  for (const sign of [1, -1]) {
    for (let distance = 8; distance <= 112; distance += 8) {
      options.push([
        x + push.x + tx * distance * sign,
        z + push.z + tz * distance * sign,
      ]);
    }
  }
  return options;
}

function searchFree(x, z, bodies, radius, blocked) {
  for (let ring = 1; ring <= 20; ring += 1) {
    const reach = ring * 8;
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const nx = x + Math.cos(angle) * reach;
      const nz = z + Math.sin(angle) * reach;
      if (blocked(nx, nz)) continue;
      if (overlapDepth(nx, nz, bodies, radius) <= 0) return { x: nx, z: nz };
    }
  }
  return null;
}

export function pushOutOfCars(x, z, bodies, radius, blocked) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 8; pass += 1) {
    let worst = null;
    for (const body of bodies) {
      const hit = carSeparation(px, pz, body, radius);
      if (hit && (!worst || hit.depth > worst.depth)) worst = hit;
    }
    if (!worst) return { x: px, z: pz };
    let placed = false;
    for (const [nx, nz] of exits(px, pz, worst)) {
      if (blocked(nx, nz)) continue;
      if (overlapDepth(nx, nz, bodies, radius) < worst.depth - 0.25) {
        px = nx;
        pz = nz;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  if (overlapDepth(px, pz, bodies, radius) > 0) {
    const found = searchFree(px, pz, bodies, radius, blocked);
    if (found) return found;
  }
  return { x: px, z: pz };
}
