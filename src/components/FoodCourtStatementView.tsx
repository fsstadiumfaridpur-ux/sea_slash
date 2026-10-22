import { NumericInput } from './NumericInput';
import { roundMoney } from '../utils/money';
import { DailyCommissionPrintPreview } from './DailyCommissionPrintPreview';
import type { CommissionTracking } from '../lib/commissionTracking';
import { calculateCommission } from '../utils/commission';
import React, { useState } from "react";
import {
  Download,
  Printer,
  Plus,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type {
  DailySalesRecord,
  FoodCourtSettings,
  MonthlyExpenseItem,
} from "../types";
import { exportToCSV, getTodayString } from "../utils/formatters";
import { courtStatement, courtPaymentStatus } from "../utils/courtStatement";
import { printStaffDocument } from "../utils/staffPayroll";

interface Props {
  isAdmin?: boolean;
  onRecordMissingSales?: (date: string) => void;
  tracking?: CommissionTracking;
  onSaveTracking?: (value: CommissionTracking) => Promise<void>;
  onAssignPaymentDate?: (payment: MonthlyExpenseItem, date: string) => Promise<void>;
  initialMonth?: string;
  onMonthChange?: (month:string)=>void;
  salesHistory: DailySalesRecord[];
  expenses: MonthlyExpenseItem[];
  settings: FoodCourtSettings;
  onRecordPayment: (category: "rent" | "commission", month: string, date?: string) => void;
  onOpenExpenses: () => void;
}

const money = (amount: number) =>
  "৳" + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const buttonClass =
  "flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium dark:border-slate-700";

export function FoodCourtStatementView({
  isAdmin = false,
  onRecordMissingSales,
  tracking = { paidDates: {} },
  onSaveTracking,
  onAssignPaymentDate,
  initialMonth,
  onMonthChange,
  salesHistory,
  expenses,
  settings,
  onRecordPayment,
  onOpenExpenses,
}: Props) {
  const [month, setMonth] = useState(() => initialMonth ?? getTodayString().slice(0, 7));
  const [printDate, setPrintDate] = useState<string | null>(null);
  const [commissionExpanded, setCommissionExpanded] = useState(false);
  const [salesExpanded, setSalesExpanded] = useState(false);
  const [adjustCategory, setAdjustCategory] = useState<'rent' | 'commission'>('commission');
  const [adjustDate, setAdjustDate] = useState(getTodayString());
  const [adjustTarget, setAdjustTarget] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSaved, setAdjustSaved] = useState(false);
  const [paidFrom, setPaidFrom] = useState('');
  const [paidThrough, setPaidThrough] = useState('');
  const [trackingStart, setTrackingStart] = useState(tracking.startDate ?? getTodayString());
  const [trackingSaved, setTrackingSaved] = useState(false);
  const [assignDates, setAssignDates] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const s = courtStatement(month, salesHistory, expenses, settings, tracking);
  const newestCommissions = [...s.dailyCommissions].sort((a, b) => b.date.localeCompare(a.date));
  const newestSales = [...s.days].sort((a, b) => b.date.localeCompare(a.date));
  const visibleCommissions = commissionExpanded ? newestCommissions : newestCommissions.slice(0, 5);
  const visibleSales = salesExpanded ? newestSales : newestSales.slice(0, 5);
  const rate = (settings.commissionRate * 100).toFixed(1);
  const period = new Date(month + "-01T12:00:00").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const obligations = [
    {
      category: "rent" as const,
      label: "Fixed Monthly Rent",
      owed: s.rent + s.rentAdjustment,
      paid: s.rentPaid,
      due: s.rentDue,
      credit: s.rentCredit,
    },
    {
      category: "commission" as const,
      label: "Daily Sales Commission (" + rate + "% after 5% VAT deduction)",
      owed: s.commission + s.dailyCommissions.reduce((total, day) => total + day.adjustment, 0),
      paid: s.commissionPaid,
      due: s.commissionDue,
      credit: s.commissionCredit,
    },
  ];
  const exportStatement = () => {
    const rows: Record<string, unknown>[] = [];
    const row = (
      type: string,
      date: string,
      description: string,
      amount: number,
      reference = "",
      method = "",
    ) => ({
      Type: type,
      StatementMonth: month,
      Date: date,
      Description: description,
      Amount_BDT: amount,
      Reference: reference,
      PaymentMethod: method,
    });
    rows.push(
      row("Summary", "", "Recorded Gross Sales", s.gross),
      row(
        "Summary",
        "",
        "Commission Rate Percent",
        settings.commissionRate * 100,
      ),
    );
    obligations.forEach((o) =>
      rows.push(
        row("Amount owed", "", o.label, o.owed),
        row("Paid", "", o.label, o.paid),
        row("Remaining", "", o.label, o.due),
        row("Overpayment", "", o.label, o.credit),
      ),
    );
    s.days.forEach((day) =>
      rows.push(
        row("Sales", day.date, "Gross Sales", day.grossSales),
        row(
          "Sales commission",
          day.date,
          "Commission at agreed rate",
          calculateCommission(day.grossSales, settings.commissionRate),
        ),
      ),
    );
    s.dailyCommissions.filter(day => !day.hasSalesRecord).forEach(day => rows.push({ Type: 'Missing sales record', StatementMonth: month, Date: day.date, Description: day.historicalConfirmation ? 'Previously paid confirmed; sales amount not recorded' : 'Sales amount not recorded', Amount_BDT: '' }));
    s.dailyCommissions.filter(day => day.hasSalesRecord).forEach(day => rows.push(row('Daily commission owed', day.date, 'Sales × 95% × agreed commission rate', day.owed), row('Daily commission paid', day.date, courtPaymentStatus(day.owed, day.paid), day.paid), row('Daily commission remaining', day.date, 'Outstanding daily commission', day.due)));
    s.dailyCommissions.filter(day => day.confirmedAmount > 0).forEach(day => rows.push(row('Historical confirmation (no cash movement)', day.date, 'Previously paid commission', day.confirmedAmount)));
    s.dailyCommissions.filter(day => day.adjustment !== 0).forEach(day => rows.push(row('Balance adjustment (no cash movement)', day.date, day.adjustmentReason ?? '', day.adjustment)));
    if (s.rentAdjustment !== 0) rows.push(row('Rent balance adjustment (no cash movement)', month, tracking.rentAdjustments?.[month]?.reason ?? '', s.rentAdjustment));
    s.payments.forEach((p) =>
      rows.push(
        row(
          "Payment",
          p.date,
          p.commissionDate ? `${p.title} / Sales date ${p.commissionDate}` : p.title,
          p.amount,
          p.paymentReference ?? "",
          p.paymentMode,
        ),
      ),
    );
    exportToCSV("mughal_mahal_court_statement_" + month, rows);
  };
  const print = () => {
    setError("");
    try {
      const lines = [
        settings.stallName,
        "FOOD COURT STATEMENT / " + period,
        "Food Court: " + settings.foodCourtName,
        "Stall: " + settings.stallNumber,
        "",
        "Recorded sales: " + money(s.gross),
        "Sales days recorded: " + s.days.length,
        "Cash: " + money(s.cash),
        "bKash: " + money(s.bkash),
        "Nagad: " + money(s.nagad),
        "Card: " + money(s.card),
        "Bank Transfer: " + money(s.bank),
        "Unreconciled collections: " + money(s.collectionDifference),
        "",
        "OBLIGATIONS AND PAYMENTS",
      ];
      obligations.forEach((o) =>
        lines.push(
          o.label +
            ": Owed " +
            money(o.owed) +
            " / Paid " +
            money(o.paid) +
            " / Remaining " +
            money(o.due) +
            " / Overpayment " +
            money(o.credit),
        ),
      );
      s.dailyCommissions.forEach(day => lines.push(!day.hasSalesRecord ? day.date + ': Sales not recorded / ' + (day.historicalConfirmation ? 'Previously paid confirmed' : 'Amounts unavailable') : day.date + ': Daily commission ' + money(day.owed) + ' / Paid ' + money(day.paid) + ' / Due ' + money(day.due) + ' / ' + courtPaymentStatus(day.owed, day.paid)));
      lines.push(
        "",
        "Total paid: " + money(s.totalPaid),
        "Remaining balance: " + money(s.remaining),
        "",
        "RECORDED PAYMENTS",
      );
      s.dailyCommissions.filter(day => day.adjustment !== 0).forEach(day => lines.push(`${day.date}: Balance adjustment ${money(day.adjustment)} / ${day.adjustmentReason}`));
      if (s.rentAdjustment !== 0) lines.push(`Rent balance adjustment: ${money(s.rentAdjustment)} / ${tracking.rentAdjustments?.[month]?.reason}`);
      s.payments.forEach((p) =>
        lines.push(
          [
            p.date,
            p.category,
            p.commissionDate ? `Sales day ${p.commissionDate}` : "",
            money(p.amount),
            p.paymentMode,
            p.paymentReference || "No reference",
          ].join(" / "),
        ),
      );
      if (!s.payments.length) lines.push("No payments recorded.");
      lines.push(
        "",
        "Daily commission = software sales × 95% × agreed rate (5% VAT deducted first). Rent is monthly. Payments settle the selected sales date.",
        "This statement covers recorded data only; it is not a payment receipt.",
      );
      printStaffDocument(settings.stallName + " / " + period, lines.join("\n"));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not print statement.",
      );
    }
  };

  return (
    <div className="space-y-6">
      {printDate && <DailyCommissionPrintPreview date={printDate} sales={salesHistory} expenses={expenses} settings={settings} tracking={tracking} onClose={() => setPrintDate(null)} />}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Commission & Statement</h2>
          <p className="mt-1 text-xs text-slate-500">
            {period} / {s.days.length} recorded sales days · Daily commission = sales × 95% × {rate}%
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Statement month"
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) { setMonth(e.target.value); onMonthChange?.(e.target.value); setCommissionExpanded(false); setSalesExpanded(false); }
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <button onClick={exportStatement} className={buttonClass}>
            <Download size={16} />
            Export Statement
          </button>
          <button onClick={print} className={buttonClass}>
            <Printer size={16} />
            Print Statement
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {s.remaining > 0 && <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle size={18} className="shrink-0" /><p><strong>{money(s.remaining)} due for {period}.</strong> {s.rentDue > 0 ? `Rent: ${money(s.rentDue)}. ` : ''}{s.commissionDue > 0 ? `Commission: ${money(s.commissionDue)}.` : ''}</p></div>}
      {s.remaining === 0 && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">All rent and commission obligations for {period} are settled.</p>}
      <section
        className="grid grid-cols-2 gap-5 border-y border-slate-200 py-5 lg:grid-cols-4 dark:border-slate-700"
        aria-label="Statement totals"
      >
        {[
          ["Recorded Sales", s.gross],
          ["Total Owed", s.totalOwed],
          ["Payments + Confirmations", s.totalPaid],
          ["Remaining Balance", s.remaining],
        ].map(([label, amount]) => (
          <div key={label as string}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {money(amount as number)}
            </p>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rent & Commission</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
              <tr>
                {["Cost", "Owed", "Paid", "Remaining", "Status", ""].map(
                  (h, i) => (
                    <th key={i} className="px-3 py-3">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {obligations.map((o) => (
                <tr
                  key={o.category}
                  className="border-b border-slate-200 dark:border-slate-800"
                >
                  <td className="px-3 py-4 font-medium">
                    {o.label}
                    {o.credit > 0 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Overpayment: {money(o.credit)}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {money(o.owed)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {money(o.paid)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {money(o.due)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-xs">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${o.due === 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                      {o.due === 0 && <CheckCircle2 size={14} />}
                      {o.due > 0 ? (o.paid > 0 ? 'Part-paid' : 'Unpaid') : courtPaymentStatus(o.owed, o.paid)}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <button
                      disabled={o.due === 0}
                      title={o.due === 0 ? 'No outstanding balance for this item' : `Record payment toward ${money(o.due)} due`}
                      onClick={() => { if (o.due > 0 && o.category === 'rent') onRecordPayment('rent', month); else document.getElementById('daily-commission-ledger')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {o.due === 0 ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                      <span className="whitespace-nowrap">
                        {o.due === 0 ? courtPaymentStatus(o.owed, o.paid) : (o.category === 'rent' ? 'Record Rent' : 'View Daily Commission')}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {s.rentAdjustment !== 0 && <p className="text-sm text-slate-500">Rent balance adjustment: {money(s.rentAdjustment)} — {tracking.rentAdjustments?.[month]?.reason}</p>}
      {isAdmin && onSaveTracking && <details className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <summary className="cursor-pointer text-sm font-semibold">Adjust Final Landlord Balance (Admin)</summary>
        <form className="mt-4 space-y-3" onSubmit={async event => {
          event.preventDefault(); if (!isAdmin || assigning) return; setError(''); setAdjustSaved(false); setAssigning(true);
          try {
            const statement = courtStatement(adjustDate.slice(0, 7), salesHistory, expenses, settings, tracking);
            const day = statement.dailyCommissions.find(row => row.date === adjustDate);
            if (adjustCategory === 'commission' && !day?.hasSalesRecord) throw new Error('Choose a sales date with a recorded commission.');
            const unadjusted = adjustCategory === 'rent' ? statement.rent - statement.rentPaid : day!.owed - day!.paid;
            const entry = { amount: roundMoney(adjustTarget - unadjusted), reason: adjustReason.trim() };
            if (!entry.reason) throw new Error('Enter a reason.');
            await onSaveTracking({ paidDates: {}, ...(adjustCategory === 'rent' ? { rentAdjustments: { [adjustDate.slice(0, 7)]: entry } } : { balanceAdjustments: { [adjustDate]: entry } }) });
            setAdjustSaved(true);
          } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not adjust balance.'); } finally { setAssigning(false); }
        }}>
          <p className="text-xs text-slate-500">Set the agreed remaining balance, for example ৳13 to ৳0. This records a balance adjustment without changing sales, bills, or cash payments. Negative balances mean credit.</p>
          <label className="block text-sm">Balance Type<select value={adjustCategory} onChange={event => { setAdjustCategory(event.target.value as 'rent' | 'commission'); setAdjustSaved(false); }} className="staff-input"><option value="commission">Daily Commission</option><option value="rent">Monthly Rent</option></select></label>
          <label className="block text-sm">{adjustCategory === 'rent' ? 'Rent Month' : 'Commission Sales Date'}<input type={adjustCategory === 'rent' ? 'month' : 'date'} required value={adjustCategory === 'rent' ? adjustDate.slice(0, 7) : adjustDate} onChange={event => { setAdjustDate(adjustCategory === 'rent' ? `${event.target.value}-01` : event.target.value); setAdjustSaved(false); }} className="staff-input" /></label>
          <p className="text-sm">Current final balance: {money((() => { const statement = courtStatement(adjustDate.slice(0, 7), salesHistory, expenses, settings, tracking); const day = statement.dailyCommissions.find(row => row.date === adjustDate); return adjustCategory === 'rent' ? statement.rentDue - statement.rentCredit : day ? day.due - day.credit : 0; })())}</p>
          <label className="block text-sm">Final Balance (BDT)<NumericInput required step="0.01" value={adjustTarget} onChange={event => { setAdjustTarget(Number(event.target.value)); setAdjustSaved(false); }} className="staff-input" /></label>
          <label className="block text-sm">Reason<input required maxLength={500} value={adjustReason} onChange={event => setAdjustReason(event.target.value)} className="staff-input" /></label>
          <button disabled={assigning} className={buttonClass}>{assigning ? 'Saving…' : 'Save Final Balance'}</button>
          {adjustSaved && <p role="status" className="text-sm text-emerald-700">Final balance adjusted.</p>}
        </form>
      </details>}
      {isAdmin && onSaveTracking && <details className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">Historical Commission &amp; Reminder Start</summary><form className="mt-4 space-y-3" onSubmit={async event => {
        event.preventDefault(); if (!isAdmin) return; setError(''); setTrackingSaved(false);
        if (!paidFrom || !paidThrough || paidThrough < paidFrom || (Date.parse(paidThrough) - Date.parse(paidFrom)) / 86400000 > 366) { setError('Choose a valid paid date range of up to one year.'); return; }
        const paidDates: Record<string, number> = {};
        const cursor = new Date(paidFrom + 'T00:00:00Z');
        while (cursor.toISOString().slice(0, 10) <= paidThrough) {
          const date = cursor.toISOString().slice(0, 10);
          const gross = salesHistory.filter(record => record.date === date).reduce((sum, record) => sum + record.grossSales, 0);
          paidDates[date] = calculateCommission(gross, settings.commissionRate);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        setAssigning(true);
        try { await onSaveTracking({ paidDates, startDate: trackingStart }); setTrackingSaved(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save historical confirmations.'); }
        finally { setAssigning(false); }
      }}><p className="text-xs text-slate-500">Confirm commission already paid outside this ledger. This marks the selected days paid without creating expenses or deducting cash again. Existing payment records count toward the confirmation, so they are not counted twice. Reminder start affects commission notifications only; older balances stay in history.</p><div className="flex flex-wrap gap-3"><label className="text-sm">Paid From<input aria-label="Commission paid from" required type="date" value={paidFrom} onChange={event => setPaidFrom(event.target.value)} className="ml-2 rounded border bg-transparent px-2 py-1" /></label><label className="text-sm">Paid Through<input aria-label="Commission paid through" required type="date" value={paidThrough} onChange={event => setPaidThrough(event.target.value)} className="ml-2 rounded border bg-transparent px-2 py-1" /></label><label className="text-sm">Reminder Start<input aria-label="Commission reminder start" required type="date" value={trackingStart} onChange={event => setTrackingStart(event.target.value)} className="ml-2 rounded border bg-transparent px-2 py-1" /></label></div><button type="submit" disabled={assigning} className={buttonClass}>{assigning ? 'Saving…' : 'Confirm Previously Paid'}</button>{trackingSaved && <p role="status" className="text-sm text-emerald-700">Historical commissions confirmed paid. Reminders start {trackingStart}.</p>}</form></details>}
      <section id="daily-commission-ledger" className="space-y-3 scroll-mt-40">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Daily Commission Payments</h3>{newestCommissions.length > 5 && <button type="button" aria-expanded={commissionExpanded} aria-controls="daily-commission-rows" onClick={() => setCommissionExpanded(value => !value)} className={buttonClass}>{commissionExpanded ? 'Collapse to latest 5 dates' : `Expand all ${newestCommissions.length} dates`}</button>}</div>
        <p className="text-xs text-slate-500">Newest dates first · Showing {visibleCommissions.length} of {newestCommissions.length}</p>
        {s.dailyCommissions.some(day => !day.hasSalesRecord) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Missing sales records: {s.dailyCommissions.filter(day => !day.hasSalesRecord).map(day => day.date).join(', ')}. A dash means the amount has not been recorded. Historical paid confirmations are preserved.</p>}
        {tracking.startDate && <p className="text-xs text-slate-500">Commission reminders start {tracking.startDate}. Earlier dates remain visible in history.</p>}
        <p className="text-xs text-slate-500">Deduct 5% VAT from software sales first, then apply {rate}% commission. Example: ৳100 − ৳5 = ৳95; commission at 10% = ৳9.50. Each sales day is settled separately.</p>
        {s.unallocatedCommissionPaid > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{money(s.unallocatedCommissionPaid)} of older commission payments have no matching sales date. They remain in payment history but cannot mark a specific day paid. Correct their sales dates before recording more payments.</p>}
        {onAssignPaymentDate && s.unallocatedCommissionPayments.map(payment => <form key={payment.id} onSubmit={async event => { event.preventDefault(); const date = assignDates[payment.id]; if (!date) return; setAssigning(true); setError(''); try { await onAssignPaymentDate(payment, date); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not assign payment date.'); } finally { setAssigning(false); } }} className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 p-3 text-sm"><p>Existing payment: {money(payment.amount)} on {payment.date}</p><label>Settles sales date<input aria-label={`Sales date for payment ${payment.id}`} required type="date" min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`} value={assignDates[payment.id] ?? ''} onChange={event => setAssignDates(current => ({ ...current, [payment.id]: event.target.value }))} className="ml-2 rounded border border-slate-300 bg-transparent px-2 py-1" /></label><button disabled={assigning} type="submit" className={buttonClass}>Assign Existing Payment</button></form>)}
        <div id="daily-commission-rows" className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Sales Date', 'Software Sales', '5% VAT Deduction', 'Commission Base', 'Commission Owed', 'Paid', 'Adjustment', 'Due', 'Status', 'Action'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{label}</th>)}</tr></thead><tbody>
          {visibleCommissions.length ? visibleCommissions.map(day => <tr key={day.date} className="border-t border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-3 py-3">{day.date}{!day.hasSalesRecord && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Sales not recorded</span>}</td>{[day.grossSales, day.vatDeduction, day.base, day.owed, day.paid, day.adjustment, day.due].map((amount, index) => <td key={index} className="whitespace-nowrap px-3 py-3 font-mono">{!day.hasSalesRecord && (index < 4 || amount === 0) ? '—' : money(amount)}</td>)}<td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${day.due > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{day.adjustment !== 0 ? (day.due === 0 ? 'Settled' : 'Adjusted') : day.historicalConfirmation && day.due === 0 ? 'Paid' : courtPaymentStatus(day.owed, day.paid)}</span>{day.adjustmentReason && <span className="mt-1 block text-xs text-slate-500">{day.adjustmentReason}</span>}{day.historicalConfirmation && <span className="mt-1 block text-xs text-slate-500">Confirmed previously paid</span>}</td><td className="px-3 py-3"><button type="button" aria-label={`Print commission for ${day.date}`} onClick={() => setPrintDate(day.date)} className={`${buttonClass} mb-2 whitespace-nowrap`}><Printer size={14} />Print Receipt</button><button type="button" disabled={day.due === 0 || s.unallocatedCommissionPaid > 0} aria-label={`Record commission for ${day.date}`} onClick={() => { if (day.due > 0 && !s.unallocatedCommissionPaid) onRecordPayment('commission', month, day.date); }} className={`${buttonClass} whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60`}>{day.due === 0 ? (day.adjustment !== 0 ? 'Settled' : day.historicalConfirmation ? 'Paid' : courtPaymentStatus(day.owed, day.paid)) : 'Record Payment'}</button>{!day.hasSalesRecord && onRecordMissingSales && <button type="button" className={`${buttonClass} mt-2 whitespace-nowrap`} onClick={() => onRecordMissingSales(day.date)}>Record Missing Sales</button>}</td></tr>) : <tr><td colSpan={10} className="p-4 text-sm text-slate-500">No commission due: no sales recorded for this month.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Sales Collections</h3>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Cash", s.cash],
            ["bKash", s.bkash],
            ["Nagad", s.nagad],
            ["Card", s.card],
            ["Bank Transfer", s.bank],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums">
                {money(value as number)}
              </dd>
            </div>
          ))}
        </dl>
        {Math.abs(s.collectionDifference) >= 0.01 && (
          <p
            role="status"
            className="flex items-start gap-2 text-xs text-rose-600"
          >
            <AlertCircle size={16} className="shrink-0" />
            Sales and payment collections differ by{" "}
            {money(s.collectionDifference)}.
          </p>
        )}
        {Math.abs(s.recordedCommission - s.commission) >= 0.01 && (
          <p role="status" className="text-xs text-rose-600">
            Sales-log commission {money(s.recordedCommission)} differs from the
            agreed-rate calculation {money(s.commission)}.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Recorded Sales</h3>{newestSales.length > 5 && <button type="button" aria-expanded={salesExpanded} aria-controls="recorded-sales-rows" onClick={() => setSalesExpanded(value => !value)} className={buttonClass}>{salesExpanded ? 'Collapse to latest 5 sales' : `Expand all ${newestSales.length} sales`}</button>}</div>
        <p className="text-xs text-slate-500">Newest dates first · Showing {visibleSales.length} of {newestSales.length}</p>
        <div id="recorded-sales-rows" className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
              <tr>
                {[
                  "Date",
                  "Gross Sales",
                  "Commission (" + rate + "%)",
                  "Cash",
                  "bKash",
                  "Nagad",
                  "Card",
                  "Bank Transfer",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSales.map((day) => (
                <tr
                  key={day.id}
                  className="border-b border-slate-200 dark:border-slate-800"
                >
                  {[
                    day.date,
                    money(day.grossSales),
                    money(
                      calculateCommission(day.grossSales, settings.commissionRate),
                    ),
                    money(day.cashSales),
                    money(day.bkashSales),
                    money(day.nagadSales),
                    money(day.cardSales),
                    money(day.bankSales ?? 0),
                  ].map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-3">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!s.days.length && (
            <p className="py-6 text-sm text-slate-500">
              No sales recorded for this month.
            </p>
          )}
        </div>
      </section>
      <section className="space-y-3">
        <header className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Rent & Commission Payments</h3>
          <button onClick={onOpenExpenses} className={buttonClass}>
            <ExternalLink size={14} />
            Monthly Expenses
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
              <tr>
                {[
                  "Payment Date",
                  "Category",
                  "Commission Sales Date",
                  "Amount",
                  "Method",
                  "Reference",
                ].map((h) => (
                  <th key={h} className="px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-200 dark:border-slate-800"
                >
                  <td className="whitespace-nowrap px-3 py-3">{p.date}</td>
                  <td className="px-3 py-3 capitalize">{p.category}</td>
                  <td className="whitespace-nowrap px-3 py-3">{p.category === "commission" ? (p.commissionDate ?? (s.dailyCommissions.some(day => day.date === p.date) ? p.date : "Needs assignment")) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {money(p.amount)}
                  </td>
                  <td className="px-3 py-3">{p.paymentMode}</td>
                  <td className="max-w-60 break-all px-3 py-3">
                    {p.paymentReference || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.payments.length && (
            <p className="py-6 text-sm text-slate-500">
              No rent or commission payments recorded for this month.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
