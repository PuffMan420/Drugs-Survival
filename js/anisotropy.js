// Raises every later texture to the GPU max when anisotropy can change the picture.
// Filters, mipmaps, and render targets are left as the caller set them.

import {
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  Texture,
} from "three";

const MIPMAP_MIN_FILTERS = new Set([
  NearestMipmapNearestFilter,
  NearestMipmapLinearFilter,
  LinearMipmapNearestFilter,
  LinearMipmapLinearFilter,
]);

let gpuMax = 1;
let patched = false;
const warned = new Set();
const stored = new WeakMap();
const waiting = new WeakSet();

function textureLabel(texture) {
  if (texture.name) return texture.name;
  const image = texture.image;
  const src = image && (image.src || image.currentSrc);
  if (typeof src === "string" && src) {
    const file = src.split("?")[0].split("/").pop();
    try {
      return decodeURIComponent(file);
    } catch {
      return file;
    }
  }
  const kind = texture.constructor?.name || "Texture";
  return `${kind} ${texture.uuid.slice(0, 8)}`;
}

function anisotropyApplies(texture) {
  if (!texture || texture.isTexture !== true) return false;
  if (texture.isRenderTargetTexture || texture.isFramebufferTexture || texture.isDepthTexture) return false;
  if (texture.renderTarget) return false;
  if (texture.magFilter === NearestFilter || texture.minFilter === NearestFilter) return false;
  const manualMips = texture.mipmaps && texture.mipmaps.length > 1;
  if (texture.generateMipmaps === false && !manualMips) return false;
  if (!MIPMAP_MIN_FILTERS.has(texture.minFilter)) return false;
  return true;
}

function readAnisotropy(texture) {
  const own = Object.getOwnPropertyDescriptor(texture, "anisotropy");
  if (own && "value" in own) return own.value;
  return stored.has(texture) ? stored.get(texture) : 1;
}

function commitAnisotropy(texture, value) {
  const own = Object.getOwnPropertyDescriptor(texture, "anisotropy");
  if (own && "value" in own) {
    texture.anisotropy = value;
    return;
  }
  stored.set(texture, value);
}

function schedule(texture) {
  // Wait for the next frame so a loader can finish setting filters first.
  // An early check would treat a nearest-filtered texture as if it still used mipmaps.
  if (waiting.has(texture)) return;
  waiting.add(texture);
  requestAnimationFrame(() => {
    waiting.delete(texture);
    enforce(texture);
  });
}

function enforce(texture) {
  if (!(gpuMax > 1) || !anisotropyApplies(texture)) return;
  const value = readAnisotropy(texture);
  if (typeof value !== "number" || !(value < gpuMax)) return;
  const label = textureLabel(texture);
  if (!warned.has(label)) {
    warned.add(label);
    console.warn(`Anisotropy below GPU max (${value} < ${gpuMax}): ${label}`);
  }
  commitAnisotropy(texture, gpuMax);
  if (texture.version > 0) texture.needsUpdate = true;
}

function patchTexture() {
  if (patched) return;
  patched = true;

  const needsUpdate = Object.getOwnPropertyDescriptor(Texture.prototype, "needsUpdate");
  const needsDescriptor = {
    configurable: true,
    enumerable: Boolean(needsUpdate.enumerable),
    set(value) {
      needsUpdate.set.call(this, value);
      if (value === true) schedule(this);
    },
  };
  if (needsUpdate.get) {
    const getNeedsUpdate = needsUpdate.get;
    needsDescriptor.get = function getNeedsUpdateWrapped() {
      return getNeedsUpdate.call(this);
    };
  }
  Object.defineProperty(Texture.prototype, "needsUpdate", needsDescriptor);

  Object.defineProperty(Texture.prototype, "anisotropy", {
    configurable: true,
    enumerable: true,
    get() {
      return stored.has(this) ? stored.get(this) : 1;
    },
    set(value) {
      stored.set(this, value);
      if (this.version > 0) schedule(this);
    },
  });
}

export function installMaxAnisotropy(renderer) {
  const max = renderer.capabilities.getMaxAnisotropy();
  if (Number.isFinite(max) && max > gpuMax) gpuMax = max;
  patchTexture();
}
