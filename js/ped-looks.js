// Crowd outfits. The camera looks down, so hair and shirt are the colors
// that separate these people from the player. Each look differs in one of them.

export const PED_LOOK_HEX = [
  { shirt: 0xd24a3a, pants: 0x1c1c1c, shoes: 0xf2f2f2, hair: 0x1a1a1a, skin: 0xd7a67a },
  { shirt: 0xf4f4f4, pants: 0x2a4f86, shoes: 0x111111, hair: 0xe2c36a, skin: 0xf0c9a0 },
  { shirt: 0xf0c43a, pants: 0x2f6b3a, shoes: 0x4a3424, hair: 0x6b3a1f, skin: 0xc68642 },
  { shirt: 0x7a4ea3, pants: 0x3a3a3a, shoes: 0xf2f2f2, hair: 0xa33b2b, skin: 0x8d5524 },
  { shirt: 0xe07a2f, pants: 0x243556, shoes: 0xf2f2f2, hair: 0xb9b9b9, skin: 0xf3d2b5 },
  { shirt: 0x3f8f4e, pants: 0xc2a15a, shoes: 0x111111, hair: 0x24160f, skin: 0xa56b3c },
  { shirt: 0xe57aa8, pants: 0x35507a, shoes: 0xf2f2f2, hair: 0xd8b15a, skin: 0xf6d7c3 },
  { shirt: 0x161616, pants: 0x161616, shoes: 0xf2f2f2, hair: 0xeeeeee, skin: 0x5c3317 },
  { shirt: 0x3aa0b8, pants: 0x7a2430, shoes: 0x111111, hair: 0x4a2c1a, skin: 0xd7a67a },
  { shirt: 0xf7f7f7, pants: 0xb4332a, shoes: 0x111111, hair: 0x6e6e6e, skin: 0xf0c9a0 },
  { shirt: 0x2f5fd0, pants: 0xd9c7a2, shoes: 0x4a3424, hair: 0x1a1a1a, skin: 0xc68642 },
  { shirt: 0xc6d63a, pants: 0x3a2a55, shoes: 0xf2f2f2, hair: 0xa33b2b, skin: 0x8d5524 },
];

function unitHash(n) {
  let h = Math.imul(n | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h >>> 0) / 4294967296;
}

export function pedLookIndex(index) {
  return Math.floor(unitHash(index) * PED_LOOK_HEX.length);
}
