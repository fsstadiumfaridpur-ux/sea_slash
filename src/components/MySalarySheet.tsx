import {isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import { useEffect, useState } from 'react';
import { getMySalarySheetData, type MySalarySheetData } from '../lib/staffSalarySheet';
import { buildStaffSalarySheet } from '../utils/staffSalarySheet';
import { getTodayString } from '../utils/formatters';
import { StaffSalarySheetView } from './StaffSalarySheetView';

export function MySalarySheet() {
  const [open,setOpen] = useState(false);
  const [month,setMonth] = useRememberedViewState('mySalary.month',getTodayString().slice(0,7),isViewMonth);
  const [data,setData] = useState<MySalarySheetData | null>(null);
  const [error,setError] = useState('');
  const [now,setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    let cancelled=false;
    let inFlight=false;
    let anchorServer=Date.now(); let anchorLocal=performance.now();
    const refresh=async () => {
      if (inFlight) return; inFlight=true;
      try { const result=await getMySalarySheetData(); if (!cancelled) { setData(result); setError(''); anchorServer=Date.parse(result.serverNow); anchorLocal=performance.now(); setNow(anchorServer); } }
      catch (cause) { if (!cancelled) setError((cause as Error).message); }
      finally { inFlight=false; }
    };
    void refresh();
    const refreshTimer=window.setInterval(refresh,30000);
    const clockTimer=window.setInterval(() => setNow(anchorServer+performance.now()-anchorLocal),1000);
    window.addEventListener('focus',refresh);
    return () => { cancelled=true; window.clearInterval(refreshTimer); window.clearInterval(clockTimer); window.removeEventListener('focus',refresh); };
  },[open]);
  return <section className="border-b border-slate-200 bg-white px-4 py-3 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
    <div className="mx-auto max-w-7xl space-y-4"><button type="button" aria-expanded={open} aria-controls="my-monthly-salary-sheet" onClick={() => setOpen(value => !value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{open ? 'Close My Salary Sheet' : 'My Monthly Earnings & Salary Sheet'}</button>
      {open && <div id="my-monthly-salary-sheet" className="space-y-4">
        <label className="block max-w-52 text-sm">Salary Month<input aria-label="My salary month" type="month" required max={getTodayString().slice(0,7)} value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="staff-input mt-1 block" /></label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {!data && !error && <p role="status" className="text-sm text-slate-500">Loading your salary sheet...</p>}
        {data && <StaffSalarySheetView sheet={buildStaffSalarySheet(data.profile,data.attendance,data.advances,data.expenses,month,now)} restaurant="Sea Slash" />}
      </div>}
    </div>
  </section>;
}
