import type { InventoryItem, InventoryCategoryDefinition } from '../types';
import { VendorLedgerView } from './VendorLedgerView';
import { vendorCategoryBalances, type VendorLedgerEntry } from '../utils/vendorLedger';
import { formatBDT } from '../utils/formatters';
import { useMemo, useState } from 'react';
import { Pencil, Plus, Save, Store, Trash2, X } from 'lucide-react';

export const vendorCategories = ['Chicken Vendors', 'Kacha Bazar Vendors', 'Other Vendors'] as const;
export interface Vendor {
  id: string;
  category: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

export function VendorsView({ vendors, inventory, inventoryCategories, categories: customCategories, onAddCategory, onSave, onDelete, canEdit, isAdmin, ledger, onSaveLedger }: {
  vendors: Vendor[];
  inventory: InventoryItem[];
  inventoryCategories: InventoryCategoryDefinition[];
  ledger: VendorLedgerEntry[];
  onSaveLedger: (entry: VendorLedgerEntry) => Promise<void>;
  categories: string[];
  onAddCategory: (name: string) => Promise<void>;
  onSave: (vendor: Vendor) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [category, setCategory] = useState<Vendor['category']>('Chicken Vendors');
  const categories = Array.from(new Set([...vendorCategories, ...customCategories, ...vendors.map(vendor => vendor.category)]));
  const balances = useMemo(() => vendorCategoryBalances(vendors, ledger), [vendors, ledger]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visible = vendors.filter(vendor => vendor.category === category && `${vendor.name} ${vendor.phone} ${vendor.address} ${vendor.notes}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const name = categoryName.trim().replace(/\s+/g, ' ');
      if (!name) throw new Error('Enter a category name.');
      if (categories.some(value => value.toLowerCase() === name.toLowerCase())) throw new Error('This category already exists.');
      await onAddCategory(name);
      if (draft) setDraft({ ...draft, category: name });
      setCategory(name); setAddingCategory(false); setCategoryName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save category.'); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError('');
    try {
      const name = draft.name.trim();
      if (!name) throw new Error('Enter a vendor name.');
      await onSave({ ...draft, name, phone: draft.phone.trim(), address: draft.address.trim(), notes: draft.notes.trim() });
      setCategory(draft.category); setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save vendor.'); }
    finally { setBusy(false); }
  }

  async function remove(vendor: Vendor) {
    if (ledger.some(entry => entry.vendorId === vendor.id)) { setError('This vendor has bills or payments and cannot be deleted.'); return; }
    if (!confirm(`Delete vendor "${vendor.name}"?`)) return;
    setBusy(true); setError('');
    try { await onDelete(vendor.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete vendor.'); }
    finally { setBusy(false); }
  }

  const selected = vendors.find(vendor => vendor.id === selectedId);
  if (selected) return <VendorLedgerView inventoryCategories={inventoryCategories} inventory={inventory} vendor={selected} entries={ledger} canEdit={canEdit} canOverride={isAdmin && canEdit} onBack={() => setSelectedId(null)} onSave={onSaveLedger} />;

  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Vendors</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your suppliers and organize them into categories. Balances include vendor payments recorded in Daily Expenses.</p></div>
      {canEdit && <button disabled={busy} onClick={() => { setError(''); setDraft({ id: crypto.randomUUID(), category, name: '', phone: '', address: '', notes: '' }); }} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Plus size={18} />Add Vendor</button>}
    </div>
    {canEdit && <button disabled={busy} onClick={() => { setError(''); setCategoryName(''); setAddingCategory(true); }} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700"><Plus size={16} />Add Category</button>}
    <div aria-label="Vendor categories" className="grid gap-3 sm:grid-cols-3">
      {categories.map(value => {
        const total = balances.get(value) ?? { balance: 0, due: 0, credit: 0, count: 0 };
        return <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)} className={`rounded-lg border p-4 text-left transition ${category === value ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
          <span className="flex items-center gap-2 text-sm font-semibold"><Store size={18} />{value}</span>
          <span className="mt-1 block text-xs text-slate-500">{total.count} {total.count === 1 ? 'vendor' : 'vendors'}</span>
          <span className="mt-3 block text-xs text-slate-500">Final Balance · {total.balance < 0 ? 'Advance / Credit' : total.balance > 0 ? 'Net Due' : 'Settled'}</span>
          <span className={`mt-1 block text-2xl font-semibold tabular-nums ${total.balance < 0 ? 'text-emerald-700 dark:text-emerald-400' : total.balance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>{formatBDT(Math.abs(total.balance))}</span>
          {(total.due > 0 || total.credit > 0) && <span className="mt-2 block text-xs text-slate-500">To pay: {formatBDT(total.due)} · Credit: {formatBDT(total.credit)}</span>}
        </button>;
      })}
    </div>
    <label className="block max-w-sm text-sm">Search Vendors<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, phone, or address" className={inputClass} /></label>
    <h2 className="text-lg font-semibold">{category}</h2>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400"><tr>{['Vendor', 'Phone', 'Address', 'Notes', ...(canEdit ? ['Actions'] : [])].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{visible.map(vendor => <tr key={vendor.id} className="border-b border-slate-200 dark:border-slate-800"><td className="min-w-40 px-3 py-3 font-medium break-words"><button onClick={() => setSelectedId(vendor.id)} aria-label={`View bills and payments for ${vendor.name}`} className="text-left text-amber-700 underline decoration-amber-500/40 underline-offset-4 dark:text-amber-400">{vendor.name}</button></td><td className="whitespace-nowrap px-3 py-3">{vendor.phone || '—'}</td><td className="min-w-40 px-3 py-3 break-words">{vendor.address || '—'}</td><td className="min-w-40 px-3 py-3 break-words">{vendor.notes || '—'}</td>{canEdit && <td className="px-3 py-3"><div className="flex gap-2"><button disabled={busy} aria-label={`Edit ${vendor.name}`} onClick={() => { setError(''); setDraft({ ...vendor }); }} className="p-2"><Pencil size={16} /></button><button disabled={busy} aria-label={`Delete ${vendor.name}`} onClick={() => remove(vendor)} className="p-2 text-red-600"><Trash2 size={16} /></button></div></td>}</tr>)}</tbody>
    </table></div>
    {!visible.length && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{search.trim() ? 'No matching vendors.' : `No ${category.toLowerCase()} added yet.`}</p>}
    {draft && !addingCategory && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} role="dialog" aria-modal="true" aria-label="Vendor details" className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-5 dark:bg-slate-950">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Vendor Details</h2><button type="button" disabled={busy} aria-label="Close vendor details" onClick={() => setDraft(null)} className="p-2"><X size={20} /></button></div>
      <label className="block text-sm">Category<select className={inputClass} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" disabled={busy} onClick={() => { setError(''); setCategoryName(''); setAddingCategory(true); }} className="text-sm font-semibold text-amber-700 dark:text-amber-400">+ Add Custom Category</button>
      <label className="block text-sm">Vendor Name<input autoFocus required maxLength={200} className={inputClass} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="block text-sm">Phone<input type="tel" maxLength={50} className={inputClass} value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
      <label className="block text-sm">Address<input maxLength={500} className={inputClass} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
      <label className="block text-sm">Notes<textarea rows={3} maxLength={2000} className={inputClass} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"><Save size={18} />{busy ? 'Saving...' : 'Save Vendor'}</button>
    </form></div>}
    {addingCategory && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={addCategory} role="dialog" aria-modal="true" aria-label="Add vendor category" className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 dark:bg-slate-950">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add Vendor Category</h2><button type="button" disabled={busy} aria-label="Close category form" onClick={() => { setAddingCategory(false); setError(''); }} className="p-2"><X size={20} /></button></div>
      <label className="block text-sm">Category Name<input autoFocus required maxLength={100} value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="e.g. Fish Vendors" className={inputClass} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"><Save size={18} />{busy ? 'Saving...' : 'Save Category'}</button>
    </form></div>}
  </section>;
}
