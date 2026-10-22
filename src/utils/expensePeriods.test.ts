import test from 'node:test';
import assert from 'node:assert/strict';
import { expensesForPeriod } from './expensePeriods';
import type { MonthlyExpenseItem } from '../types';

const expense: MonthlyExpenseItem = { id: 'one', date: '2026-10-15', month: '2026-10', category: 'transport', title: 'Delivery fare', amount: 100, paymentMode: 'cash', isRecurring: false };
test('daily expenses roll into their payment month exactly once', () => {
  const rows = [expense, { ...expense, id: 'two', date: '2026-10-14', amount: 200 }, { ...expense, id: 'next-month', date: '2026-11-01', month: '2026-11', amount: 500 }];
  assert.deepEqual(expensesForPeriod(rows, 'daily', '2026-10-15', '2026-10').map(row => row.id), ['one']);
  const month = expensesForPeriod(rows, 'monthly', '2026-10-15', '2026-10');
  assert.deepEqual(month.map(row => row.id), ['one', 'two']);
  assert.equal(month.reduce((sum, row) => sum + row.amount, 0), 300);
  assert.equal(rows.length, 3);
});
test('late payroll and linked purchases use the date recorded, preserving source records', () => {
  const rows: MonthlyExpenseItem[] = [
    { ...expense, id: 'salary', date: '2026-11-02', month: '2026-11', category: 'payroll', salaryMonth: '2026-10', staffId: 'staff' },
    { ...expense, id: 'purchase', source: 'purchase', sourceId: 'purchase-1' },
  ];
  assert.deepEqual(expensesForPeriod(rows, 'monthly', '', '2026-10').map(row => row.id), ['purchase']);
  assert.equal(expensesForPeriod(rows, 'daily', '2026-11-02', '2026-11')[0], rows[0]);
  assert.deepEqual(expensesForPeriod(rows, 'daily', '2026-11-03', '2026-11'), []);
});
