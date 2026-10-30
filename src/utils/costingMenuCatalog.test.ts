import test from "node:test";
import assert from "node:assert/strict";
import { syncCostingCatalog } from "./costingMenuCatalog";
import type { PublicMenuItem } from "./publicMenu";
import type { RecipeItem } from "../types";
import { menuItemFinancials } from "./menuPricing";
import { defaultSettings } from "../data/seedData";
const item: PublicMenuItem = {
  id: "public-rice",
  name: "Royal Rice",
  description: "Rich rice",
  category: "Rice",
  price: 250,
  photoUrl: "https://example.com/rice.webp",
  badge: "",
  available: true,
  published: true,
  sortOrder: 0,
};
const recipe: RecipeItem = {
  id: "old-recipe",
  dishName: " Royal   Rice ",
  portionSize: "2 plates",
  sellingPrice: 200,
  estimatedCOGS: 10,
  extraPortionCost: 5,
  ingredients: [
    { inventoryItemId: "rice", itemName: "Rice", quantity: 250, unit: "g" },
  ],
};
test("public dish creates a durable placeholder with live price/photo and no invented recipe", () => {
  const result = syncCostingCatalog([], [item]);
  assert.equal(result[0].publicMenuItemId, item.id);
  assert.equal(result[0].sellingPrice, 250);
  assert.equal(result[0].photoUrl, item.photoUrl);
  assert.deepEqual(result[0].ingredients, []);
  const costs = menuItemFinancials(
    result[0],
    [],
    { monthlyPortions: 100, monthlyLpgCost: 0, operatingDays: 30 },
    defaultSettings,
    [],
  );
  assert.equal(costs.foodCost, null);
  assert.equal(costs.netProfit, null);
  assert.deepEqual(syncCostingCatalog(result, [item]), result);
});
test("one exact normalized name preserves recipe ID, portions, ingredients and extras", () => {
  const before = JSON.stringify(recipe);
  const result = syncCostingCatalog([recipe], [item]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, recipe.id);
  assert.equal(result[0].portionSize, "2 plates");
  assert.deepEqual(result[0].ingredients, recipe.ingredients);
  assert.equal(result[0].extraPortionCost, 5);
  assert.equal(result[0].sellingPrice, 250);
  assert.equal(JSON.stringify(recipe), before);
});
test("stable public ID survives renaming, repricing and photo changes", () => {
  const original = syncCostingCatalog([recipe], [item]);
  const result = syncCostingCatalog(original, [
    { ...item, name: "New rice", price: 300, photoUrl: "" },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "old-recipe");
  assert.equal(result[0].dishName, "New rice");
  assert.equal(result[0].sellingPrice, 300);
  assert.equal(result[0].photoUrl, "");
  assert.deepEqual(result[0].ingredients, recipe.ingredients);
});
test("ambiguous names never steal or overwrite existing recipes", () => {
  const current = [recipe, { ...recipe, id: "other-recipe" }];
  const result = syncCostingCatalog(current, [item]);
  assert.equal(result.length, 3);
  assert.equal(result[0].publicMenuItemId, undefined);
  assert.equal(result[1].publicMenuItemId, undefined);
  assert.equal(result[2].publicMenuItemId, item.id);
  const duplicateNames = syncCostingCatalog(
    [recipe],
    [item, { ...item, id: "second-public" }],
  );
  assert.equal(duplicateNames.length, 3);
  assert.equal(duplicateNames[0].publicMenuItemId, undefined);
});
test("hidden/unavailable public items included; costing-only recipes retained; no fuzzy matches", () => {
  const other = { ...recipe, id: "old", dishName: "Royal Rice Special" };
  const result = syncCostingCatalog(
    [other],
    [{ ...item, published: false, available: false }],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "old");
  assert.equal(result[1].publicMenuItemId, item.id);
  assert.deepEqual(syncCostingCatalog([recipe], []), [recipe]);
});
