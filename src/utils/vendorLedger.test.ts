import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorCategoryBalances, vendorUnitPrice, vendorBillDetails, vendorBillUnits, sortVendorLedgerByDate, validateVendorLedgerEntry, vendorLedgerSummary, type VendorLedgerEntry } from './vendorLedger';
const bill: VendorLedgerEntry = { id: 'bill', vendorId: 'chicken', date: '2026-10-14', description: 'Chicken delivery', billed: 1000, paid: 400 };
test('daily ledger groups bills and carries unpaid money across days', () => {
  const summary = vendorLedgerSummary([bill, { ...bill, id: 'second', billed: 200, paid: 100 }, { ...bill, id: 'payment', date: '2026-10-15', billed: 0, paid: 300 }, { ...bill, id: 'other', vendorId: 'other', billed: 9999 }], 'chicken');
  assert.equal(summary.billed, 1200); assert.equal(summary.paid, 800); assert.equal(summary.balance, 400);
  assert.deepEqual(summary.daily.map(day => day.balance), [700, 400]);
});
test('overpayments display vendor credit and decimal amounts stay precise', () => {
  const summary = vendorLedgerSummary([{ ...bill, billed: 0.1, paid: 1 }, { ...bill, id: 'decimal', billed: 0.2, paid: 0 }], 'chicken');
  assert.equal(summary.billed, 0.3); assert.equal(summary.balance, -0.7);
  assert.deepEqual(vendorLedgerSummary([], 'chicken'), { billed: 0, paid: 0, balance: 0, daily: [] });
});
test('ledger rejects invalid dates, empty references, and invalid amounts', () => {
  for (const billed of [-1, Infinity, NaN, 1.001]) assert.throws(() => validateVendorLedgerEntry({ ...bill, billed }));
  for (const date of ['2026-02-30', '', 'tomorrow']) assert.throws(() => validateVendorLedgerEntry({ ...bill, date }));
  assert.throws(() => validateVendorLedgerEntry({ ...bill, description: ' ' }));
  assert.throws(() => validateVendorLedgerEntry({ ...bill, billed: 0, paid: 0 }));
});
test('kg bills calculate rounded totals and reject inconsistent stored amounts', () => {
  const entry = { ...bill, quantityKg: 2.5, pricePerKg: 220.25, billed: 550.63 };
  validateVendorLedgerEntry(entry);
  assert.equal(vendorLedgerSummary([entry], 'chicken').balance, 150.63);
  assert.throws(() => validateVendorLedgerEntry({ ...entry, billed: 550 }));
  assert.throws(() => validateVendorLedgerEntry({ ...entry, quantityKg: -1 }));
  assert.throws(() => validateVendorLedgerEntry({ ...entry, pricePerKg: undefined }));
  assert.throws(() => validateVendorLedgerEntry({ ...entry, quantityKg: 0, billed: 0 }));
  validateVendorLedgerEntry({ ...bill, quantityKg: 0, pricePerKg: 0, billed: 0, paid: 100 });
  validateVendorLedgerEntry(bill); // Existing amount-only records remain editable.
});

test('history stays newest first and backdated edits recalculate daily balances', () => {
  const rows = [
    { ...bill, id: 'latest', date: '2026-10-15', billed: 500, paid: 300 },
    { ...bill, id: 'oldest', date: '2026-10-01', billed: 100, paid: 0 },
    { ...bill, id: 'middle', date: '2026-10-08', billed: 200, paid: 50 },
  ];
  const originalIds = rows.map(row => row.id);
  assert.deepEqual(sortVendorLedgerByDate(rows).map(row => row.id), ['latest', 'middle', 'oldest']);
  assert.deepEqual(rows.map(row => row.id), originalIds);
  const edited = rows.map(row => row.id === 'latest' ? { ...row, date: '2026-09-30' } : row);
  assert.deepEqual(sortVendorLedgerByDate(edited).map(row => row.id), ['middle', 'oldest', 'latest']);
  const summary = vendorLedgerSummary(edited, 'chicken');
  assert.deepEqual(summary.daily.map(day => [day.date, day.balance]), [
    ['2026-09-30', 200], ['2026-10-01', 300], ['2026-10-08', 450],
  ]);
});


