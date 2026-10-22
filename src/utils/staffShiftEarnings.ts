import type { AttendanceRecord, StaffMember } from '../types';

export interface WorkSchedule { start: string; end: string }
export const defaultWorkSchedule: WorkSchedule = { start: '11:00', end: '23:00' };
export function validWorkSchedule(value: WorkSchedule): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.end) && value.start !== value.end;
}
export function shiftEarnings(record: AttendanceRecord, now = Date.now()) {
  const start = Math.max(Date.parse(record.checkedInAt ?? ''), Date.parse(record.shiftStartAt ?? ''));
  const end = Date.parse(record.shiftEndAt ?? '');
  const shiftStart = Date.parse(record.shiftStartAt ?? '');
  const rate = record.salaryPerSecond;
  const cap = record.status === 'present' ? 1 : record.status === 'half_day' ? 0.5 : 0;
  if (![start, end, shiftStart, rate].every(value => typeof value === 'number' && Number.isFinite(value)) || end <= shiftStart || (rate ?? -1) < 0) return null;
  const scheduledSeconds = (end - shiftStart) / 1000;
  const elapsedSeconds = Math.min(Math.max(0, Math.floor((Math.min(now, end) - start) / 1000)), scheduledSeconds * cap);
  return { elapsedSeconds, earned: elapsedSeconds * rate!, rate: rate!, scheduledSeconds, dailyPay: scheduledSeconds * rate!, finished: now >= end || elapsedSeconds >= scheduledSeconds * cap };
}
export function durationClock(seconds: number): string {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60].map(n => String(n).padStart(2, '0')).join(':');
}

export function attendancePay(staff: Pick<StaffMember,'salaryType'|'baseSalary'>, record: AttendanceRecord, now=Date.now()) {
  const timed = shiftEarnings(record,now);
  const fraction = record.status === 'present' ? 1 : record.status === 'half_day' ? 0.5 : 0;
  const dailyRate = timed?.dailyPay ?? (staff.salaryType === 'daily' ? staff.baseSalary : staff.baseSalary/30);
  return {timed, effectiveDays: staff.salaryType === 'hourly' ? (timed ? timed.elapsedSeconds/timed.scheduledSeconds : 0) : fraction,
    earned: staff.salaryType === 'hourly' ? (timed?.earned ?? 0) : dailyRate*fraction};
}

export function correctAttendanceHourlyRate<T extends AttendanceRecord>(record:T, hourlyRate:number):T {
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) throw new Error('Enter a positive hourly rate.');
  if (!shiftEarnings(record)) throw new Error('A timed attendance record is required.');
  return {...record, salaryPerSecond:hourlyRate/3600};
}

export function checkinAvailability(window: { checkInOpensAt?: string; checkInClosesAt?: string }, now: number) {
  const opens = Date.parse(window.checkInOpensAt ?? '');
  const closes = Date.parse(window.checkInClosesAt ?? '');
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens) return 'unconfigured';
  if (now < opens) return 'before';
  return now >= closes ? 'closed' : 'open';
}

export function staffScheduledHours(staff:Pick<StaffMember,'salaryType'|'hourlyWorkSchedule'>,fallback=12):number {
  const schedule=staff.salaryType==='hourly'?staff.hourlyWorkSchedule:undefined;
  if(!schedule||!validWorkSchedule(schedule))return fallback;
  const minutes=(value:string)=>{const [hours,mins]=value.split(':').map(Number);return hours*60+mins;};
  return ((minutes(schedule.end)-minutes(schedule.start)+1440)%1440)/60;
}
