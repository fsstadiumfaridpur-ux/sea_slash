import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailySalesRecord, MonthlyExpenseItem } from '../types';
import { calculateDailyCash } from './dailyCash';

const date = '2026-10-17';
const sale: DailySalesRecord = { id: 'sale', date, grossSales: 10000, cashSales: 6000, bkashSales: 2000, nagadSales: 1000, cardSales: 1000, foodCourtCommission: 1000, proratedRent: 1667, cogsCost: 2000, staffCost: 500, otherExpenses: 100, netProfit: 4733 };
const expense: MonthlyExpenseItem = { id: 'expense', date, month: '2026-10', category: 'other', title: 'Shop expense', amount: 1000, paymentMode: 'cash', isRecurring: false };

test('separates physical cash from digital payments and unpaid expenses without deducting P&L allocations again', () => {
  const totals = calculateDailyCash([sale, { ...sale, date: '2026-10-16' }], [expense, { ...expense, id: 'digital', amount: 500, paymentMode: 'bkash' }, { ...expense, id: 'credit', amount: 2000, paymentMode: 'credit' }, { ...expense, id: 'unknown', amount: 100, paymentMode: 'unknown' }, { ...expense, id: 'yesterday', date: '2026-10-16' }], date);
  assert.equal(totals.totalSales, 10000);
  assert.equal(totals.totalExpenses, 3600);
  assert.equal(totals.remainingBalance, 6400);
  assert.equal(totals.cashInHand, 5000);
  assert.equal(totals.unpaidExpenses, 2000);
  assert.equal(totals.unknownExpenses, 100);
});

test('preserves cash shortages and distinguishes missing sales from a recorded zero-sales day', () => {
  const missing = calculateDailyCash([], [expense], date);
  assert.equal(missing.cashInHand, -1000);
  assert.equal(missing.hasSales, false);
  assert.equal(calculateDailyCash([{ ...sale, grossSales: 0, cashSales: 0 }], [], date).hasSales, true);
  assert.equal(calculateDailyCash([], [], date).remainingBalance, 0);
});

test('owner change float increases physical cash without becoming software sales or profit', () => {
  const totals = calculateDailyCash([sale], [expense], date, 14210);
  assert.equal(totals.openingCash, 14210);
  assert.equal(totals.cashInHand, 19210);
  assert.equal(totals.totalSales, 10000);
  assert.equal(totals.remainingBalance, 9000);
  assert.equal(calculateDailyCash([], [], '2026-10-18').openingCash, 0);
});

test('derives drawer receipts from software total minus every digital channel, including bank transfers', () => {
  const totals = calculateDailyCash([{ ...sale, cashSales: 0, bankSales: 1500 }], [expense, { ...expense, id: 'bank-cost', amount: 500, paymentMode: 'bank' }], date, 14210);
  assert.equal(totals.digitalSales, 5500);
  assert.equal(totals.cashSales, 4500);
  assert.equal(totals.cashInHand, 17710);
  assert.equal(totals.totalExpenses, 1500);
  assert.equal(totals.invalidBreakdown, false);
});

test('legacy records with no cash breakdown use the remainder and impossible digital totals are flagged', () => {
  const legacy = { ...sale, cashSales: 0, bkashSales: 0, nagadSales: 0, cardSales: 0 };
  assert.equal(calculateDailyCash([legacy], [], date).cashSales, 10000);
  assert.equal(calculateDailyCash([{ ...legacy, bankSales: 11000 }], [], date).invalidBreakdown, true);
});
