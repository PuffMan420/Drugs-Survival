import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_BLOOM_RADIANCE,
  bloomRadianceLiteral,
  bloomSanitizeHelpersGlsl,
  guardBloomHighPassShader,
  guardBloomPass,
} from "../js/bloom-guard.js";

// Exact fragment shader from three@0.180 LuminosityHighPassShader.js.
const OFFICIAL_HIGH_PASS = `

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`;

test("bloom radiance cap is a GLSL float literal of 16.0", () => {
  assert.equal(MAX_BLOOM_RADIANCE, 16);
  assert.equal(bloomRadianceLiteral(), "16.0");
  assert.equal(bloomRadianceLiteral(16), "16.0");
  assert.equal(bloomRadianceLiteral(Number.NaN), "16.0");
});

test("guardBloomHighPassShader injects a finite clamp after the official texel sample", () => {
  const patched = guardBloomHighPassShader(OFFICIAL_HIGH_PASS);

  assert.equal(patched.includes("uniform sampler2D tDiffuse;"), true);
  assert.equal(patched.includes("uniform float luminosityThreshold;"), true);
  assert.equal(patched.includes("float v = luminance( texel.xyz );"), true);
  assert.equal(patched.includes("float alpha = smoothstep("), true);
  assert.equal(patched.includes("gl_FragColor = mix( outputColor, texel, alpha );"), true);

  const sampleAt = patched.indexOf("vec4 texel = texture2D( tDiffuse, vUv );");
  const sanitizeAt = patched.indexOf("texel.rgb = dsSanitizeBloom(texel.rgb);");
  const lumaAt = patched.indexOf("float v = luminance( texel.xyz );");
  assert.equal(sampleAt >= 0, true, "keeps the official texel sample");
  assert.equal(sanitizeAt > sampleAt, true, "sanitizes after the sample");
  assert.equal(lumaAt > sanitizeAt, true, "luminance runs on the sanitized texel");

  assert.equal(patched.includes("dsSanitizeBloomChannel(const in float c)"), true);
  assert.equal(patched.includes("if (c >= 0.0 && c <= 16.0)"), true);
  assert.equal(patched.includes("isnan"), false, "GLSL 100 has no isnan");
  assert.equal(patched.includes("isinf"), false, "GLSL 100 has no isinf");

  const mainAt = patched.indexOf("void main()");
  const helperAt = patched.indexOf("float dsSanitizeBloomChannel");
  assert.equal(helperAt >= 0 && helperAt < mainAt, true, "helpers are declared before main");
});

test("guardBloomHighPassShader is idempotent and leaves unknown shaders alone", () => {
  const once = guardBloomHighPassShader(OFFICIAL_HIGH_PASS);
  const twice = guardBloomHighPassShader(once);
  assert.equal(twice, once);

  assert.equal(guardBloomHighPassShader(null), null);
  assert.equal(guardBloomHighPassShader(""), "");
  const foreign = "void main() { gl_FragColor = vec4(1.0); }";
  assert.equal(guardBloomHighPassShader(foreign), foreign);
});

test("guardBloomPass patches materialHighPassFilter and does not touch uniforms", () => {
  const uniforms = {
    tDiffuse: { value: null },
    luminosityThreshold: { value: 0.85 },
    smoothWidth: { value: 0.01 },
    defaultColor: { value: { r: 0, g: 0, b: 0 } },
    defaultOpacity: { value: 0 },
  };
  const pass = {
    materialHighPassFilter: {
      uniforms,
      fragmentShader: OFFICIAL_HIGH_PASS,
      needsUpdate: false,
    },
    compositeMaterial: { fragmentShader: "composite" },
    separableBlurMaterials: [{ fragmentShader: "blur" }],
  };

  const first = guardBloomPass(pass);
  assert.equal(first, pass);
  assert.equal(pass._dsBloomGuard, true);
  assert.equal(pass.materialHighPassFilter.needsUpdate, true);
  assert.equal(pass.materialHighPassFilter.uniforms, uniforms);
  assert.equal(uniforms.luminosityThreshold.value, 0.85);
  assert.equal(pass.materialHighPassFilter.fragmentShader.includes("dsSanitizeBloom("), true);
  assert.equal(pass.compositeMaterial.fragmentShader, "composite");
  assert.equal(pass.separableBlurMaterials[0].fragmentShader, "blur");

  const shader = pass.materialHighPassFilter.fragmentShader;
  pass.materialHighPassFilter.needsUpdate = false;
  guardBloomPass(pass);
  assert.equal(pass.materialHighPassFilter.fragmentShader, shader);
  assert.equal(pass.materialHighPassFilter.needsUpdate, false);

  assert.equal(guardBloomPass(null), null);
  assert.equal(guardBloomPass({})._, undefined);
});

test("bloomSanitizeHelpersGlsl stays valid GLSL 100 and caps at the named radiance", () => {
  const glsl = bloomSanitizeHelpersGlsl();
  assert.equal(glsl.includes("16.0"), true);
  assert.equal(/\d+\.\d+/.test(bloomRadianceLiteral(8)), true);
  assert.equal(bloomSanitizeHelpersGlsl(8).includes("8.0"), true);
});
