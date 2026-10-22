import type { StaffSalarySheet } from './staffSalarySheet';
import { salaryTime } from './staffSalarySheet';

export async function buildStaffSalaryExcel(sheets: StaffSalarySheet[], restaurant: string) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = restaurant;
  const summary = workbook.addWorksheet('Salary Summary');
  summary.columns = ['Staff', 'Position', 'Month', 'Attendance Days', 'Present Days', 'Half Days', 'Absent Days', 'Unpaid Leave', 'Not Recorded', 'Paid Work Time', 'Untimed Paid Days', 'Total Earned (BDT)', 'Total Paid Salary (BDT)', 'Remaining Due (BDT)', 'Paid Above Earnings (BDT)', 'Generated At'].map(header => ({header, width: header.length > 18 ? 26 : 20}));
  for (const [index, sheet] of sheets.entries()) {
    summary.addRow([sheet.staff.name, sheet.staff.role, sheet.month, sheet.attendanceDays, sheet.presentDays, sheet.halfDays, sheet.absentDays, sheet.leaveDays, sheet.notRecordedDays, sheet.totalSeconds / 86400, sheet.untimedPaidDays, sheet.earned, sheet.paid, sheet.remainingDue, sheet.overpaid, sheet.generatedAt]);
    const daily = workbook.addWorksheet(`Staff ${index + 1}`);
    daily.addRow([restaurant, sheet.staff.name, sheet.month]);
    daily.addRow(['Generated at', sheet.generatedAt]);
    daily.addRow(['Older attendance without timed records has no invented working hours. Monthly totals are summed before rounding.']);
    daily.addRow(['Date', 'Attendance', 'Check-in (Dhaka)', 'Shift Start (Dhaka)', 'Shift End (Dhaka)', 'Paid Work Time', 'Earned (BDT)']);
    for (const day of sheet.daily) daily.addRow([day.date, day.status.replaceAll('_', ' '), salaryTime(day.checkedInAt), salaryTime(day.shiftStartAt), salaryTime(day.shiftEndAt), day.seconds === null ? 'Not timed' : day.seconds / 86400, day.earned]);
    daily.addRow(['TOTAL', '', '', '', '', sheet.totalSeconds / 86400, sheet.earned]);
    daily.columns.forEach((col, i) => { col.width = i === 1 ? 26 : 22; });
    daily.getColumn(6).numFmt = '[h]:mm:ss'; daily.getColumn(7).numFmt = '#,##0.0000';
    daily.getRow(4).font = { bold: true }; daily.views = [{state:'frozen',ySplit:4}];
    const payments = workbook.addWorksheet(`Payments ${index + 1}`);
    payments.columns = [{header:'Payment Date',width:20},{header:'Method',width:20},{header:'Amount Paid (BDT)',width:26}];
    for (const payment of sheet.payments) payments.addRow([payment.date,payment.paymentMode,payment.amount]);
    payments.addRow(['TOTAL PAID','',sheet.paid]);
    payments.addRow(['TOTAL SALARY EARNED','',sheet.earned]);
    payments.addRow(['SALARY STILL TO PAY','',sheet.remainingDue]);
    payments.getColumn(3).numFmt = '#,##0.00'; payments.getRow(1).font = {bold:true};
    payments.views = [{state:'frozen',ySplit:1}];
  }
  const sum = (field: keyof StaffSalarySheet) => sheets.reduce((total,sheet) => total + Number(sheet[field]),0);
  summary.addRow(['TOTAL','',sheets[0]?.month ?? '',sum('attendanceDays'),sum('presentDays'),sum('halfDays'),sum('absentDays'),sum('leaveDays'),sum('notRecordedDays'),sum('totalSeconds')/86400,sum('untimedPaidDays'),sum('earned'),sum('paid'),sum('remainingDue'),sum('overpaid')]);
  summary.lastRow!.font = {bold:true};
  summary.getColumn(10).numFmt = '[h]:mm:ss';
  for (let col = 12; col <= 15; col++) summary.getColumn(col).numFmt = '#,##0.00';
  summary.getRow(1).font = {bold:true}; summary.views = [{state:'frozen',ySplit:1}];
  summary.autoFilter = {from:{row:1,column:1},to:{row:Math.max(1,summary.rowCount),column:16}};
  return workbook.xlsx.writeBuffer();
}
export async function downloadStaffSalaryExcel(sheets: StaffSalarySheet[], restaurant: string) {
  const buffer = await buildStaffSalaryExcel(sheets, restaurant);
  const url = URL.createObjectURL(new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link = document.createElement('a'); link.href = url; link.download = `Salary_${sheets[0]?.month ?? 'monthly'}_${sheets.length === 1 ? sheets[0].staff.name.replace(/[^\p{L}\p{N} -]/gu,'').slice(0,60) : 'All_Staff'}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
