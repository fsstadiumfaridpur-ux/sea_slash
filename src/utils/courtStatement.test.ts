import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailySalesRecord, MonthlyExpenseItem } from '../types';
import { defaultSettings } from '../data/demoFixtures';
import { courtStatement, courtPaymentStatus, courtDueNotices } from './courtStatement';
import { retiredDemoExpenses } from './demoExpenses';
import { validateExpense } from './linkedExpenses';

const sales: DailySalesRecord = { id: 'real-sales', date: '2026-10-05', grossSales: 10000, cashSales: 5000, bkashSales: 3000, nagadSales: 1000, cardSales: 1000, foodCourtCommission: 1000, proratedRent: 1667, cogsCost: 2000, staffCost: 1000, otherExpenses: 500, netProfit: 3833 };
const rent: MonthlyExpenseItem = { id: 'real-rent', date: '2026-10-05', month: '2026-10', category: 'rent', title: 'Actual rent payment', amount: 20000, paymentMode: 'bank', isRecurring: true, paymentReference: 'actual-user-reference' };

test('fixed rent is owed but never marked paid without a real payment', () => {
  const s = courtStatement('2026-10', [], [], defaultSettings);
  assert.equal(s.gross, 0); assert.equal(s.commission, 0);
  assert.equal(s.rent, 50000); assert.equal(s.totalPaid, 0);
  assert.equal(s.remaining, 50000);
  assert.equal(courtPaymentStatus(s.rent, s.rentPaid), 'Unpaid');
  assert.equal(courtPaymentStatus(s.commission, s.commissionPaid), 'Nothing due');
});

test('commission comes from actual monthly sales at the configured agreed rate', () => {
  const s = courtStatement('2026-10', [sales, { ...sales, id: 'other-month', date: '2026-09-05' }], [], defaultSettings);
  assert.equal(s.gross, 10000); assert.equal(s.commission, 950);
  assert.equal(s.totalOwed, 50950); assert.equal(s.remaining, 50950);
  assert.equal(s.collectionDifference, 0);
  assert.equal(courtStatement('2026-10', [sales], [], { ...defaultSettings, commissionRate: 0.12 }).commission, 1140);
  assert.equal(courtStatement('2026-10', [{ ...sales, grossSales: 123.45 }], [], defaultSettings).commission, 11.73);
});

test('partial payments and full payments reconcile separately for rent and commission', () => {
  const commission = { ...rent, id: 'actual-commission', category: 'commission' as const, amount: 500 };
  const s = courtStatement('2026-10', [sales], [rent, commission], defaultSettings);
  assert.equal(s.totalPaid, 20500); assert.equal(s.rentDue, 30000); assert.equal(s.commissionDue, 450); assert.equal(s.remaining, 30450);
  assert.equal(courtPaymentStatus(s.rent, s.rentPaid), 'Part-paid');
  const full = courtStatement('2026-10', [sales], [{ ...rent, amount: 50000 }, { ...commission, amount: 950 }], defaultSettings);
  assert.equal(full.remaining, 0); assert.equal(courtPaymentStatus(full.rent, full.rentPaid), 'Paid');
  assert.equal(s.payments[0].paymentReference, 'actual-user-reference');
});

test('late payments belong to their statement month, but cash expense dates remain unchanged', () => {
  const delayed = { ...rent, date: '2026-11-05', month: '2026-11', statementMonth: '2026-10' };
  const s = courtStatement('2026-10', [sales], [delayed], defaultSettings);
  assert.equal(s.rentPaid, 20000); assert.equal(s.payments[0].date, '2026-11-05');
  assert.equal(courtStatement('2026-11', [], [delayed], defaultSettings).rentPaid, 0);
  assert.doesNotThrow(() => validateExpense(delayed));
  assert.throws(() => validateExpense({ ...delayed, statementMonth: '2026-13' }), /statement month/);
});

