import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryInfo, customCategoryId, guessCategory, suggestCategories } from "./product-categories.ts";

const g = (title: string, description?: string, businessCategories: string[] = []) => guessCategory({ title, description }, { businessCategories });

test("guesses from the product's words", () => {
  assert.equal(g("Ankara wrap dress"), "clothes");
  assert.equal(g("6 yards of Swiss lace"), "fabrics");
  assert.equal(g("Smoky party jollof tray"), "food");
  assert.equal(g("Red velvet cake, 8 inch"), "cakes");
  assert.equal(g("Chilled zobo, 1 litre"), "drinks");
  assert.equal(g("4 bedroom duplex, Lekki"), "property");
  assert.equal(g("Red sneakers"), "shoes");
  assert.equal(g("Leather tote bag"), "bags");
  assert.equal(g("Bone straight wig, 24 inches"), "hair");
  assert.equal(g("Signature perfume"), "perfumes");
  assert.equal(g("iPhone 13 Pro Max, UK used"), "phones");
  assert.equal(g("Shea body butter"), "beauty");
  assert.equal(g("Bag of rice, 50kg"), "groceries");
  assert.equal(g("2018 Toyota Camry"), "cars");
  assert.equal(g("New arrival", "Two piece aso oke set"), "clothes");
});

test("services read as services", () => {
  assert.equal(guessCategory({ title: "Knotless braids", kind: "service" }), "hair-styling");
  assert.equal(guessCategory({ title: "Bridal make-up artist", kind: "service" }), "makeup");
  assert.equal(guessCategory({ title: "Wedding photoshoot", kind: "service" }), "photography");
  assert.equal(guessCategory({ title: "AC repair and servicing", kind: "service" }), "repairs");
  assert.equal(guessCategory({ title: "Something special", kind: "service" }), "other-services");
});

test("falls back on the business's categories, then Other", () => {
  assert.equal(g("New arrival", undefined, ["Fashion"]), "clothes");
  assert.equal(g("Saturday special", undefined, ["Bakery & cakes"]), "cakes");
  assert.equal(g("Phone case", undefined, ["Gadgets"]), "phones");
  assert.equal(g("Mystery box"), "other-products");
});

test("a food word used as a colour isn't food", () => {
  assert.equal(g("Coffee brown gown"), "clothes");
  assert.equal(g("Chocolate leather loafers"), "shoes");
  assert.equal(g("Honey blonde wig", undefined, ["Bakery & cakes"]), "hair");
  assert.equal(g("Wine red heels"), "shoes");
});

test("a business's own categories are suggested by their names", () => {
  const custom = [{ id: customCategoryId("Bridal sets"), name: "Bridal sets", placement: "wall" as const }];
  assert.equal(custom[0]!.id, "c-bridal-sets");
  assert.equal(guessCategory({ title: "Ivory bridal set with veil" }, { custom }), "c-bridal-sets");
  assert.ok(suggestCategories({ title: "Ivory bridal set with veil" }, { custom }).includes("other-products"));
});

test("category info: names, places and the business's choices", () => {
  assert.deepEqual(categoryInfo("shoes"), { id: "shoes", name: "Shoes", group: "product", placement: "shelf", wide: false, custom: false });
  assert.equal(categoryInfo("shoes", [], { shoes: "wall" }).placement, "wall");
  assert.equal(categoryInfo("property").wide, true);
  assert.equal(categoryInfo("nope").id, "other-products");
  assert.equal(categoryInfo("c-x", [{ id: "c-x", name: "X", placement: "table" }]).placement, "table");
});
