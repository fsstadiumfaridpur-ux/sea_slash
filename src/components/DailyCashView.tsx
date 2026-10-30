import { DailyCashPrintPreview } from './DailyCashPrintPreview';
import { useEffect, useState } from 'react';
import { loadCashFloat, addCashFloat } from '../lib/dailyCash';
import { NumericInput } from './NumericInput';
import type { DailySalesRecord, MonthlyExpenseItem, FoodCourtSettings } from '../types';
import { calculateDailyCash } from '../utils/dailyCash';
import { formatBDT } from '../utils/formatters';

interface Props {
  settings: FoodCourtSettings;
  sales: DailySalesRecord[];
  expenses: MonthlyExpenseItem[];
  date: string;
  onEditSales: (record: DailySalesRecord) => void;
  onDateChange: (date: string) => void;
}

export function DailyCashView({ sales, expenses, date, onDateChange, onEditSales, settings }: Props) {
  const [printOpen, setPrintOpen] = useState(false);
  const [cashFloat, setCashFloat] = useState(0);
  const [draftFloat, setDraftFloat] = useState(0);
  const [loadedDate, setLoadedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [pending,setPending]=useState<{date:string;amount:number;previous:number;total:number;id:string}|null>(null);
  const [alreadyApplied,setAlreadyApplied]=useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoadedDate(''); setError(''); setSaved(false); setCashFloat(0); setDraftFloat(0); setPending(null); setRequestId(crypto.randomUUID());
    loadCashFloat(date).then(amount => {
      if (!cancelled) { setCashFloat(amount); setDraftFloat(0); setLoadedDate(date); }
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load change float.'); });
    return () => { cancelled = true; };
  }, [date]);
  const ready = loadedDate === date;
  const totals = calculateDailyCash(sales, expenses, date, ready ? cashFloat : 0);
  return (
    <div role="tabpanel" id="expense-cash-panel" aria-labelledby="expense-cash-tab" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Daily Cash</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track the cash available to receive from the shop each day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!ready || saving || draftFloat !== 0} title={draftFloat !== 0 ? "Save or clear the cash top-up before printing" : "Preview a thermal receipt with all daily expenses"} onClick={() => setPrintOpen(true)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Print Daily Cash</button><input type="date" aria-label="Daily cash date" required disabled={saving || !!pending} value={date} onChange={event => { if (event.target.value) onDateChange(event.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white" /></div>
      </div>
      {printOpen && <DailyCashPrintPreview date={date} sales={sales} expenses={expenses} settings={settings} openingCash={cashFloat} onClose={() => setPrintOpen(false)} />}
      <form onSubmit={async event => {
        event.preventDefault(); if(!ready||saving||pending)return; setSaving(true); setError(''); setSaved(false);
        try {
          if(!Number.isFinite(draftFloat)||draftFloat<=0||draftFloat>1e12||Math.abs(draftFloat*100-Math.round(draftFloat*100))>0.0001)throw new Error('Enter a positive cash top-up with up to two decimal places.');
          const previous=await loadCashFloat(date);setCashFloat(previous);
          setPending({date,amount:draftFloat,previous,total:Math.round((previous+draftFloat)*100)/100,id:requestId});
        }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save change float.'); }
        finally { setSaving(false); }
      }} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <fieldset disabled={!ready || saving || !!pending} className="space-y-3">
          <h3 className="block text-sm font-semibold text-slate-900 dark:text-white">Opening Cash / Change Float</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">Enter only the extra change cash you are supplying now. It will be added to this date’s saved float, including top-ups during the day. This does not count as sales or profit. Cash cannot be taken back through this control.</p>
          <p className="text-sm font-medium">Saved opening / change float: {ready?formatBDT(cashFloat):'—'}</p>
          <label htmlFor="daily-change-float" className="block text-xs text-slate-500">Additional cash to add (BDT)</label>
          <div className="flex flex-wrap gap-3">
            <NumericInput id="daily-change-float" required min={0.01} step="0.01" value={draftFloat} onChange={event => { setDraftFloat(Number(event.target.value)); setSaved(false); setRequestId(crypto.randomUUID()); }} className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-slate-900 dark:border-slate-700 dark:text-white" />
            <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Add Change Float'}</button>
          </div>
        </fieldset>
        {!ready && !error && <p role="status" className="mt-3 text-sm text-slate-500">Loading change float…</p>}
        {saved && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{alreadyApplied?'This cash top-up was already saved.':'Cash top-up saved.'} Total opening / change float for {date}: {formatBDT(cashFloat)}.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      </form>
      {pending&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="float-confirm-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 dark:bg-slate-950">
        <h3 id="float-confirm-title" className="text-lg font-semibold">Add to opening / change float?</h3>
        <p className="text-sm">This will add {formatBDT(pending.amount)} to the saved amount for {pending.date}.</p>
        <div className="rounded-lg bg-amber-50 p-4 font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100">{formatBDT(pending.previous)} + {formatBDT(pending.amount)} = {formatBDT(pending.total)}</div>
        <p className="text-sm text-slate-500">The new total opening / change float will be {formatBDT(pending.total)}. This adds cash; it does not replace or withdraw the saved amount.</p>
        <div className="flex justify-end gap-3"><button autoFocus type="button" disabled={saving} onClick={()=>setPending(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button type="button" disabled={saving} onClick={async()=>{
          if(saving)return;setSaving(true);setError('');
          try{const result=await addCashFloat(pending.date,pending.amount,pending.previous,pending.id);setCashFloat(result.total);setDraftFloat(0);setAlreadyApplied(result.alreadyApplied);setRequestId(crypto.randomUUID());setSaved(true);setPending(null);}
          catch(failure){setError(failure instanceof Error?failure.message:'Could not add change float.');setPending(null);try{setCashFloat(await loadCashFloat(pending.date));}catch{/* Keep the last confirmed total; the error stays visible. */}}
          finally{setSaving(false);}
        }} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{saving?'Saving…':'OK, add cash'}</button></div>
      </div></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Software Sales', amount: totals.totalSales, detail: 'All recorded payment methods' },
          { label: 'Total Daily Expenses', amount: totals.totalExpenses, detail: 'All expenses recorded on this date' },
          { label: 'Remaining Cash Balance', amount: totals.cashInHand, detail: 'Change float + cash sales − cash-box expenses' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">{item.label}</p>
            <p className={`mt-2 text-2xl font-bold ${item.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{item.label === 'Remaining Cash Balance' && (!ready || totals.invalidBreakdown) ? '—' : formatBDT(item.amount)}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Payments Outside the Cash Box</h3>
          {sales.find(record => record.date === date) && <button type="button" onClick={() => onEditSales(sales.find(record => record.date === date)!)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Edit Payment Breakdown</button>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {[['Bank Transfer', totals.bankSales], ['bKash', totals.bkashSales], ['Nagad', totals.nagadSales], ['Card', totals.cardSales]].map(([label, amount]) => <div key={label}><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{formatBDT(Number(amount))}</dd></div>)}
        </dl>
        <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">Software sales {formatBDT(totals.totalSales)} − digital payments {formatBDT(totals.digitalSales)} = cash sales {formatBDT(totals.cashSales)}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Enter every digital payment to get an accurate cash-box balance. Each payment must appear once, even if bKash, Nagad, or card funds later settle into your bank.</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
        <h3 className="font-semibold text-slate-900 dark:text-white">Cash in Hand (Including Change Float)</h3>
        <p className={`mt-2 text-3xl font-bold ${totals.cashInHand < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-800 dark:text-amber-300'}`}>{ready && !totals.invalidBreakdown ? formatBDT(totals.cashInHand) : '—'}</p>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">Change float {ready ? formatBDT(totals.openingCash) : '—'} + cash sales {formatBDT(totals.cashSales)} − cash expenses {formatBDT(totals.cashExpenses)}</p>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Expected physical cash in the till, including the money you supplied for change. Digital payments, unpaid purchases, and previous cash handovers are excluded.</p>
        {totals.cashInHand < 0 && <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">Cash expenses exceed change float plus cash sales by {formatBDT(-totals.cashInHand)}.</p>}
      </div>
      {totals.invalidBreakdown && <p role="alert" className="text-sm text-rose-600">Digital payments exceed software sales. Correct the payment breakdown to calculate the cash balance.</p>}
      {!totals.hasSales && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">No software sales recorded for this date. Record sales in Daily P&amp;L to calculate the day’s balance.</p>}
      {totals.unpaidExpenses > 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Daily expenses include {formatBDT(totals.unpaidExpenses)} in unpaid purchases. These reduce the remaining balance but do not reduce cash in hand.</p>}
      {totals.unknownExpenses > 0 && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Expenses of {formatBDT(totals.unknownExpenses)} have an unknown payment method. Confirm their payment methods to make cash in hand accurate.</p>}
    </div>
  );
}
