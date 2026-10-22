import { useState } from 'react';
import type { MonthlyExpenseItem, PurchaseRecord, StaffAdvance, StaffMember } from '../types';
import { NumericInput } from './NumericInput';
import { vendorBillTotal, vendorUnitPrice } from '../utils/vendorLedger';
import { formatBDT } from '../utils/formatters';

type Props = {
  expense: MonthlyExpenseItem;
  purchase?: PurchaseRecord;
  advance?: StaffAdvance;
  staff: StaffMember[];
  onSavePurchase: (previous: PurchaseRecord, next: PurchaseRecord) => Promise<void>;
  onSaveAdvance: (previous: StaffAdvance, next: StaffAdvance) => Promise<void>;
  onClose: () => void;
};
export function LinkedExpenseEditModal({ expense, purchase, advance, staff, onSavePurchase, onSaveAdvance, onClose }: Props) {
  const [date, setDate] = useState(expense.date);
  const [amount, setAmount] = useState(expense.amount);
  const [payment, setPayment] = useState<string>(expense.paymentMode);
  const [quantity, setQuantity] = useState(purchase?.quantity ?? 0);
  const [unitPrice, setUnitPrice] = useState(purchase?.unitPrice ?? 0);
  const [supplier, setSupplier] = useState(purchase?.supplier ?? '');
  const [notes, setNotes] = useState(purchase?.notes ?? advance?.reason ?? '');
  const [staffId, setStaffId] = useState(advance?.staffId ?? '');
  const [repaid, setRepaid] = useState(advance?.repaid ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = expense.source === 'purchase' ? purchase : advance;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form role="dialog" aria-modal="true" aria-label="Edit linked daily expense" className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-6 dark:bg-slate-900" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (!source) throw new Error('The original transaction could not be found. Reload and try again.');
      if (expense.source === 'purchase' && purchase) {
        if (!(quantity > 0) || !(amount > 0)) throw new Error('Enter a positive quantity and amount.');
        await onSavePurchase(purchase, { ...purchase, date, quantity, unitPrice, totalCost: amount, supplier: supplier.trim(), notes: notes.trim(), paymentMode: payment as PurchaseRecord['paymentMode'] });
      } else if (advance) {
        await onSaveAdvance(advance, { ...advance, date, staffId, amount, reason: notes.trim(), repaid, paymentMode: payment === 'unknown' ? undefined : payment as StaffAdvance['paymentMode'] });
      }
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update transaction.'); } finally { setBusy(false); }
  }}>
    <h3 className="text-base font-semibold">Edit {expense.source === 'purchase' ? 'Ingredient Purchase' : 'Salary Payment'}</h3>
    <p className="text-xs text-slate-500">This updates the original transaction and its daily expense together.</p>
    {!source && <p role="alert" className="text-sm text-rose-600">Original transaction not found. Reload before editing.</p>}
    <fieldset disabled={busy || !source} className="space-y-3">
      {purchase && expense.source === 'purchase' ? <>
        <p className="text-sm font-medium">{purchase.itemName} · {purchase.unit}</p>
        <label className="block text-sm">Quantity ({purchase.unit})<NumericInput required min="0.000001" value={quantity} onChange={event => { const next = Number(event.target.value); setQuantity(next); setUnitPrice(vendorUnitPrice(next, amount)); }} className="staff-input" /></label>
        <label className="block text-sm">Price per {purchase.unit}<NumericInput required min="0.000001" value={Number(unitPrice.toFixed(6))} onChange={event => { const next = Number(event.target.value); setUnitPrice(next); setAmount(vendorBillTotal(quantity, next)); }} className="staff-input" /></label>
        <label className="block text-sm">Vendor / Supplier<input value={supplier} onChange={event => setSupplier(event.target.value)} className="staff-input" /></label>
        <p className="text-xs text-slate-500">Stock changes by {quantity - purchase.quantity >= 0 ? '+' : ''}{Number((quantity - purchase.quantity).toFixed(6))} {purchase.unit}. No duplicate expense is created.</p>
      </> : <label className="block text-sm">Staff<select required value={staffId} onChange={event => setStaffId(event.target.value)} className="staff-input">{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}{!staff.some(member => member.id === staffId) && <option value={staffId}>Archived staff ({staffId})</option>}</select></label>}
      <label className="block text-sm">Payment Date<input required type="date" value={date} onChange={event => setDate(event.target.value)} className="staff-input" /></label>
      <label className="block text-sm">Amount (BDT)<NumericInput required min="0.01" step="0.01" value={amount} onChange={event => { const next = Number(event.target.value); setAmount(next); if (purchase) setUnitPrice(vendorUnitPrice(quantity, next)); }} className="staff-input" /></label>
      <label className="block text-sm">Payment Method<select value={payment} onChange={event => setPayment(event.target.value)} className="staff-input"><option value="cash">Cash</option><option value="bkash">bKash</option>{expense.source === 'purchase' ? <option value="credit">Unpaid / Credit</option> : <><option value="bank">Bank</option><option value="card">Card</option><option value="unknown">Not recorded</option></>}</select></label>
      <label className="block text-sm">{expense.source === 'purchase' ? 'Notes' : 'Reason'}<textarea required={expense.source === 'advance'} value={notes} onChange={event => setNotes(event.target.value)} className="staff-input" /></label>
      {expense.source === 'advance' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={repaid} onChange={event => setRepaid(event.target.checked)} />Payment returned</label>}
      <p className="text-sm font-semibold">Total: {formatBDT(amount)}</p>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button disabled={busy || !source} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">{busy ? 'Saving…' : 'Save Changes'}</button></div>
  </form></div>;
}
