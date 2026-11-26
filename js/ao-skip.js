// Keep flat sprites and unlit cards out of the SSAO normal pass.
// A Sprite has no normals; MeshNormalMaterial then does normalize(0), which
// becomes NaN in the HalfFloat buffer and bloom smears it into a black square.
// Three.js AdditiveBlending is 2; this file stays free of a "three" import so
// unit tests can run in Node.

import { AO_SKIP_LAYER } from "./constants.js";

const ADDITIVE_BLENDING = 2;

export function skipsAmbientOcclusion(material) {
  if (!material) return false;
  if (material.isShaderMaterial) return true;
  if (material.blending === ADDITIVE_BLENDING) return true;
  return material.transparent === true && material.depthWrite === false;
}

export function skipAmbientOcclusion(obj) {
  if (!obj || !obj.layers || typeof obj.layers.set !== "function") return obj;
  obj.layers.set(AO_SKIP_LAYER);
  return obj;
}

export function omitFromAmbientOcclusion(root) {
  if (!root || typeof root.traverse !== "function") return;
  root.traverse((obj) => {
    if (obj.isSprite) {
      skipAmbientOcclusion(obj);
      return;
    }
    if (!obj.isMesh) return;
    const source = obj.material;
    const list = Array.isArray(source) ? source : [source];
    if (list.some(skipsAmbientOcclusion)) skipAmbientOcclusion(obj);
  });
}

// SSAOPass only hides points and lines. Wrap it so sprites spawned after
// startup (muzzle flash, impacts, car fires) never enter the normal pass.
export function hideSpritesFromAmbientOcclusion(ssaoPass) {
  if (!ssaoPass || typeof ssaoPass._overrideVisibility !== "function") return ssaoPass;
  if (ssaoPass._dsHideSprites) return ssaoPass;
  const hideNonMeshes = ssaoPass._overrideVisibility.bind(ssaoPass);
  ssaoPass._overrideVisibility = function overrideVisibility() {
    hideNonMeshes();
    const scene = this.scene;
    const cache = this._visibilityCache;
    if (!scene || !Array.isArray(cache) || typeof scene.traverse !== "function") return;
    scene.traverse((object) => {
      if (object.isSprite && object.visible) {
        object.visible = false;
        cache.push(object);
      }
    });
  };
  ssaoPass._dsHideSprites = true;
  return ssaoPass;
}
