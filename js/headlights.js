// Headlight faces ship flat on one side of the nose. A sloped hood keeps the
// whole quad on top; a vertical nose keeps it on the front face. Either way
// the quad misses the corner. Fold each lamp about its own midline, seat that
// midline on the hood/front edge, and lay equal halves on the two faces so
// the halves follow those face angles. Indices belong only to the lamp, so
// the body stays put. A fill triangle closes the opening the lamp leaves.

const EPS = 1e-5;

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a) {
  const len = length(a);
  if (len < 1e-8) return null;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function projectOntoPlane(vector, normal) {
  return normalize(sub(vector, scale(normal, dot(vector, normal))));
}

function read3(array, index) {
  const offset = index * 3;
  return [array[offset], array[offset + 1], array[offset + 2]];
}

function write3(array, index, value) {
  const offset = index * 3;
  array[offset] = value[0];
  array[offset + 1] = value[1];
  array[offset + 2] = value[2];
}

function triNormal(base, i0, i1, i2) {
  const a = read3(base, i0);
  const b = read3(base, i1);
  const c = read3(base, i2);
  return normalize(cross(sub(b, a), sub(c, a)));
}

function triArea(base, i0, i1, i2) {
  const a = read3(base, i0);
  const b = read3(base, i1);
  const c = read3(base, i2);
  return length(cross(sub(b, a), sub(c, a)));
}

function posKey(p) {
  return `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)},${Math.round(p[2] * 1000)}`;
}

function edgePoint(indexA, indexB, spanA, spanB) {
  return {
    lerp: spanA / (spanA - spanB),
    from: indexA,
    to: indexB,
  };
}

// Far half of a lamp triangle: the side away from the nose corner (span < 0).
// Corners are either an original vertex or a lerp, in the original winding.
function farPieces(ids, spans) {
  const pos = [];
  const neg = [];
  const zero = [];
  for (let k = 0; k < 3; k += 1) {
    if (spans[k] > EPS) pos.push(k);
    else if (spans[k] < -EPS) neg.push(k);
    else zero.push(k);
  }
  const at = (index) => ({ index });
  if (!pos.length || !neg.length) {
    if (pos.length) return [];
    return [[at(ids[0]), at(ids[1]), at(ids[2])]];
  }
  if (zero.length === 1) {
    const rotated = rotateFirst(zero[0], ids, spans);
    const negSlot = rotated.spans[1] < 0 ? 1 : 2;
    const posSlot = negSlot === 1 ? 2 : 1;
    const mid = edgePoint(
      rotated.ids[posSlot],
      rotated.ids[negSlot],
      rotated.spans[posSlot],
      rotated.spans[negSlot],
    );
    if (negSlot === 1) return [[at(rotated.ids[0]), at(rotated.ids[1]), mid]];
    return [[at(rotated.ids[0]), mid, at(rotated.ids[2])]];
  }
  const lone = pos.length === 1 ? pos[0] : neg[0];
  const rotated = rotateFirst(lone, ids, spans);
  const next = edgePoint(rotated.ids[0], rotated.ids[1], rotated.spans[0], rotated.spans[1]);
  const prev = edgePoint(rotated.ids[0], rotated.ids[2], rotated.spans[0], rotated.spans[2]);
  if (rotated.spans[0] < 0) return [[at(rotated.ids[0]), next, prev]];
  return [
    [next, at(rotated.ids[1]), at(rotated.ids[2])],
    [next, at(rotated.ids[2]), prev],
  ];
}

function rotateFirst(slot, ids, spans) {
  if (slot === 0) return { ids, spans };
  if (slot === 1) {
    return {
      ids: [ids[1], ids[2], ids[0]],
      spans: [spans[1], spans[2], spans[0]],
    };
  }
  return {
    ids: [ids[2], ids[0], ids[1]],
    spans: [spans[2], spans[0], spans[1]],
  };
}

// One lamp per side of the nose. `group` is the headlight triangles there.
function foldSide(state, group) {
  const { base, positions, normals, uvs, indices, cats, paint, bodyAt, bodyList } = state;
  const tris = group.map((entry) => {
    const offset = entry.tri * 3;
    return [indices[offset], indices[offset + 1], indices[offset + 2]];
  });
  const main = [];
  for (let i = 0; i < tris.length; i += 1) {
    const normal = triNormal(base, tris[i][0], tris[i][1], tris[i][2]);
    if (normal && Math.abs(normal[0]) < 0.5) main.push(tris[i]);
  }
  const frameTris = main.length ? main : tris;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  const frameVerts = new Set();
  for (const ids of frameTris) {
    const normal = triNormal(base, ids[0], ids[1], ids[2]);
    const area = triArea(base, ids[0], ids[1], ids[2]);
    if (!normal || area < 1e-8) continue;
    nx += normal[0] * area;
    ny += normal[1] * area;
    nz += normal[2] * area;
    frameVerts.add(ids[0]);
    frameVerts.add(ids[1]);
    frameVerts.add(ids[2]);
  }
  const lampNormal = normalize([nx, ny, nz]);
  if (!lampNormal || frameVerts.size < 3) return;

  const onHood = Math.abs(lampNormal[1]) > Math.abs(lampNormal[2]);
  let depth = projectOntoPlane(onHood ? [0, 0, 1] : [0, 1, 0], lampNormal);
  if (!depth) return;
  if (onHood && depth[2] < 0) depth = scale(depth, -1);
  if (!onHood && depth[1] < 0) depth = scale(depth, -1);
  let edge = normalize(cross(lampNormal, depth));
  if (!edge) return;
  if (edge[0] < 0) edge = scale(edge, -1);

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const index of frameVerts) {
    const p = read3(base, index);
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const center = [cx / frameVerts.size, cy / frameVerts.size, cz / frameVerts.size];

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const index of frameVerts) {
    const t = dot(sub(read3(base, index), center), depth);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  if (tMax - tMin < 1e-4) return;
  const mid = (tMin + tMax) / 2;
  // The forward (hood lamp) or upper (front lamp) edge is the nose corner.
  const origin = add(center, scale(depth, tMax));

  const hoodNormal = surfaceNormal(state, center, (normal) => normal[1] > 0.7) || [0, 1, 0];
  const frontNormal = surfaceNormal(state, center, (normal) => normal[2] > 0.7) || [0, 0, 1];
  let hoodDir = normalize(cross(edge, hoodNormal));
  let faceDir = normalize(cross(frontNormal, edge));
  if (!hoodDir || !faceDir) return;
  if (hoodDir[2] > 0) hoodDir = scale(hoodDir, -1);
  if (faceDir[1] > 0) faceDir = scale(faceDir, -1);
  const creaseNormal = normalize(add(hoodNormal, frontNormal)) || hoodNormal;

  const spanOf = (index) => dot(sub(read3(base, index), center), depth) - mid;
  const acrossOf = (index) => dot(sub(read3(base, index), center), edge);
  const foldedAt = (index) => {
    const span = spanOf(index);
    const dir = onHood
      ? (span >= 0 ? faceDir : hoodDir)
      : (span >= 0 ? hoodDir : faceDir);
    return add(add(origin, scale(edge, acrossOf(index))), scale(dir, Math.abs(span)));
  };
  const normalAt = (span) => {
    if (Math.abs(span) <= EPS) return creaseNormal;
    const onHoodHalf = onHood ? span < 0 : span >= 0;
    return onHoodHalf ? hoodNormal : frontNormal;
  };

  const cornerUv = (index) => {
    const sample = bodySample(bodyAt, bodyList, read3(base, index));
    if (sample) return [sample.u, sample.v];
    const offset = index * 2;
    return [uvs[offset], uvs[offset + 1]];
  };

  // The lip half of a nose lamp lands back on the panel it left. Filling that
  // half would fight the lamp. The far half, and a side cap that leaves the
  // fender entirely, stay behind as body-coloured patches.
  const fillCorner = (corner, normal) => {
    if (corner.lerp == null) {
      const point = read3(base, corner.index);
      return addRaw(state, point, normal, cornerUv(corner.index), 1);
    }
    const from = read3(base, corner.from);
    const to = read3(base, corner.to);
    const point = add(from, scale(sub(to, from), corner.lerp));
    const uvFrom = cornerUv(corner.from);
    const uvTo = cornerUv(corner.to);
    return addRaw(
      state,
      point,
      normal,
      [
        uvFrom[0] + (uvTo[0] - uvFrom[0]) * corner.lerp,
        uvFrom[1] + (uvTo[1] - uvFrom[1]) * corner.lerp,
      ],
      1,
    );
  };
  for (let g = 0; g < group.length; g += 1) {
    const ids = tris[g];
    const normal = triNormal(base, ids[0], ids[1], ids[2]) || frontNormal;
    const spans = [spanOf(ids[0]), spanOf(ids[1]), spanOf(ids[2])];
    const pieces = Math.abs(normal[0]) >= 0.5
      ? [ids.map((index) => ({ index }))]
      : farPieces(ids, spans);
    for (let p = 0; p < pieces.length; p += 1) {
      const made = [
        fillCorner(pieces[p][0], normal),
        fillCorner(pieces[p][1], normal),
        fillCorner(pieces[p][2], normal),
      ];
      indices.push(made[0], made[1], made[2]);
      cats.push(0);
    }
  }

  const intersect = (indexA, indexB, spanA, spanB) => {
    const weight = spanA / (spanA - spanB);
    const across = acrossOf(indexA) + (acrossOf(indexB) - acrossOf(indexA)) * weight;
    const point = add(origin, scale(edge, across));
    const uvA = indexA * 2;
    const uvB = indexB * 2;
    const u = uvs[uvA] + (uvs[uvB] - uvs[uvA]) * weight;
    const v = uvs[uvA + 1] + (uvs[uvB + 1] - uvs[uvA + 1]) * weight;
    return addRaw(state, point, creaseNormal, [u, v], 0);
  };

  const splitOf = (ids) => {
    const spans = [spanOf(ids[0]), spanOf(ids[1]), spanOf(ids[2])];
    const pos = [];
    const neg = [];
    const zero = [];
    for (let k = 0; k < 3; k += 1) {
      if (spans[k] > EPS) pos.push(k);
      else if (spans[k] < -EPS) neg.push(k);
      else zero.push(k);
    }
    if (!pos.length || !neg.length) return [ids];
    if (zero.length === 1) {
      const rotated = rotateFirst(zero[0], ids, spans);
      const midIndex = intersect(rotated.ids[1], rotated.ids[2], rotated.spans[1], rotated.spans[2]);
      return [
        [rotated.ids[0], rotated.ids[1], midIndex],
        [rotated.ids[0], midIndex, rotated.ids[2]],
      ];
    }
    const lone = pos.length === 1 ? pos[0] : neg[0];
    const rotated = rotateFirst(lone, ids, spans);
    const towardNext = intersect(rotated.ids[0], rotated.ids[1], rotated.spans[0], rotated.spans[1]);
    const towardPrev = intersect(rotated.ids[0], rotated.ids[2], rotated.spans[0], rotated.spans[2]);
    return [
      [rotated.ids[0], towardNext, towardPrev],
      [towardNext, rotated.ids[1], rotated.ids[2]],
      [towardNext, rotated.ids[2], towardPrev],
    ];
  };

  for (let g = 0; g < group.length; g += 1) {
    const pieces = splitOf(tris[g]);
    const slot = group[g].tri * 3;
    indices[slot] = pieces[0][0];
    indices[slot + 1] = pieces[0][1];
    indices[slot + 2] = pieces[0][2];
    for (let p = 1; p < pieces.length; p += 1) {
      indices.push(pieces[p][0], pieces[p][1], pieces[p][2]);
      cats.push(2);
    }
  }

  const moved = new Set();
  for (const ids of tris) {
    moved.add(ids[0]);
    moved.add(ids[1]);
    moved.add(ids[2]);
  }
  for (const index of moved) {
    write3(positions, index, foldedAt(index));
    write3(normals, index, normalAt(spanOf(index)));
  }
}

function surfaceNormal(state, center, accept) {
  const { base, indices, cats } = state;
  const side = center[0] < 0;
  let sum = [0, 0, 0];
  let count = 0;
  const tris = state.triCount;
  for (let tri = 0; tri < tris; tri += 1) {
    if (cats[tri] === 2) continue;
    const offset = tri * 3;
    const i0 = indices[offset];
    const i1 = indices[offset + 1];
    const i2 = indices[offset + 2];
    const normal = triNormal(base, i0, i1, i2);
    if (!normal || !accept(normal)) continue;
    const a = read3(base, i0);
    const b = read3(base, i1);
    const c = read3(base, i2);
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    if (Math.abs(cx - center[0]) > 0.45) continue;
    if (cz < center[2] - 0.55) continue;
    if ((cx < 0) !== side && Math.abs(cx) > 0.05) continue;
    const area = triArea(base, i0, i1, i2);
    sum = add(sum, scale(normal, area));
    count += 1;
  }
  if (!count) return null;
  return normalize(sum);
}

function bodySample(bodyAt, bodyList, point) {
  const hit = bodyAt.get(posKey(point));
  if (hit) return hit;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < bodyList.length; i += 1) {
    const sample = bodyList[i];
    const dist = (sample.x - point[0]) ** 2 + (sample.y - point[1]) ** 2 + (sample.z - point[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = sample;
    }
  }
  return best;
}

function addRaw(state, point, normal, uv, paintValue) {
  const { positions, normals, uvs, paint } = state;
  const index = positions.length / 3;
  positions.push(point[0], point[1], point[2]);
  normals.push(normal[0], normal[1], normal[2]);
  uvs.push(uv[0], uv[1]);
  if (paint) paint.push(paintValue);
  return index;
}

function collectBody(base, indices, uvs, cats) {
  const bodyAt = new Map();
  const bodyList = [];
  const tris = cats.length;
  for (let tri = 0; tri < tris; tri += 1) {
    if (cats[tri] === 2) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const index = indices[tri * 3 + corner];
      const point = read3(base, index);
      const sample = {
        x: point[0],
        y: point[1],
        z: point[2],
        u: uvs[index * 2],
        v: uvs[index * 2 + 1],
        cat: cats[tri],
      };
      bodyList.push(sample);
      const key = posKey(point);
      const prior = bodyAt.get(key);
      if (!prior || (prior.cat !== 0 && sample.cat === 0)) bodyAt.set(key, sample);
    }
  }
  return { bodyAt, bodyList };
}

