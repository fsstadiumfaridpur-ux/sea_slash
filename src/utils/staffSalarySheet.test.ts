import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildStaffSalarySheet, salarySheetText } from './staffSalarySheet';
import { buildStaffSalaryExcel } from './staffSalaryExcel';
import type { StaffMember, StaffAttendance, StaffAdvance, MonthlyExpenseItem } from '../types';
const staff: StaffMember = {id:'s',name:'=Chef One',role:'Chef',phone:'',salaryType:'monthly',baseSalary:30000,joinDate:'2026-10-01',active:true};
const now = Date.parse('2026-10-07T23:00:00+06:00');
const row = (date:string,status:StaffAttendance['status']='present',timed=true):StaffAttendance => ({id:date,staffId:'s',date,status,advancePaid:0,overtimeHours:0,...(timed ? {checkedInAt:`${date}T11:00:00+06:00`,shiftStartAt:`${date}T11:00:00+06:00`,shiftEndAt:`${date}T23:00:00+06:00`,salaryPerSecond:1000/43200} : {})});
const records=[row('2026-10-01'),row('2026-10-02'),row('2026-10-03','half_day'),row('2026-10-04','present',false),row('2026-10-05','absent'),row('2026-10-06','leave'),row('2026-10-08')];
const advances:StaffAdvance[]=[{id:'a',staffId:'s',date:'2026-10-03',amount:300,reason:'Advance',repaid:false},{id:'other',staffId:'other',date:'2026-10-03',amount:900,reason:'',repaid:false}];
const expenses=[{id:'pay',category:'payroll',staffId:'s',salaryMonth:'2026-10',date:'2026-10-07',amount:500,paymentMode:'cash'}, {id:'credit',category:'payroll',staffId:'s',salaryMonth:'2026-10',date:'2026-10-07',amount:999,paymentMode:'credit'}, {id:'other',category:'payroll',staffId:'other',salaryMonth:'2026-10',date:'2026-10-07',amount:999,paymentMode:'cash'}] as MonthlyExpenseItem[];
test('sheet daily rows and totals use day pay for monthly and daily staff, seconds for hourly staff',()=>{
 const clock=Date.parse('2026-10-01T11:00:01+06:00');
 const present=row('2026-10-01');
 for (const member of [staff,{...staff,salaryType:'daily' as const,baseSalary:1000}]) {
   const sheet=buildStaffSalarySheet(member,[present],[],[],'2026-10',clock);
   assert.equal(sheet.earned,1000);assert.equal(sheet.daily[0].earned,1000);assert.equal(sheet.totalSeconds,1);assert.equal(sheet.effectiveDays,1);
 }
 const hourly=buildStaffSalarySheet({...staff,salaryType:'hourly',baseSalary:66.67},[{...present,salaryPerSecond:66.67/3600}],[],[],'2026-10',clock);
 assert.equal(hourly.earned,0.02);assert.equal(hourly.daily[0].earned,66.67/3600);
});
test('monthly sheets count attendance and recorded hours without inventing legacy hours or future earnings', () => {
 const sheet=buildStaffSalarySheet(staff,records,advances,expenses,'2026-10',now);
 assert.equal(sheet.attendanceDays,4); assert.equal(sheet.presentDays,3); assert.equal(sheet.halfDays,1);
 assert.equal(sheet.absentDays,1); assert.equal(sheet.leaveDays,1); assert.equal(sheet.notRecordedDays,1);
 assert.equal(sheet.totalSeconds,30*3600); assert.equal(sheet.untimedPaidDays,1);
 assert.equal(sheet.earned,3500); assert.equal(sheet.totalAdvance,300); assert.equal(sheet.paid,800); assert.equal(sheet.remainingDue,2700);
 assert.equal(sheet.daily.length,7);
 assert.match(salarySheetText(sheet,'Mughal Mahal'),/Recorded paid work time: 30:00:00/);
 assert.match(salarySheetText(sheet,'Mughal Mahal'),/Remaining due: BDT 2700.00/);
});
test('salary sheets deduplicate attendance and respect employment dates, past months and overpayments', () => {
 const sheet=buildStaffSalarySheet({...staff,joinDate:'2026-10-02',terminationDate:'2026-10-03'},[...records,row('2026-10-02','absent')],[],[{...expenses[0],amount:800}],'2026-10',now);
 assert.equal(sheet.attendanceDays,1); assert.equal(sheet.absentDays,1); assert.equal(sheet.totalSeconds,21600);
 assert.equal(sheet.earned,500); assert.equal(sheet.remainingDue,0); assert.equal(sheet.overpaid,300);
 assert.equal(buildStaffSalarySheet(staff,records,[],[],'2026-09',now).daily.length,0);
 assert.equal(buildStaffSalarySheet(staff,records,[],[],'2026-11',now).earned,0);
 assert.throws(() => buildStaffSalarySheet(staff,records,[],[],'2026-99',now),/valid salary month/);
});
test('Excel includes per-staff daily sheets, numeric earnings and durations exceeding 24 hours',async () => {
 const sheet=buildStaffSalarySheet(staff,records,advances,expenses,'2026-10',now);
 const buffer=await buildStaffSalaryExcel([sheet,{...sheet,staff:{...staff,id:'second',name:'Chef Two'}}],'Mughal Mahal');
 const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as any);
 const summary=workbook.getWorksheet('Salary Summary')!;
 assert.equal(workbook.worksheets.length,5); assert.equal(summary.getCell('A2').value,'=Chef One');
 const serial=(value:unknown) => value instanceof Date ? value.getTime()/86400000+25569 : value;
 assert.equal(serial(summary.getCell('J2').value),1.25); assert.equal(summary.getCell('J2').numFmt,'[h]:mm:ss');
 assert.equal(summary.getCell('L2').value,3500); assert.equal(summary.getCell('M2').value,800); assert.equal(summary.getCell('N2').value,2700);
 const daily=workbook.getWorksheet('Staff 1')!;
 assert.equal(daily.getCell('F8').value,'Not timed'); assert.equal(daily.getCell('G5').value,1000);
 assert.equal(serial(daily.lastRow!.getCell(6).value),1.25); assert.equal(daily.lastRow!.getCell(7).value,3500);
 const paymentSheet=workbook.getWorksheet('Payments 1')!;
 assert.equal(paymentSheet.getCell('C2').value,300);assert.equal(paymentSheet.getCell('C3').value,500);
 assert.equal(paymentSheet.getCell('C4').value,800);assert.equal(paymentSheet.lastRow!.getCell(3).value,2700);
});

