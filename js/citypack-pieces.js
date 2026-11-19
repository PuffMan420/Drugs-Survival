// City Pack props and buildings for build mode.
// Most of these files are in meters. 18.37 is the same meter as the person
// and the cars in js/fence-pieces.js.
// Billboard and the hydrant are not meters, so they have their own scale.

export const CITYPACK_METER = 18.37;
// 670 file-units tall becomes about two people.
export const CITYPACK_BILLBOARD_UNIT = 0.12;
// 233 file-units tall becomes about waist height.
export const CITYPACK_HYDRANT_UNIT = 0.071;

function piece(file, unit, label) {
  return {
    file,
    url: `assets/citypack/${file}`,
    unit,
    label,
  };
}

export const CITYPACK_KIT = {
  id: "citypack",
  label: "City Pack",
  files: [
    piece("billboard.glb", CITYPACK_BILLBOARD_UNIT, "Billboard"),
    piece("fire-hydrant.glb", CITYPACK_HYDRANT_UNIT, "Fire hydrant"),
    piece("atm.glb", CITYPACK_METER, "ATM"),
    piece("fire-exit.glb", CITYPACK_METER, "Fire exit"),
    piece("fence.glb", CITYPACK_METER, "Fence"),
    piece("fence-piece.glb", CITYPACK_METER, "Fence piece"),
    piece("fence-end.glb", CITYPACK_METER, "Fence end"),
    piece("big-building.glb", CITYPACK_METER, "Big building"),
    piece("brown-building.glb", CITYPACK_METER, "Brown building"),
    piece("building-green.glb", CITYPACK_METER, "Green building"),
    piece("building-red.glb", CITYPACK_METER, "Red building"),
    piece("building-red-corner.glb", CITYPACK_METER, "Red corner"),
  ],
};
