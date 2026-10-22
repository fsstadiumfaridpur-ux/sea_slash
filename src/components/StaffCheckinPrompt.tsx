import { Check } from 'lucide-react';
import type { StaffCheckinStatus } from '../lib/staff';
import { checkinAvailability } from '../utils/staffShiftEarnings';

export function StaffCheckinPrompt({ record, now, busy, onCheckIn }: { record: StaffCheckinStatus; now: number; busy: boolean; onCheckIn: () => void }) {
  const availability = checkinAvailability(record,now);
  const openingTime = record.nextCheckInOpensAt ?? record.checkInOpensAt;
  const openingLabel = openingTime && Number.isFinite(Date.parse(openingTime)) ? new Intl.DateTimeFormat('en-BD', {timeZone:'Asia/Dhaka',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(openingTime)) : '';
  const message = record.status ? `Your attendance is marked ${record.status.replace('_', ' ')}. Ask the admin or manager to correct it before continuing.`
    : availability === 'open' ? 'Check in to start your shift. Earnings begin at the scheduled start time.'
    : availability === 'unconfigured' ? 'Check-in schedule setup is required. Ask admin to run the updated supabase-attendance-checkin.sql.'
    : `Check-in ${availability === 'before' ? 'opens' : 'is closed. Next opening:'} ${openingLabel} (Bangladesh time), 10 minutes before the shift starts.`;
  return <>
    <p className="text-sm">{message}</p>
    <button type="button" disabled={busy || !!record.status || availability !== 'open'} onClick={onCheckIn} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"><Check size={18} />{busy ? 'Saving Attendance...' : availability === 'open' ? 'Check In Today' : 'Check-in Unavailable'}</button>
  </>;
}
