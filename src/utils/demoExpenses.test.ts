import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMonthlyExpenses } from '../data/demoFixtures';
import { retiredDemoExpenses, removeDemoExpenses } from './demoExpenses';

test('expense defaults are empty and all exact retired samples are removed', () => {
  assert.deepEqual(initialMonthlyExpenses, []);
  assert.equal(retiredDemoExpenses.length, 14);
  assert.deepEqual(removeDemoExpenses(retiredDemoExpenses), []);
});

test('real expenses and edited samples are preserved even with matching IDs', () => {
  const original = retiredDemoExpenses[0];
  const records = [{ ...original, id: 'real-rent' }, { ...original, amount: 45000 }, { ...original, notes: 'Actual October payment' }, { ...original, date: '2026-10-05' }, { ...original, receipt: 'real-receipt' }];
  assert.deepEqual(removeDemoExpenses([...retiredDemoExpenses, ...records]), records);
  assert.equal(original.amount, 50000);
});

test('database JSON key ordering does not restore samples and cleanup is idempotent', () => {
  const reordered = retiredDemoExpenses.map(record => Object.fromEntries(Object.entries(record).reverse()) as typeof record);
  assert.deepEqual(removeDemoExpenses(reordered), []);
  const real = { ...retiredDemoExpenses[0], id: 'actual-payment' };
  const cleaned = removeDemoExpenses([...reordered, real]);
  assert.deepEqual(removeDemoExpenses(cleaned), [real]);
});
