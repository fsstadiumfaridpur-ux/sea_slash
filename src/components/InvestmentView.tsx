import {InvestmentFundingPanel} from './InvestmentFundingPanel';
import { NumericInput } from './NumericInput';
import { useEffect, useState } from 'react';
import { Download, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { deleteInvestment, loadInvestments, recordInvestment } from '../lib/investments';
import { investmentCategories, investmentTotals, type InvestmentEntry } from '../utils/investments';
import { formatBDT, getTodayString } from '../utils/formatters';

const blankEntry = (): InvestmentEntry => ({ id: crypto.randomUUID(), date: getTodayString(), description: '', category: 'Equipment', amount: 0, notes: '' });
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

export function InvestmentView({readOnly=false}:{readOnly?:boolean}={}) {
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<InvestmentEntry | null>(null);
  const [search, setSearch] = useState('');
  async function reload() {
    setLoading(true);
    setReady(false);
    setError('');
    try { setEntries(await loadInvestments()); setReady(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load investments.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    loadInvestments().then(rows => { if (!cancelled) { setEntries(rows); setReady(true); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load investments.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const totals = investmentTotals(entries);
  const visible = entries.filter(entry => `${entry.description} ${entry.category} ${entry.notes}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError('');
    try { setEntries(await recordInvestment({ ...draft, description: draft.description.trim(), notes: draft.notes.trim() })); setDraft(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save investment.'); }
    finally { setBusy(false); }
  }
  async function remove(entry: InvestmentEntry) {
    if (!confirm(`Delete investment "${entry.description}" (${formatBDT(entry.amount)})?`)) return;
    setBusy(true); setError('');
    try { setEntries(await deleteInvestment(entry.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete investment.'); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    const escape = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const lines = [['Date', 'Description', 'Category', 'Amount (BDT)', 'Notes'], ...entries.map(entry => [entry.date, entry.description, entry.category, entry.amount, entry.notes]), ['', 'Total investment', '', totals.total, '']];
    const url = URL.createObjectURL(new Blob([lines.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `sea-slash-investments-${getTodayString()}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Total Investment</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Investment costs & partner contributions</p></div>
      <div className="flex items-center gap-2">
        <button title="Refresh investment records" aria-label="Refresh investment records" disabled={loading || busy} onClick={reload} className="rounded-md border border-slate-300 p-2 disabled:opacity-40 dark:border-slate-700"><RefreshCw size={18} /></button>
        <button title="Export investments" aria-label="Export investments" disabled={!ready || busy || !entries.length} onClick={exportCsv} className="rounded-md border border-slate-300 p-2 disabled:opacity-40 dark:border-slate-700"><Download size={18} /></button>
        {!readOnly&&<button disabled={!ready || busy} onClick={() => { setError(''); setDraft(blankEntry()); }} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Plus size={18} />Add Investment</button>}
      </div>
    </div>
    {error && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-400">{error}</p>}
    <InvestmentFundingPanel readOnly={readOnly} costs={totals.total}/>
    {loading ? <p role="status">Loading investments...</p> : ready && <>
      <div className="grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-3 dark:border-slate-800">
        <div><p className="text-sm text-slate-500 dark:text-slate-400">Recorded Investment Costs</p><p className="mt-1 break-words text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{formatBDT(totals.total)}</p></div>
        <div><p className="text-sm text-slate-500 dark:text-slate-400">Investment Entries</p><p className="mt-1 text-2xl font-semibold">{entries.length}</p></div>
        <div><p className="text-sm text-slate-500 dark:text-slate-400">Latest Investment</p><p className="mt-1 text-lg font-semibold">{entries.length ? [...entries].sort((a, b) => b.date.localeCompare(a.date))[0].date : 'No records'}</p></div>
      </div>
      {!!entries.length && <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(totals.categories).map(([category, amount]) => <div key={category} className="flex justify-between gap-3 text-sm"><dt>{category}</dt><dd className="font-medium">{formatBDT(amount)}</dd></div>)}</dl>}
      <label className="block max-w-sm text-sm">Search Investments<input className={`${inputClass} mt-1`} value={search} onChange={event => setSearch(event.target.value)} type="search" /></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400"><tr>{['Date', 'Investment', 'Category', 'Amount', ''].map((label, index) => <th key={index} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{visible.map(entry => <tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-3 py-3">{entry.date}</td><td className="min-w-44 max-w-sm break-words px-3 py-3"><p className="font-medium">{entry.description}</p>{entry.notes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.notes}</p>}</td><td className="px-3 py-3">{entry.category}</td><td className="whitespace-nowrap px-3 py-3 font-medium">{formatBDT(entry.amount)}</td><td className="px-3 py-3">{!readOnly&&<div className="flex gap-2"><button disabled={busy} aria-label={`Edit ${entry.description}`} title="Edit investment" onClick={() => { setError(''); setDraft({ ...entry }); }} className="p-2"><Pencil size={16} /></button><button disabled={busy} aria-label={`Delete ${entry.description}`} title="Delete investment" onClick={() => remove(entry)} className="p-2 text-red-600"><Trash2 size={16} /></button></div>}</td></tr>)}</tbody></table></div>
      {!visible.length && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{entries.length ? 'No matching investments.' : 'No investments recorded yet.'}</p>}
    </>}
    {!readOnly && draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} role="dialog" aria-modal="true" aria-label="Investment record" className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-5 dark:bg-slate-950">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Investment Record</h2><button type="button" disabled={busy} aria-label="Close investment record" title="Close" onClick={() => setDraft(null)} className="p-2"><X size={20} /></button></div>
      <label className="block text-sm">Date<input required type="date" className={`${inputClass} mt-1`} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="block text-sm">Description<input required maxLength={200} className={`${inputClass} mt-1`} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label className="block text-sm">Category<select className={`${inputClass} mt-1`} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{Array.from(new Set([...investmentCategories, draft.category])).map(category => <option key={category}>{category}</option>)}</select></label>
      <label className="block text-sm">Amount (BDT)<NumericInput required type="number" min="0.01" step="any" className={`${inputClass} mt-1`} value={draft.amount || ''} onChange={event => setDraft({ ...draft, amount: Number(event.target.value) })} /></label>
      <label className="block text-sm">Notes / Payment Reference<textarea maxLength={2000} className={`${inputClass} mt-1`} rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800"><span>{entries.some(entry => entry.id === draft.id) ? 'Total After Update' : 'Total After Addition'}</span><strong>{formatBDT(totals.total - (entries.find(entry => entry.id === draft.id)?.amount ?? 0) + (Number.isFinite(draft.amount) ? draft.amount : 0))}</strong></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"><Save size={18} />{busy ? 'Saving...' : 'Save Investment'}</button>
    </form></div>}
  </section>;
}
