import test from "node:test";
import assert from "node:assert/strict";
import {
  itemPriceHistory,
  itemPriceSummary,
  priceHistoryQuantity,
  priceHistoryStartDate,
  filterItemPrices,
} from "./itemPriceHistory";
import type { InventoryItem, PurchaseRecord } from "../types";
import type { VendorLedgerEntry } from "./vendorLedger";
const item: InventoryItem = {
  id: "rice",
  name: "Rice",
  category: "dry",
  currentStock: 99,
  unit: "kg",
  unitCost: 999,
  minThreshold: 0,
  lastUpdated: "2026-10-24",
};
const bill: VendorLedgerEntry = {
  id: "one",
  vendorId: "vendor",
  date: "2026-10-20",
  description: "Rice",
  billed: 250,
  paid: 0,
  quantity: 5,
  unit: "kg",
  unitPrice: 50,
  inventoryItemId: "rice",
  inventoryQuantity: 5,
  inventoryUnit: "kg",
};
const purchase: PurchaseRecord = {
  id: "bazaar",
  date: "2026-10-22",
  itemId: "rice",
  itemName: "Rice",
  quantity: 2000,
  unit: "g",
  unitPrice: 0.06,
  totalCost: 120,
  supplier: "Bazaar shop",
  paymentMode: "cash",
};
test("converts compatible weights, volumes, counts and lengths without guessing package sizes", () => {
  assert.equal(priceHistoryQuantity(500, "g", "kg"), 0.5);
  assert.equal(priceHistoryQuantity(2, "liter", "ml"), 2000);
  assert.equal(priceHistoryQuantity(2, "dozen", "pcs"), 24);
  assert.equal(priceHistoryQuantity(1, "inch", "cm"), 2.54);
  assert.equal(priceHistoryQuantity(2, "packet", "kg"), null);
  assert.equal(priceHistoryQuantity(2, "bottle", "liter"), null);
  assert.equal(priceHistoryQuantity(0, "kg", "kg"), null);
  assert.equal(priceHistoryQuantity(Infinity, "g", "kg"), null);
});
test("uses actual purchase totals and received quantities, not current stock values", () => {
  const result = itemPriceHistory(
    item,
    [bill],
    [purchase],
    [{ id: "vendor", name: "Rice vendor" }],
  );
  assert.deepEqual(
    result.points.map((point) => [
      point.unitPrice,
      point.vendor,
      point.quantity,
    ]),
    [
      [50, "Rice vendor", 5],
      [60, "Bazaar shop", 2],
    ],
  );
  const summary = itemPriceSummary(result.points);
  assert.equal(summary.change, 10);
  assert.equal(summary.percent, 20);
  assert.equal(summary.low, 50);
  assert.equal(summary.high, 60);
  assert.equal(result.excluded, 0);
});
test("supports saved package receipt conversions and legacy kilogram bills", () => {
  const packaged = {
    ...bill,
    id: "bag",
    quantity: 1,
    unit: "bag" as const,
    inventoryQuantity: 25,
    inventoryUnit: "kg",
    billed: 1250,
  };
  const legacy = {
    ...bill,
    id: "legacy",
    quantity: undefined,
    unit: undefined,
    unitPrice: undefined,
    inventoryQuantity: undefined,
    inventoryUnit: undefined,
    quantityKg: 5,
    pricePerKg: 50,
  };
  const result = itemPriceHistory(item, [packaged, legacy], [], []);
  assert.deepEqual(
    result.points.map((point) => point.unitPrice),
    [50, 50],
  );
  assert.equal(result.points[0].originalUnit, "bag");
});
test("payments, balance adjustments, expenses, unlinked names and other items do not become price points", () => {
  const rows = [
    bill,
    { ...bill, id: "pay", billed: 0, paid: 500 },
    { ...bill, id: "adjust", balanceAdjustment: 5 },
    { ...bill, id: "expense", sourceExpenseId: "expense" },
    { ...bill, id: "unlinked", inventoryItemId: undefined },
    { ...bill, id: "other", inventoryItemId: "other" },
  ];
  assert.equal(itemPriceHistory(item, rows, [], []).points.length, 1);
});
test("excludes invalid linked records and unconvertible units", () => {
  const rows = [
    { ...bill, id: "bad-date", date: "2026-02-30" },
    { ...bill, id: "zero", inventoryQuantity: 0 },
    { ...bill, id: "bad-total", billed: NaN },
    { ...bill, id: "bag", inventoryUnit: "bag" },
  ];
  const result = itemPriceHistory(item, rows, [], []);
  assert.equal(result.points.length, 0);
  assert.equal(result.excluded, 4);
});
test("one point per saved record, corrected bill values replace the point, latest date wins", () => {
  const correction = { ...bill, billed: 300 };
  const result = itemPriceHistory(
    item,
    [correction, correction, { ...bill, id: "earlier", date: "2026-10-19" }],
    [],
    [],
  );
  assert.equal(result.points.length, 2);
  assert.equal(itemPriceSummary(result.points).latest?.unitPrice, 60);
});
test("date ranges are inclusive and cross leap days correctly", () => {
  assert.equal(priceHistoryStartDate("2024-03-01", 3), "2024-02-28");
  const points = itemPriceHistory(item, [bill], [purchase], []).points;
  assert.equal(filterItemPrices(points, "2026-10-20", "2026-10-20").length, 1);
  assert.equal(filterItemPrices(points, "2026-10-21", "2026-10-21").length, 0);
  assert.equal(itemPriceSummary([]).latest, null);
  assert.equal(itemPriceSummary(points.slice(0, 1)).percent, null);
});
