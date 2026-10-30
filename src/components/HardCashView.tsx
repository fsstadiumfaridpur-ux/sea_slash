import {useEffect,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,RefreshCw,Trash2,Wallet} from 'lucide-react';
import {addHardCash,deleteHardCash,loadHardCash,type HardCashEntry,type HardCashSnapshot} from '../lib/hardCash';
import {formatBDT,formatDatePretty,getTodayString} from '../utils/formatters';
import {NumericInput} from './NumericInput';
const field='mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
export function HardCashView(){
  const [snapshot,setSnapshot]=useState<HardCashSnapshot|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [date,setDate]=useState(getTodayString);
  const [direction,setDirection]=useState<'in'|'out'>('in');
  const [amount,setAmount]=useState(0);
  const [reason,setReason]=useState('');
  const [reasonOpen,setReasonOpen]=useState(false);
  const [reasonIndex,setReasonIndex]=useState(-1);
  const normalizeReason=(value:string)=>value.normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const query=normalizeReason(reason);
  const lastWord=query.split(' ').at(-1)??'';
  const seenReasons=new Set<string>();
  const reasonSuggestions=(snapshot?.entries??[]).map(entry=>entry.reason.trim()).filter(value=>{
    const normalized=normalizeReason(value);
    if(!normalized||seenReasons.has(normalized))return false;
    seenReasons.add(normalized);
    return normalized!==query&&(!query||normalized.includes(query)||(lastWord.length>1&&normalized.includes(lastWord)));
  }).slice(0,6);
  const chooseReason=(value:string)=>{setReason(value);setReasonOpen(false);setReasonIndex(-1);};
  const [entryId,setEntryId]=useState(()=>crypto.randomUUID());
  const [deleting,setDeleting]=useState<HardCashEntry|null>(null);
  const [notice,setNotice]=useState('');
  useEffect(()=>{let active=true;loadHardCash().then(data=>{if(active)setSnapshot(data);}).catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function refresh(){setLoading(true);setError('');try{setSnapshot(await loadHardCash());}catch(cause){setError(cause instanceof Error?cause.message:'Could not load Hard Cash.');}finally{setLoading(false);}}
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-semibold"><Wallet size={22}/>Hard Cash</h1><p className="mt-1 text-sm text-slate-500">Admin only · Record physical cash movements and their reasons.</p></div><button type="button" disabled={loading||busy} onClick={refresh} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-40"><RefreshCw size={16}/>Refresh</button></div>
    {error&&!deleting&&<p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-sm font-medium">Total cash balance</p><p className="mt-2 text-3xl font-bold tabular-nums">{snapshot?formatBDT(snapshot.balance):loading?'Loading…':'—'}</p>{snapshot&&<p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>Money in: {formatBDT(snapshot.totalIn)}</span><span>Money out: {formatBDT(snapshot.totalOut)}</span></p>}</div>
    <form onSubmit={async event=>{
      event.preventDefault();if(busy||!snapshot)return;setBusy(true);setError('');setNotice('');
      try{if(!Number.isFinite(amount)||amount<=0||amount>999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.0001)throw new Error('Enter a positive amount with at most two decimal places.');if(!reason.trim())throw new Error('Enter a reason.');setSnapshot(await addHardCash({id:entryId,date,direction,amount,reason:reason.trim()}));setAmount(0);setReason('');setReasonOpen(false);setReasonIndex(-1);setEntryId(crypto.randomUUID());setNotice('Cash entry saved.');}
      catch(cause){setError(cause instanceof Error?cause.message:'Could not save cash entry.');}finally{setBusy(false);}
    }} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="font-semibold">Record money in / out</h2>
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm">Date<input required type="date" value={date} onChange={e=>setDate(e.target.value)} className={field}/></label><label className="text-sm">Transaction<select value={direction} onChange={e=>setDirection(e.target.value as 'in'|'out')} className={field}><option value="in">+ Money in</option><option value="out">− Money out</option></select></label><label className="text-sm">Amount (BDT)<NumericInput required min="0.01" max="999999999.99" step="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))} className={field}/></label></div>
      <div className="relative" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){setReasonOpen(false);setReasonIndex(-1);}}}>
        <label className="block text-sm">Reason<input required maxLength={500} value={reason} role="combobox" aria-autocomplete="list" aria-expanded={reasonOpen&&reasonSuggestions.length>0} aria-controls="hard-cash-reasons" aria-activedescendant={reasonOpen&&reasonIndex>=0&&reasonIndex<reasonSuggestions.length?`hard-cash-reason-${reasonIndex}`:undefined} autoComplete="off" onFocus={()=>setReasonOpen(true)} onChange={e=>{setReason(e.target.value);setReasonOpen(true);setReasonIndex(-1);}} onKeyDown={event=>{
          if(event.key==='Escape'){setReasonOpen(false);setReasonIndex(-1);return;}
          if(!reasonSuggestions.length)return;
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setReasonOpen(true);setReasonIndex(index=>event.key==='ArrowDown'?(index+1)%reasonSuggestions.length:(index<=0?reasonSuggestions.length-1:index-1));}
          if(event.key==='Enter'&&reasonOpen&&reasonIndex>=0&&reasonIndex<reasonSuggestions.length){event.preventDefault();chooseReason(reasonSuggestions[reasonIndex]);}
        }} placeholder="e.g. Opening cash, cash deposit, supplier payment" className={field}/></label>
        {reasonOpen&&reasonSuggestions.length>0&&<div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"><p className="px-3 py-2 text-xs text-slate-500">Previously used reasons</p><div id="hard-cash-reasons" role="listbox" aria-label="Previously used cash reasons" className="max-h-56 overflow-y-auto">{reasonSuggestions.map((value,index)=><button id={`hard-cash-reason-${index}`} key={normalizeReason(value)} type="button" role="option" aria-selected={reasonIndex===index} onMouseDown={event=>event.preventDefault()} onClick={()=>chooseReason(value)} className={`block w-full break-words px-3 py-2.5 text-left text-sm hover:bg-amber-50 dark:hover:bg-slate-800 ${reasonIndex===index?'bg-amber-50 dark:bg-slate-800':''}`}>{value}</button>)}</div></div>}
      </div>
      <button disabled={busy||loading||!snapshot} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{busy?'Saving…':'Save transaction'}</button>
      <p className="text-xs text-slate-500">Starts at ৳0. Add your opening cash as Money in. Sales and expenses are not added automatically.</p>
    </form>
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><h2 className="mb-3 font-semibold">Transaction history</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-800">{['Date','Reason','Money in','Money out','Actions'].map(label=><th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody>{snapshot?.entries.map(entry=><tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-3 py-3">{formatDatePretty(entry.date)}</td><td className="min-w-44 max-w-sm break-words px-3 py-3">{entry.reason}</td><td className="whitespace-nowrap px-3 py-3 text-emerald-700 dark:text-emerald-400">{entry.direction==='in'?<span className="inline-flex items-center gap-1"><ArrowDownLeft size={15}/>+{formatBDT(entry.amount)}</span>:'—'}</td><td className="whitespace-nowrap px-3 py-3 text-red-600 dark:text-red-400">{entry.direction==='out'?<span className="inline-flex items-center gap-1"><ArrowUpRight size={15}/>−{formatBDT(entry.amount)}</span>:'—'}</td><td className="px-3 py-3"><button type="button" disabled={busy||loading} aria-label={`Delete ${entry.reason}`} title="Delete cash transaction" onClick={()=>{setError('');setNotice('');setDeleting(entry);}} className="rounded-md p-2 text-red-600 disabled:opacity-40"><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>{snapshot&&!snapshot.entries.length&&<p className="py-8 text-center text-sm text-slate-500">No cash transactions yet.</p>}</section>
    {deleting&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="cash-delete-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 dark:bg-slate-950"><h2 id="cash-delete-title" className="text-lg font-semibold">Delete cash transaction?</h2><p className="break-words text-sm">{deleting.reason} · {formatDatePretty(deleting.date)} · {deleting.direction==='in'?'+':'−'}{formatBDT(deleting.amount)}</p><p className="text-sm text-slate-500">This permanently removes the transaction and recalculates your cash balance.</p>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button autoFocus type="button" disabled={busy} onClick={()=>{setDeleting(null);setError('');}} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button type="button" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{setSnapshot(await deleteHardCash(deleting.id));setDeleting(null);setNotice('Cash transaction deleted.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not delete transaction.');}finally{setBusy(false);}}} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy?'Deleting…':'Delete transaction'}</button></div></div></div>}
  </section>;
}