test('admin final balance adjustment clears 13 without adding bills or payments', () => {
  const small = { ...bill, billed: 100, paid: 87 };
  const adjustment: VendorLedgerEntry = { id: 'adjust', vendorId: bill.vendorId, date: '2026-10-15', description: 'Agreed rounding', billed: 0, paid: 0, balanceAdjustment: -13 };
  const summary = vendorLedgerSummary([small, adjustment], bill.vendorId);
  assert.equal(summary.balance, 0);
  assert.equal(summary.billed, 100); assert.equal(summary.paid, 87);
  assert.deepEqual(summary.daily.map(row => row.balance), [13, 0]);
  assert.equal(vendorLedgerSummary([small, adjustment, { ...bill, id: 'next', date: '2026-10-16', billed: 20, paid: 0 }], bill.vendorId).balance, 20);
  assert.throws(() => validateVendorLedgerEntry({ ...adjustment, paid: 13 }));
  assert.throws(() => validateVendorLedgerEntry({ ...adjustment, balanceAdjustment: NaN }));
});


test('unit bills retain their unit and total after saving while old kg bills still load', () => {
  for (const unit of vendorBillUnits) {
    const entry = JSON.parse(JSON.stringify({ ...bill, quantity: 2.5, unitPrice: 20, unit, billed: 50, paid: 0 }));
    validateVendorLedgerEntry(entry);
    assert.deepEqual(vendorBillDetails(entry), { quantity: 2.5, unitPrice: 20, unit });
    assert.equal(vendorLedgerSummary([entry], bill.vendorId).balance, 50);
    assert.throws(() => validateVendorLedgerEntry({ ...entry, billed: 51 }));
    assert.throws(() => validateVendorLedgerEntry({ ...entry, unit: 'unknown' }));
    assert.throws(() => validateVendorLedgerEntry({ ...entry, quantityKg: 2.5, pricePerKg: 20 }));
  }
  const old = { ...bill, quantityKg: 2, pricePerKg: 500, billed: 1000 };
  validateVendorLedgerEntry(old);
  assert.deepEqual(vendorBillDetails(old), { quantity: 2, unitPrice: 500, unit: 'kg' });
});


test('quantity and total derive the unit price without changing the entered bill', () => {
  for (const [quantity, total, expected] of [[5, 500, 100], [12, 180, 15], [3, 100, 100 / 3], [1.5, 100, 100 / 1.5]]) {
    const unitPrice = vendorUnitPrice(quantity, total);
    assert.equal(unitPrice, expected);
    const entry = { ...bill, quantity, unitPrice, unit: 'liter' as const, billed: total, paid: 0 };
    validateVendorLedgerEntry(entry);
    assert.equal(vendorLedgerSummary([entry], bill.vendorId).billed, total);
  }
  assert.equal(vendorUnitPrice(0, 100), 0);
  assert.equal(vendorUnitPrice(-1, 100), 0);
  assert.equal(vendorUnitPrice(1, Infinity), 0);
});


test('category final balances include adjustments and show vendor debts separately from credits', () => {
  const vendors = [{ id: 'chicken', category: 'Chicken' }, { id: 'second', category: 'Chicken' }, { id: 'bazaar', category: 'Bazaar' }, { id: 'empty', category: 'Other' }];
  const rows = [bill, { ...bill, id: 'credit', vendorId: 'second', billed: 100, paid: 150 }, { ...bill, id: 'bazaar', vendorId: 'bazaar', billed: 1000, paid: 987 }, { ...bill, id: 'adjust', vendorId: 'bazaar', date: '2026-10-15', billed: 0, paid: 0, balanceAdjustment: -13 }];
  const totals = vendorCategoryBalances(vendors, rows);
  assert.deepEqual(totals.get('Chicken'), { balance: 550, due: 600, credit: 50, count: 2 });
  assert.deepEqual(totals.get('Bazaar'), { balance: 0, due: 0, credit: 0, count: 1 });
  assert.deepEqual(totals.get('Other'), { balance: 0, due: 0, credit: 0, count: 1 });
  assert.deepEqual(vendorCategoryBalances([], rows), new Map());
});
