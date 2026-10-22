import {correctAttendanceHourlyRate, staffScheduledHours} from './staffShiftEarnings';
import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftEarnings, durationClock, validWorkSchedule } from './staffShiftEarnings';
import { calculateStaffEarnings } from './staffPayroll';
import type { StaffAttendance, StaffMember } from '../types';
const at = (hour: string) => Date.parse(`2026-10-19T${hour}+06:00`);
const shift: StaffAttendance = { id: 'a', staffId: 's', date: '2026-10-19', status: 'present', advancePaid: 0, overtimeHours: 0, checkedInAt: '2026-10-19T11:00:00+06:00', shiftStartAt: '2026-10-19T11:00:00+06:00', shiftEndAt: '2026-10-19T23:00:00+06:00', salaryPerSecond: 30000 / 30 / (12 * 3600) };
const staff: StaffMember = { id: 's', name: 'Chef', role: 'Chef', phone: '', baseSalary: 30000, salaryType: 'monthly', joinDate: '2026-01-01', active: true };
test('correct a historical hourly rate without changing recorded work time or the original record', () => {
  const original = {...shift, checkedInAt:'2026-10-19T16:52:40.001+06:00', shiftEndAt:'2026-10-19T22:00:00+06:00', salaryPerSecond:10000/3600};
  const corrected = correctAttendanceHourlyRate(original,66.67);
  assert.deepEqual({...corrected,salaryPerSecond:original.salaryPerSecond}, original);
  assert.equal(original.salaryPerSecond,10000/3600);
  const earnings = shiftEarnings(corrected,at('23:00:00'))!;
  assert.equal(earnings.elapsedSeconds,18439);
  assert.equal(Math.round(earnings.earned*100)/100,341.48);
  for (const rate of [0,-1,NaN,Infinity]) assert.throws(()=>correctAttendanceHourlyRate(original,rate));
  assert.throws(()=>correctAttendanceHourlyRate({...shift,checkedInAt:undefined},66.67));
});
test('salary accrues each whole second from a 30-day monthly basis', () => {
  const first = shiftEarnings(shift, at('11:00:01'))!;
  assert.equal(first.elapsedSeconds, 1);
  assert.equal(first.earned, 1000 / 43200);
  assert.equal(shiftEarnings(shift, at('12:00:00'))!.elapsedSeconds, 3600);
  assert.equal(shiftEarnings(shift, at('23:00:00'))!.earned, 1000);
  assert.equal(shiftEarnings(shift, at('23:59:59'))!.earned, 1000);
  assert.equal(durationClock(3661), '01:01:01');
});
test('early, late and future check-ins cannot earn outside the scheduled shift', () => {
  assert.equal(shiftEarnings({ ...shift, checkedInAt: '2026-10-19T09:00:00+06:00' }, at('10:59:59'))!.earned, 0);
  assert.equal(shiftEarnings({ ...shift, checkedInAt: '2026-10-19T12:00:00+06:00' }, at('23:00:00'))!.elapsedSeconds, 39600);
  assert.equal(shiftEarnings(shift, at('10:00:00'))!.elapsedSeconds, 0);
  assert.equal(shiftEarnings({ ...shift, checkedInAt: '2026-10-19T23:30:00+06:00' }, at('23:59:59'))!.earned, 0);
});
test('overnight shift works across midnight and retains the saved rate', () => {
  const night = { ...shift, checkedInAt: '2026-10-19T19:00:00+06:00', shiftStartAt: '2026-10-19T19:00:00+06:00', shiftEndAt: '2026-10-20T03:00:00+06:00', salaryPerSecond: 1000 / 28800 };
  assert.equal(shiftEarnings(night, Date.parse('2026-10-20T01:00:00+06:00'))!.elapsedSeconds, 21600);
  assert.equal(shiftEarnings(night, Date.parse('2026-10-20T04:00:00+06:00'))!.earned, 1000);
});
test('half days cap at half pay; absence and leave do not accrue', () => {
  assert.equal(shiftEarnings({ ...shift, status: 'half_day' }, at('23:00:00'))!.earned, 500);
  for (const status of ['absent', 'leave'] as const) assert.equal(shiftEarnings({ ...shift, status }, at('23:00:00'))!.earned, 0);
  assert.equal(shiftEarnings({ ...shift, checkedInAt: undefined }, at('12:00:00')), null);
});
test('monthly and daily payroll count attendance days even during partial shifts, preserving saved daily rates', () => {
  assert.equal(calculateStaffEarnings(staff, [shift, shift], [], '2026-10', at('12:00:00')).earned, 1000);
  assert.equal(calculateStaffEarnings(staff, [shift], [], '2026-10', at('11:00:00')).effectiveDays, 1);
  assert.equal(calculateStaffEarnings(staff, [{...shift,status:'half_day'}], [], '2026-10', at('12:00:00')).earned, 500);
  assert.equal(calculateStaffEarnings({ ...staff, baseSalary: 60000 }, [shift], [], '2026-10', at('23:00:00')).earned, 1000);
  const daily = {...staff,salaryType:'daily' as const,baseSalary:800};
  const dailyShift = {...shift,salaryPerSecond:800/43200,checkedInAt:'2026-10-19T22:00:00+06:00'};
  assert.equal(calculateStaffEarnings(daily,[dailyShift],[],'2026-10',at('22:00:01')).earned,800);
  assert.equal(calculateStaffEarnings(daily,[{...dailyShift,status:'half_day'}],[],'2026-10',at('22:00:01')).earned,400);
  for (const status of ['absent','leave'] as const) assert.equal(calculateStaffEarnings(daily,[{...dailyShift,status}],[],'2026-10',at('23:00:00')).earned,0);
});
test('invalid or zero-length work schedules are rejected', () => {
  assert.equal(validWorkSchedule({ start: '11:00', end: '23:00' }), true);
  assert.equal(validWorkSchedule({ start: '19:00', end: '03:00' }), true);
  assert.equal(validWorkSchedule({ start: '11:00', end: '11:00' }), false);
  assert.equal(validWorkSchedule({ start: '25:00', end: '23:00' }), false);
});

