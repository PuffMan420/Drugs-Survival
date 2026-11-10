// One-piece city buildings joined from the packs in Material/City.
// Kenney folders are not part of this list. Each file is one mesh.
// A lot mesh is a single building and can sit on a frontage.
// A scene mesh is a street, a set, or a district, and stays in build mode.

const ROOT = "City Single Mesh";

export function singleMeshPath(file) {
  return `${ROOT}/${file}`;
}

// Blue is the poor southwest. Green is the wealthy northeast.
// building-single-mesh is the modern concrete-and-glass office.
export const LOT_MESHES = [
  { file: "124-87-117_building-single-mesh.glb", zone: "blue" },
  { file: "abadoned_building__lowpoly-single-mesh.glb", zone: "blue" },
  { file: "mykolaiv_9_floor_panel_blocks-single-mesh.glb", zone: "blue" },
  { file: "building-single-mesh.glb", zone: "green" },
];

// Whole scenes, plus the pieces that are not a lot in the right district.
// conjunto is about a metre tall, so the shared metre scale does not make a building.
// city_building is a broken shell. The fire station has no firehouse lot.
// The "(1)" fire-station file is the same mesh and is not listed twice.
export const UNPLACED_MESHES = [
  "asian_buildings_set-single-mesh.glb",
  "beautiful_city-single-mesh.glb",
  "brooklyn_street_row_buildings_low_poly-single-mesh.glb",
  "ccity_building_set_1-single-mesh.glb",
  "city_building-single-mesh.glb",
  "conjunto_habitacional_kpd___villa_carmen_quilpue-single-mesh.glb",
  "downtown_buildings_set_-_low_poly_model (1)-single-mesh.glb",
  "downtown_toronto_yonge_and_dundas-single-mesh.glb",
  "estacion_de_bomberos_voluntarios-single-mesh.glb",
  "full_gameready_city_buildings_iv_hongkong-single-mesh.glb",
  "loft_18_mini_office_v.environment-single-mesh.glb",
  "low-poly_city_buildings-single-mesh.glb",
  "low_poly_street_gameready_6-single-mesh.glb",
  "neighbourhood_city_modular_lowpoly-single-mesh.glb",
  "old_concrete_building_pack__lowpoly-single-mesh.glb",
  "procedural_city_3-single-mesh.glb",
  "street_city_7_for_games_free-single-mesh.glb",
  "street_city_buildings_8-single-mesh.glb",
];

// Three shop buildings from the Asian set. The single-mesh copy of that set
// is the whole market fused together, so these come from the original file.
// Downtown and the other city-sized meshes stay unplaced.
export const CHINATOWN_FILE = "Material/City/asian_buildings_set.glb";
export const CHINATOWN_BUILDINGS = [
  "RaoheBuilding_01",
  "RaoheBuilding_04",
  "RaoheBuilding_05",
];
export const CHINATOWN_COPIES = 3;

export const CATALOG_MESHES = [
  ...LOT_MESHES.map((item) => item.file),
  ...UNPLACED_MESHES,
];
