import type { StaffMember, StaffAttendance, StaffAdvance } from '../types';
import { roundMoney } from './money';
import { attendancePay } from './staffShiftEarnings';

export function calculateStaffEarnings(staff: StaffMember, attendance: StaffAttendance[], advances: StaffAdvance[], month: string, now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const byDate = new Map<string, StaffAttendance>();
  for (const record of attendance) {
    if (record.staffId === staff.id && record.date.startsWith(`${month}-`) && record.date <= today && record.date >= staff.joinDate &&
        (!staff.terminationDate || record.date <= staff.terminationDate)) byDate.set(record.date, record);
  }
  const effectiveDays = [...byDate.values()].reduce((sum, record) => {
    return sum + attendancePay(staff,record,now).effectiveDays;
  }, 0);
  const earned = roundMoney([...byDate.values()].reduce((sum, record) => {
    return sum + attendancePay(staff,record,now).earned;
  }, 0));
  const totalAdvance = roundMoney(advances.filter(a => a.staffId === staff.id && a.date.startsWith(`${month}-`) && !a.repaid).reduce((sum, a) => sum + a.amount, 0));
  return { effectiveDays, earned, totalAdvance, netPayable: roundMoney(Math.max(0, earned - totalAdvance)), advanceBalance: roundMoney(Math.max(0, totalAdvance - earned)) };
}

export function generateStaffAgreement(staff: StaffMember, restaurant: string, terms: string): string {
  return [restaurant, 'STAFF AGREEMENT', '', `Employee: ${staff.name}`, `Position: ${staff.role}`,
    `Start date: ${staff.joinDate}`, `Base pay: BDT ${staff.baseSalary} per ${staff.salaryType === 'hourly' ? 'hour' : staff.salaryType === 'daily' ? 'day' : 'month'}`,
    '', terms.trim()].join('\n');
}

export function printStaffDocument(title: string, content: string) {
  const popup = window.open('', '_blank', 'width=800,height=900');
  if (!popup) throw new Error('Allow pop-ups to print this document.');
  popup.document.title = title;
  const style = popup.document.createElement('style');
  style.textContent = 'body{font-family:Arial,sans-serif;line-height:1.6;margin:40px;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:15mm}}';
  popup.document.head.append(style);
  const text = popup.document.createElement('pre');
  text.textContent = content;
  popup.document.body.append(text);
  popup.document.close();
  popup.focus();
  popup.print();
}
