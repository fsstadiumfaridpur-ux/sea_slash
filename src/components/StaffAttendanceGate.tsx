import { StaffCheckinPrompt } from './StaffCheckinPrompt';
import { MySalarySheet } from './MySalarySheet';
import { LiveStaffEarnings } from './LiveStaffEarnings';
import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { checkInStaff, getStaffCheckinStatus, type StaffCheckinStatus } from '../lib/staff';
import { RestaurantLogo } from './RestaurantLogo';

export function StaffAttendanceGate({ children, onLogout }: { children: ReactNode; onLogout: () => Promise<void> }) {
  const [record, setRecord] = useState<StaffCheckinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const server = Date.parse(record?.serverNow ?? '');
    const local = performance.now();
    const anchor = Number.isFinite(server) ? server : Date.now();
    setNow(anchor);
    const timer = window.setInterval(() => setNow(anchor + performance.now() - local),1000);
    return () => window.clearInterval(timer);
  },[record?.serverNow]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const next = await getStaffCheckinStatus();
        if (!cancelled) { setRecord(next); setError(''); }
      } catch (failure) {
        if (!cancelled) { setRecord(null); setError(failure instanceof Error ? failure.message : 'Could not check attendance.'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    const onFocus = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [revision]);

  async function checkIn() {
    setBusy(true); setError('');
    try { setRecord(await checkInStaff()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Attendance could not be saved.'); }
    finally { setBusy(false); }
  }

  if (!loading && record && (record.status === 'present' || record.status === 'half_day')) return <><LiveStaffEarnings record={record} /><MySalarySheet />{children}</>;
  return <main className="app-shell flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <section className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <RestaurantLogo large />
      <div><h1 className="text-xl font-semibold">Today's Attendance</h1>{record && <p className="mt-2 break-words text-sm text-slate-500 dark:text-slate-400">{record.name} / {record.date}</p>}</div>
      {loading ? <p role="status" className="text-sm">Checking attendance...</p> : record && <StaffCheckinPrompt record={record} now={now} busy={busy} onCheckIn={checkIn} />}
      {!loading && record && <MySalarySheet />}
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex flex-wrap justify-between gap-3"><button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setRecord(null); setRevision(value => value + 1); }} className="flex items-center gap-2 px-2 py-3 text-sm disabled:opacity-50"><RefreshCw size={16} />Refresh</button><button type="button" disabled={busy} onClick={() => onLogout().catch(failure => setError(failure.message))} className="flex items-center gap-2 px-2 py-3 text-sm disabled:opacity-50"><LogOut size={16} />Sign Out</button></div>
    </section>
  </main>;
}
