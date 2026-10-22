import type { MonthlyExpenseItem, StaffAdvance, StaffAttendance, StaffMember } from '../types';
import { roundMoney } from './money';
import { calculateStaffEarnings } from './staffPayroll';
import { attendancePay, durationClock } from './staffShiftEarnings';

export function buildStaffSalarySheet(staff: StaffMember, attendance: StaffAttendance[], advances: StaffAdvance[], expenses: MonthlyExpenseItem[], month: string, now = Date.now()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid salary month.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const byDate = new Map<string, StaffAttendance>();
  for (const record of attendance) if (record.staffId === staff.id && record.date.startsWith(`${month}-`) && record.date <= today && record.date >= staff.joinDate && (!staff.terminationDate || record.date <= staff.terminationDate)) byDate.set(record.date, record);
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const daily = Array.from({ length: dayCount }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
    .filter(date => date <= today && date >= staff.joinDate && (!staff.terminationDate || date <= staff.terminationDate))
    .map(date => {
      const record = byDate.get(date);
      const pay = record && attendancePay(staff,record,now);
      return { date, status: record?.status ?? 'not_recorded' as const, checkedInAt: record?.checkedInAt, shiftStartAt: record?.shiftStartAt, shiftEndAt: record?.shiftEndAt, seconds: pay?.timed ? pay.timed.elapsedSeconds : null, earned: pay?.earned ?? 0 };
    });
  const totals = calculateStaffEarnings(staff, [...byDate.values()], advances, month, now);
  const payments = [
    ...expenses.filter(payment => !payment.source && payment.category === 'payroll' && payment.staffId === staff.id && payment.salaryMonth === month && payment.paymentMode !== 'credit')
      .map(payment => ({id:`expense:${payment.id}`,date:payment.date,amount:payment.amount,paymentMode:payment.paymentMode ?? 'unknown',note:payment.notes ?? ''})),
    ...advances.filter(payment => payment.staffId === staff.id && payment.date.startsWith(`${month}-`) && !payment.repaid)
      .map(payment => ({id:`legacy:${payment.id}`,date:payment.date,amount:payment.amount,paymentMode:payment.paymentMode ?? 'unknown',note:payment.reason})),
  ].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const paid = roundMoney(payments.reduce((sum,payment)=>sum+payment.amount,0));
  return { staff, month, generatedAt: new Date(now).toISOString(), daily, payments, ...totals, paid,
    remainingDue: roundMoney(Math.max(0, totals.earned - paid)),
    overpaid: roundMoney(Math.max(0, paid - totals.earned)),
    presentDays: daily.filter(day => day.status === 'present').length,
    halfDays: daily.filter(day => day.status === 'half_day').length,
    absentDays: daily.filter(day => day.status === 'absent').length,
    leaveDays: daily.filter(day => day.status === 'leave').length,
    notRecordedDays: daily.filter(day => day.status === 'not_recorded').length,
    attendanceDays: daily.filter(day => day.status === 'present' || day.status === 'half_day').length,
    totalSeconds: daily.reduce((sum, day) => sum + (day.seconds ?? 0), 0),
    untimedPaidDays: daily.filter(day => day.seconds === null && (day.status === 'present' || day.status === 'half_day')).length,
  };
}
export type StaffSalarySheet = ReturnType<typeof buildStaffSalarySheet>;
export function salaryTime(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(value)) : '—';
}
export function salarySheetText(sheet: StaffSalarySheet, restaurant: string) {
  return [restaurant, `MONTHLY SALARY SHEET / ${sheet.month}`, `Employee: ${sheet.staff.name}`, `Position: ${sheet.staff.role}`,
    `Base salary: BDT ${sheet.staff.baseSalary} / ${sheet.staff.salaryType}`, sheet.staff.salaryType === 'hourly' ? 'Hourly pay: rate / 3600 per recorded working second.' : sheet.staff.salaryType === 'daily' ? 'Daily pay: one daily rate per Present day; half rate per Half Day.' : 'Monthly pay: salary / 30 per Present day; half rate per Half Day.',
    `Attendance: ${sheet.attendanceDays} days (${sheet.presentDays} present, ${sheet.halfDays} half days)`,
    `Absent: ${sheet.absentDays} | Unpaid leave: ${sheet.leaveDays} | Not recorded: ${sheet.notRecordedDays}`,
    `Recorded paid work time: ${durationClock(sheet.totalSeconds)}`, `Older paid records without timed hours: ${sheet.untimedPaidDays}`,
    `Total earned: BDT ${sheet.earned.toFixed(2)}`,
    `Total paid salary: BDT ${sheet.paid.toFixed(2)}`, `Remaining due: BDT ${sheet.remainingDue.toFixed(2)}`,
    `Paid above current earnings: BDT ${sheet.overpaid.toFixed(2)}`,
    '', 'SALARY PAYMENT HISTORY', 'PAYMENT DATE | METHOD | PAID (BDT)',
    ...sheet.payments.map(payment => `${payment.date} | ${payment.paymentMode} | ${payment.amount.toFixed(2)}`),
    ...(sheet.payments.length ? [] : ['No salary payments recorded for this month.']),
    `TOTAL PAID: BDT ${sheet.paid.toFixed(2)}`, `SALARY STILL TO PAY: BDT ${sheet.remainingDue.toFixed(2)}`,
    '', 'DATE | ATTENDANCE | CHECK-IN | PAID TIME | EARNED (BDT)',
    ...sheet.daily.map(day => `${day.date} | ${day.status.replaceAll('_', ' ')} | ${salaryTime(day.checkedInAt)} | ${day.seconds === null ? 'Not timed' : durationClock(day.seconds)} | ${day.earned.toFixed(4)}`),
    '', `Generated: ${sheet.generatedAt}`, 'Times: Asia/Dhaka. Hours include only recorded scheduled paid time. No hours are invented for older attendance.',
    'Month totals are summed before rounding. This sheet is a calculation, not a confirmation of payment.'].join('\n');
}
