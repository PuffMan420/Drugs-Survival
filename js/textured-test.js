// TEST ONLY: one Textured Models house next to the spawn so Ted can look at it.
// Remove this file and its two lines in main.js to undo.

import { Box3, LinearFilter, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TILE } from "./constants.js";

const HOUSE_URL = "./assets/buildings/textured-test/1Story_GableRoof.glb";
// Player height from js/player.js. The door should be about 1.15 times that.
const PERSON = (71 / 3) * 1.15 * 1.1 * 1.1 * 1.05;
// The door in the file is about 0.95 tall (frame included).
const DOOR_IN_FILE = 0.95;
const SCALE = (PERSON * 1.15) / DOOR_IN_FILE;
const GROUND_Y = 0.2;
// Northeast of the spawn crossroad (tile 98, 202), just past the sidewalk.
// The door faces south, toward the road and the camera.
const SIDEWALK = 34;
const WEST_EDGE = 100 * TILE + SIDEWALK;
const SOUTH_EDGE = 200 * TILE - SIDEWALK;

export async function placeTexturedTest(scene) {
  try {
    const gltf = await new GLTFLoader().loadAsync(HOUSE_URL);
    const root = gltf.scene;
    root.name = "textured-test-house";
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mat = obj.material;
      mat.toneMapped = false;
      if (mat.map) {
        // The texture is a small colour palette. Linear without mipmaps keeps the colours clean.
        mat.map.colorSpace = SRGBColorSpace;
        mat.map.magFilter = LinearFilter;
        mat.map.minFilter = LinearFilter;
        mat.map.generateMipmaps = false;
        mat.map.needsUpdate = true;
      }
    });
    root.scale.setScalar(SCALE);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    root.position.set(WEST_EDGE - box.min.x, GROUND_Y - box.min.y, SOUTH_EDGE - box.max.z);
    scene.add(root);
    root.updateMatrixWorld(true);
    const placed = new Box3().setFromObject(root);
    console.info("textured-test house", { scale: SCALE, door: DOOR_IN_FILE * SCALE, person: PERSON, box: placed });
  } catch (error) {
    console.warn("textured-test house failed to load", error);
  }
}