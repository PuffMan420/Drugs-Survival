// The supplier's spot: a flat glowing ring on the ground, no model.
// Additive and depthWrite off, so the occlusion pass skips it.
import { AdditiveBlending, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";

export function createSupplierMarker(x, y, z, radius) {
  const group = new Group();
  const ringMat = new MeshBasicMaterial({
    color: 0x5cff7a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const fillMat = ringMat.clone();
  fillMat.opacity = 0.22;
  const ring = new Mesh(new RingGeometry(radius * 0.82, radius, 40), ringMat);
  const fill = new Mesh(new CircleGeometry(radius * 0.82, 40), fillMat);
  for (const mesh of [ring, fill]) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  group.position.set(x, y, z);
  let age = 0;
  return {
    group,
    update(dt) {
      age += dt;
      ringMat.opacity = 0.6 + 0.3 * Math.sin(age * 3);
    },
  };
}