test('advances and salary payments form one total paid without double deductions or projected duplicates',()=>{
 const monthNow=Date.parse('2026-10-31T23:59:00+06:00');
 const attendance=Array.from({length:25},(_,index)=>row(`2026-10-${String(index+1).padStart(2,'0')}`,'present',false));
 const paidAdvances:StaffAdvance[]=[{id:'a1',staffId:'s',date:'2026-10-03',amount:10000,reason:'Paid early',repaid:false},{id:'a2',staffId:'s',date:'2026-10-10',amount:2000,reason:'Paid early',repaid:false}];
 const payments=[{...expenses[0],id:'salary1',amount:5000},{...expenses[0],id:'salary2',amount:3000},{...expenses[0],id:'projection',source:'advance',sourceId:'a1',amount:10000},{...expenses[0],id:'unpaid-credit',paymentMode:'credit',amount:9999}] as MonthlyExpenseItem[];
 const sheet=buildStaffSalarySheet(staff,attendance,paidAdvances,payments,'2026-10',monthNow);
 assert.equal(sheet.earned,25000);assert.equal(sheet.paid,20000);assert.equal(sheet.remainingDue,5000);assert.equal(sheet.overpaid,0);
 assert.equal(sheet.payments.length,4);assert.equal(sheet.payments.reduce((sum,payment)=>sum+payment.amount,0),20000);
 assert.deepEqual(sheet.payments.map(payment=>payment.amount),[10000,5000,3000,2000]);
 assert.match(salarySheetText(sheet,'Mughal Mahal'),/Total paid salary: BDT 20000.00/);
 assert.match(salarySheetText(sheet,'Mughal Mahal'),/SALARY PAYMENT HISTORY/);
 assert.match(salarySheetText(sheet,'Mughal Mahal'),/SALARY STILL TO PAY: BDT 5000.00/);
 assert.doesNotMatch(salarySheetText(sheet,'Mughal Mahal'),/advance/i);
 const exceeded=buildStaffSalarySheet(staff,[],paidAdvances,payments,'2026-10',monthNow);assert.equal(exceeded.overpaid,20000);assert.equal(exceeded.remainingDue,0);
 const returned=buildStaffSalarySheet(staff,attendance,[...paidAdvances,{id:'returned',staffId:'s',date:'2026-10-03',amount:500,repaid:true,reason:'Returned'}],payments,'2026-10',monthNow);assert.equal(returned.paid,20000);
});