test('demo entries, unrelated costs, unpaid credit and unknown methods never become court payments', () => {
  const rows = [...retiredDemoExpenses, { ...rent, paymentMode: 'credit' as const }, { ...rent, paymentMode: 'unknown' as const }, { ...rent, category: 'payroll' as const }, { ...rent, source: 'purchase' as const }];
  const s = courtStatement('2026-10', [sales], rows, defaultSettings);
  assert.equal(s.totalPaid, 0); assert.equal(s.payments.length, 0);
  assert.equal(s.remaining, 50950);
});

test('overpayments remain visible and do not silently offset a different obligation', () => {
  const s = courtStatement('2026-10', [sales], [{ ...rent, amount: 52000 }], defaultSettings);
  assert.equal(s.rentDue, 0); assert.equal(s.rentCredit, 2000); assert.equal(s.commissionDue, 950); assert.equal(s.remaining, 950);
  assert.equal(courtPaymentStatus(s.rent, s.rentPaid), 'Overpaid');
  const mismatch = courtStatement('2026-10', [{ ...sales, cashSales: 4000, foodCourtCommission: 800 }], [], defaultSettings);
  assert.equal(mismatch.collectionDifference, 1000); assert.equal(mismatch.recordedCommission, 800);
});

test('due notifications clear paid categories and retain partial or historical balances', async () => {
  const { courtDueNotices } = await import('./courtStatement');
  const rows = [
    { ...rent, amount: 50000 },
    { ...rent, id: 'commission-part', category: 'commission' as const, amount: 400 },
  ];
  const notices = courtDueNotices('2026-10', [sales], rows, defaultSettings);
  assert.deepEqual(notices, [{ month: '2026-10', date: '2026-10-05', category: 'commission', label: 'Daily commission due', amount: 550 }]);
  assert.deepEqual(courtDueNotices('2026-10', [sales], [...rows, { ...rent, id: 'commission-rest', category: 'commission', amount: 550 }], defaultSettings), []);
  const oldSale = { ...sales, date: '2026-09-01' };
  assert.ok(courtDueNotices('2026-10', [oldSale], rows, defaultSettings).some(notice => notice.month === '2026-09' && notice.category === 'rent'));
  assert.ok(!courtDueNotices('2026-10', [{ ...sales, date: '2026-11-01' }], rows, defaultSettings).some(notice => notice.month === '2026-11'));
});

test('daily landlord commission follows the stated 100 minus 5 then 10 percent example', () => {
  const statement = courtStatement('2026-10', [{ ...sales, grossSales: 100 }], [], defaultSettings);
  assert.equal(statement.dailyCommissions[0].vatDeduction, 5);
  assert.equal(statement.dailyCommissions[0].base, 95);
  assert.equal(statement.dailyCommissions[0].owed, 9.5);
});

test('late daily payment settles its selected sales day and cannot conceal another day due', () => {
  const records = [{ ...sales, grossSales: 100 }, { ...sales, id: 'second', date: '2026-10-06', grossSales: 200 }];
  const payment = { ...rent, id: 'daily-commission', category: 'commission' as const, date: '2026-11-01', month: '2026-11', statementMonth: '2026-10', commissionDate: '2026-10-05', amount: 30 };
  const statement = courtStatement('2026-10', records, [payment], defaultSettings);
  assert.equal(statement.dailyCommissions[0].due, 0);
  assert.equal(statement.dailyCommissions[0].credit, 20.5);
  assert.equal(statement.dailyCommissions[1].due, 19);
  assert.equal(statement.commissionDue, 19);
  assert.equal(courtStatement('2026-11', [], [payment], defaultSettings).commissionPaid, 0);
  assert.doesNotThrow(() => validateExpense(payment));
  assert.throws(() => validateExpense({ ...payment, commissionDate: '2026-09-01' }), /commission sales date/);
});

