// Shared max-anisotropy policy used by the game and by unit tests.
// Filters, mipmaps, and render targets are left as the caller set them.

let gpuMax = 1;
let patched = false;
let TextureClass = null;
const warned = new Set();
const stored = new WeakMap();
const waiting = new WeakSet();
let originals = null;
let scheduleFn = (fn) => requestAnimationFrame(fn);
let NearestFilter = 1003;
let mipmapMinFilters = new Set([1004, 1005, 1007, 1008]);

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
  return `${kind} ${String(texture.uuid || "").slice(0, 8)}`;
}

function anisotropyApplies(texture) {
  if (!texture || texture.isTexture !== true) return false;
  if (texture.isRenderTargetTexture || texture.isFramebufferTexture || texture.isDepthTexture) return false;
  if (texture.renderTarget) return false;
  if (texture.magFilter === NearestFilter || texture.minFilter === NearestFilter) return false;
  const manualMips = texture.mipmaps && texture.mipmaps.length > 1;
  if (texture.generateMipmaps === false && !manualMips) return false;
  if (!mipmapMinFilters.has(texture.minFilter)) return false;
  return true;
}

function defaultAnisotropy() {
  return gpuMax > 1 ? gpuMax : 1;
}

function raisedValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultAnisotropy();
  if (gpuMax > 1 && value < gpuMax) return gpuMax;
  return value;
}

function readAnisotropy(texture) {
  const own = Object.getOwnPropertyDescriptor(texture, "anisotropy");
  if (own && "value" in own) return own.value;
  return stored.has(texture) ? stored.get(texture) : defaultAnisotropy();
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
  scheduleFn(() => {
    waiting.delete(texture);
    enforce(texture);
  });
}

function enforce(texture, { warn = true, allowUpload = true } = {}) {
  if (!(gpuMax > 1) || !anisotropyApplies(texture)) return false;
  const value = readAnisotropy(texture);
  if (typeof value !== "number" || !(value < gpuMax)) return false;
  if (warn) {
    const label = textureLabel(texture);
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(`Anisotropy below GPU max (${value} < ${gpuMax}): ${label}`);
    }
  }
  commitAnisotropy(texture, gpuMax);
  // Only re-upload when the texture may already be on the GPU with the old value.
  if (allowUpload && texture.version > 0) texture.needsUpdate = true;
  return true;
}

function patchTexture(Texture) {
  if (patched) return;
  patched = true;
  TextureClass = Texture;

  const needsUpdate = Object.getOwnPropertyDescriptor(Texture.prototype, "needsUpdate");
  const previousAnisotropy = Object.getOwnPropertyDescriptor(Texture.prototype, "anisotropy");
  originals = { needsUpdate, previousAnisotropy };

  const needsDescriptor = {
    configurable: true,
    enumerable: Boolean(needsUpdate?.enumerable),
    set(value) {
      // Raise silently before the first version bump so the first upload
      // already uses the GPU max. No warning and no second needsUpdate.
      // After a texture is already on the GPU, a later low value is raised
      // with a warning and a re-upload.
      if (value === true) {
        const alreadyUploaded = this.version > 0;
        enforce(this, { warn: alreadyUploaded, allowUpload: alreadyUploaded });
      }
      if (needsUpdate?.set) needsUpdate.set.call(this, value);
      else if (value === true) this.version += 1;
      if (value === true) schedule(this);
    },
  };
  if (needsUpdate?.get) {
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
      return stored.has(this) ? stored.get(this) : defaultAnisotropy();
    },
    set(value) {
      const previous = readAnisotropy(this);
      const next = raisedValue(value);
      stored.set(this, next);
      // An explicit lower value after the first upload must still be raised.
      // If the stored value was already the max, the GPU already has it.
      if (this.version > 0 && previous < gpuMax && next === gpuMax) schedule(this);
    },
  });
}

export function installTextureAnisotropy(Texture, options = {}) {
  if (options.NearestFilter != null) NearestFilter = options.NearestFilter;
  if (options.mipmapMinFilters) mipmapMinFilters = options.mipmapMinFilters;
  if (typeof options.schedule === "function") scheduleFn = options.schedule;
  const max = typeof options.getMaxAnisotropy === "function"
    ? options.getMaxAnisotropy()
    : options.max;
  if (Number.isFinite(max) && max > gpuMax) gpuMax = max;
  patchTexture(Texture);
}

export function resetTextureAnisotropyForTests() {
  if (patched && TextureClass && originals) {
    if (originals.needsUpdate) {
      Object.defineProperty(TextureClass.prototype, "needsUpdate", originals.needsUpdate);
    }
    if (originals.previousAnisotropy) {
      Object.defineProperty(TextureClass.prototype, "anisotropy", originals.previousAnisotropy);
    } else {
      delete TextureClass.prototype.anisotropy;
    }
  }
  gpuMax = 1;
  patched = false;
  TextureClass = null;
  warned.clear();
  originals = null;
  scheduleFn = (fn) => requestAnimationFrame(fn);
}

export function getGpuMaxAnisotropy() {
  return gpuMax;
}
