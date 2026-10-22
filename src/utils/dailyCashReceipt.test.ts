import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyCashReceiptHtml } from './dailyCashReceipt';
import { defaultSettings } from '../data/demoFixtures';
import type { DailySalesRecord, MonthlyExpenseItem } from '../types';

const date = '2026-10-17';
const sale: DailySalesRecord = { id: 'sale', date, grossSales: 10000, cashSales: 0, bankSales: 1000, bkashSales: 2000, nagadSales: 500, cardSales: 500, foodCourtCommission: 950, proratedRent: 1667, cogsCost: 2000, staffCost: 500, otherExpenses: 0, netProfit: 4883 };
const expense: MonthlyExpenseItem = { id: 'expense', date, month: '2026-10', category: 'other', title: 'Delivery fare', amount: 1000, paymentMode: 'cash', isRecurring: false };
const props = { date, sales: [sale], expenses: [expense], settings: defaultSettings, openingCash: 14210, width: 80 as const, printedAt: new Date('2026-10-17T12:00:00Z') };

test('thermal receipt reconciles physical cash and itemizes digital, unpaid and linked expenses exactly once', () => {
  const html = dailyCashReceiptHtml({ ...props, expenses: [expense, { ...expense, id: 'digital', title: 'Bank expense', amount: 500, paymentMode: 'bank' }, { ...expense, id: 'credit', title: 'Unpaid ingredients', amount: 2000, paymentMode: 'credit', source: 'purchase', sourceId: 'purchase' }, { ...expense, id: 'previous', title: 'Yesterday expense', date: '2026-10-16' }] });
  assert.match(html, /All Daily Expenses \(3\)/);
  assert.match(html, /Tk 19,210\.00/); // 14,210 + (10,000 - 4,000 digital) - 1,000 cash expense.
  assert.match(html, /Tk 3,500\.00/);
  assert.match(html, /Unpaid \/ Credit/);
  assert.doesNotMatch(html, /Yesterday expense|Net Profit|Margin|4,883/);
  assert.equal(html.match(/Unpaid ingredients/g)?.length, 1);
});

test('receipt safely renders user text and supports both paper sizes with Dhaka print time', () => {
  const html = dailyCashReceiptHtml({ ...props, width: 58, settings: { ...defaultSettings, stallName: '<script>attack()</script>' }, expenses: [{ ...expense, title: '<img src=x onerror=attack()>', vendor: 'A & B' }] });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /width:58mm/);
  assert.match(html, /6:00:00 pm/);
  assert.match(dailyCashReceiptHtml(props), /width:80mm/);
});

test('receipt labels missing sales and invalid channels rather than printing a trustworthy cash balance', () => {
  const missing = dailyCashReceiptHtml({ ...props, sales: [] });
  assert.match(missing, /No software sales recorded/);
  assert.match(missing, /Unavailable/);
  const invalid = dailyCashReceiptHtml({ ...props, sales: [{ ...sale, grossSales: 100 }] });
  assert.match(invalid, /Digital payments exceed software sales/);
  assert.match(invalid, /Unavailable/);
});
