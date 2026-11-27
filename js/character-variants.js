// Interchangeable parts in the multi-head UAL crowd files. mergeFigure bakes
// every still-attached skinned mesh into one draw, so extra heads, pants,
// hats and the gold chain must be removed before that merge. Single-head
// files (Casual_Head, Punk_Head, the player, cops) are left as they are.
//
// GLTFLoader splits a multi-material part into a named Group with one
// SkinnedMesh per primitive (Head_Adventurer, Head_Adventurer_1, ...).
// Variant code must use that group as the part root, not each primitive,
// or Head_Casual_2 (a real head) would be impossible to tell from a
// loader suffix and we would spawn hundreds of incomplete figures.
const TOGGLE_PARTS = new Set(["Beanie", "Cap", "GoldChain"]);

export function isTogglePart(name) {
  return name.startsWith("Head_") || name.startsWith("Pants_") || TOGGLE_PARTS.has(name);
}

function isLoaderPrimitive(obj) {
  const parent = obj.parent;
  if (!parent || !isTogglePart(parent.name)) return false;
  return obj.name === parent.name || obj.name.startsWith(`${parent.name}_`);
}

// The named outfit pieces: a group when the loader split materials, or the
// skinned mesh itself when the part is a single primitive.
export function characterPartRoots(root) {
  const roots = [];
  root.traverse((obj) => {
    if (!isTogglePart(obj.name)) return;
    if (isLoaderPrimitive(obj)) return;
    roots.push(obj);
  });
  return roots;
}

export function meshNames(root) {
  const names = [];
  root.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) names.push(obj.name);
  });
  return names;
}

export function characterVariantOptionsFromNames(names) {
  const allHeads = names.filter((name) => name.startsWith("Head_"));
  const heads = allHeads.filter((name) => !name.endsWith("_Beanie") && !name.endsWith("_Cap"));
  const pants = names.filter((name) => name.startsWith("Pants_"));
  const hats = ["bare"];
  if (names.includes("Beanie") && allHeads.some((name) => name.endsWith("_Beanie"))) hats.push("beanie");
  if (names.includes("Cap") && allHeads.some((name) => name.endsWith("_Cap"))) hats.push("cap");
  return {
    heads,
    pants,
    hats,
    hasChain: names.includes("GoldChain"),
    hasVariants: heads.length > 1 || pants.length > 1 || hats.length > 1 || names.includes("GoldChain"),
  };
}

export function characterVariantOptions(root) {
  return characterVariantOptionsFromNames(characterPartRoots(root).map((obj) => obj.name));
}

export function characterVariantCount(options) {
  if (!options || !options.hasVariants) return 1;
  return Math.max(options.heads.length, 1);
}

export function pickCharacterVariant(options, seed = 0) {
  if (!options || !options.hasVariants) return null;
  const index = Math.abs(Math.floor(Number(seed) || 0));
  const head = options.heads.length ? options.heads[index % options.heads.length] : null;
  const hat = options.hats[index % options.hats.length];
  const pants = options.pants.length ? options.pants[(index + 1) % options.pants.length] : null;
  return {
    head,
    hat,
    pants,
    chain: options.hasChain ? index % 2 === 0 : false,
  };
}

function preferredHeadName(variant) {
  if (!variant || !variant.head) return null;
  if (variant.hat === "beanie") return `${variant.head}_Beanie`;
  if (variant.hat === "cap") return `${variant.head}_Cap`;
  return variant.head;
}

// Drops every interchangeable part that is not in this variant. A missing
// beanie/cap head falls back to the bare head and hides the hat.
export function applyCharacterVariant(root, variant) {
  if (!variant) return;
  const parts = characterPartRoots(root);
  const available = new Set(parts.map((obj) => obj.name));
  const keep = new Set();
  let headName = preferredHeadName(variant);
  let hat = variant.hat;
  if (headName && !available.has(headName) && available.has(variant.head)) {
    headName = variant.head;
    hat = "bare";
  }
  if (headName) keep.add(headName);
  if (hat === "beanie") keep.add("Beanie");
  if (hat === "cap") keep.add("Cap");
  if (variant.pants) keep.add(variant.pants);
  if (variant.chain) keep.add("GoldChain");
  const remove = [];
  for (const obj of parts) {
    if (!keep.has(obj.name)) remove.push(obj);
  }
  for (const obj of remove) obj.removeFromParent();
}
