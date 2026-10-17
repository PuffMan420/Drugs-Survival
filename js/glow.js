import {
  AdditiveBlending,
  CanvasTexture,
  InstancedMesh,
  LinearFilter,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

const CENTER_H = new Set(["H", "h"]);
const CENTER_V = new Set(["V", "v"]);
const ROAD = new Set(["H", "h", "V", "v", "+", "X", "1", "2", "5", "6"]);
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function tileHash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h >>> 0;
}

function radialTexture(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function spriteMesh(texture, capacity, size) {
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: AdditiveBlending,
    }),
    Math.max(1, capacity),
  );
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.count = 0;
  return mesh;
}

function collectLights(map) {
  const span = map.tile || 48;
  const { cols, rows, ground } = map;
  const at = (x, z) => {
    if (x < 0 || z < 0 || x >= cols || z >= rows) return "~";
    return ground[z][x];
  };
  const lamps = [];
  const signals = [];
  const seen = new Set();
  const add = (list, x, z) => {
    const key = `${list === lamps ? "l" : "s"}:${x},${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ x: (x + 0.5) * span, z: (z + 0.5) * span });
  };

  for (let z = 1; z < rows - 1; z += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      const cell = at(x, z);
      if (cell === "s") {
        let facesRoad = false;
        for (let i = 0; i < 4; i += 1) {
          const [dx, dz] = NEIGHBORS[i];
          if (ROAD.has(at(x + dx, z + dz))) facesRoad = true;
        }
        if (!facesRoad || tileHash(x, z) % 28 !== 0) continue;
        add(lamps, x, z);
        continue;
      }
      if (!CENTER_H.has(cell)) continue;
      const touchesVertical = (
        CENTER_V.has(at(x, z - 1))
        || CENTER_V.has(at(x, z + 1))
        || CENTER_V.has(at(x - 1, z))
        || CENTER_V.has(at(x + 1, z))
      );
      if (!touchesVertical) continue;
      add(signals, x, z);
      for (const [dx, dz] of NEIGHBORS) {
        if (at(x + dx, z + dz) !== "s") continue;
        add(lamps, x + dx, z + dz);
        break;
      }
    }
  }
  return { lamps, signals };
}

export function createGlow(scene, map) {
  const { lamps, signals } = collectLights(map);
  const lampTexture = radialTexture([
    [0, "rgba(255, 210, 150, 0.55)"],
    [0.22, "rgba(255, 120, 30, 0.18)"],
    [0.55, "rgba(160, 40, 0, 0.04)"],
    [1, "rgba(80, 20, 0, 0)"],
  ]);
  const signalTexture = radialTexture([
    [0, "rgba(255, 80, 60, 0.95)"],
    [0.35, "rgba(220, 20, 10, 0.35)"],
    [1, "rgba(80, 0, 0, 0)"],
  ]);
  const headTexture = radialTexture([
    [0, "rgba(255, 236, 200, 0.95)"],
    [0.4, "rgba(255, 170, 60, 0.28)"],
    [1, "rgba(120, 40, 0, 0)"],
  ]);
  const tailTexture = radialTexture([
    [0, "rgba(255, 40, 30, 0.95)"],
    [0.4, "rgba(180, 0, 0, 0.3)"],
    [1, "rgba(40, 0, 0, 0)"],
  ]);

  // Street lamps were 70 units across. A third of that is the largest pool allowed.
  const pools = spriteMesh(lampTexture, lamps.length, 22);
  const heads = spriteMesh(headTexture, 64, 8);
  const tails = spriteMesh(tailTexture, 64, 7);
  const cores = spriteMesh(signalTexture, signals.length, 9);
  scene.add(pools, heads, tails, cores);

  const dummy = new Object3D();
  const place = (mesh, index, x, y, z) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  const inView = (light, camX, camZ) => (
    light.x > camX - 640 && light.x < camX + 640 && light.z > camZ - 500 && light.z < camZ + 640
  );

  return {
    update(camX, camZ, carLights) {
      let poolCount = 0;
      for (const lamp of lamps) {
        if (!inView(lamp, camX, camZ)) continue;
        place(pools, poolCount, lamp.x, 7, lamp.z);
        poolCount += 1;
      }
      pools.count = poolCount;
      pools.instanceMatrix.needsUpdate = poolCount > 0;

      let signalCount = 0;
      for (const signal of signals) {
        if (!inView(signal, camX, camZ)) continue;
        place(cores, signalCount, signal.x, 16, signal.z);
        signalCount += 1;
      }
      cores.count = signalCount;
      cores.instanceMatrix.needsUpdate = signalCount > 0;

      let headCount = 0;
      let tailCount = 0;
      for (const light of carLights) {
        if (light.kind === "head") {
          if (headCount >= 64) continue;
          place(heads, headCount, light.x, 4.2, light.z);
          headCount += 1;
        } else if (tailCount < 64) {
          place(tails, tailCount, light.x, 4.2, light.z);
          tailCount += 1;
        }
      }
      heads.count = headCount;
      heads.instanceMatrix.needsUpdate = headCount > 0;
      tails.count = tailCount;
      tails.instanceMatrix.needsUpdate = tailCount > 0;
    },
  };
}
