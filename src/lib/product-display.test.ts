import assert from "node:assert/strict";
import { test } from "node:test";
import { displayKey, guessDisplay } from "./product-display.ts";

const image = (title: string, description: string | null = null) => ({ title, description, media_type: "image" });

test("videos stand on banners", () => {
  assert.equal(guessDisplay({ title: "Ankara dress", media_type: "video" }), "video");
});

test("the product's words pick its display", () => {
  assert.equal(guessDisplay(image("Ankara wrap dress")), "wear");
  assert.equal(guessDisplay(image("Smoky party jollof tray")), "food");
  assert.equal(guessDisplay(image("4 bedroom duplex, Lekki")), "home");
  assert.equal(guessDisplay(image("New arrival", "Two piece aso oke set")), "wear");
});

test("otherwise the business's categories decide", () => {
  assert.equal(guessDisplay(image("New arrival"), ["Fashion"]), "wear");
  assert.equal(guessDisplay(image("Saturday special"), ["Bakery & cakes"]), "food");
  assert.equal(guessDisplay(image("Phone case"), ["Gadgets"]), "item");
});

test("display keys are short and stable", () => {
  assert.equal(displayKey("718b2620-2077-48ea-871b-d65d83fe6f92"), "718b262020");
});

test("shoes and bags stand on a riser", () => {
  assert.equal(guessDisplay(image("Red sneakers")), "shoes");
  assert.equal(guessDisplay(image("Leather tote bag")), "shoes");
  assert.equal(guessDisplay(image("New in"), ["Shoes & bags"]), "shoes");
});

test("hair and beauty get their own large boards", () => {
  assert.equal(guessDisplay(image("Bone straight wig, 24 inches")), "hair");
  assert.equal(guessDisplay(image("Knotless braids")), "hair");
  assert.equal(guessDisplay(image("New look"), ["Hair salon"]), "hair");
});

test("clothes, shoes and hair are never put on a food table, even at a bakery", () => {
  assert.equal(guessDisplay(image("Coffee brown gown")), "wear");
  assert.equal(guessDisplay(image("Chocolate leather loafers")), "shoes");
  assert.equal(guessDisplay(image("Honey blonde wig"), ["Bakery & cakes"]), "hair");
});
