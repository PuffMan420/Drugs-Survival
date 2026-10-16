import { PlaneGeometry, MeshBasicMaterial, Mesh, BoxGeometry, FrontSide, DoubleSide } from "three";
import {
  TILE,
  COLS,
  ROWS,
  ROAD_COLS,
  ROAD_ROWS,
  BUILDINGS,
  PLAYER_START_X,
  PLAYER_START_Z,
  PLAYER_SIZE,
  isRoadCol,
  isRoadRow,
  tileKind,
  validateBuildings,
} from "./city-data.js";
import { makeRoofTexture, makeWallTexture, pixelTexture } from "./textures.js";

const flat = { toneMapped: false, side: FrontSide };

function paintGround() {
  const width = COLS * TILE;
  const height = ROWS * TILE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  for (let tz = 0; tz < ROWS; tz += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const x = tx * TILE;
      const y = tz * TILE;
      const kind = tileKind(tx, tz);
      if (kind === "road") {
        ctx.fillStyle = "#34363b";
        ctx.fillRect(x, y, TILE, TILE);
      } else if (kind === "sidewalk") {
        ctx.fillStyle = "#c8c0b2";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#ddd6c8";
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = "#8a847a";
        if (isRoadCol(tx - 1)) ctx.fillRect(x, y, 3, TILE);
        if (isRoadCol(tx + 1)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
        if (isRoadRow(tz - 1)) ctx.fillRect(x, y, TILE, 3);
        if (isRoadRow(tz + 1)) ctx.fillRect(x, y + TILE - 3, TILE, 3);
      } else {
        ctx.fillStyle = "#5a564f";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#4a463f";
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
        ctx.fillRect(x + TILE - 1, y, 1, TILE);
      }
    }
  }

  ctx.fillStyle = "#e6c34a";
  for (const start of ROAD_ROWS) {
    const zLine = (start + 1) * TILE;
    for (let tx = 0; tx < COLS; tx += 1) {
      if (isRoadCol(tx)) continue;
      ctx.fillRect(tx * TILE + 10, zLine - 1, 28, 2);
    }
  }
  for (const start of ROAD_COLS) {
    const xLine = (start + 1) * TILE;
    for (let tz = 0; tz < ROWS; tz += 1) {
      if (isRoadRow(tz)) continue;
      ctx.fillRect(xLine - 1, tz * TILE + 10, 2, 28);
    }
  }

  return pixelTexture(canvas);
}

function addGround(scene) {
  const mapW = COLS * TILE;
  const mapH = ROWS * TILE;
  // PlaneGeometry's +Y edge is texture v=1. rotateX(-90°) sends that edge to -Z,
  // which is world z = 0 when the plane is centered — canvas y-down matches +Z.
  const geometry = new PlaneGeometry(mapW, mapH);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: paintGround(),
    toneMapped: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(mapW / 2, 0, mapH / 2);
  scene.add(mesh);
}

function addBuildings(scene) {
  validateBuildings();
  for (const building of BUILDINGS) {
    const width = building.w * TILE;
    const depth = building.d * TILE;
    const height = building.h * TILE;
    const geometry = new BoxGeometry(width, height, depth);
    // ±X faces are depth × height, ±Z faces are width × height, +Y is the roof.
    const sideX = new MeshBasicMaterial({ map: makeWallTexture(building.d, building.h, building.wall), ...flat });
    const sideZ = new MeshBasicMaterial({ map: makeWallTexture(building.w, building.h, building.wall), ...flat });
    const roof = new MeshBasicMaterial({ map: makeRoofTexture(building.w, building.d, building.roof), ...flat });
    const bottom = new MeshBasicMaterial({ color: 0x222222, ...flat });
    const mesh = new Mesh(geometry, [sideX, sideX, roof, bottom, sideZ, sideZ]);
    mesh.position.set((building.tx + building.w / 2) * TILE, height / 2, (building.tz + building.d / 2) * TILE);
    scene.add(mesh);
  }
}

function addPlayer(scene) {
  const geometry = new BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
  const side = new MeshBasicMaterial({ color: 0xe0a000, ...flat });
  const top = new MeshBasicMaterial({ color: 0xffe14a, ...flat });
  const mesh = new Mesh(geometry, [side, side, top, side, side, side]);
  mesh.position.set(PLAYER_START_X, PLAYER_SIZE / 2, PLAYER_START_Z);
  scene.add(mesh);
  return mesh;
}

export function buildCity(scene) {
  addGround(scene);
  addBuildings(scene);
  const playerMesh = addPlayer(scene);
  return {
    playerMesh,
    mapW: COLS * TILE,
    mapH: ROWS * TILE,
  };
}
