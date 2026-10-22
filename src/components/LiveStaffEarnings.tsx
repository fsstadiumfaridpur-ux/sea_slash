import { useEffect, useState } from 'react';
import type { StaffCheckinStatus } from '../lib/staff';
import { attendancePay, durationClock } from '../utils/staffShiftEarnings';
import { getMySalarySheetData } from '../lib/staffSalarySheet';
import type { StaffMember } from '../types';

export function LiveStaffEarnings({ record }: { record: StaffCheckinStatus }) {
  const [profile,setProfile] = useState<StaffMember | null>(null);
  const [profileError,setProfileError] = useState('');
  useEffect(() => {
    let cancelled=false;
    void getMySalarySheetData().then(data => { if (!cancelled) { setProfile(data.profile); setProfileError(''); } }).catch(() => { if (!cancelled) setProfileError('Could not load your salary basis. Refresh to try again.'); });
    return () => {cancelled=true;};
  },[record.serverNow]);
  const [clock, setClock] = useState(() => ({ server: Date.parse(record.serverNow ?? '') || Date.now(), local: performance.now(), now: Date.parse(record.serverNow ?? '') || Date.now() }));
  useEffect(() => {
    const server = Date.parse(record.serverNow ?? '') || Date.now();
    const local = performance.now();
    setClock({ server, local, now: server });
    const tick = () => setClock({ server, local, now: server + performance.now() - local });
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [record.serverNow]);
  const pay = profile && record.attendance && attendancePay(profile, record.attendance, clock.now);
  const result = pay?.timed;
  if (!pay || !profile) return <aside className="border-b border-slate-200 bg-amber-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">{record.name} · {profileError || 'Loading attendance earnings…'}</aside>;
  const hourly = profile.salaryType === 'hourly';
  const time = (value?: string) => value ? new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
  return <aside aria-label="My live shift earnings" className="border-b border-emerald-200 bg-emerald-50 px-4 py-4 text-slate-900 dark:border-emerald-900 dark:bg-slate-900 dark:text-white">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">{record.name} · {hourly ? result?.finished ? 'Shift earnings' : 'Live shift earnings' : 'Attendance day earnings'}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{record.date} · {time(record.attendance?.shiftStartAt)}–{time(record.attendance?.shiftEndAt)} · Checked in {time(record.attendance?.checkedInAt)}</p></div>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><div><p className="text-xs text-slate-500">Recorded work time</p><p className="font-mono text-lg font-semibold" role="timer">{result ? durationClock(result.elapsedSeconds) : 'Not timed'}</p></div><div><p className="text-xs text-slate-500">{hourly ? 'Earned this shift' : 'Earned this day'}</p><p className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-400">৳{pay.earned.toFixed(hourly ? 4 : 2)}</p></div><div className="text-xs text-slate-500">{hourly ? result ? <><p>৳{result.rate.toFixed(8)} / second</p><p className="mt-1">Full shift: ৳{result.dailyPay.toFixed(2)}</p></> : <p>Timed check-in required for hourly earnings.</p> : <p>{profile.salaryType === 'monthly' ? 'Monthly salary ÷ 30 per Present day' : 'Daily rate per Present day'}<br />Half Day pays half; absence and leave pay zero.</p>}</div></div>
    </div>
  </aside>;
}