test('monthly commission sums rounded daily obligations and retains unattributed late payments for review', () => {
  const records = [{ ...sales, grossSales: 0.06 }, { ...sales, id: 'second', date: '2026-10-06', grossSales: 0.06 }];
  assert.equal(courtStatement('2026-10', records, [], defaultSettings).commission, 0.02);
  const payment = { ...rent, category: 'commission' as const, date: '2026-11-01', month: '2026-11', statementMonth: '2026-10', amount: 5 };
  assert.equal(courtStatement('2026-10', records, [payment], defaultSettings).unallocatedCommissionPaid, 5);
});

test('historical paid confirmations settle selected days without duplicating expenses or existing payments', () => {
  const records = [{ ...sales, date: '2026-10-08', grossSales: 100 }, { ...sales, id: 'sixteenth', date: '2026-10-16', grossSales: 100 }, { ...sales, id: 'today', date: '2026-10-17', grossSales: 100 }];
  const actualPayment = { ...rent, category: 'commission' as const, date: '2026-10-08', amount: 2 };
  const tracking = { paidDates: { '2026-10-08': 9.5, '2026-10-09': 0 }, startDate: '2026-10-17' };
  const expenses = [actualPayment];
  const statement = courtStatement('2026-10', records, expenses, defaultSettings, tracking);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-08')!.due, 0);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-09')!.historicalConfirmation, true);
  assert.equal(statement.actualCommissionPaid, 2);
  assert.equal(statement.confirmedCommissionPaid, 7.5);
  assert.equal(statement.commissionPaid, 9.5);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-16')!.due, 9.5);
  const notices = courtDueNotices('2026-10', records, expenses, defaultSettings, tracking).filter(notice => notice.category === 'commission');
  assert.deepEqual(notices.map(notice => notice.date), ['2026-10-17']);
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].amount, 2);
});

test('editing a confirmed day sales total exposes only newly owed commission', () => {
  const tracking = { paidDates: { '2026-10-05': 9.5 } };
  const statement = courtStatement('2026-10', [{ ...sales, grossSales: 200 }], [], defaultSettings, tracking);
  assert.equal(statement.dailyCommissions[0].due, 9.5);
});

test('historical paid dates without sales are distinguishable from recorded zero-sales days', () => {
  const tracking = { paidDates: { '2026-10-12': 0, '2026-10-13': 0 } };
  const statement = courtStatement('2026-10', [{ ...sales, date: '2026-10-13', grossSales: 0 }], [], defaultSettings, tracking);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-12')!.hasSalesRecord, false);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-12')!.historicalConfirmation, true);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-13')!.hasSalesRecord, true);
  assert.equal(statement.dailyCommissions.find(day => day.date === '2026-10-13')!.grossSales, 0);
});


test('13 taka landlord differences clear with admin adjustments without changing payments', () => {
  const payment: MonthlyExpenseItem = { ...rent, id: 'commission-rounding', category: 'commission', commissionDate: sales.date, amount: 937 };
  const tracking = { paidDates: {}, balanceAdjustments: { [sales.date]: { amount: -13, reason: 'Agreed rounding' } }, rentAdjustments: { '2026-10': { amount: -13, reason: 'Rent rounding' } } };
  const rentPayment = { ...rent, amount: 49987 };
  const before = courtStatement('2026-10', [sales], [payment, rentPayment], defaultSettings);
  assert.equal(before.commissionDue, 13); assert.equal(before.rentDue, 13);
  const after = courtStatement('2026-10', [sales], [payment, rentPayment], defaultSettings, tracking);
  assert.equal(after.commissionDue, 0); assert.equal(after.rentDue, 0);
  assert.equal(after.actualCommissionPaid, 937); assert.equal(after.rentPaid, 49987);
  assert.equal(after.dailyCommissions[0].adjustment, -13);
  assert.equal(courtDueNotices('2026-10', [sales], [payment, rentPayment], defaultSettings, tracking).length, 0);
  // New payments still affect the balance after an adjustment.
  const next = courtStatement('2026-10', [sales], [{ ...payment, amount: 947 }, rentPayment], defaultSettings, tracking);
  assert.equal(next.commissionCredit, 10);
});
