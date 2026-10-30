import {Trash2} from 'lucide-react';
import {isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import type {DailySalesRecord,MonthlyExpenseItem,ExpenseCategory} from '../types';
import type {Vendor} from './VendorsView';
import {NumericInput} from './NumericInput';
import {addBkashTransfer,deleteBkashTransfer,loadBkashSnapshot,setBkashOpening} from '../lib/bkashAccount';
import {bkashHistory,type BkashAccount} from '../utils/bkashAccount';
import {exportToCSV,formatBDT,getTodayString} from '../utils/formatters';

interface Props {summaryTarget:HTMLElement|null;isAdmin:boolean;expanded:boolean;onOpen:()=>void;sales:DailySalesRecord[];expenses:MonthlyExpenseItem[];vendors:Vendor[];onAddExpense:(expense:MonthlyExpenseItem)=>Promise<void>;onDeleteExpense:(id:string)=>Promise<void>}
const input='mt-1 block w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700';
const button='rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700 disabled:opacity-50';
export function BkashAccountView({summaryTarget,isAdmin,expanded,onOpen,sales,expenses,vendors,onAddExpense,onDeleteExpense}:Props){
  const [deleting,setDeleting]=useState<{id:string;description:string;signed:number;kind:'transfer'|'expense'}|null>(null);
  const today=getTodayString();
  const [account,setAccount]=useState<BkashAccount|null>(null);
  const [sources,setSources]=useState<{sales:DailySalesRecord[];expenses:MonthlyExpenseItem[]}>({sales,expenses});
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [openingDate,setOpeningDate]=useState(today);const [openingAmount,setOpeningAmount]=useState(0);
  const [mode,setMode]=useState<'in'|'out'|'vendor'|null>(null);
  const [date,setDate]=useState(today);const [amount,setAmount]=useState(0);const [description,setDescription]=useState('');const [reference,setReference]=useState('');
  const [vendorId,setVendorId]=useState('');const [category,setCategory]=useState<ExpenseCategory>('ingredients');
  const [draftId,setDraftId]=useState('');
  const [month,setMonth]=useRememberedViewState('bkash.historyMonth','',value=>value===''||isViewMonth(value));
  const reload=async()=>{try{const next=await loadBkashSnapshot();setAccount(next.account);setSources(next);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Could not load bKash account.');}};
  useEffect(()=>{let cancelled=false;setSources({sales,expenses});const refresh=async()=>{try{const next=await loadBkashSnapshot();if(!cancelled){setAccount(next.account);setSources(next);setError('');}}catch(cause){if(!cancelled)setError(cause instanceof Error?cause.message:'Could not load bKash account.');}};void refresh();const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',refresh);};},[sales,expenses]);
  const totals=useMemo(()=>account?bkashHistory(account,sources.sales,sources.expenses,today):null,[account,sources,today]);
  const history=totals?.rows.filter(row=>!month||row.date.startsWith(`${month}-`)).slice().reverse()??[];
  const startForm=(next:'in'|'out'|'vendor')=>{if(next!=='vendor'&&!isAdmin)return;setMode(next);setDate(today);setAmount(0);setDescription('');setReference('');setVendorId(vendors[0]?.id??'');setCategory('ingredients');setDraftId(`bkash-${crypto.randomUUID()}`);setError('');setNotice('');};
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!account?.opening||!mode)return;setBusy(true);setError('');setNotice('');
    try{
      if(mode!=='vendor'&&!isAdmin)throw new Error('Only an administrator can add money or transfer out manually.');
      if(!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)/100-amount)>1e-7)throw new Error('Enter an amount greater than zero with up to two decimal places.');
      if(date<account.opening.date||date>today)throw new Error('Choose a date within the account tracking period.');
      if(mode==='vendor'){
        const vendor=vendors.find(row=>row.id===vendorId);if(!vendor)throw new Error('Select a vendor.');
        await onAddExpense({id:draftId,date,month:date.slice(0,7),category,title:'Vendor payment (bKash)',amount,paymentMode:'bkash',vendorId:vendor.id,vendor:vendor.name,notes:description.trim(),paymentReference:reference.trim(),isRecurring:false});
      }else setAccount(await addBkashTransfer({id:draftId,date,direction:mode,amount,description:description.trim(),reference:reference.trim()}));
      setNotice(mode==='vendor'?'Vendor payment recorded. bKash balance and vendor due updated.':'bKash transfer recorded.');setMode(null);setDraftId(`bkash-${crypto.randomUUID()}`);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not record transaction.');}finally{setBusy(false);}
  };
  return <>
    {summaryTarget&&createPortal(<button type="button" onClick={onOpen} title="View bKash transaction history" className="min-w-44 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2.5 text-right dark:border-pink-900 dark:bg-slate-900"><span className="block text-xs font-semibold text-pink-800 dark:text-pink-200">bKash account balance</span><span className={`mt-1 block font-mono text-2xl font-bold ${totals?.balance!==null&&(totals?.balance??0)<0?'text-rose-600':'text-pink-700 dark:text-pink-300'}`}>{totals?.balance==null?'—':formatBDT(totals.balance)}</span>{!account?.opening&&<span className="mt-1 block text-xs text-slate-500">{account?'Set opening balance':'Loading…'}</span>}</button>,summaryTarget)}
    {(expanded||error||notice)&&<section role={expanded?'tabpanel':'region'} id="expense-bkash-panel" aria-labelledby={expanded?'expense-bkash-tab':undefined} aria-label={expanded?undefined:'bKash account messages'} className="space-y-4">
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {expanded&&<>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{account?.opening?`From ${account.opening.date} · Opening ${formatBDT(account.opening.amount)} · Received +${formatBDT(totals?.incoming??0)} · Paid / transferred −${formatBDT(totals?.outgoing??0)}`:account?'Opening balance not set.':'Loading bKash account…'}</p><button type="button" disabled={busy} className={button} onClick={()=>void reload()}>Reload bKash account</button></div>
      {account&&!account.opening&&(isAdmin?<form className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{if(openingDate>today)throw new Error('Opening date cannot be in the future.');setAccount(await setBkashOpening(openingDate,openingAmount));setNotice('bKash opening balance saved.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not save opening balance.');}finally{setBusy(false);}}}>
        <h3 className="font-semibold">Set opening balance</h3><p className="text-xs text-slate-500">Enter the balance before any sales or payments on the start date. Transactions before this date are excluded.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tracking start date<input required type="date" max={today} value={openingDate} onChange={event=>setOpeningDate(event.target.value)} className={input}/></label><label className="text-sm">Opening bKash balance (BDT)<NumericInput min="0" step="0.01" required value={openingAmount} onChange={event=>setOpeningAmount(Number(event.target.value))} className={input}/></label></div><button disabled={busy} className={button}>Save bKash opening balance</button>
      </form>:<p className="text-sm text-slate-500">Ask admin to set the opening balance before recording bKash transfers.</p>)}
      {account?.opening&&<>
        <div className="flex flex-wrap gap-2">{isAdmin&&<><button type="button" disabled={busy} className={button} onClick={()=>startForm('in')}>+ Add money</button><button type="button" disabled={busy} className={button} onClick={()=>startForm('out')}>− Transfer out</button></>}<button type="button" disabled={busy||!vendors.length} className="rounded-md bg-pink-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>startForm('vendor')}>Record vendor payment</button></div>
        <p className="text-xs text-slate-500">bKash sales and bKash expenses appear automatically. Only admins can use Add money and Transfer out for manual deposits and transfers.</p>
        {mode&&(isAdmin||mode==='vendor')&&<form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{mode==='vendor'?'Record vendor payment by bKash':mode==='in'?'Record money added to bKash':'Record transfer out of bKash'}</h3><fieldset disabled={busy} className="space-y-3">
          {mode==='vendor'&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Vendor<select required value={vendorId} onChange={event=>setVendorId(event.target.value)} className={input}><option value="">Select vendor</option>{vendors.map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="text-sm">Expense category<select value={category} onChange={event=>setCategory(event.target.value as ExpenseCategory)} className={input}>{[['ingredients','Food ingredients'],['packaging','Packaging'],['gas_utilities','Gas & utilities'],['ice_beverage','Ice & beverages'],['transport','Transport'],['maintenance','Cleaning & maintenance'],['other','Other']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Transaction date<input required type="date" min={account.opening.date} max={today} value={date} onChange={event=>setDate(event.target.value)} className={input}/></label><label className="text-sm">Amount (BDT)<NumericInput required min="0.01" step="0.01" value={amount} onChange={event=>setAmount(Number(event.target.value))} className={input}/></label></div>
          <label className="block text-sm">{mode==='vendor'?'Payment notes':'Description'}<input required={mode!=='vendor'} maxLength={500} value={description} onChange={event=>setDescription(event.target.value)} className={input}/></label><label className="block text-sm">bKash transaction reference (optional)<input maxLength={200} value={reference} onChange={event=>setReference(event.target.value)} className={input}/></label>
          <div className="flex gap-2"><button type="submit" className={button}>{busy?'Saving…':'Save bKash transaction'}</button><button type="button" className={button} onClick={()=>setMode(null)}>Cancel</button></div>
        </fieldset></form>}
        {(totals?.balance??0)<0&&<p role="status" className="text-sm text-rose-600">Recorded payments exceed the available bKash balance by {formatBDT(-(totals?.balance??0))}. Check for missing incoming money or incorrect payment methods.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">bKash transaction history</h3><div className="flex flex-wrap gap-2"><label className="text-xs">History month<input aria-label="bKash history month" type="month" value={month} onChange={event=>setMonth(event.target.value)} className={input}/></label><button type="button" className={button} onClick={()=>setMonth('')}>All dates</button><button type="button" className={button} onClick={()=>exportToCSV('bKash_transactions',history.map(row=>({Date:row.date,Description:row.description,Reference:row.reference,Type:row.kind,MoneyIn:row.signed>0?row.signed:0,MoneyOut:row.signed<0?-row.signed:0,Balance:row.balance})))}>Export history</button></div></div>
        <p className="text-xs text-slate-500">Sales receipts are daily totals. Running balances use date order; same-day entries are grouped by source.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500">{['Date','Transaction','Reference','+ Money in','− Money out','Running balance',...(isAdmin?['Actions']:[])].map(label=><th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{history.map(row=><tr key={row.id} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3">{row.description}<span className="mt-1 block text-xs capitalize text-slate-500">{row.kind}</span></td><td className="p-3">{row.reference||'—'}</td><td className="whitespace-nowrap p-3 font-mono text-emerald-700">{row.signed>0?`+${formatBDT(row.signed)}`:'—'}</td><td className="whitespace-nowrap p-3 font-mono text-rose-600">{row.signed<0?`−${formatBDT(-row.signed)}`:'—'}</td><td className="whitespace-nowrap p-3 font-mono font-semibold">{formatBDT(row.balance)}</td>{isAdmin&&<td className="p-3">{(row.kind==='transfer'||(row.kind==='expense'&&sources.expenses.some(expense=>!expense.source&&`expense:${expense.id}`===row.id)))?<button type="button" disabled={busy} aria-label={`Delete ${row.description}`} title="Delete bKash transaction (Admin only)" onClick={()=>{setError('');setNotice('');setDeleting({id:row.id,description:row.description,signed:row.signed,kind:row.kind as 'transfer'|'expense'});}} className="rounded-md p-2 text-rose-600 disabled:opacity-40"><Trash2 size={17}/></button>:<span className="text-xs text-slate-500">{row.kind==='sale'?'Manage in Sales':row.kind==='expense'?'Manage original payment':'Opening balance'}</span>}</td>}</tr>)}{!history.length&&<tr><td colSpan={isAdmin?7:6} className="p-5 text-slate-500">No bKash transactions for this selection.</td></tr>}</tbody></table></div>
      </>}
    </>}
  </section>}
  {deleting&&isAdmin&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="bkash-delete-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 dark:bg-slate-950">
    <h2 id="bkash-delete-title" className="text-lg font-semibold">Delete bKash transaction?</h2><p className="break-words text-sm">{deleting.description} · {formatBDT(Math.abs(deleting.signed))}</p><p className="text-sm text-slate-500">This permanently removes the {deleting.kind==='expense'?'original Daily Expense payment, updates expense totals and any vendor, salary or commission balance linked to it':'transfer'} and recalculates your bKash balance.</p>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-3"><button autoFocus type="button" disabled={busy} className={button} onClick={()=>{setDeleting(null);setError('');}}>Cancel</button><button type="button" disabled={busy} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={async()=>{
      if(!isAdmin||busy)return;setBusy(true);setError('');
      try{
        if(deleting.kind==='transfer'){
          const transfer=account?.transfers.find(row=>`transfer:${row.id}`===deleting.id);if(!transfer)throw new Error('Transfer no longer exists. Reload the account.');
          setAccount(await deleteBkashTransfer(transfer));
        }else{
          const expense=sources.expenses.find(row=>!row.source&&`expense:${row.id}`===deleting.id);if(!expense)throw new Error('Original payment no longer exists. Reload the account.');
          await onDeleteExpense(expense.id);
          setSources(current=>({...current,expenses:current.expenses.filter(row=>row.id!==expense.id)}));
        }
        setDeleting(null);setNotice('bKash transaction deleted. Balance updated.');
      }catch(cause){setError(cause instanceof Error?cause.message:'Could not delete bKash transaction.');}finally{setBusy(false);}
    }}>{busy?'Deleting…':'Delete transaction'}</button></div>
  </div></div>}
  </>;
}
