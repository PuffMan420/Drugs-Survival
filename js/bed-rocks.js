// The garbage truck's bed holds eight rock lumps on one mesh. They share a
// single medium-grey sheet, so the bake multiplies a dark grey onto each lump.
// The greys are linear multipliers on that sheet. Channels stay close so a
// lump stays grey, and the values stay apart so neighbouring lumps do not match.

export const ROCK_GREYS = [
  [0.16, 0.16, 0.17],
  [0.22, 0.22, 0.23],
  [0.28, 0.27, 0.27],
  [0.34, 0.33, 0.33],
  [0.19, 0.20, 0.20],
  [0.25, 0.24, 0.24],
  [0.31, 0.30, 0.31],
  [0.40, 0.39, 0.39],
];

const QUANT = 1000;

function positionKey(positions, index) {
  const o = index * 3;
  return [
    Math.round(positions[o] * QUANT),
    Math.round(positions[o + 1] * QUANT),
    Math.round(positions[o + 2] * QUANT),
  ].join(",");
}

// One group per rock. Vertices welded by position belong together even when
// the file splits them for normals. Order is by centroid so both wear levels
// paint the same lump the same grey.
export function rockGroups(positions, indices) {
  const parent = new Map();
  const find = (key) => {
    let root = parent.get(key);
    if (root == null) {
      parent.set(key, key);
      return key;
    }
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = key;
    while (cursor !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const keys = new Array(positions.length / 3);
  for (let i = 0; i < indices.length; i += 1) {
    const vertex = indices[i];
    const key = positionKey(positions, vertex);
    keys[vertex] = key;
    find(key);
  }
  for (let tri = 0; tri < indices.length; tri += 3) {
    union(keys[indices[tri]], keys[indices[tri + 1]]);
    union(keys[indices[tri]], keys[indices[tri + 2]]);
  }

  const groups = new Map();
  for (let vertex = 0; vertex < keys.length; vertex += 1) {
    const key = keys[vertex];
    if (key == null) continue;
    const root = find(key);
    let group = groups.get(root);
    if (!group) {
      group = { vertices: [], sx: 0, sy: 0, sz: 0 };
      groups.set(root, group);
    }
    group.vertices.push(vertex);
    group.sx += positions[vertex * 3];
    group.sy += positions[vertex * 3 + 1];
    group.sz += positions[vertex * 3 + 2];
  }

  const list = [...groups.values()];
  for (const group of list) {
    const n = group.vertices.length || 1;
    group.centroid = [group.sx / n, group.sy / n, group.sz / n];
  }
  list.sort((a, b) => a.centroid[0] - b.centroid[0]
    || a.centroid[2] - b.centroid[2]
    || a.centroid[1] - b.centroid[1]);
  return list;
}

export function rockVertexColors(positions, indices) {
  const colors = new Float32Array(positions.length);
  colors.fill(1);
  const groups = rockGroups(positions, indices);
  groups.forEach((group, index) => {
    const shade = ROCK_GREYS[index % ROCK_GREYS.length];
    for (const vertex of group.vertices) {
      colors[vertex * 3] = shade[0];
      colors[vertex * 3 + 1] = shade[1];
      colors[vertex * 3 + 2] = shade[2];
    }
  });
  return colors;
}
