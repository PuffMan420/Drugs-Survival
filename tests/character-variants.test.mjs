import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applyCharacterVariant,
  characterVariantCount,
  characterVariantOptions,
  characterVariantOptionsFromNames,
  pickCharacterVariant,
} from "../js/character-variants.js";

function exportedArray(src, name) {
  const start = src.indexOf("export const " + name + " = [");
  if (start < 0) throw new Error("missing " + name);
  const open = src.indexOf("[", start);
  const close = src.indexOf("];", open);
  const body = src.slice(open, close + 1);
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function exportedString(src, name) {
  const token = "export const " + name + ' = "';
  const start = src.indexOf(token);
  if (start < 0) throw new Error("missing " + name);
  const from = start + token.length;
  const to = src.indexOf('"', from);
  return src.slice(from, to);
}

const CHAR_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../js/characters.js"), "utf8");
const PED_MODELS = exportedArray(CHAR_SRC, "PED_MODELS");
const COP_MODELS = exportedArray(CHAR_SRC, "COP_MODELS");
const PLAYER_MODEL = exportedString(CHAR_SRC, "PLAYER_MODEL");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function repoPath(rel) {
  return join(ROOT, rel.replace(/^\.\.\//, ""));
}

function mesh(name) {
  const obj = {
    name,
    isSkinnedMesh: true,
    isMesh: true,
    children: [],
    parent: null,
    removeFromParent() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    traverse(fn) {
      fn(this);
      for (const child of this.children.slice()) child.traverse(fn);
    },
  };
  return obj;
}

function group(children) {
  const root = {
    name: "root",
    children: [],
    isMesh: false,
    isSkinnedMesh: false,
    traverse(fn) {
      fn(this);
      for (const child of this.children.slice()) child.traverse(fn);
    },
  };
  for (const child of children) {
    child.parent = root;
    if (typeof child.traverse !== "function") {
      child.traverse = function traverse(fn) {
        fn(this);
        for (const nested of this.children.slice()) nested.traverse(fn);
      };
    }
    root.children.push(child);
  }
  return root;
}

const STYLE7 = [
  "Beanie",
  "Boots",
  "Cap",
  "GoldChain",
  "Head_Adventurer",
  "Head_Adventurer_Beanie",
  "Head_Adventurer_Cap",
  "Head_Beach",
  "Head_Beach_Beanie",
  "Head_Beach_Cap",
  "Head_Casual_2",
  "Head_Casual_2_Beanie",
  "Head_Casual_2_Cap",
  "Head_Casual_Hoodie",
  "Head_Casual_Hoodie_Beanie",
  "Head_Casual_Hoodie_Cap",
  "Head_Suit",
  "Head_Suit_Beanie",
  "Head_Suit_Cap",
  "Pants_Cargo",
  "Pants_Jeans",
  "Pants_Work",
  "Top_Hoodie",
];

const WOMEN = [
  "Head_Adventurer",
  "Head_Casual",
  "Head_Formal",
  "Head_Medieval",
  "Head_Punk",
  "Head_SciFi",
  "Head_Soldier",
  "Head_Suit",
  "Head_Witch",
  "Punk_Body",
  "Punk_Feet",
  "Punk_Legs",
];

function remaining(root) {
  return root.children.map((child) => child.name).sort();
}

test("the player model is still Ted's approved main character", () => {
  assert.equal(
    PLAYER_MODEL,
    "../06 Player Character/Main Character/MainCharacter_v1_medium_leaf_v3.glb",
  );
  assert.ok(existsSync(repoPath(PLAYER_MODEL)));
});

test("the new crowd files are added beside the existing pedestrian models", () => {
  const existing = [
    "../06 Player Character/Modular/men_Casual_Hoodie_UAL.glb",
    "../06 Player Character/Modular/women_Casual_UAL.glb",
    "../06 Player Character/Modular/men_Hoodie_criminal_UAL.glb",
    "../06 Player Character/Modular/men_Hoodie_criminal_brown_UAL.glb",
    "../06 Player Character/Modular/women_Punk_night_UAL.glb",
    "../06 Player Character/Modular/women_Punk_night_brown_UAL.glb",
  ];
  const added = [
    "../06 Player Character/Modular/style7_gangster_hoodie_UAL.glb",
    "../06 Player Character/Modular/style7_gangster_hoodie_brown_UAL.glb",
    "../06 Player Character/Modular/style7_gangster_tee_UAL.glb",
    "../06 Player Character/Modular/style7_gangster_tee_brown_UAL.glb",
    "../06 Player Character/Modular/style7_gangster_vest_UAL.glb",
    "../06 Player Character/Modular/style7_gangster_vest_brown_UAL.glb",
    "../06 Player Character/Modular/women_Punk_night6_bare_v2_UAL.glb",
    "../06 Player Character/Modular/women_Punk_night6_bare_v2_brown_UAL.glb",
  ];
  assert.deepEqual(PED_MODELS.slice(0, 6), existing);
  for (const path of added) assert.ok(PED_MODELS.includes(path), path);
  assert.equal(PED_MODELS.length, existing.length + added.length);
  for (const path of [...PED_MODELS, ...COP_MODELS]) {
    assert.ok(existsSync(repoPath(path)), path);
  }
});

test("a single-head casual figure is left untouched", () => {
  const options = characterVariantOptionsFromNames(["Casual_Body", "Casual_Feet", "Casual_Head", "Casual_Legs"]);
  assert.equal(options.hasVariants, false);
  assert.equal(characterVariantCount(options), 1);
  assert.equal(pickCharacterVariant(options, 0), null);
  const root = group(["Casual_Body", "Casual_Feet", "Casual_Head", "Casual_Legs"].map(mesh));
  applyCharacterVariant(root, null);
  assert.deepEqual(remaining(root), ["Casual_Body", "Casual_Feet", "Casual_Head", "Casual_Legs"]);
});

test("a style7 file yields one clean head, one pants pair, and a matching hat", () => {
  const options = characterVariantOptionsFromNames(STYLE7);
  assert.deepEqual(options.heads, [
    "Head_Adventurer",
    "Head_Beach",
    "Head_Casual_2",
    "Head_Casual_Hoodie",
    "Head_Suit",
  ]);
  assert.deepEqual(options.pants, ["Pants_Cargo", "Pants_Jeans", "Pants_Work"]);
  assert.deepEqual(options.hats, ["bare", "beanie", "cap"]);
  assert.equal(options.hasChain, true);
  assert.equal(characterVariantCount(options), 5);

  const bare = pickCharacterVariant(options, 0);
  assert.deepEqual(bare, { head: "Head_Adventurer", hat: "bare", pants: "Pants_Jeans", chain: true });
  const beanie = pickCharacterVariant(options, 1);
  assert.equal(beanie.head, "Head_Beach");
  assert.equal(beanie.hat, "beanie");
  assert.equal(beanie.chain, false);
  const cap = pickCharacterVariant(options, 2);
  assert.equal(cap.head, "Head_Casual_2");
  assert.equal(cap.hat, "cap");

  const root = group(STYLE7.map(mesh));
  applyCharacterVariant(root, beanie);
  assert.deepEqual(remaining(root), [
    "Beanie",
    "Boots",
    "Head_Beach_Beanie",
    beanie.pants,
    "Top_Hoodie",
  ].sort());
  assert.equal(remaining(root).filter((name) => name.startsWith("Head_")).length, 1);
  assert.equal(remaining(root).includes("Cap"), false);
  assert.equal(remaining(root).includes("GoldChain"), false);
});

test("night women keep one of the nine heads and the body parts", () => {
  const options = characterVariantOptionsFromNames(WOMEN);
  assert.equal(options.heads.length, 9);
  assert.equal(options.hasChain, false);
  assert.deepEqual(options.hats, ["bare"]);
  assert.equal(characterVariantCount(options), 9);
  const variant = pickCharacterVariant(options, 4);
  assert.deepEqual(variant, { head: "Head_Punk", hat: "bare", pants: null, chain: false });
  const root = group(WOMEN.map(mesh));
  applyCharacterVariant(root, variant);
  assert.deepEqual(remaining(root), ["Head_Punk", "Punk_Body", "Punk_Feet", "Punk_Legs"]);
});

function glbJson(absPath) {
  const buf = readFileSync(absPath);
  const length = buf.readUInt32LE(8);
  let offset = 12;
  while (offset < length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === "JSON") return JSON.parse(data.toString("utf8"));
    offset += 8 + chunkLen;
  }
  throw new Error(`no JSON chunk in ${absPath}`);
}

test("each new crowd GLB has the needed UAL clips and no COLOR_0", () => {
  const needed = [
    "Idle_Loop",
    "Jog_Fwd_Loop",
    "Walk_Loop",
    "Sprint_Loop",
    "Hit_Chest",
    "Hit_Head",
    "Death01",
    "Punch_Jab",
    "Punch_Cross",
  ];
  const added = PED_MODELS.slice(6);
  assert.equal(added.length, 8);
  for (const path of added) {
    const json = glbJson(repoPath(path));
    const names = (json.animations || []).map((clip) => clip.name);
    for (const clip of needed) {
      assert.ok(names.includes(clip), `${path} missing ${clip}`);
    }
    let color0 = 0;
    for (const meshNode of json.meshes || []) {
      for (const prim of meshNode.primitives || []) {
        if (prim.attributes && prim.attributes.COLOR_0 != null) color0 += 1;
      }
    }
    assert.equal(color0, 0, `${path} has COLOR_0`);
  }
});

function partGroup(name, primitiveCount) {
  const holder = {
    name,
    isGroup: true,
    isMesh: false,
    isSkinnedMesh: false,
    children: [],
    parent: null,
    removeFromParent() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    traverse(fn) {
      fn(this);
      for (const child of this.children.slice()) child.traverse(fn);
    },
  };
  for (let i = 0; i < primitiveCount; i += 1) {
    const child = mesh(i === 0 ? name : `${name}_${i}`);
    child.parent = holder;
    holder.children.push(child);
  }
  return holder;
}

test("multi-material loader groups stay one head or pants piece", () => {
  const pieces = [
    partGroup("Head_Adventurer", 4),
    partGroup("Head_Adventurer_Beanie", 4),
    partGroup("Head_Casual_2", 5),
    partGroup("Head_Casual_2_Beanie", 5),
    partGroup("Head_Casual_2_Cap", 5),
    partGroup("Head_Beach", 3),
    partGroup("Pants_Cargo", 2),
    partGroup("Pants_Jeans", 1),
    partGroup("Pants_Work", 2),
    mesh("Beanie"),
    mesh("Cap"),
    mesh("GoldChain"),
    mesh("Boots"),
    mesh("Top_Hoodie"),
  ];
  const root = group(pieces);
  const options = characterVariantOptions(root);
  assert.deepEqual(options.heads, ["Head_Adventurer", "Head_Casual_2", "Head_Beach"]);
  assert.deepEqual(options.pants, ["Pants_Cargo", "Pants_Jeans", "Pants_Work"]);
  assert.deepEqual(options.hats, ["bare", "beanie", "cap"]);
  assert.equal(characterVariantCount(options), 3);

  const beanie = pickCharacterVariant(options, 0);
  // seed 0: first head Adventurer, hat bare, pants Jeans, chain on
  assert.equal(beanie.head, "Head_Adventurer");
  const cap = pickCharacterVariant(options, 1);
  assert.equal(cap.head, "Head_Casual_2");
  assert.equal(cap.hat, "beanie");

  applyCharacterVariant(root, cap);
  const kept = remaining(root);
  assert.ok(kept.includes("Head_Casual_2_Beanie"));
  assert.ok(kept.includes("Beanie"));
  assert.ok(kept.includes("Boots"));
  assert.ok(kept.includes("Top_Hoodie"));
  assert.equal(kept.includes("Head_Adventurer"), false);
  assert.equal(kept.includes("Head_Beach"), false);
  assert.equal(kept.includes("Cap"), false);
  assert.equal(kept.includes("GoldChain"), false);
  assert.equal(kept.filter((name) => name.startsWith("Head_")).length, 1);
  // All primitives under the kept beanie head stay attached.
  const beanieHead = root.children.find((child) => child.name === "Head_Casual_2_Beanie");
  assert.equal(beanieHead.children.length, 5);
});
