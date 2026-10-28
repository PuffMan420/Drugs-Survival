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

export function createGlow(scene) {
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

  const heads = spriteMesh(headTexture, 64, 8);
  const tails = spriteMesh(tailTexture, 64, 7);
  scene.add(heads, tails);

  const dummy = new Object3D();
  const place = (mesh, index, x, y, z) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  return {
    update(_camX, _camZ, carLights) {
      let headCount = 0;
      let tailCount = 0;
      for (const light of carLights) {
        if (light.kind === "head") {
          if (headCount >= 64) continue;
          place(heads, headCount, light.x, light.y == null ? 4.2 : light.y, light.z);
          headCount += 1;
        } else if (tailCount < 64) {
          place(tails, tailCount, light.x, light.y == null ? 4.2 : light.y, light.z);
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
