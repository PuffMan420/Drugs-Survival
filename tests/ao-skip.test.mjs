import assert from "node:assert/strict";
import test from "node:test";
import { AO_SKIP_LAYER } from "../js/constants.js";
import {
  hideSpritesFromAmbientOcclusion,
  omitFromAmbientOcclusion,
  skipAmbientOcclusion,
  skipsAmbientOcclusion,
} from "../js/ao-skip.js";

const LAYER_0 = 0;

function makeLayers(layer = LAYER_0) {
  return {
    mask: 1 << layer,
    set(value) {
      this.mask = 1 << value;
    },
  };
}

function makeNode(flags = {}) {
  const node = {
    isMesh: flags.isMesh === true,
    isSprite: flags.isSprite === true,
    isLine: flags.isLine === true,
    isPoints: flags.isPoints === true,
    visible: flags.visible !== false,
    material: flags.material,
    layers: makeLayers(flags.layer ?? LAYER_0),
    children: flags.children || [],
    traverse(fn) {
      fn(this);
      for (const child of this.children) child.traverse(fn);
    },
  };
  return node;
}

function onLayer(obj, layer) {
  return obj.layers.mask === (1 << layer);
}

test("skipsAmbientOcclusion flags additive, shader, and transparent depthWrite-off materials", () => {
  assert.equal(skipsAmbientOcclusion(null), false);
  assert.equal(skipsAmbientOcclusion({}), false);
  assert.equal(skipsAmbientOcclusion({ isShaderMaterial: true }), true);
  assert.equal(skipsAmbientOcclusion({ blending: 2 }), true);
  assert.equal(skipsAmbientOcclusion({ blending: 1, transparent: true, depthWrite: true }), false);
  assert.equal(skipsAmbientOcclusion({ transparent: true, depthWrite: false }), true);
});

test("omitFromAmbientOcclusion puts sprites on AO_SKIP_LAYER and leaves opaque meshes on layer 0", () => {
  const opaque = makeNode({ isMesh: true, material: { transparent: false, depthWrite: true } });
  const ghost = makeNode({
    isMesh: true,
    material: { transparent: true, depthWrite: false },
  });
  const flash = makeNode({ isSprite: true });
  const laterFlash = makeNode({ isSprite: true });
  const root = makeNode({ children: [opaque, ghost, flash] });

  omitFromAmbientOcclusion(root);

  assert.equal(onLayer(opaque, LAYER_0), true, "opaque mesh should stay on layer 0");
  assert.equal(onLayer(ghost, AO_SKIP_LAYER), true, "transparent mesh should be skipped");
  assert.equal(onLayer(flash, AO_SKIP_LAYER), true, "startup sprite should be skipped");
  assert.equal(onLayer(laterFlash, LAYER_0), true, "sprites created later are not walked until tagged");
  skipAmbientOcclusion(laterFlash);
  assert.equal(onLayer(laterFlash, AO_SKIP_LAYER), true);
});

test("hideSpritesFromAmbientOcclusion hides sprites during the SSAO visibility override, including ones spawned later", () => {
  const mesh = makeNode({ isMesh: true });
  const line = makeNode({ isLine: true });
  const sprite = makeNode({ isSprite: true });
  const scene = makeNode({ children: [mesh, line, sprite] });
  const cache = [];
  const pass = {
    scene,
    _visibilityCache: cache,
    _overrideVisibility() {
      this.scene.traverse((object) => {
        if ((object.isPoints || object.isLine) && object.visible) {
          object.visible = false;
          this._visibilityCache.push(object);
        }
      });
    },
    _restoreVisibility() {
      for (const object of this._visibilityCache) object.visible = true;
      this._visibilityCache.length = 0;
    },
  };

  hideSpritesFromAmbientOcclusion(pass);
  hideSpritesFromAmbientOcclusion(pass); // wrapping twice must stay safe

  pass._overrideVisibility();
  assert.equal(mesh.visible, true);
  assert.equal(line.visible, false);
  assert.equal(sprite.visible, false);

  pass._restoreVisibility();
  assert.equal(mesh.visible, true);
  assert.equal(line.visible, true);
  assert.equal(sprite.visible, true);
  assert.equal(cache.length, 0);

  const late = makeNode({ isSprite: true });
  scene.children.push(late);
  pass._overrideVisibility();
  assert.equal(late.visible, false);
  pass._restoreVisibility();
  assert.equal(late.visible, true);
});
