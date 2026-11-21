import assert from "node:assert/strict";
import { test } from "node:test";
import { placeOf } from "./place.ts";

test("a located row reads as its place", () => {
  assert.deepEqual(
    placeOf({ latitude: 3.1589569, longitude: 101.7137273, place_name: " Starbucks ", place_address: "151, Jalan Ampang", place_category: "Cafe" }),
    { name: "Starbucks", address: "151, Jalan Ampang", latitude: 3.1589569, longitude: 101.7137273, category: "Cafe" },
  );
});

test("an unnamed spot is named by its address, else its coordinates", () => {
  assert.equal(placeOf({ latitude: 1.5, longitude: 103.8, place_address: "Airport Blvd" })?.name, "Airport Blvd");
  assert.equal(placeOf({ latitude: 1.5, longitude: 103.8 })?.name, "1.5000, 103.8000");
});

test("a row from an older app, half a point or a point off the globe has no place", () => {
  assert.equal(placeOf({}), null);
  assert.equal(placeOf({ latitude: 1.5, longitude: null, place_name: "A" }), null);
  assert.equal(placeOf({ latitude: 95, longitude: 10, place_name: "A" }), null);
});