export function foldHeadlightGeometry(mesh) {
  const cats = Array.from(mesh.cats);
  let any = false;
  for (let i = 0; i < cats.length; i += 1) {
    if (cats[i] === 2) any = true;
  }
  if (!any) return mesh;

  const base = Float32Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);
  const uvs = Array.from(mesh.uvs);
  const { bodyAt, bodyList } = collectBody(base, indices, uvs, cats);
  const state = {
    base,
    positions: Array.from(base),
    normals: Array.from(mesh.normals),
    uvs,
    indices,
    cats,
    paint: mesh.paint ? Array.from(mesh.paint) : null,
    bodyAt,
    bodyList,
    triCount: cats.length,
  };

  const heads = [];
  for (let tri = 0; tri < cats.length; tri += 1) {
    if (cats[tri] !== 2) continue;
    const i0 = indices[tri * 3];
    const i1 = indices[tri * 3 + 1];
    const i2 = indices[tri * 3 + 2];
    const cx = (base[i0 * 3] + base[i1 * 3] + base[i2 * 3]) / 3;
    heads.push({ tri, cx });
  }
  const left = heads.filter((head) => head.cx < 0);
  const right = heads.filter((head) => head.cx >= 0);
  if (left.length) foldSide(state, left);
  if (right.length) foldSide(state, right);

  return {
    positions: Float32Array.from(state.positions),
    normals: Float32Array.from(state.normals),
    uvs: Float32Array.from(state.uvs),
    indices: Uint32Array.from(state.indices),
    cats: state.cats,
    paint: state.paint ? Float32Array.from(state.paint) : null,
  };
}
