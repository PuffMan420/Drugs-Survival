// Flat yard tiles for the build menu. One piece covers one map cell.
// Textures stay on mipmaps so installMaxAnisotropy can raise them.

import { Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three";
import { TILE } from "./constants.js";

const geometry = new PlaneGeometry(1, 1);
geometry.rotateX(-Math.PI / 2);

function piece(file, texture, spin) {
  return {
    file,
    url: texture,
    texture,
    unit: TILE,
    ground: true,
    spin,
  };
}

export const GROUND_KIT = {
  id: "ground",
  label: "Ground",
  files: [
    piece("lush-grass.glb", "assets/textures/ground/pieces/lush-grass.png", true),
    piece("dry-grass.glb", "assets/textures/ground/pieces/dry-grass.png", true),
    piece("patchy-grass.glb", "assets/textures/ground/pieces/patchy-grass.png", true),
    piece("overgrown-grass.glb", "assets/textures/ground/pieces/overgrown-grass.png", true),
    piece("bare-dirt.glb", "assets/textures/ground/pieces/bare-dirt.png", true),
    piece("gravel.glb", "assets/textures/ground/pieces/gravel.png", true),
    piece("concrete-plain.glb", "assets/textures/ground/sidewalk_worn.webp", true),
    piece("concrete-cracked.glb", "assets/textures/ground/pieces/concrete-cracked.png", true),
    piece("concrete-dirty.glb", "assets/textures/ground/pieces/concrete-dirty.png", true),
    piece("concrete-slabs.glb", "assets/textures/ground/sidewalk_concrete.webp", false),
    piece("asphalt-plain.glb", "assets/textures/ground/pieces/asphalt-plain.png", true),
    piece("asphalt-worn.glb", "assets/textures/ground/pieces/asphalt-worn.png", true),
    piece("asphalt-oil.glb", "assets/textures/ground/pieces/asphalt-oil.png", true),
    piece("asphalt-patched.glb", "assets/textures/ground/pieces/asphalt-patched.png", true),
    piece("cracked-mud.glb", "assets/textures/ground/pieces/cracked-mud.png", true),
    piece("dried-mud.glb", "assets/textures/ground/pieces/dried-mud.png", true),
    piece("muddy-ground.glb", "assets/textures/ground/pieces/muddy-ground.png", true),
    piece("cracked-pavement.glb", "assets/textures/ground/pieces/cracked-pavement.png", true),
    piece("tan-cracked-pavement.glb", "assets/textures/ground/pieces/tan-cracked-pavement.png", true),
    piece("mossy-concrete.glb", "assets/textures/ground/pieces/mossy-concrete.png", true),
    piece("pitted-concrete.glb", "assets/textures/ground/pieces/pitted-concrete.png", true),
    piece("stained-concrete.glb", "assets/textures/ground/pieces/stained-concrete.png", true),
    piece("mossy-tiles.glb", "assets/textures/ground/pieces/mossy-tiles.png", false),
    piece("triangle-tiles.glb", "assets/textures/ground/pieces/triangle-tiles.png", false),
    piece("gray-tiles.glb", "assets/textures/ground/pieces/gray-tiles.png", false),
    piece("brown-tiles.glb", "assets/textures/ground/pieces/brown-tiles.png", false),
    piece("grimy-tiles.glb", "assets/textures/ground/pieces/grimy-tiles.png", false),
    piece("tiny-grass-01.glb", "assets/textures/ground/pieces/tiny-grass-01.png", true),
    piece("tiny-grass-02.glb", "assets/textures/ground/pieces/tiny-grass-02.png", true),
    piece("tiny-grass-03.glb", "assets/textures/ground/pieces/tiny-grass-03.png", true),
    piece("tiny-grass-04.glb", "assets/textures/ground/pieces/tiny-grass-04.png", true),
    piece("tiny-grass-05.glb", "assets/textures/ground/pieces/tiny-grass-05.png", true),
    piece("tiny-grass-06.glb", "assets/textures/ground/pieces/tiny-grass-06.png", true),
    piece("tiny-grass-07.glb", "assets/textures/ground/pieces/tiny-grass-07.png", true),
    piece("tiny-grass-08.glb", "assets/textures/ground/pieces/tiny-grass-08.png", true),
    piece("tiny-grass-09.glb", "assets/textures/ground/pieces/tiny-grass-09.png", true),
    piece("tiny-grass-10.glb", "assets/textures/ground/pieces/tiny-grass-10.png", true),
    piece("tiny-grass-11.glb", "assets/textures/ground/pieces/tiny-grass-11.png", true),
    piece("tiny-grass-12.glb", "assets/textures/ground/pieces/tiny-grass-12.png", true),
    piece("tiny-grass-13.glb", "assets/textures/ground/pieces/tiny-grass-13.png", true),
    piece("tiny-grass-14.glb", "assets/textures/ground/pieces/tiny-grass-14.png", true),
    piece("tiny-grass-15.glb", "assets/textures/ground/pieces/tiny-grass-15.png", true),
    piece("tiny-grass-16.glb", "assets/textures/ground/pieces/tiny-grass-16.png", true),
    piece("tiny-grass-17.glb", "assets/textures/ground/pieces/tiny-grass-17.png", true),
    piece("tiny-grass-18.glb", "assets/textures/ground/pieces/tiny-grass-18.png", true),
    piece("tiny-grass-19.glb", "assets/textures/ground/pieces/tiny-grass-19.png", true),
    piece("tiny-grass-20.glb", "assets/textures/ground/pieces/tiny-grass-20.png", true),
    piece("tiny-grass-21.glb", "assets/textures/ground/pieces/tiny-grass-21.png", true),
    piece("tiny-grass-22.glb", "assets/textures/ground/pieces/tiny-grass-22.png", true),
    piece("tiny-grass-23.glb", "assets/textures/ground/pieces/tiny-grass-23.png", true),
    piece("tiny-grass-24.glb", "assets/textures/ground/pieces/tiny-grass-24.png", true),
    piece("tiny-grass-25.glb", "assets/textures/ground/pieces/tiny-grass-25.png", true),
    piece("tiny-floor-01.glb", "assets/textures/ground/pieces/tiny-floor-01.png", false),
    piece("tiny-floor-02.glb", "assets/textures/ground/pieces/tiny-floor-02.png", false),
    piece("tiny-floor-03.glb", "assets/textures/ground/pieces/tiny-floor-03.png", false),
    piece("tiny-floor-04.glb", "assets/textures/ground/pieces/tiny-floor-04.png", false),
    piece("tiny-floor-05.glb", "assets/textures/ground/pieces/tiny-floor-05.png", false),
    piece("tiny-floor-06.glb", "assets/textures/ground/pieces/tiny-floor-06.png", false),
    piece("tiny-floor-07.glb", "assets/textures/ground/pieces/tiny-floor-07.png", false),
    piece("tiny-floor-08.glb", "assets/textures/ground/pieces/tiny-floor-08.png", false),
    piece("tiny-floor-09.glb", "assets/textures/ground/pieces/tiny-floor-09.png", false),
    piece("tiny-floor-10.glb", "assets/textures/ground/pieces/tiny-floor-10.png", false),
    piece("tiny-floor-11.glb", "assets/textures/ground/pieces/tiny-floor-11.png", false),
    piece("tiny-floor-12.glb", "assets/textures/ground/pieces/tiny-floor-12.png", false),
    piece("tiny-floor-13.glb", "assets/textures/ground/pieces/tiny-floor-13.png", false),
    piece("tiny-floor-14.glb", "assets/textures/ground/pieces/tiny-floor-14.png", false),
    piece("tiny-floor-15.glb", "assets/textures/ground/pieces/tiny-floor-15.png", false),
    piece("tiny-floor-16.glb", "assets/textures/ground/pieces/tiny-floor-16.png", false),
    piece("tiny-floor-17.glb", "assets/textures/ground/pieces/tiny-floor-17.png", false),
    piece("tiny-floor-18.glb", "assets/textures/ground/pieces/tiny-floor-18.png", false),
    piece("tiny-floor-19.glb", "assets/textures/ground/pieces/tiny-floor-19.png", false),
    piece("tiny-floor-20.glb", "assets/textures/ground/pieces/tiny-floor-20.png", false),
    piece("tiny-floor-21.glb", "assets/textures/ground/pieces/tiny-floor-21.png", false),
    piece("tiny-floor-22.glb", "assets/textures/ground/pieces/tiny-floor-22.png", false),
    piece("tiny-floor-23.glb", "assets/textures/ground/pieces/tiny-floor-23.png", false),
    piece("tiny-floor-24.glb", "assets/textures/ground/pieces/tiny-floor-24.png", false),
    piece("tiny-floor-25.glb", "assets/textures/ground/pieces/tiny-floor-25.png", false),
    piece("tiny-wood-01.glb", "assets/textures/ground/pieces/tiny-wood-01.png", false),
    piece("tiny-wood-02.glb", "assets/textures/ground/pieces/tiny-wood-02.png", false),
    piece("tiny-wood-03.glb", "assets/textures/ground/pieces/tiny-wood-03.png", false),
    piece("tiny-wood-04.glb", "assets/textures/ground/pieces/tiny-wood-04.png", false),
    piece("tiny-wood-05.glb", "assets/textures/ground/pieces/tiny-wood-05.png", false),
    piece("tiny-wood-06.glb", "assets/textures/ground/pieces/tiny-wood-06.png", false),
    piece("tiny-wood-07.glb", "assets/textures/ground/pieces/tiny-wood-07.png", false),
    piece("tiny-wood-08.glb", "assets/textures/ground/pieces/tiny-wood-08.png", false),
    piece("tiny-wood-09.glb", "assets/textures/ground/pieces/tiny-wood-09.png", false),
    piece("tiny-wood-10.glb", "assets/textures/ground/pieces/tiny-wood-10.png", false),
    piece("tiny-wood-11.glb", "assets/textures/ground/pieces/tiny-wood-11.png", false),
    piece("tiny-wood-12.glb", "assets/textures/ground/pieces/tiny-wood-12.png", false),
    piece("tiny-wood-13.glb", "assets/textures/ground/pieces/tiny-wood-13.png", false),
    piece("tiny-wood-14.glb", "assets/textures/ground/pieces/tiny-wood-14.png", false),
    piece("tiny-wood-15.glb", "assets/textures/ground/pieces/tiny-wood-15.png", false),
    piece("tiny-wood-16.glb", "assets/textures/ground/pieces/tiny-wood-16.png", false),
    piece("tiny-wood-17.glb", "assets/textures/ground/pieces/tiny-wood-17.png", false),
    piece("tiny-wood-18.glb", "assets/textures/ground/pieces/tiny-wood-18.png", false),
    piece("tiny-wood-19.glb", "assets/textures/ground/pieces/tiny-wood-19.png", false),
    piece("tiny-wood-20.glb", "assets/textures/ground/pieces/tiny-wood-20.png", false),
    piece("tiny-wood-21.glb", "assets/textures/ground/pieces/tiny-wood-21.png", false),
    piece("tiny-wood-22.glb", "assets/textures/ground/pieces/tiny-wood-22.png", false),
    piece("tiny-wood-23.glb", "assets/textures/ground/pieces/tiny-wood-23.png", false),
    piece("tiny-wood-24.glb", "assets/textures/ground/pieces/tiny-wood-24.png", false),
    piece("tiny-wood-25.glb", "assets/textures/ground/pieces/tiny-wood-25.png", false),
  ],
};

const groundFiles = new Set(GROUND_KIT.files.map((item) => item.file));
const spinFiles = new Set(GROUND_KIT.files.filter((item) => item.spin).map((item) => item.file));

export function isGroundFile(file) {
  return groundFiles.has(file);
}

function mix(x, z) {
  const ix = Math.round(Number(x) * 1000);
  const iz = Math.round(Number(z) * 1000);
  let n = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

// Quarter turns for pieces whose picture still meets at the edges when spun.
export function groundQuarter(file, x, z) {
  if (!spinFiles.has(file)) return 0;
  return mix(x, z) % 4;
}

// A small brightness shift so a filled yard is not one repeated stamp.
export function groundTint(x, z) {
  const n = mix(x, z);
  const swing = ((n % 11) - 5) / 90;
  const warm = (((n >>> 8) % 5) - 2) / 140;
  const clamp = (value) => Math.min(1.08, Math.max(0.9, value));
  return {
    r: clamp(1 + swing + warm),
    g: clamp(1 + swing),
    b: clamp(1 + swing - warm * 0.5),
  };
}

export function createGroundTemplate(texture) {
  const material = new MeshLambertMaterial({
    map: texture,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "ground-tile";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const group = new Group();
  group.add(mesh);
  return group;
}