test('check-in opens exactly ten minutes before the shift and closes at shift end', async () => {
  const { checkinAvailability } = await import('./staffShiftEarnings');
  const window = {checkInOpensAt:'2026-10-19T10:50:00+06:00',checkInClosesAt:'2026-10-19T23:00:00+06:00'};
  assert.equal(checkinAvailability(window,at('03:34:00')),'before');
  assert.equal(checkinAvailability(window,at('10:49:59')),'before');
  assert.equal(checkinAvailability(window,at('10:50:00')),'open');
  assert.equal(checkinAvailability(window,at('22:59:59')),'open');
  assert.equal(checkinAvailability(window,at('23:00:00')),'closed');
  assert.equal(checkinAvailability({},at('11:00:00')),'unconfigured');
});

test('hourly attendance accrues the saved hourly rate per second and stops at shift end',()=>{
 const hourly={...staff,salaryType:'hourly' as const,baseSalary:120};
 const timed={...shift,salaryPerSecond:120/3600};
 assert.equal(calculateStaffEarnings(hourly,[timed],[],'2026-10',at('12:00:00')).earned,120);
 assert.equal(calculateStaffEarnings(hourly,[timed],[],'2026-10',at('11:00:01')).earned,0.03);
 assert.equal(calculateStaffEarnings(hourly,[timed],[],'2026-10',at('23:00:00')).earned,1440);
 assert.equal(calculateStaffEarnings(hourly,[timed],[],'2026-10',at('23:59:00')).earned,1440);
 const {checkedInAt,shiftStartAt,shiftEndAt,salaryPerSecond,...untimed}=timed;
 assert.equal(calculateStaffEarnings(hourly,[untimed],[],'2026-10',at('23:00:00')).earned,0);
 assert.equal(calculateStaffEarnings({...hourly,baseSalary:999},[timed],[],'2026-10',at('12:00:00')).earned,120);
});

test('individual hourly schedules set planned hours, including overnight shifts',()=>{
 assert.equal(staffScheduledHours({...staff,salaryType:'hourly',hourlyWorkSchedule:{start:'15:00',end:'19:00'}},12),4);
 assert.equal(staffScheduledHours({...staff,salaryType:'hourly',hourlyWorkSchedule:{start:'22:00',end:'02:00'}},12),4);
 assert.equal(staffScheduledHours({...staff,salaryType:'hourly'},8),8);
 assert.equal(staffScheduledHours({...staff,hourlyWorkSchedule:{start:'15:00',end:'19:00'}},12),12);
});
