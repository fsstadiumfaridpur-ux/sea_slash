import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSalesHistory } from '../data/demoFixtures';
import { removeDemoSales } from './demoSales';
import type { DailySalesRecord } from '../types';

const demo: DailySalesRecord = { id: 'sales-2026-10-03', date: '2026-10-03', grossSales: 38400, cashSales: 16500, bkashSales: 15400, nagadSales: 3500, cardSales: 3000, foodCourtCommission: 3840, proratedRent: 1667, cogsCost: 15800, staffCost: 2967, otherExpenses: 950, netProfit: 13176, customerCount: 118, topSellingItem: 'Shahi Mutton Kacchi (Basmati)', notes: 'Friday crowd in food court was huge; 2 full deghs sold out by 9:30 PM.' };

test('sales defaults are empty and exact legacy samples are removed', () => {
  assert.deepEqual(initialSalesHistory, []);
  assert.deepEqual(removeDemoSales([demo]), []);
  assert.equal(demo.grossSales, 38400);
});
test('real or edited records on the same dates are preserved', () => {
  const real = [{ ...demo, grossSales: 100 }, { ...demo, notes: 'Actual sale' }, { ...demo, id: 'real-sale-id' }];
  assert.deepEqual(removeDemoSales([demo, ...real]), real);
  assert.deepEqual(removeDemoSales(removeDemoSales(real)), real);
});
test('JSON property ordering does not affect recognition but extra fields are preserved', () => {
  const reordered = Object.fromEntries(Object.entries(demo).reverse()) as unknown as DailySalesRecord;
  assert.deepEqual(removeDemoSales([reordered]), []);
  assert.equal(removeDemoSales([{ ...demo, receiptId: 'real-receipt' } as DailySalesRecord]).length, 1);
});
