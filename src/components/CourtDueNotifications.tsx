import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { CourtDueNotice } from '../utils/courtStatement';
import { formatBDT } from '../utils/formatters';

interface Props {
  notices: CourtDueNotice[];
  onOpenStatement: (month: string) => void;
}

export function CourtDueNotifications({ notices, onOpenStatement }: Props) {
  const [open, setOpen] = useState(false);
  return <div className="relative">
    <button type="button" aria-label={`Payment notifications: ${notices.length} due`} aria-expanded={open} aria-controls="court-due-notifications" onClick={() => setOpen(value => !value)} className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <Bell size={18} />
      {notices.length > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{notices.length}</span>}
    </button>
    {open && <section id="court-due-notifications" aria-label="Rent and commission payment notifications" className="absolute right-0 z-50 mt-3 w-[min(20rem,85vw)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Payment Reminders</h2><button type="button" aria-label="Close payment notifications" onClick={() => setOpen(false)}><X size={16} /></button></div>
      {notices.length ? <><p className="mt-2 text-xs text-slate-500">Unpaid rent and commission, including the current month’s accrued amounts.</p><ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">{notices.map(notice => <li key={`${notice.date ?? notice.month}-${notice.category}`}><button type="button" onClick={() => { onOpenStatement(notice.month); setOpen(false); }} className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm dark:border-amber-800 dark:bg-amber-950/30"><span className="block font-semibold">{notice.label} · {notice.date ?? notice.month}</span><span className="mt-1 block font-mono text-rose-700 dark:text-rose-400">{formatBDT(notice.amount)}</span><span className="mt-1 block text-xs text-slate-500">View statement →</span></button></li>)}</ul></> : <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">All tracked rent and commission payments are settled.</p>}
    </section>}
  </div>;
}
