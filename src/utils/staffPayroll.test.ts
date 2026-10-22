import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStaffEarnings, generateStaffAgreement } from './staffPayroll';
import type { StaffMember, StaffAttendance } from '../types';

const staff: StaffMember = { id: 's1', name: 'Chef One', role: 'Kebab Chef', phone: '', salaryType: 'monthly', baseSalary: 31000, joinDate: '2026-01-01', active: true };
const attendance = (date: string, status: StaffAttendance['status'] = 'present', staffId = 's1'): StaffAttendance => ({ id: `${staffId}-${date}-${status}`, staffId, date, status, advancePaid: 0, overtimeHours: 0 });

test('no attendance never creates fictional salary days', () => {
  assert.equal(calculateStaffEarnings(staff, [], [], '2026-10').earned, 0);
  assert.equal(calculateStaffEarnings({ ...staff, salaryType: 'daily', baseSalary: 800 }, [], [], '2026-10').effectiveDays, 0);
});
test('monthly earnings use the fixed 30-day basis and recorded half-days', () => {
  const result = calculateStaffEarnings(staff, [attendance('2026-10-01'), attendance('2026-10-02', 'half_day'), attendance('2026-10-03', 'leave'), attendance('2026-10-04', 'absent'), attendance('2026-10-01', 'present', 'other')], [], '2026-10');
  assert.equal(result.effectiveDays, 1.5);
  assert.equal(result.earned, 1550);
  assert.equal(calculateStaffEarnings({ ...staff, baseSalary: 28000 }, [attendance('2026-02-01')], [], '2026-02').earned, 933.33);
});
test('duplicate attendance and days outside employment never inflate earnings', () => {
  const result = calculateStaffEarnings({ ...staff, joinDate: '2026-10-02', terminationDate: '2026-10-03', active: false }, [attendance('2026-10-01'), attendance('2026-10-02'), attendance('2026-10-02', 'half_day'), attendance('2026-10-03'), attendance('2026-10-04')], [], '2026-10');
  assert.equal(result.earned, 1550);
});
test('advances exclude other workers, months and repaid amounts, preserving excess balance', () => {
  const result = calculateStaffEarnings({ ...staff, salaryType: 'daily', baseSalary: 800 }, [attendance('2026-10-01')], [
    { id: 'a', staffId: 's1', date: '2026-10-01', amount: 1200, reason: '', repaid: false },
    { id: 'b', staffId: 's1', date: '2026-10-02', amount: 500, reason: '', repaid: true },
    { id: 'c', staffId: 'other', date: '2026-10-01', amount: 500, reason: '', repaid: false },
  ], '2026-10');
  assert.equal(result.netPayable, 0);
  assert.equal(result.advanceBalance, 400);
});
test('custom agreements contain the exact profile and supplied terms', () => {
  const agreement = generateStaffAgreement(staff, 'Mughal Mahal', 'Shift: 10:00 to 18:00\nPay date: 5th');
  assert.match(agreement, /Kebab Chef/);
  assert.match(agreement, /BDT 31000 per month/);
  assert.match(agreement, /Pay date: 5th/);
});
