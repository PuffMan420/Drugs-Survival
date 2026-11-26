// Raises every later texture to the GPU max when anisotropy can change the picture.
// Filters, mipmaps, and render targets are left as the caller set them.
// The first upload already uses the GPU max, so a normal texture is not
// re-uploaded and does not warn at boot.

import {
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  Texture,
} from "three";
import { installTextureAnisotropy } from "./anisotropy-core.js";

const MIPMAP_MIN_FILTERS = new Set([
  NearestMipmapNearestFilter,
  NearestMipmapLinearFilter,
  LinearMipmapNearestFilter,
  LinearMipmapLinearFilter,
]);

export function installMaxAnisotropy(renderer) {
  installTextureAnisotropy(Texture, {
    getMaxAnisotropy: () => renderer.capabilities.getMaxAnisotropy(),
    NearestFilter,
    mipmapMinFilters: MIPMAP_MIN_FILTERS,
  });
}
