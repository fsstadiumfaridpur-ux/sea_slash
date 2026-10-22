import test from 'node:test';
import assert from 'node:assert/strict';
import type { MonthlyExpenseItem, PurchaseRecord, StaffAdvance, StaffMember } from '../types';
import { initialPurchases } from '../data/demoFixtures';
import { removeDemoPurchases, retiredDemoPurchases } from './demoPurchases';
import { linkedExpenses, salaryPayments, validateExpense } from './linkedExpenses';
import { calculateStaffEarnings } from './staffPayroll';

const purchase: PurchaseRecord = { id: 'real-purchase', date: '2026-10-05', itemId: 'rice', itemName: 'Rice', quantity: 10, unit: 'kg', unitPrice: 100, totalCost: 1000, supplier: 'Real Supplier', paymentMode: 'cash' };
const staff: StaffMember = { id: 'chef', name: 'Chef', role: 'Cook', phone: '', salaryType: 'daily', baseSalary: 1000, joinDate: '2026-01-01', active: true };
const advance: StaffAdvance = { id: 'actual-advance', staffId: staff.id, date: '2026-10-05', amount: 200, reason: 'Advance', repaid: false };
const payment: MonthlyExpenseItem = { id: 'salary-payment', month: '2026-10', date: '2026-10-05', category: 'payroll', title: 'Salary Payment', amount: 500, paymentMode: 'bank', staffId: staff.id, salaryMonth: '2026-10', isRecurring: false };

test('inventory projections preserve amounts and sources without changing stock or duplicating linked rows', () => {
  const linked = linkedExpenses([], [purchase, purchase], [], [], []);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].amount, 1000);
  assert.equal(linked[0].sourceId, purchase.id);
  assert.equal(linked[0].month, '2026-10');
  assert.deepEqual(linkedExpenses(linked, [purchase], [], [], []), linked);
  assert.equal(linkedExpenses([], [{ ...purchase, totalCost: 1500 }], [], [], [])[0].amount, 1500);
  assert.deepEqual(linkedExpenses(linked, [], [], [], []), []);
});

test('LPG, transport, packaging and credit purchase categories stay attached to their source', () => {
  for (const category of ['gas_utilities', 'transport', 'packaging', 'other'] as const) {
    const result = linkedExpenses([], [{ ...purchase, expenseCategory: category, paymentMode: 'credit' }], [], [], []);
    assert.equal(result[0].category, category);
    assert.equal(result[0].paymentMode, 'credit');
  }
});

test('salary advances are actual payments, not salary budgets, and repayments do not erase historical outflows', () => {
  const rows = linkedExpenses([], [], [advance, advance], [staff], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 200);
  assert.equal(rows[0].vendor, 'Chef');
  assert.equal(rows[0].paymentMode, 'unknown');
  assert.equal(linkedExpenses([], [], [{ ...advance, repaid: true }], [{ ...staff, active: false, archivedAt: '2026-10-05' }], [])[0].amount, 200);
  assert.deepEqual(linkedExpenses([], [], [], [staff], []), []);
});

test('salary month and payment date remain distinct and advances are not deducted twice', () => {
  const delayed = { ...payment, date: '2026-11-02', month: '2026-11' };
  const rows = linkedExpenses([delayed], [], [advance], [staff], []);
  assert.equal(salaryPayments(rows, staff.id, '2026-10'), 500);
  assert.equal(salaryPayments(rows, staff.id, '2026-11'), 0);
  assert.equal(salaryPayments(rows, 'other', '2026-10'), 0);
  const earned = calculateStaffEarnings(staff, [{ id: 'att', staffId: staff.id, date: '2026-10-05', status: 'present', advancePaid: 0, overtimeHours: 0 }], [advance], '2026-10');
  assert.equal(earned.netPayable - salaryPayments(rows, staff.id, '2026-10'), 300);
  assert.equal(rows.reduce((sum, r) => sum + r.amount, 0), 700);
});

test('purchase samples never enter real expenses and modified purchases remain', () => {
  assert.deepEqual(initialPurchases, []);
  assert.deepEqual(removeDemoPurchases(retiredDemoPurchases), []);
  const real = { ...retiredDemoPurchases[0], totalCost: 5000 };
  assert.deepEqual(removeDemoPurchases([...retiredDemoPurchases, real]), [real]);
});

test('invalid payments fail validation and source rows cannot be manually saved', () => {
  assert.doesNotThrow(() => validateExpense(payment));
  assert.throws(() => validateExpense({ ...payment, amount: NaN }), /greater than zero/);
  assert.throws(() => validateExpense({ ...payment, staffId: '' }), /staff member/);
  assert.throws(() => validateExpense({ ...payment, salaryMonth: '' }), /salary month/);
  assert.throws(() => validateExpense({ ...payment, source: 'advance' }), /source/);
  assert.throws(() => validateExpense({ ...payment, month: '2026-09' }), /date/);
});
