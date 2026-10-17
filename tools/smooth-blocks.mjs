// Straighten the outer shore and the sidewalk frames on the baked city.
// Streets, buildings, docks, and the river stay where they are.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "4", "5", "6", "8", "A", "E", "a", "e"]);
const FRAME = new Set(["s", "c", "g", "l"]);

function hash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function landCell(cell) {
  return cell !== "~" && cell !== "d";
}

// Noise along a shore collapses to a straight quay. A real turn starts a new run.
function cleanSegment(values, outwardMin) {
  const n = values.length;
  const out = values.slice();
  let i = 0;
  while (i < n) {
    let j = i + 1;
    let runLo = values[i];
    let runHi = values[i];
    while (j < n) {
      const nextLo = Math.min(runLo, values[j]);
      const nextHi = Math.max(runHi, values[j]);
      if (nextHi - nextLo > 6) break;
      runLo = nextLo;
      runHi = nextHi;
      j += 1;
    }
    const edge = outwardMin ? runLo : runHi;
    for (let k = i; k < j; k += 1) out[k] = edge;
    i = j;
  }
  return out;
}

function segments(positions) {
  const parts = [];
  let current = null;
  for (let i = 0; i < positions.length; i += 1) {
    const pos = positions[i];
    if (pos == null) {
      if (current) parts.push(current);
      current = null;
      continue;
    }
    if (!current || Math.abs(pos - positions[i - 1]) > 6) {
      if (current) parts.push(current);
      current = { start: i, values: [pos] };
    } else current.values.push(pos);
  }
  if (current) parts.push(current);
  return parts;
}

export function smoothBlocks(map) {
  const grid = map.ground.map((row) => row.split(""));
  const rows = grid.length;
  const cols = grid[0].length;
  const at = (x, z) => (x < 0 || z < 0 || x >= cols || z >= rows ? "~" : grid[z][x]);

  const sea = Array.from({ length: rows }, () => new Uint8Array(cols));
  const queue = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[z][x] !== "~") continue;
      if (x === 0 || z === 0 || x === cols - 1 || z === rows - 1) {
        sea[z][x] = 1;
        queue.push(x, z);
      }
    }
  }
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const z = queue[head + 1];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || sea[nz][nx] || grid[nz][nx] !== "~") continue;
      sea[nz][nx] = 1;
      queue.push(nx, nz);
    }
  }

  const isSoft = (cell) => cell === "s" || cell === "c" || cell === "g" || cell === "q" || cell === "l" || cell === "p";

  function paintShore(axis, index, from, to, outwardMin) {
    if (to === from) return;
    const movingOut = outwardMin ? to < from : to > from;
    const fillFrom = outwardMin ? to : from + 1;
    const fillTo = outwardMin ? from - 1 : to;
    if (axis === "x") {
      const z = index;
      if (movingOut) {
        for (let x = fillFrom; x <= fillTo; x += 1) {
          if (x < 0 || x >= cols) continue;
          if (grid[z][x] === "~") {
            grid[z][x] = "c";
            sea[z][x] = 0;
          }
        }
      } else {
        const step = to > from ? 1 : -1;
        for (let x = from; x !== to; x += step) {
          const cell = grid[z][x];
          if (ROAD.has(cell) || cell === "b" || cell === "d" || cell === "n") break;
          if (isSoft(cell)) {
            grid[z][x] = "~";
            sea[z][x] = 1;
          }
        }
      }
    } else {
      const x = index;
      if (movingOut) {
        for (let z = fillFrom; z <= fillTo; z += 1) {
          if (z < 0 || z >= rows) continue;
          if (grid[z][x] === "~") {
            grid[z][x] = "c";
            sea[z][x] = 0;
          }
        }
      } else {
        const step = to > from ? 1 : -1;
        for (let z = from; z !== to; z += step) {
          const cell = grid[z][x];
          if (ROAD.has(cell) || cell === "b" || cell === "d" || cell === "n") break;
          if (isSoft(cell)) {
            grid[z][x] = "~";
            sea[z][x] = 1;
          }
        }
      }
    }
  }

  function smoothOuter(positions, axis, outwardMin) {
    for (const part of segments(positions)) {
      const target = cleanSegment(part.values, outwardMin);
      for (let i = 0; i < part.values.length; i += 1) {
        paintShore(axis, part.start + i, part.values[i], target[i], outwardMin);
      }
    }
  }

  const west = [];
  const east = [];
  for (let z = 0; z < rows; z += 1) {
    let left = null;
    let right = null;
    for (let x = 0; x < cols; x += 1) if (landCell(grid[z][x])) { left = x; break; }
    for (let x = cols - 1; x >= 0; x -= 1) if (landCell(grid[z][x])) { right = x; break; }
    west.push(left);
    east.push(right);
  }
  const north = [];
  const south = [];
  for (let x = 0; x < cols; x += 1) {
    let top = null;
    let bottom = null;
    for (let z = 0; z < rows; z += 1) if (landCell(grid[z][x])) { top = z; break; }
    for (let z = rows - 1; z >= 0; z -= 1) if (landCell(grid[z][x])) { bottom = z; break; }
    north.push(top);
    south.push(bottom);
  }

  smoothOuter(west, "x", true);
  smoothOuter(east, "x", false);
  smoothOuter(north, "z", true);
  smoothOuter(south, "z", false);

  const seaCount = (x, z) => {
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || grid[nz][nx] === "~") n += 1;
    }
    return n;
  };
  const landCount = (x, z) => 4 - seaCount(x, z);

  for (let pass = 0; pass < 3; pass += 1) {
    const grow = [];
    const shrink = [];
    for (let z = 1; z < rows - 1; z += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        const cell = grid[z][x];
        if (cell === "~" && sea[z][x] && landCount(x, z) >= 3) grow.push([x, z]);
        if (isSoft(cell) && seaCount(x, z) >= 3) {
          let road = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (ROAD.has(at(x + dx, z + dz))) road = true;
          }
          if (!road) shrink.push([x, z]);
        }
      }
    }
    for (const [x, z] of grow) {
      grid[z][x] = "c";
      sea[z][x] = 0;
    }
    for (const [x, z] of shrink) {
      grid[z][x] = "~";
      sea[z][x] = 1;
    }
  }

  const near = (x, z, pred) => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (pred(at(x + dx, z + dz))) return true;
    }
    return false;
  };
  const isRoad = (cell) => ROAD.has(cell);
  const isWater = (cell) => cell === "~" || cell === "d";

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[z][x] !== "s" && grid[z][x] !== "c") continue;
      const left = isRoad(at(x - 1, z));
      const right = isRoad(at(x + 1, z));
      const up = isRoad(at(x, z - 1));
      const down = isRoad(at(x, z + 1));
      const roads = left + right + up + down;
      const opposite = (left && right) || (up && down);
      if (roads >= 3 || (roads >= 2 && opposite)) grid[z][x] = "+";
    }
  }

  // Quay tiles left inland of the new shore become park, same as other empty filler.
  const seenC = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (seenC[z][x] || grid[z][x] !== "c") continue;
      const cells = [];
      const stack = [[x, z]];
      seenC[z][x] = 1;
      let wet = false;
      while (stack.length) {
        const [cx, cz] = stack.pop();
        cells.push([cx, cz]);
        if (near(cx, cz, isWater)) wet = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || seenC[nz][nx] || grid[nz][nx] !== "c") continue;
          seenC[nz][nx] = 1;
          stack.push([nx, nz]);
        }
      }
      if (wet) continue;
      for (const [cx, cz] of cells) grid[cz][cx] = "g";
    }
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[z][x] !== "s") continue;
      if (near(x, z, isRoad) || near(x, z, isWater)) continue;
      grid[z][x] = "g";
    }
  }

  const seen = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (seen[z][x] || grid[z][x] !== "g") continue;
      const cells = [];
      const stack = [[x, z]];
      seen[z][x] = 1;
      let yard = false;
      while (stack.length) {
        const [cx, cz] = stack.pop();
        cells.push([cx, cz]);
        if (near(cx, cz, (cell) => cell === "b")) yard = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || seen[nz][nx] || grid[nz][nx] !== "g") continue;
          seen[nz][nx] = 1;
          stack.push([nx, nz]);
        }
      }
      if (yard || cells.length < 8 || cells.length > 70) continue;
      const [sx, sz] = cells[0];
      if (hash(sx, sz) % 2 !== 0) continue;
      for (const [cx, cz] of cells) grid[cz][cx] = "l";
    }
  }

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!FRAME.has(grid[z][x])) continue;
      if (near(x, z, isWater)) grid[z][x] = "c";
      else if (near(x, z, isRoad)) grid[z][x] = "s";
    }
  }

  // A few long curbs step one tile into the park so a block is not a perfect rectangle.
  const thicken = (x, z, dx, dz, ox, oz) => {
    for (let i = 0; i < 4; i += 1) {
      const sx = x + dx * i;
      const sz = z + dz * i;
      if (at(sx, sz) !== "s") return;
      if (at(sx + ox, sz + oz) !== "g") return;
      if (!isRoad(at(sx - ox, sz - oz))) return;
    }
    for (let i = 0; i < 4; i += 1) grid[z + dz * i][x + dx * i + ox] = "s";
  };
  for (let z = 2; z < rows - 6; z += 1) {
    for (let x = 2; x < cols - 6; x += 1) {
      if (hash(x, z) % 41 !== 0) continue;
      thicken(x, z, 1, 0, 0, -1);
      thicken(x, z, 1, 0, 0, 1);
      thicken(x, z, 0, 1, -1, 0);
      thicken(x, z, 0, 1, 1, 0);
    }
  }

  map.ground = grid.map((row) => row.join(""));
  return map;
}

