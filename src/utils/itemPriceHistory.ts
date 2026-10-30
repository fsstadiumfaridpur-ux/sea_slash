import type { InventoryItem, PurchaseRecord } from "../types";
import { vendorBillDetails, type VendorLedgerEntry } from "./vendorLedger";
import { isViewDate } from "./viewPreferences";
export interface ItemPricePoint {
  id: string;
  source: "vendor" | "bazaar";
  date: string;
  vendor: string;
  quantity: number;
  unit: string;
  total: number;
  unitPrice: number;
  originalQuantity: number;
  originalUnit: string;
  order: number;
}
const conversions: Record<string, { group: string; factor: number }> = {
  kg: { group: "mass", factor: 1000 },
  gram: { group: "mass", factor: 1 },
  g: { group: "mass", factor: 1 },
  liter: { group: "volume", factor: 1000 },
  ml: { group: "volume", factor: 1 },
  pcs: { group: "count", factor: 1 },
  pair: { group: "count", factor: 2 },
  dozen: { group: "count", factor: 12 },
  mm: { group: "length", factor: 1 },
  cm: { group: "length", factor: 10 },
  inch: { group: "length", factor: 25.4 },
  meter: { group: "length", factor: 1000 },
  foot: { group: "length", factor: 304.8 },
  yard: { group: "length", factor: 914.4 },
};
export function priceHistoryQuantity(
  quantity: number,
  from: string,
  to: string,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (from === to) return quantity;
  const a = conversions[from],
    b = conversions[to];
  return a && b && a.group === b.group
    ? (quantity * a.factor) / b.factor
    : null;
}
export function itemPriceHistory(
  item: InventoryItem,
  ledger: VendorLedgerEntry[],
  purchases: PurchaseRecord[],
  vendors: { id: string; name: string }[],
) {
  const names = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const seen = new Set<string>();
  const points: ItemPricePoint[] = [];
  let excluded = 0;
  const add = (
    record: Omit<ItemPricePoint, "quantity" | "unitPrice" | "unit">,
    quantity: number | undefined,
    unit: string | undefined,
  ) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    const normalized =
      quantity !== undefined && unit
        ? priceHistoryQuantity(quantity, unit, item.unit)
        : null;
    if (
      normalized === null ||
      normalized <= 0 ||
      !Number.isFinite(normalized) ||
      !isViewDate(record.date) ||
      !Number.isFinite(record.total) ||
      record.total <= 0 ||
      !Number.isFinite(record.total / normalized)
    ) {
      excluded++;
      return;
    }
    points.push({
      ...record,
      quantity: normalized,
      unit: item.unit,
      unitPrice: record.total / normalized,
    });
  };
  for (const [index, bill] of ledger.entries()) {
    if (
      bill.inventoryItemId !== item.id ||
      bill.billed <= 0 ||
      bill.balanceAdjustment !== undefined ||
      bill.sourceExpenseId
    )
      continue;
    const details = vendorBillDetails(bill);
    const received =
      bill.inventoryQuantity !== undefined && bill.inventoryUnit !== undefined;
    add(
      {
        id: `vendor:${bill.id}`,
        source: "vendor",
        date: bill.date,
        vendor: names.get(bill.vendorId) || "Vendor unavailable",
        total: bill.billed,
        originalQuantity: details?.quantity ?? bill.inventoryQuantity ?? 0,
        originalUnit: details?.unit ?? bill.inventoryUnit ?? "",
        order: index,
      },
      received ? bill.inventoryQuantity : details?.quantity,
      received ? bill.inventoryUnit : details?.unit,
    );
  }
  for (const [index, purchase] of purchases.entries()) {
    if (purchase.itemId !== item.id) continue;
    add(
      {
        id: `bazaar:${purchase.id}`,
        source: "bazaar",
        date: purchase.date,
        vendor: purchase.supplier?.trim() || "Supplier not recorded",
        total: purchase.totalCost,
        originalQuantity: purchase.quantity,
        originalUnit: purchase.unit,
        order: ledger.length + purchases.length - index,
      },
      purchase.quantity,
      purchase.unit,
    );
  }
  points.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  return { points, excluded };
}
export function itemPriceSummary(points: ItemPricePoint[]) {
  const latest = points.at(-1) ?? null,
    previous = points.at(-2) ?? null;
  return {
    latest,
    previous,
    change: latest && previous ? latest.unitPrice - previous.unitPrice : null,
    percent:
      latest && previous && previous.unitPrice > 0
        ? ((latest.unitPrice - previous.unitPrice) / previous.unitPrice) * 100
        : null,
    low: points.length
      ? Math.min(...points.map((point) => point.unitPrice))
      : null,
    high: points.length
      ? Math.max(...points.map((point) => point.unitPrice))
      : null,
  };
}
export function priceHistoryStartDate(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}
export function filterItemPrices(
  points: ItemPricePoint[],
  from: string,
  to: string,
) {
  return points.filter(
    (point) => (!from || point.date >= from) && (!to || point.date <= to),
  );
}
export const formatItemPrice = (price: number) =>
  `৳${price.toLocaleString("en-BD", { maximumFractionDigits: 6 })}`;
