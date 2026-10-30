import test from 'node:test';import assert from 'node:assert/strict';
import {buildStaffSalarySheet} from './staffSalarySheet';import {staffSalarySheetHtml} from './staffSalaryPrint';
import type {StaffMember,StaffAttendance,MonthlyExpenseItem} from '../types';
const staff:StaffMember={id:'employee',name:'Employee <script>alert(1)</script>',role:'Kitchen Supervisor',phone:'',salaryType:'monthly',baseSalary:30000,joinDate:'2026-10-01',active:true};
const attendance:StaffAttendance[]=Array.from({length:31},(_,i)=>({id:`a-${i}`,staffId:staff.id,date:`2026-10-${String(i+1).padStart(2,'0')}`,status:'present',advancePaid:0,overtimeHours:0}));
const payments:MonthlyExpenseItem[]=Array.from({length:45},(_,i)=>({id:`p-${i}`,category:'payroll',date:'2026-10-22',staffId:staff.id,salaryMonth:'2026-10',amount:100+i,paymentMode:i%2?'cash':'bkash'} as MonthlyExpenseItem));
const sheet=(expenses:MonthlyExpenseItem[]=[])=>buildStaffSalarySheet(staff,attendance,[],expenses,'2026-10',Date.parse('2026-11-01T00:00:00+06:00'));
test('salary print uses escaped structured tables, exact earned/paid/due totals and Dhaka dates',()=>{
 const data=sheet(payments.slice(0,4));const html=staffSalarySheetHtml(data,'Mughal & Mahal');
 assert.match(html,/Mughal &amp; Mahal/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/Employee &lt;script&gt;/);assert.doesNotMatch(html,/<pre/);
 assert.match(html,/October 2026/);assert.match(html,/BDT 31,000.00/);assert.match(html,/BDT 406.00/);assert.match(html,/BDT 30,594.00/);
 assert.match(html,/Prepared by/);assert.match(html,/Employee signature/);assert.match(html,/Asia\/Dhaka/);assert.match(html,/Not timed/);assert.match(html,/Page 2 of 2/);
 assert.match(html,/@page\{size:A4 portrait/);assert.match(html,/display:table-header-group/);assert.match(html,/bKash/);assert.doesNotMatch(html,/advance/i);
});
test('long payment history prints every payment once and all 31 attendance dates across numbered pages',()=>{
 const html=staffSalarySheetHtml(sheet(payments),'Sea Slash');
 for(let i=0;i<45;i++)assert.equal(html.split(`<td class="money">BDT ${(100+i).toFixed(2)}</td>`).length-1,1);
 for(let i=1;i<=31;i++)assert.match(html,new RegExp(`<td>${String(i).padStart(2,'0')} Oct</td>`));
 assert.match(html,/First 6 of 45 payments/);assert.match(html,/Payments 7–30 of 45/);assert.match(html,/Payments 31–45 of 45/);assert.match(html,/Page 4 of 4/);
});
test('empty and hourly sheets retain payment empty states, seconds-based detail and overpayment disclosure',()=>{
 const data=buildStaffSalarySheet({...staff,salaryType:'hourly',baseSalary:66.67},[],[],[],'2026-10',Date.parse('2026-10-01T12:00:00+06:00'));
 const html=staffSalarySheetHtml({...data,paid:100,overpaid:100},'Sea Slash');
 assert.match(html,/BDT 66.67 \/ hour/);assert.match(html,/Hourly rate ÷ 3,600/);assert.match(html,/No salary payments recorded/);assert.match(html,/Paid above current earnings/);assert.match(html,/BDT 100.00/);
});
