import type { StaffAttendance, StaffMember } from '../types';
import { attendancePay, durationClock } from '../utils/staffShiftEarnings';

function attendanceTime(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(value));
}

export function AttendanceEarningsCells({ staff, attendance, now, onCorrectRate }: { staff:StaffMember; attendance?: StaffAttendance; now: number; onCorrectRate?: () => void }) {
  const pay = attendance && attendancePay(staff,attendance,now);
  const earnings = pay?.timed;
  return <>
    <td className="whitespace-nowrap p-3 font-mono text-xs">{attendanceTime(attendance?.checkedInAt)}</td>
    <td className="whitespace-nowrap p-3 text-xs text-slate-500">{attendance?.shiftStartAt && attendance.shiftEndAt ? <>{attendanceTime(attendance.shiftStartAt)}–{attendanceTime(attendance.shiftEndAt)}</> : '—'}</td>
    <td className="whitespace-nowrap p-3 font-mono tabular-nums">{earnings ? durationClock(earnings.elapsedSeconds) : '—'}</td>
    <td className="p-3">
      {pay && (staff.salaryType !== 'hourly' || earnings) ? <><p className="whitespace-nowrap font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">৳{pay.earned.toFixed(staff.salaryType === 'hourly' ? 4 : 2)}</p><p className="mt-1 whitespace-nowrap text-xs text-slate-500">{staff.salaryType !== 'hourly' ? 'Attendance day pay' : earnings && <>{earnings.finished ? 'Stopped' : now < Date.parse(attendance!.shiftStartAt!) || now < Date.parse(attendance!.checkedInAt!) ? 'Not started' : 'Earning'} · ৳{earnings.rate.toFixed(8)}/sec</>}</p></> : <span className="text-xs text-slate-500">{attendance ? 'No timed check-in recorded' : 'Not checked in'}</span>}
      {earnings && onCorrectRate && <button type="button" onClick={onCorrectRate} className="mt-2 text-xs font-medium text-amber-700 underline dark:text-amber-400">Correct hourly rate</button>}
    </td>
  </>;
}
