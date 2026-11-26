// Keep UnrealBloomPass from smearing a NaN or Inf pixel into a huge black square.
// Ted confirmed ?nobloom=1 stops the square completely, so the smear happens
// inside this pass. The high-pass shader is patched so its output is always a
// finite color in [0, MAX_BLOOM_RADIANCE]. The 5 blur mips and the composite
// then only ever see clean values. Look of legal highlights is unchanged.
//
// The helper uses GLSL 100 comparisons (no isnan/isinf): NaN fails every
// comparison, +Inf fails <= max, negatives and -Inf fail >= 0. The if/return
// path returns the literal 0.0 for those cases, so the NaN is never mixed
// back in (mix(0.0, NaN, 0.0) is still NaN on many GPUs).

export const MAX_BLOOM_RADIANCE = 16;

const CHANNEL = "dsSanitizeBloomChannel";
const COLOR = "dsSanitizeBloom";
const SAMPLE = /vec4\s+texel\s*=\s*texture2D\s*\(\s*tDiffuse\s*,\s*vUv\s*\)\s*;/;
const MAIN = /\bvoid\s+main\s*\(\s*\)/;

export function bloomRadianceLiteral(maxRadiance = MAX_BLOOM_RADIANCE) {
  const value = Number(maxRadiance);
  const cap = Number.isFinite(value) && value > 0 ? value : MAX_BLOOM_RADIANCE;
  return cap.toFixed(1);
}

export function bloomSanitizeHelpersGlsl(maxRadiance = MAX_BLOOM_RADIANCE) {
  const cap = bloomRadianceLiteral(maxRadiance);
  return `
		float ${CHANNEL}(const in float c) {
			if (c >= 0.0 && c <= ${cap}) {
				return c;
			}
			return 0.0;
		}
		vec3 ${COLOR}(const in vec3 c) {
			return vec3(${CHANNEL}(c.r), ${CHANNEL}(c.g), ${CHANNEL}(c.b));
		}
`;
}

export function guardBloomHighPassShader(fragmentShader, maxRadiance = MAX_BLOOM_RADIANCE) {
  if (typeof fragmentShader !== "string") return fragmentShader;
  if (fragmentShader.includes(`${COLOR}(`)) return fragmentShader;
  if (!SAMPLE.test(fragmentShader) || !MAIN.test(fragmentShader)) return fragmentShader;
  const helpers = bloomSanitizeHelpersGlsl(maxRadiance);
  const withHelpers = fragmentShader.replace(MAIN, `${helpers}\nvoid main()`);
  return withHelpers.replace(SAMPLE, (line) => `${line}\n\t\t\ttexel.rgb = ${COLOR}(texel.rgb);`);
}

export function guardBloomPass(bloomPass, maxRadiance = MAX_BLOOM_RADIANCE) {
  if (!bloomPass || !bloomPass.materialHighPassFilter) return bloomPass;
  if (bloomPass._dsBloomGuard) return bloomPass;
  const mat = bloomPass.materialHighPassFilter;
  const next = guardBloomHighPassShader(mat.fragmentShader, maxRadiance);
  if (typeof next === "string" && next !== mat.fragmentShader) {
    mat.fragmentShader = next;
    mat.needsUpdate = true;
  }
  if (typeof mat.fragmentShader === "string" && mat.fragmentShader.includes(`${COLOR}(`)) {
    bloomPass._dsBloomGuard = true;
  }
  return bloomPass;
}
