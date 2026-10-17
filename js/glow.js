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
      toneMapped: false,
      fog: false,
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
    [0, "rgba(255, 244, 220, 1)"],
    [0.1, "rgba(255, 150, 40, 1)"],
    [0.34, "rgba(255, 78, 12, 0.72)"],
    [0.68, "rgba(200, 40, 0, 0.22)"],
    [1, "rgba(120, 20, 0, 0)"],
  ]);
  const signalTexture = radialTexture([
    [0, "rgba(255, 220, 210, 1)"],
    [0.14, "rgba(255, 36, 18, 0.98)"],
    [0.4, "rgba(210, 0, 0, 0.55)"],
    [1, "rgba(90, 0, 0, 0)"],
  ]);
  const headTexture = radialTexture([
    [0, "rgba(255, 250, 230, 1)"],
    [0.16, "rgba(255, 186, 80, 0.95)"],
    [0.46, "rgba(255, 110, 24, 0.4)"],
    [1, "rgba(180, 50, 0, 0)"],
  ]);
  const tailTexture = radialTexture([
    [0, "rgba(255, 180, 170, 1)"],
    [0.2, "rgba(255, 24, 16, 0.95)"],
    [0.55, "rgba(160, 0, 0, 0.28)"],
    [1, "rgba(60, 0, 0, 0)"],
  ]);

  const pools = spriteMesh(lampTexture, lamps.length, 70);
  const heads = spriteMesh(headTexture, 64, 26);
  const tails = spriteMesh(tailTexture, 64, 16);
  const cores = spriteMesh(signalTexture, signals.length, 22);
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
          if (headCount >= 96) continue;
          place(heads, headCount, light.x, 4.2, light.z);
          headCount += 1;
        } else if (tailCount < 96) {
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
