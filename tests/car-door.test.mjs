import assert from "node:assert/strict";
import test from "node:test";
import {
  DOOR_OPEN_ANGLE,
  DOOR_OPEN_TIME,
  assignDoorFlags,
  attachDoor,
  bakeHinge,
  closeCarDoor,
  doorIsOpen,
  doorPhase,
  doorSideFromHinge,
  hasSwingDoor,
  nearestCat,
  openCarDoor,
  snapDoorShut,
  stepDoor,
  yAngleOfQuaternion,
} from "../js/car-door.js";

test("the baked hinge flips X and Z the same way bakeLevel turns the car", () => {
  const hinge = bakeHinge({ x: -0.8, y: 0.4, z: 0.86 }, 0, 0, 0);
  assert.ok(Math.abs(hinge.x - 0.8) < 1e-9);
  assert.ok(Math.abs(hinge.y - 0.4) < 1e-9);
  assert.ok(Math.abs(hinge.z + 0.86) < 1e-9);
  assert.equal(doorSideFromHinge(hinge), 1);
});

test("a hinge that stays on -X after the bake hops to the default left side", () => {
  assert.equal(doorSideFromHinge({ x: -0.5, y: 0.4, z: 0.2 }), -1);
});

test("Door_Open's last quaternion is about 65 degrees around Y", () => {
  const angle = yAngleOfQuaternion(0, 0.537299633026123, 0, 0.8433914184570312);
  assert.ok(Math.abs(angle - DOOR_OPEN_ANGLE) < 1e-5);
});

test("exact paint keys win, leftover edges go to the nearer side", () => {
  const doorKeys = new Map([["door", 0]]);
  const bodyKeys = new Map([["body", 0]]);
  const flags = assignDoorFlags(
    ["door", "body", "edge"],
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
    ],
    doorKeys,
    bodyKeys,
    [{ x: 0, y: 0, z: 0 }],
    [{ x: 10, y: 0, z: 0 }],
  );
  assert.deepEqual(flags, [true, false, true]);
});

test("nearestCat returns the category of the closest sample", () => {
  const cat = nearestCat(
    { x: 1, y: 0, z: 0 },
    [
      { x: 8, y: 0, z: 0, cat: 5 },
      { x: 1.2, y: 0, z: 0, cat: 0 },
    ],
  );
  assert.equal(cat, 0);
});

test("open, step, and close swing the door on a tagged car", () => {
  const model = {
    hasDoor: true,
    doorSide: 1,
    doorOpenAngle: DOOR_OPEN_ANGLE,
    doorOpenTime: DOOR_OPEN_TIME,
    doorCloseTime: DOOR_OPEN_TIME,
  };
  const car = attachDoor({}, model);
  assert.equal(hasSwingDoor(car), true);
  assert.equal(doorPhase(car), "shut");
  assert.equal(openCarDoor(car), true);
  stepDoor(car, 0.075);
  assert.equal(doorPhase(car), "open");
  assert.ok(car.doorAngle > 0.4 && car.doorAngle < DOOR_OPEN_ANGLE);
  stepDoor(car, 0.075);
  assert.equal(doorIsOpen(car), true);
  assert.equal(doorPhase(car), "open");
  assert.equal(closeCarDoor(car), true);
  stepDoor(car, 0.15);
  assert.equal(car.doorAngle, 0);
  assert.equal(doorPhase(car), "shut");
  openCarDoor(car);
  stepDoor(car, 0.15);
  snapDoorShut(car);
  assert.equal(car.doorAngle, 0);
  assert.equal(doorPhase(car), "shut");
});
