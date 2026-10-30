import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { StaffSalarySheet } from '../utils/staffSalarySheet';
import { salaryTime } from '../utils/staffSalarySheet';
import { durationClock } from '../utils/staffShiftEarnings';
import { formatBDT } from '../utils/formatters';
import {printStaffSalarySheet} from '../utils/staffSalaryPrint';
import { downloadStaffSalaryExcel } from '../utils/staffSalaryExcel';

export function StaffSalarySheetView({ sheet, restaurant, onRecordPayment }: { sheet: StaffSalarySheet; restaurant: string; onRecordPayment?: () => void }) {
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  return <section className="space-y-4" aria-label={`Monthly salary sheet for ${sheet.staff.name}`}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">{sheet.staff.name} · {sheet.month}</h3><p className="text-xs text-slate-500">{sheet.staff.role} · Base salary {formatBDT(sheet.staff.baseSalary)} / {sheet.staff.salaryType}</p></div><div className="flex gap-2">
      <button type="button" onClick={() => { try { printStaffSalarySheet(sheet, restaurant); } catch (cause) { setError((cause as Error).message); } }} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><Printer size={16} />Print Sheet</button>
      <button type="button" disabled={exporting} onClick={async () => { setExporting(true); setError(''); try { await downloadStaffSalaryExcel([sheet],restaurant); } catch (cause) { setError((cause as Error).message); } finally { setExporting(false); } }} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"><Download size={16} />{exporting ? 'Exporting...' : 'Export Excel'}</button>
    </div></header>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Total salary earned',formatBDT(sheet.earned)], ['Total paid salary',formatBDT(sheet.paid)], ['Salary still to pay',formatBDT(sheet.remainingDue)], ['Total attendance', `${sheet.attendanceDays} days`], ['Recorded paid work time',sheet.totalSeconds === 0 && sheet.untimedPaidDays > 0 ? 'Not timed' : durationClock(sheet.totalSeconds)], ['Present / Half days',`${sheet.presentDays} / ${sheet.halfDays}`], ['Absent / Unpaid leave',`${sheet.absentDays} / ${sheet.leaveDays}`]].map(([label,value]) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <p className="text-xs text-slate-500">{sheet.staff.salaryType === 'hourly' ? 'Hourly rate ÷ 3,600 × recorded working seconds within scheduled hours.' : sheet.staff.salaryType === 'daily' ? 'Daily rate × attendance days. Present pays one day; Half Day pays half.' : 'Monthly salary ÷ 30 × attendance days. Present pays one day; Half Day pays half.'} Absent and unpaid leave pay zero. Not recorded: {sheet.notRecordedDays} days. Attendance without timed hours: {sheet.untimedPaidDays} days.</p>
    {sheet.overpaid > 0 && <p className="text-sm text-amber-700">Paid above current earnings: {formatBDT(sheet.overpaid)}</p>}
    <section aria-label="Salary payment history" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">Salary payment history</h4>{onRecordPayment && <button type="button" onClick={onRecordPayment} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">Record salary payment</button>}</div>
      <p className="text-xs text-slate-500">All payments assigned to this salary month, including earlier staff payment records.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">{['Payment date','Method','Amount paid'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>
        {sheet.payments.map(payment=><tr key={payment.id} className="border-b border-slate-200 dark:border-slate-800"><td className="p-3">{payment.date}</td><td className="p-3 capitalize">{payment.paymentMode === 'bkash' ? 'bKash' : payment.paymentMode === 'unknown' ? 'Not recorded' : payment.paymentMode}</td><td className="p-3 font-mono">{formatBDT(payment.amount)}</td></tr>)}
        {!sheet.payments.length && <tr><td colSpan={3} className="p-3 text-slate-500">No salary payments recorded for this month.</td></tr>}
      </tbody><tfoot><tr className="font-semibold"><td colSpan={2} className="p-3">Total paid salary</td><td className="p-3 font-mono">{formatBDT(sheet.paid)}</td></tr><tr className="font-semibold"><td colSpan={2} className="p-3">Salary still to pay</td><td className="p-3 font-mono">{formatBDT(sheet.remainingDue)}</td></tr></tfoot></table></div>
    </section>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">{['Date','Attendance','Check-in (Dhaka)','Paid work time','Salary earned'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>
      {sheet.daily.map(day => <tr key={day.date} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap p-3">{day.date}</td><td className="whitespace-nowrap p-3 capitalize">{day.status.replaceAll('_',' ')}</td><td className="whitespace-nowrap p-3">{salaryTime(day.checkedInAt)}</td><td className="whitespace-nowrap p-3 font-mono">{day.seconds === null ? 'Not timed' : durationClock(day.seconds)}</td><td className="whitespace-nowrap p-3 font-mono">{formatBDT(day.earned)}</td></tr>)}
      {!sheet.daily.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No elapsed employment days in this month.</td></tr>}
    </tbody></table></div>
    <p className="text-xs text-slate-500">Working time is shown only where recorded. Monthly earnings are summed before rounding. This sheet does not record a salary payment.</p>
  </section>;
}
