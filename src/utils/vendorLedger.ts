import { roundMoney } from './money';

export const vendorBillUnits = ['pcs', 'kg', 'g', 'liter', 'ml', 'bottle', 'packet', 'box', 'bag', 'carton', 'dozen', 'pair', 'inch', 'cm', 'mm', 'meter', 'foot', 'yard', 'roll', 'bundle'] as const;
export type VendorBillUnit = typeof vendorBillUnits[number];

export interface VendorLedgerEntry {
  id: string;
  vendorId: string;
  date: string;
  description: string;
  quantity?: number;
  unit?: VendorBillUnit;
  unitPrice?: number;
  quantityKg?: number;
  pricePerKg?: number;
  billed: number;
  paid: number;
  balanceAdjustment?: number;
  sourceExpenseId?: string;
  inventoryCategoryId?: string;
  inventoryCategoryName?: string;
  createInventoryItem?: boolean; // Request only; the server replaces this with an inventory link.
  inventoryUpdateMode?: 'replace';
  inventoryItemId?: string;
  inventoryQuantity?: number;
  inventoryUnit?: string;
}

export function sortVendorLedgerByDate(entries: VendorLedgerEntry[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export function vendorBillTotal(quantity: number, unitPrice: number) {
  if (![quantity, unitPrice].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Enter a valid quantity and unit price.');
  const total = roundMoney(quantity * unitPrice);
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER / 100) throw new Error('Bill amount is too large.');
  return total;
}

// Keep the unrounded rate so 100 / 3 saves a total of 100, not 99.99.
export function vendorUnitPrice(quantity: number, total: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(total) || total < 0) return 0;
  return total / quantity;
}

// Older bills without a unit used kilograms.
export function vendorBillDetails(entry: VendorLedgerEntry) {
  if (entry.quantity !== undefined || entry.unitPrice !== undefined) return { quantity: entry.quantity, unitPrice: entry.unitPrice, unit: entry.unit };
  if (entry.quantityKg !== undefined || entry.pricePerKg !== undefined) return { quantity: entry.quantityKg, unitPrice: entry.pricePerKg, unit: 'kg' as const };
  return null;
}

export function validateVendorLedgerEntry(entry: VendorLedgerEntry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.vendorId !== 'string' || !entry.vendorId) throw new Error('Invalid vendor ledger record.');
  if (typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw new Error('Enter a valid date.');
  if (typeof entry.description !== 'string' || !entry.description.trim() || entry.description.length > 500) throw new Error('Enter a description (up to 500 characters).');
  for (const amount of [entry.billed, entry.paid]) {
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100 || Math.abs(roundMoney(amount) - amount) > 0.0000001) throw new Error('Enter a valid amount with up to two decimal places.');
  }
  if(entry.inventoryUpdateMode!==undefined&&entry.inventoryUpdateMode!=='replace')throw new Error('Invalid inventory update mode.');
  const details = vendorBillDetails(entry);
  if (entry.unit !== undefined && !vendorBillUnits.includes(entry.unit)) throw new Error('Choose a valid measurement unit.');
  if ((entry.quantity !== undefined || entry.unitPrice !== undefined || entry.unit !== undefined) && (entry.quantityKg !== undefined || entry.pricePerKg !== undefined)) throw new Error('Use only one quantity and unit price.');
  if (details || entry.unit !== undefined) {
    if (!details || typeof details.quantity !== 'number' || typeof details.unitPrice !== 'number' || !details.unit || !vendorBillUnits.includes(details.unit)) throw new Error('Enter quantity, unit, and unit price.');
    const total = vendorBillTotal(details.quantity, details.unitPrice);
    if ((details.quantity > 0) !== (details.unitPrice > 0)) throw new Error('Enter both quantity and unit price, or leave both zero for a payment only.');
    if (entry.billed !== total) throw new Error('Total bill must equal quantity multiplied by unit price.');
  }
  if (entry.inventoryItemId !== undefined || entry.inventoryQuantity !== undefined || entry.inventoryUnit !== undefined) {
    if (typeof entry.inventoryItemId !== 'string' || !entry.inventoryItemId || !Number.isFinite(entry.inventoryQuantity) || entry.inventoryQuantity! <= 0 || entry.inventoryQuantity! > 1e9 || typeof entry.inventoryUnit !== 'string' || !entry.inventoryUnit || !details || !details.quantity || entry.billed <= 0 || entry.balanceAdjustment !== undefined) throw new Error('Select an inventory item and a valid received quantity for this bill.');
  }
  if (entry.balanceAdjustment !== undefined) {
    if (!Number.isFinite(entry.balanceAdjustment) || Math.abs(entry.balanceAdjustment) > Number.MAX_SAFE_INTEGER / 100 || roundMoney(entry.balanceAdjustment) !== entry.balanceAdjustment || entry.balanceAdjustment === 0 || entry.billed !== 0 || entry.paid !== 0 || details !== null || entry.unit !== undefined) throw new Error('A balance adjustment must have a nonzero amount and no bill or payment.');
    return;
  }
  if (entry.billed === 0 && entry.paid === 0) throw new Error('Enter a bill amount or a payment amount.');
}

export function vendorLedgerSummary(entries: VendorLedgerEntry[], vendorId: string) {
  const days = new Map<string, { date: string; billed: number; paid: number; balance: number }>();
  for (const entry of entries.filter(row => row.vendorId === vendorId)) {
    validateVendorLedgerEntry(entry);
    const day = days.get(entry.date) ?? { date: entry.date, billed: 0, paid: 0, balance: 0 };
    day.billed = roundMoney(day.billed + entry.billed);
    day.paid = roundMoney(day.paid + entry.paid);
    days.set(entry.date, day);
  }
  let billed = 0, paid = 0;
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of daily) {
    billed = roundMoney(billed + day.billed);
    paid = roundMoney(paid + day.paid);
    const adjustments = entries.filter(row => row.vendorId === vendorId && row.date <= day.date).reduce((sum, row) => sum + (row.balanceAdjustment ?? 0), 0);
    day.balance = roundMoney(billed - paid + adjustments);
  }
  return { billed, paid, balance: daily.at(-1)?.balance ?? 0, daily };
}

export function vendorCategoryBalances(vendors: { id: string; category: string }[], entries: VendorLedgerEntry[]) {
  const totals = new Map<string, { balance: number; due: number; credit: number; count: number }>();
  for (const vendor of vendors) {
    const { balance } = vendorLedgerSummary(entries, vendor.id);
    const category = totals.get(vendor.category) ?? { balance: 0, due: 0, credit: 0, count: 0 };
    category.balance = roundMoney(category.balance + balance);
    category.due = roundMoney(category.due + Math.max(0, balance));
    category.credit = roundMoney(category.credit + Math.max(0, -balance));
    category.count++;
    totals.set(vendor.category, category);
  }
  return totals;
}

export function vendorStockUpdateMode(previous:VendorLedgerEntry|undefined,next:VendorLedgerEntry):'replace'|undefined {
  if(next.billed<=0||!next.quantity||(!next.inventoryItemId&&!next.createInventoryItem))return undefined;
  if(!previous||['inventoryItemId','inventoryQuantity','inventoryUnit','quantity','unit','unitPrice','billed'].some(key=>previous[key as keyof VendorLedgerEntry]!==next[key as keyof VendorLedgerEntry]))return 'replace';
  return previous.inventoryUpdateMode;
}