function writeCity(city) {
  const lines = ["{"];
  lines.push(`  "cols": ${city.cols},`);
  lines.push(`  "rows": ${city.rows},`);
  lines.push(`  "tile": ${city.tile},`);
  lines.push(`  "spawn": {"x":${city.spawn.x},"z":${city.spawn.z}},`);
  lines.push(`  "views": [`);
  city.views.forEach((view, index) => {
    const comma = index === city.views.length - 1 ? "" : ",";
    lines.push("    {");
    lines.push(`      "name": ${JSON.stringify(view.name)},`);
    lines.push(`      "x": ${view.x},`);
    lines.push(`      "z": ${view.z}`);
    lines.push(`    }${comma}`);
  });
  lines.push("  ],");
  lines.push(`  "ground": [`);
  city.ground.forEach((row, index) => {
    const comma = index === city.ground.length - 1 ? "" : ",";
    lines.push(`    ${JSON.stringify(row)}${comma}`);
  });
  lines.push("  ],");
  lines.push(`  "buildings": [`);
  city.buildings.forEach((building, index) => {
    const comma = index === city.buildings.length - 1 ? "" : ",";
    lines.push(`    {"x":${building.x},"z":${building.z},"w":${building.w},"d":${building.d},"h":${building.h},"style":${JSON.stringify(building.style)},"roof":${JSON.stringify(building.roof)}}${comma}`);
  });
  lines.push("  ]");
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? "data/city.json";
  const city = JSON.parse(readFileSync(file, "utf8"));
  smoothBlocks(city);
  writeFileSync(file, writeCity(city));
  console.log("smoothed", file);
}
