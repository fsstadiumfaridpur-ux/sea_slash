import {vendorStockUpdateMode} from '../utils/vendorLedger';
import type { InventoryItem, InventoryCategoryDefinition } from '../types';
import { matchingInventoryNames, suggestInventory, suggestVendorDescriptions, normalizedDescription, inventoryUnitFactor } from '../utils/inventorySuggestions';
import { buildVendorLedgerExcel, vendorLedgerExcelFilename } from '../utils/vendorLedgerExcel';
import { roundMoney } from '../utils/money';
import { useState } from 'react';
import { ArrowLeft, Download, ChevronDown, ChevronUp, Pencil, Plus, Save, X } from 'lucide-react';
import type { Vendor } from './VendorsView';
import { NumericInput } from './NumericInput';
import { formatBDT, formatNumber, formatDatePretty, getTodayString } from '../utils/formatters';
import { vendorBillUnits, vendorUnitPrice, vendorBillDetails, type VendorBillUnit, sortVendorLedgerByDate, validateVendorLedgerEntry, vendorBillTotal, vendorLedgerSummary, type VendorLedgerEntry } from '../utils/vendorLedger';

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export function VendorLedgerView({ vendor, entries, inventory, inventoryCategories, canEdit, canOverride, onBack, onSave }: {
  vendor: Vendor;
  entries: VendorLedgerEntry[];
  inventory: InventoryItem[];
  inventoryCategories: InventoryCategoryDefinition[];
  canEdit: boolean;
  canOverride: boolean;
  onBack: () => void;
  onSave: (entry: VendorLedgerEntry) => Promise<void>;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [targetBalance, setTargetBalance] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [draft, setDraft] = useState<VendorLedgerEntry | null>(null);
  const [calculationBasis, setCalculationBasis] = useState<'total' | 'unitPrice'>('total');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const exactMatches = matchingInventoryNames(draft?.description ?? '', inventory);
  const linkedItem = inventory.find(item => item.id === draft?.inventoryItemId) ?? (draft?.quantity !== undefined && exactMatches.length === 1 ? exactMatches[0] : undefined);
  const suggestions = suggestInventory(draft?.description ?? '', inventory, entries);
  const savedDescriptions = suggestVendorDescriptions(draft?.description ?? '', entries, inventory, vendor.id);
  const hasSuggestions = suggestions.length > 0 || savedDescriptions.length > 0;
  const isNewDescription = !!draft?.description.trim() && !entries.some(entry => entry.balanceAdjustment === undefined && normalizedDescription(entry.description) === normalizedDescription(draft.description)) && !inventory.some(item => normalizedDescription(item.name) === normalizedDescription(draft.description) || (item.banglaName && normalizedDescription(item.banglaName) === normalizedDescription(draft.description)));
  const missingInventoryItem = !!draft?.description.trim() && !linkedItem && exactMatches.length === 0;
  const [createInventory, setCreateInventory] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState('uncategorized');
  const [newCategoryName, setNewCategoryName] = useState('');
  const stockFactor = linkedItem && draft?.unit ? inventoryUnitFactor(draft.unit, linkedItem.unit) : null;
  const receivedQuantity = stockFactor === null ? draft?.inventoryQuantity ?? 0 : Number(((draft?.quantity ?? 0) * stockFactor).toFixed(6));
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [dailyExpanded, setDailyExpanded] = useState(false);
  const [expandedHistoryDates, setExpandedHistoryDates] = useState<Set<string>>(() => new Set());
  const summary = vendorLedgerSummary(entries, vendor.id);
  const records = sortVendorLedgerByDate(entries.filter(entry => entry.vendorId === vendor.id));
  const dailyNewestFirst = [...summary.daily].reverse();
  const visibleDays = dailyExpanded ? dailyNewestFirst : dailyNewestFirst.slice(0, 2);
  const newEntry = () => { setError(''); setCalculationBasis('total'); setSuggestionsOpen(false); setCreateInventory(false); setNewItemCategory("uncategorized"); setNewCategoryName(""); setDraft({ id: crypto.randomUUID(), vendorId: vendor.id, date: getTodayString(), description: '', quantity: 0, unit: 'kg', unitPrice: 0, billed: 0, paid: 0 }); };
  async function exportExcel() {
    if (exporting) return;
    setExporting(true); setError('');
    try {
      const buffer = await buildVendorLedgerExcel(vendor, entries);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url; link.download = vendorLedgerExcelFilename(vendor.name, getTodayString());
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export Excel. Please retry.'); }
    finally { setExporting(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError('');
    try {
      if (!canEdit || (!canOverride && (draft.balanceAdjustment !== undefined || entries.some(entry => entry.id === draft.id && entry.balanceAdjustment !== undefined)))) throw new Error('Administrator access required to override vendor balances.');
      const stockBill = draft.billed > 0 && (draft.quantity ?? 0) > 0;
      if (stockBill && !linkedItem && !(missingInventoryItem && createInventory)) throw new Error('Select the original inventory item, or choose Create new inventory item for a genuinely new product.');
      if (stockBill && !linkedItem && newItemCategory === '__new__' && !newCategoryName.trim()) throw new Error('Enter the new category name.');
      const entry: VendorLedgerEntry = {
        ...draft, description: draft.description.trim(), billed: draft.billed,
        createInventoryItem: stockBill && !linkedItem && createInventory,
        inventoryCategoryId: stockBill && !linkedItem && createInventory && newItemCategory !== '__new__' ? newItemCategory : undefined,
        inventoryCategoryName: stockBill && !linkedItem && createInventory && newItemCategory === '__new__' ? newCategoryName.trim() : undefined,
        inventoryItemId: stockBill ? linkedItem?.id : undefined,
        inventoryQuantity: stockBill && linkedItem ? receivedQuantity : undefined,
        inventoryUnit: stockBill ? linkedItem?.unit : undefined,
      };
      entry.inventoryUpdateMode=vendorStockUpdateMode(entries.find(row=>row.id===entry.id),entry);
      validateVendorLedgerEntry(entry);
      await onSave(entry); setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save ledger entry.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-6">
    <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={18} />Back to Vendors</button>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">{vendor.name}</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{vendor.category}{vendor.phone ? ` · ${vendor.phone}` : ''}</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={exportExcel} disabled={exporting || !records.length} title="Export all dates to Excel" className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-700"><Download size={18} />{exporting ? 'Exporting...' : 'Export Excel'}</button>{canEdit && <button onClick={newEntry} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"><Plus size={18} />Add Bill / Payment</button>}</div></div>
    {error && !draft && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    <div className="grid gap-4 rounded-lg border border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">{[['Total Bills', summary.billed], ['Total Paid', summary.paid], [summary.balance < 0 ? 'Advance / Credit' : 'Money Left to Pay', Math.abs(summary.balance)]].map(([label, amount]) => <div key={label}><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{formatBDT(Number(amount))}</p></div>)}</div>
    {canOverride && <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <button type="button" onClick={() => { setAdjustOpen(value => !value); setTargetBalance(summary.balance); setAdjustReason(''); }} className="text-sm font-semibold">Adjust Final Balance (Admin)</button>
      {adjustOpen && <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); if (!canOverride || busy) return; setBusy(true); setError('');
        try {
          const amount = roundMoney(targetBalance - summary.balance);
          if (!adjustReason.trim()) throw new Error('Enter a reason for the adjustment.');
          const entry: VendorLedgerEntry = { id: crypto.randomUUID(), vendorId: vendor.id, date: getTodayString(), description: adjustReason.trim(), billed: 0, paid: 0, balanceAdjustment: amount };
          entry.inventoryUpdateMode=vendorStockUpdateMode(entries.find(row=>row.id===entry.id),entry);
      validateVendorLedgerEntry(entry); await onSave(entry); setAdjustOpen(false);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not adjust balance.'); } finally { setBusy(false); }
      }}>
        <p className="text-xs text-slate-500">Current balance: {formatBDT(summary.balance)}. Enter 0 to clear a small difference. This adjustment does not record a payment. Negative balances mean vendor credit.</p>
        <label className="block text-sm">Final Balance (BDT)<NumericInput required step="0.01" value={targetBalance} onChange={event => setTargetBalance(Number(event.target.value))} className={inputClass} /></label>
        <label className="block text-sm">Reason<input required maxLength={500} value={adjustReason} onChange={event => setAdjustReason(event.target.value)} className={inputClass} /></label>
        <button disabled={busy} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">{busy ? 'Saving...' : 'Save Final Balance'}</button>
      </form>}
    </div>}
    <section className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="vendor-daily-heading" className="text-lg font-semibold">Daily Bills & Payments <span className="text-sm font-normal text-slate-500">({summary.daily.length} days)</span></h2>{summary.daily.length > 2 && <button type="button" aria-expanded={dailyExpanded} aria-controls="vendor-daily-content" aria-label={`${dailyExpanded ? 'Collapse' : 'Expand'} daily bills and payments`} onClick={() => setDailyExpanded(value => !value)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{dailyExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{dailyExpanded ? 'Collapse' : 'Expand'}</button>}</div>
      <div id="vendor-daily-content" aria-labelledby="vendor-daily-heading">
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Balance carries forward each day. A negative balance is an advance paid to this vendor.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 dark:border-slate-800"><tr>{['Date', 'Daily Bills', 'Daily Paid', 'Remaining Balance'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{visibleDays.map(day => <tr key={day.date} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-3 py-3">{formatDatePretty(day.date)}</td><td className="px-3 py-3">{formatBDT(day.billed)}</td><td className="px-3 py-3 text-emerald-700 dark:text-emerald-400">{formatBDT(day.paid)}</td><td className="px-3 py-3 font-semibold">{formatBDT(day.balance)}</td></tr>)}</tbody></table></div>
        {!records.length && <p className="py-8 text-center text-sm text-slate-500">No bills or payments recorded yet.</p>}
      </div>
    </section>
    <section className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h2 id="vendor-history-heading" className="text-lg font-semibold">Bill & Payment History <span className="text-sm font-normal text-slate-500">({records.length} entries)</span></h2>
      <div id="vendor-history-content" aria-labelledby="vendor-history-heading" className="space-y-3">
        {dailyNewestFirst.map(day => {
          const dayRecords = records.filter(entry => entry.date === day.date);
          const expanded = expandedHistoryDates.has(day.date);
          const contentId = `vendor-history-${vendor.id}-${day.date}`;
          return <div key={day.date} className="rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">{formatDatePretty(day.date)}</h3>
                <button type="button" aria-expanded={expanded} aria-controls={contentId} aria-label={`${expanded ? 'Collapse' : 'Expand'} history for ${formatDatePretty(day.date)}`} onClick={() => setExpandedHistoryDates(current => {
                  const next = new Set(current);
                  if (next.has(day.date)) next.delete(day.date); else next.add(day.date);
                  return next;
                })} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700">
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{expanded ? 'Collapse' : 'Expand'}
                </button>
                <span className="text-xs text-slate-500">{dayRecords.length} {dayRecords.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400"><span>Bills: {formatBDT(day.billed)}</span><span>Paid: {formatBDT(day.paid)}</span></p>
            </div>
            <div id={contentId} hidden={!expanded}>
              {expanded && (<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 dark:border-slate-800"><tr>{['Date', 'Description / Bill Reference', 'Quantity / Unit', 'Unit Price', 'Bill', 'Paid', ...(canEdit ? ['Actions'] : [])].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{dayRecords.map(entry => <tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-3 py-3">{formatDatePretty(entry.date)}</td><td className="min-w-44 px-3 py-3 break-words">{entry.description}{entry.sourceExpenseId && <span className="block text-xs text-emerald-700">Payment from Daily Expenses · Edit in Expenses</span>}{entry.inventoryItemId && <span className="block text-xs text-emerald-700">Stock received: {formatNumber(entry.inventoryQuantity ?? 0)} {entry.inventoryUnit}</span>}{entry.balanceAdjustment !== undefined && <span className="block text-xs text-amber-700">Balance adjustment: {formatBDT(entry.balanceAdjustment)}</span>}</td><td className="px-3 py-3">{vendorBillDetails(entry) ? `${formatNumber(vendorBillDetails(entry)!.quantity ?? 0)} ${vendorBillDetails(entry)!.unit}` : '—'}</td><td className="px-3 py-3">{vendorBillDetails(entry) ? `${formatBDT(vendorBillDetails(entry)!.unitPrice ?? 0)} / ${vendorBillDetails(entry)!.unit}` : '—'}</td><td className="px-3 py-3">{formatBDT(entry.billed)}</td><td className="px-3 py-3">{formatBDT(entry.paid)}</td>{canEdit && <td className="px-3 py-3"><button disabled={!!entry.sourceExpenseId || entry.balanceAdjustment !== undefined} title={entry.sourceExpenseId ? "Edit the original payment in Expenses" : "Edit bill or payment"} aria-label={`Edit ${entry.description}`} onClick={() => { setError(''); setCreateInventory(false); setNewItemCategory("uncategorized"); setNewCategoryName(""); setCalculationBasis('total'); const details = vendorBillDetails(entry); setDraft({ ...entry, quantityKg: undefined, pricePerKg: undefined, quantity: details?.quantity, unitPrice: details?.unitPrice, unit: details?.unit }); }} className="p-2"><Pencil size={16} /></button></td>}</tr>)}</tbody></table></div>)}
            </div>
          </div>;
        })}
        {!records.length && <p className="py-8 text-center text-sm text-slate-500">No bills or payments recorded yet.</p>}
      </div>
    </section>
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form role="dialog" aria-modal="true" aria-label="Vendor bill or payment" onSubmit={save} className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-5 dark:bg-slate-950">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Bill / Payment — {vendor.name}</h2><button type="button" disabled={busy} aria-label="Close bill or payment" onClick={() => setDraft(null)} className="p-2"><X size={20} /></button></div>
      <label className="block text-sm">Date<input type="date" required className={inputClass} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="block text-sm">Description / Bill Reference<input autoFocus required maxLength={500} className={inputClass} value={draft.description} role="combobox" aria-autocomplete="list" aria-controls="vendor-inventory-suggestions" aria-expanded={suggestionsOpen && hasSuggestions} onKeyDown={event => { if (event.key === "Escape") setSuggestionsOpen(false); }} autoComplete="off" onFocus={() => setSuggestionsOpen(true)} onChange={event => { setSuggestionsOpen(true); setDraft({ ...draft, description: event.target.value }); }} /></label>
      {suggestionsOpen && hasSuggestions && <div id="vendor-inventory-suggestions" role="listbox" aria-label="Description suggestions" className="max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">{suggestions.map(item => <button key={item.id} type="button" role="option" aria-selected={item.id === draft.inventoryItemId} className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-slate-800" onClick={() => {
        setSuggestionsOpen(false); setCreateInventory(false);
        setDraft({ ...draft, description: item.name, inventoryItemId: item.id, inventoryUnit: item.unit, inventoryQuantity: undefined, quantity: draft.quantity ?? 0, unit: (draft.quantity ? draft.unit : item.unit === 'gram' ? 'g' : item.unit) as VendorBillUnit, unitPrice: draft.unitPrice ?? 0 });
      }}><span className="font-medium">{item.name}{item.banglaName ? ` / ${item.banglaName}` : ''}</span><span className="block text-xs text-slate-500">In stock: {formatNumber(item.currentStock)} {item.unit}</span></button>)}{savedDescriptions.map(saved => <button key={`description:${normalizedDescription(saved.description)}`} type="button" role="option" aria-selected={draft.description === saved.description} className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-slate-800" onClick={() => {
        const item = inventory.find(row => row.id === saved.inventoryItemId);
        setSuggestionsOpen(false);
        setDraft({ ...draft, description: saved.description, inventoryItemId: item?.id, inventoryUnit: item?.unit, inventoryQuantity: undefined, quantity: item ? draft.quantity ?? 0 : draft.quantity, unitPrice: item ? draft.unitPrice ?? 0 : draft.unitPrice, unit: !item && draft.quantity === undefined ? undefined : draft.quantity ? draft.unit : saved.unit ?? (item?.unit === 'gram' ? 'g' : item?.unit) ?? draft.unit });
      }}><span className="font-medium">{saved.description}</span><span className="block text-xs text-slate-500">Saved description{saved.unit ? ` · ${saved.unit}` : ''}{saved.inventoryItemId ? ' · Linked inventory item' : ''}</span></button>)}</div>}
      {isNewDescription && <p className="text-xs text-amber-700 dark:text-amber-400">New description — it will appear in suggestions after you save this bill/payment.</p>}
      {draft.inventoryItemId && !inventory.some(item => item.id === draft.inventoryItemId) && <p className="text-xs text-slate-500">The previous inventory item was deleted. Select an existing item or create a new one below. Its stock will be updated without reversing the deleted item's stock.</p>}
      {!linkedItem && !missingInventoryItem && <p className="text-xs text-slate-500">Select the existing inventory suggestion to update its stock.</p>}
      {missingInventoryItem && <label className="block rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950"><span className="flex items-center gap-2"><input type="checkbox" checked={createInventory} onChange={event => setCreateInventory(event.target.checked)} />Create a new inventory item (only if no existing item matches)</span><span className="mt-1 block text-xs text-slate-500">For restocking, select the original item above. Create a new item only for a different product. Payment-only entries do not change inventory.</span></label>}
      {missingInventoryItem && createInventory && <div className="space-y-2">
        <label className="block text-sm">Inventory Category<select required value={newItemCategory} onChange={event => setNewItemCategory(event.target.value)} className={inputClass}>{inventoryCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}{canOverride && <option value="__new__">+ Create new category</option>}</select></label>
        {newItemCategory === '__new__' && <label className="block text-sm">New Category Name<input required maxLength={100} value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} className={inputClass} /></label>}
      </div>}
      {linkedItem && <div className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
        <p>Inventory: <strong>{linkedItem.name}</strong> · Current stock: {formatNumber(linkedItem.currentStock)} {linkedItem.unit}</p>
        {stockFactor === null && <label className="block">New current stock quantity ({linkedItem.unit})<NumericInput required min="0.000001" step="any" value={draft.inventoryQuantity ?? 0} onChange={event => setDraft({ ...draft, inventoryQuantity: Number(event.target.value) })} className={inputClass} /><span className="text-xs">Enter the new current quantity in {linkedItem.unit}; {draft.unit} cannot be converted automatically.</span></label>}
        <p>New current stock: <strong>{formatNumber(receivedQuantity)} {linkedItem.unit}</strong>. Unit price: <strong>{formatBDT(receivedQuantity>0?draft.billed/receivedQuantity:0)} / {linkedItem.unit}</strong>. Inventory value: <strong>{formatBDT(draft.billed)}</strong>.</p><p className="text-xs">A new bill or stock/price correction replaces the current quantity and unit price on this same inventory item. It does not add to the old quantity or create a copy. Payment-only edits keep stock unchanged.</p>
        <button type="button" onClick={() => setDraft({ ...draft, inventoryItemId: undefined, inventoryQuantity: undefined, inventoryUnit: undefined })} className="text-xs underline">Unlink inventory item</button>
      </div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.quantity !== undefined} onChange={event => setDraft(event.target.checked ? { ...draft, quantity: 0, unitPrice: 0, unit: 'kg', billed: 0 } : { ...draft, quantity: undefined, unitPrice: undefined, unit: undefined, inventoryItemId: undefined, inventoryQuantity: undefined, inventoryUnit: undefined })} />Include quantity and measurement unit</label>
      {draft.quantity !== undefined && <label className="block text-sm">Unit<select aria-label="Bill unit" required className={inputClass} value={draft.unit ?? 'kg'} onChange={event => setDraft({ ...draft, unit: event.target.value as VendorBillUnit })}>{vendorBillUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>}
      {draft.quantity !== undefined && <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Quantity ({draft.unit ?? 'kg'})<NumericInput min="0" step="any" className={inputClass} value={draft.quantity} onChange={event => {
          const quantity = Number(event.target.value);
          setDraft({ ...draft, quantity, ...(calculationBasis === 'total' ? { unitPrice: vendorUnitPrice(quantity, draft.billed) } : { billed: vendorBillTotal(quantity, draft.unitPrice ?? 0) }) });
        }} /></label>
        <label className="block text-sm">Price per {draft.unit ?? 'kg'} (BDT)<NumericInput min="0" step="any" className={inputClass} value={calculationBasis === 'total' ? Number((draft.unitPrice ?? 0).toFixed(6)) : draft.unitPrice ?? 0} onChange={event => {
          const unitPrice = Number(event.target.value); setCalculationBasis('unitPrice');
          setDraft({ ...draft, unitPrice, billed: vendorBillTotal(draft.quantity ?? 0, unitPrice) });
        }} /></label>
      </div>}
      <div className="rounded-md bg-amber-50 p-4 dark:bg-amber-500/10">
        <label className="block text-sm font-medium">Total Bill (BDT)<NumericInput aria-label="Total bill" min="0" step="0.01" className={inputClass} value={draft.billed} onChange={event => {
          const billed = Number(event.target.value); setCalculationBasis('total');
          setDraft({ ...draft, billed, ...(draft.quantity !== undefined ? { unitPrice: vendorUnitPrice(draft.quantity, billed) } : {}) });
        }} /></label>
        {draft.quantity !== undefined && <p aria-live="polite" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{draft.quantity > 0 ? <>Price per {draft.unit}: {formatBDT(draft.unitPrice ?? 0)}{calculationBasis === 'total' && ' (total ÷ quantity)'}</> : 'Enter a quantity to calculate the price per unit.'}</p>}
      </div>
      <label className="block text-sm">Paid Amount (BDT)<NumericInput min="0" step="0.01" className={inputClass} value={draft.paid} onChange={event => setDraft({ ...draft, paid: Number(event.target.value) })} /></label>
      <p className="text-xs text-slate-500">For a payment only, leave quantity and price at zero. Payments recorded in Daily Expenses are included automatically in this vendor balance.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"><Save size={18} />{busy ? 'Saving...' : 'Save Bill / Payment'}</button>
    </form></div>}
  </section>;
}
