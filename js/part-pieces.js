// Doors, windows, walls, pipes, and signs for the build menu.
// 41.86 is the same size as the textured houses, so these parts match them.

const HOUSE_UNIT = 41.86;

const FILES = [
  "AC_Unit.glb",
  "AC_Unitx4.glb",
  "Balcony.glb",
  "Bricks_Half.glb",
  "Bricks_Large.glb",
  "Bricks_LeftStraight.glb",
  "Bricks_RightStraight.glb",
  "Bricks_Single.glb",
  "Bricks_Small.glb",
  "CasinoSign.glb",
  "Door1.glb",
  "Door2.glb",
  "Door3.glb",
  "Door4.glb",
  "Door5.glb",
  "Door_Double.glb",
  "Door_Window.glb",
  "Door_Window2.glb",
  "Pipe_L.glb",
  "Pipe_Straight.glb",
  "Pipe_Straight_Short.glb",
  "Sign_Bakery.glb",
  "Sign_Barbershop.glb",
  "Sign_Bookshop.glb",
  "Sign_Hardware.glb",
  "Sign_Pharmacy.glb",
  "Staircase.glb",
  "Stairs_Roof.glb",
  "Window.glb",
  "Window_Double.glb",
  "Window_Double_Roof.glb",
  "Window_Roof.glb",
];

function piece(file) {
  return {
    file,
    url: `assets/buildings/textured/parts/${file}`,
    unit: HOUSE_UNIT,
  };
}

export const PARTS_KIT = {
  id: "parts",
  label: "Parts",
  files: FILES.map(piece),
};
