import test from "node:test";
import assert from "node:assert/strict";
import type { InventoryItem, RecipeItem } from "../types";
import type { VendorLedgerEntry } from "./vendorLedger";
import { overallFoodCosts } from "./overallFoodCosts";
const item = (id: string): InventoryItem => ({
  id,
  name: id,
  category: "dry",
  currentStock: 999,
  unit: "kg",
  unitCost: 999,
  minThreshold: 0,
  lastUpdated: "2026-10-24",
});
const bill = (
  id: string,
  itemId: string,
  date: string,
  price: number,
  quantity = 10,
): VendorLedgerEntry => ({
  id,
  vendorId: "v",
  date,
  description: itemId,
  billed: price * quantity,
  paid: 0,
  inventoryItemId: itemId,
  quantity,
  unit: "kg",
  unitPrice: price,
});
const recipe: RecipeItem = {
  id: "dish",
  dishName: "Rice dish",
  sellingPrice: 200,
  estimatedCOGS: 0,
  portionSize: "1",
  extraPortionCost: 10,
  ingredients: [
    { inventoryItemId: "rice", itemName: "Rice", quantity: 500, unit: "g" },
  ],
};
const records = [
  bill("1", "rice", "2026-09-20", 100),
  bill("2", "rice", "2026-10-20", 120),
];
const calc = (
  ledger = records,
  recipes: RecipeItem[] = [recipe],
  from = "2026-09-25",
) =>
  overallFoodCosts(
    [item("rice")],
    ledger,
    [],
    recipes,
    from,
    "2026-10-24",
    5,
    35,
  );
test("weighted index and ingredient counts reflect recorded price changes", () => {
  const result = calc();
  assert.ok(Math.abs(result.change! - 20) < 0.000001);
  assert.equal(result.rising, 1);
  assert.equal(result.falling, 0);
  assert.equal(result.ingredientAlerts.length, 1);
  assert.equal(result.series[0].index, 100);
});
test("purchase size and new items never cause price inflation by themselves", () => {
  const result = overallFoodCosts(
    [item("rice"), item("oil")],
    [
      bill("1", "rice", "2026-10-01", 100),
      bill("2", "rice", "2026-10-05", 100, 1000),
      bill("3", "oil", "2026-10-05", 50000),
      bill("4", "rice", "2026-10-10", 100),
    ],
    [],
    [],
    "2026-10-01",
    "2026-10-24",
  );
  assert.ok(result.series.every((point) => point.index === 100));
  assert.equal(result.change, 0);
});
test("known basket uses fixed quantities and carries unchanged recorded prices", () => {
  const result = overallFoodCosts(
    [item("rice"), item("oil")],
    [
      bill("1", "rice", "2026-10-01", 100, 10),
      bill("2", "oil", "2026-10-01", 200, 5),
      bill("3", "rice", "2026-10-10", 120, 1000),
    ],
    [],
    [],
    "2026-10-01",
    "2026-10-24",
  );
  assert.ok(Math.abs(result.change! - 10) < 0.000001);
});
test("recipe cost converts units and recommends review without mutating selling prices", () => {
  const before = JSON.stringify(recipe),
    result = calc(),
    dish = result.dishes[0];
  assert.equal(dish.baseCost, 60);
  assert.equal(dish.currentCost, 70);
  assert.equal(dish.foodCostPercent, 35);
  assert.equal(dish.review, true);
  assert.equal(dish.suggestedPrice, 235);
  assert.equal(JSON.stringify(recipe), before);
});
test("target breach triggers review even without a new price rise; thresholds are configurable", () => {
  const result = calc([records[0]], [{ ...recipe, sellingPrice: 100 }]);
  assert.equal(result.dishes[0].review, true);
  const quiet = overallFoodCosts(
    [item("rice")],
    records,
    [],
    [recipe],
    "2026-09-25",
    "2026-10-24",
    25,
    40,
  );
  assert.equal(quiet.ingredientAlerts.length, 0);
  assert.equal(quiet.recipeAlerts.length, 0);
});
test("missing, incompatible, direct-cost and unlinked recipes cannot produce invented recommendations", () => {
  const result = calc(records, [
    {
      ...recipe,
      id: "missing",
      ingredients: [
        {
          inventoryItemId: "missing",
          itemName: "Missing",
          quantity: 1,
          unit: "kg",
        },
      ],
    },
    {
      ...recipe,
      id: "bad-unit",
      ingredients: [
        {
          inventoryItemId: "rice",
          itemName: "Rice",
          quantity: 1,
          unit: "bottle",
        },
      ],
    },
    { ...recipe, id: "direct", costingMode: "direct", directCost: 10 },
    { ...recipe, id: "empty", ingredients: [] },
  ]);
  assert.equal(result.dishes.length, 0);
  assert.equal(result.uncostedRecipes, 4);
});
test("future bills and payments excluded; date windows normalize index to their own start", () => {
  const result = calc(
    [
      ...records,
      bill("future", "rice", "2026-11-01", 9000),
      { ...records[0], id: "pay", date: "2026-10-24", billed: 0, paid: 900 },
    ],
    [],
    "2026-10-21",
  );
  assert.equal(result.change, 0);
  assert.equal(result.trends[0].latest.unitPrice, 120);
  assert.equal(result.ingredientAlerts.length, 0);
});
test("empty and first-price-only data do not fabricate rises", () => {
  const empty = calc([], []);
  assert.equal(empty.change, null);
  assert.equal(empty.untracked, 1);
  const first = calc([records[0]], []);
  assert.equal(first.ingredientAlerts.length, 0);
  assert.equal(first.trends[0].comparable, false);
});
