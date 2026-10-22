import test from 'node:test';
import assert from 'node:assert/strict';
import type { MonthlyExpenseItem } from '../types';
import { expenseVendor, vendorLedgerWithExpensePayments } from './vendorExpensePayments';
import { vendorCategoryBalances, vendorLedgerSummary } from './vendorLedger';

const vendors = [{ id: 'vendor', name: 'Aminul Hossain', category: 'Bazaar' }];
const ledger = [{ id: 'bill', vendorId: 'vendor', date: '2026-10-18', description: 'Bazaar bill', billed: 1000, paid: 100 }];
const payment: MonthlyExpenseItem = { id: 'expense', date: '2026-10-19', month: '2026-10', category: 'ingredients', title: 'Vendor payment', amount: 600, paymentMode: 'cash', vendorId: 'vendor', vendor: 'Aminul Hossain', isRecurring: false };

test('daily expense payments reduce individual and category balances without another bill', () => {
  const rows = vendorLedgerWithExpensePayments(ledger, [payment], vendors);
  const summary = vendorLedgerSummary(rows, 'vendor');
  assert.equal(summary.billed, 1000); assert.equal(summary.paid, 700); assert.equal(summary.balance, 300);
  assert.equal(vendorCategoryBalances(vendors, rows).get('Bazaar')?.balance, 300);
  assert.equal(rows[1].sourceExpenseId, payment.id);
  assert.deepEqual(vendorLedgerWithExpensePayments(rows, [payment, payment], vendors), rows);
  assert.equal(ledger.length, 1); assert.equal(ledger[0].paid, 100);
});
test('editing, deleting or making a payment unpaid immediately reconciles its original vendor', () => {
  assert.equal(vendorLedgerSummary(vendorLedgerWithExpensePayments(ledger, [{ ...payment, amount: 800 }], vendors), 'vendor').balance, 100);
  assert.equal(vendorLedgerSummary(vendorLedgerWithExpensePayments(ledger, [], vendors), 'vendor').balance, 900);
  for (const paymentMode of ['credit', 'unknown'] as const) assert.equal(vendorLedgerSummary(vendorLedgerWithExpensePayments(ledger, [{ ...payment, paymentMode }], vendors), 'vendor').balance, 900);
  for (const paymentMode of ['cash', 'bkash', 'bank', 'card'] as const) assert.equal(vendorLedgerSummary(vendorLedgerWithExpensePayments(ledger, [{ ...payment, paymentMode }], vendors), 'vendor').balance, 300);
  const other = { id: 'other', name: 'Other', category: 'Other' };
  const rows = vendorLedgerWithExpensePayments(ledger, [{ ...payment, vendorId: 'other' }], [...vendors, other]);
  assert.equal(vendorLedgerSummary(rows, 'vendor').balance, 900); assert.equal(vendorLedgerSummary(rows, 'other').balance, -600);
});
test('older expenses use an unambiguous exact vendor name; fuzzy names never move money', () => {
  const legacy = { ...payment, vendorId: undefined, vendor: '  aminul   HOSSAIN ' };
  assert.equal(expenseVendor(legacy, vendors)?.id, 'vendor');
  assert.equal(vendorLedgerSummary(vendorLedgerWithExpensePayments(ledger, [legacy], vendors), 'vendor').balance, 300);
  assert.equal(expenseVendor({ ...legacy, vendor: 'Aminul Hosain' }, vendors), undefined);
  assert.equal(expenseVendor(legacy, [...vendors, { id: 'duplicate', name: 'Aminul Hossain', category: 'Other' }]), undefined);
  assert.equal(expenseVendor({ ...legacy, vendorId: 'deleted' }, vendors), undefined);
  assert.equal(expenseVendor({ ...payment, category: 'payroll' }, vendors), undefined);
  assert.equal(expenseVendor({ ...payment, source: 'purchase' }, vendors), undefined);
});
