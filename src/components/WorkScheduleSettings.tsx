import { useEffect, useState } from 'react';
import { loadWorkSchedule, saveWorkSchedule } from '../lib/workSchedule';
import { defaultWorkSchedule, type WorkSchedule } from '../utils/staffShiftEarnings';

export function WorkScheduleSettings({ isAdmin }: { isAdmin: boolean }) {
  const [schedule, setSchedule] = useState<WorkSchedule>(defaultWorkSchedule);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let cancelled = false; loadWorkSchedule().then(value => { if (!cancelled) setSchedule(value); }).catch(cause => { if (!cancelled) setError(cause.message); }); return () => { cancelled = true; }; }, []);
  return <form onSubmit={async event => {
    event.preventDefault(); if (!isAdmin || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setSchedule(await saveWorkSchedule(schedule)); setMessage('Shift hours saved. They apply to new check-ins.'); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <h3 className="text-sm font-semibold">Office Hours & Live Salary</h3>
    <p className="text-xs text-slate-500">Monthly salary ÷ 30 per Present day; daily staff receive their daily rate. Hourly staff earn rate ÷ 3,600 per working second, from check-in within the shift until closing. Times use Bangladesh time.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Shift start<input aria-label="Shift start" type="time" required disabled={!isAdmin || busy} value={schedule.start} onChange={event => setSchedule({ ...schedule, start: event.target.value })} className="staff-input mt-1 block" /></label>
      <label className="text-sm">Shift end<input aria-label="Shift end" type="time" required disabled={!isAdmin || busy} value={schedule.end} onChange={event => setSchedule({ ...schedule, end: event.target.value })} className="staff-input mt-1 block" /></label>
      {isAdmin && <button disabled={busy} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Saving...' : 'Save Shift Hours'}</button>}
    </div>
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </form>;
}
