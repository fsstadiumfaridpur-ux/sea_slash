import type { MonthlyExpenseItem } from '../types';
import type { VendorLedgerEntry } from './vendorLedger';
import { roundMoney } from './money';

type VendorIdentity = { id: string; name: string };
const normalize = (name: string) => name.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
export function expenseVendor(expense: MonthlyExpenseItem, vendors: VendorIdentity[]) {
  if (expense.source || ['rent', 'commission', 'payroll'].includes(expense.category)) return undefined;
  if (expense.vendorId) return vendors.find(vendor => vendor.id === expense.vendorId);
  const name = normalize(expense.vendor ?? '');
  if (!name) return undefined;
  const matches = vendors.filter(vendor => normalize(vendor.name) === name);
  return matches.length === 1 ? matches[0] : undefined;
}

// Payments remain owned by Expenses. This projection is never saved as another ledger row.
export function vendorLedgerWithExpensePayments(ledger: VendorLedgerEntry[], expenses: MonthlyExpenseItem[], vendors: VendorIdentity[]): VendorLedgerEntry[] {
  const rows = ledger.filter(row => !row.sourceExpenseId);
  const seen = new Set<string>();
  for (const expense of expenses) {
    if (seen.has(expense.id) || !['cash', 'bkash', 'bank', 'card'].includes(expense.paymentMode) || !Number.isFinite(expense.amount) || expense.amount <= 0) continue;
    const vendor = expenseVendor(expense, vendors);
    if (!vendor) continue;
    seen.add(expense.id);
    rows.push({ id: `expense-payment:${expense.id}`, sourceExpenseId: expense.id, vendorId: vendor.id, date: expense.date,
      description: `${expense.title} / Daily expense payment`, billed: 0, paid: roundMoney(expense.amount) });
  }
  return rows;
}
