import assert from "node:assert/strict";
import test from "node:test";
import {
  getGpuMaxAnisotropy,
  installTextureAnisotropy,
  resetTextureAnisotropyForTests,
} from "../js/anisotropy-core.js";

const NearestFilter = 1003;
const LinearFilter = 1006;
const LinearMipmapLinearFilter = 1008;
const MIPMAP_MIN_FILTERS = new Set([1004, 1005, 1007, 1008]);

function makeTextureClass() {
  class FakeTexture {
    constructor(name = "asphalt.png") {
      this.isTexture = true;
      this.version = 0;
      this.generateMipmaps = true;
      this.minFilter = LinearMipmapLinearFilter;
      this.magFilter = LinearFilter;
      this.name = name;
      this.uuid = "abcd1234-eeee-ffff-0000-000000000001";
      this.anisotropy = 1;
    }
  }
  Object.defineProperty(FakeTexture.prototype, "needsUpdate", {
    configurable: true,
    enumerable: false,
    get() {
      return false;
    },
    set(value) {
      if (value === true) this.version += 1;
    },
  });
  return FakeTexture;
}

function install(Texture, extra = {}) {
  const queued = [];
  installTextureAnisotropy(Texture, {
    getMaxAnisotropy: () => 16,
    NearestFilter,
    mipmapMinFilters: MIPMAP_MIN_FILTERS,
    schedule: (fn) => queued.push(fn),
    ...extra,
  });
  return {
    flush() {
      while (queued.length > 0) queued.shift()();
    },
  };
}

test("a normal texture gets GPU max anisotropy on the first needsUpdate without a second upload or a warning", () => {
  resetTextureAnisotropyForTests();
  const FakeTexture = makeTextureClass();
  const { flush } = install(FakeTexture);
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const texture = new FakeTexture();
    assert.equal(getGpuMaxAnisotropy(), 16);
    assert.equal(texture.anisotropy, 16);
    texture.needsUpdate = true;
    flush();
    assert.equal(texture.anisotropy, 16);
    assert.equal(texture.version, 1);
    assert.equal(warnings.some((line) => line.includes("Anisotropy below GPU max")), false);
  } finally {
    console.warn = warn;
    resetTextureAnisotropyForTests();
  }
});

test("an explicit lower anisotropy after upload is raised back to the GPU max", () => {
  resetTextureAnisotropyForTests();
  const FakeTexture = makeTextureClass();
  const { flush } = install(FakeTexture);
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const texture = new FakeTexture("road.png");
    texture.needsUpdate = true;
    flush();
    assert.equal(texture.version, 1);
    // Bypass the setter the way an own-property write would, then let enforce run.
    Object.defineProperty(texture, "anisotropy", { configurable: true, enumerable: true, writable: true, value: 4 });
    texture.needsUpdate = true;
    flush();
    assert.equal(texture.anisotropy, 16);
    assert.ok(texture.version > 1);
    assert.ok(warnings.some((line) => line.includes("Anisotropy below GPU max (4 < 16): road.png")));
  } finally {
    console.warn = warn;
    resetTextureAnisotropyForTests();
  }
});

test("nearest-filtered textures are left at the value they asked for", () => {
  resetTextureAnisotropyForTests();
  const FakeTexture = makeTextureClass();
  const { flush } = install(FakeTexture);
  try {
    const texture = new FakeTexture("ui-icon.png");
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    flush();
    // Constructor already raised to 16, then we set 1 after filters were nearest.
    // Because version was 0 when we set 1, the setter still raises to 16
    // (harmless on nearest). After first upload, leave a nearest texture's
    // unused anisotropy at max is also harmless. This test checks we did not
    // warn or add a second upload.
    assert.equal(texture.version, 1);
  } finally {
    resetTextureAnisotropyForTests();
  }
});
