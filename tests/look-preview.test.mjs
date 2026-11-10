import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA_ANGLE, CAMERA_RADIUS } from "../js/constants.js";
import { parseLookPreview, previewRadius, sunDirection } from "../js/look-preview.js";
import { CATALOG_MESHES, CHINATOWN_BUILDINGS, LOT_MESHES, UNPLACED_MESHES } from "../js/single-mesh-buildings.js";

test("a bare page keeps the play camera", () => {
  assert.equal(parseLookPreview(""), null);
  assert.equal(parseLookPreview("?"), null);
});

test("look queries stay on the three still angles", () => {
  assert.deepEqual(parseLookPreview("?look=20"), { degrees: 20, afternoon: false });
  assert.deepEqual(parseLookPreview("?look=30"), { degrees: 30, afternoon: false });
  assert.deepEqual(parseLookPreview("?look=35"), { degrees: 35, afternoon: false });
  assert.deepEqual(parseLookPreview("?look=50"), { degrees: 50, afternoon: false });
  assert.equal(parseLookPreview("?look=45"), null);
});

test("afternoon light uses the current tilt unless a still angle is named", () => {
  assert.deepEqual(parseLookPreview("?light=afternoon"), { degrees: 30, afternoon: true });
  assert.deepEqual(parseLookPreview("?look=50&light=afternoon"), { degrees: 50, afternoon: true });
});

test("a steeper tilt keeps the camera the same height", () => {
  const height = CAMERA_RADIUS * Math.cos(CAMERA_ANGLE);
  assert.ok(Math.abs(previewRadius(CAMERA_ANGLE, CAMERA_RADIUS, CAMERA_ANGLE) - CAMERA_RADIUS) < 1e-6);
  const phi = (50 * Math.PI) / 180;
  const radius = previewRadius(phi, CAMERA_RADIUS, CAMERA_ANGLE);
  assert.ok(Math.abs(radius * Math.cos(phi) - height) < 1e-6);
  assert.ok(radius > CAMERA_RADIUS);
});

test("the afternoon sun is lower than the daytime sun", () => {
  const day = sunDirection(false);
  const afternoon = sunDirection(true);
  for (const dir of [day, afternoon]) {
    const length = Math.hypot(dir[0], dir[1], dir[2]);
    assert.ok(Math.abs(length - 1) < 1e-6);
  }
  assert.ok(afternoon[1] < day[1]);
  assert.deepEqual(day.map((n) => Math.round(n * 1000)), [-345, 794, -501]);
});

test("the build catalog skips Kenney and the duplicate fire station", () => {
  assert.equal(CATALOG_MESHES.some((file) => /kenney/i.test(file)), false);
  assert.equal(CATALOG_MESHES.filter((file) => file.startsWith("estacion_de_bomberos")).length, 1);
  for (const item of LOT_MESHES) assert.ok(CATALOG_MESHES.includes(item.file));
  for (const file of UNPLACED_MESHES) assert.ok(CATALOG_MESHES.includes(file));
  assert.equal(LOT_MESHES.find((item) => item.file.startsWith("building-single")).zone, "green");
  assert.equal(LOT_MESHES.find((item) => item.file.startsWith("124-")).zone, "blue");
  assert.equal(LOT_MESHES.some((item) => item.zone === "red"), false);
  assert.deepEqual(CHINATOWN_BUILDINGS, ["RaoheBuilding_01", "RaoheBuilding_04", "RaoheBuilding_05"]);
});
