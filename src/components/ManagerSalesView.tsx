import {isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import { useState } from 'react';
import type { DailySalesRecord } from '../types';
import { salesPayments } from '../utils/salesPayments';
import { exportToCSV, formatBDT, formatDatePretty, getTodayString } from '../utils/formatters';

interface Props {
  mode: 'overview' | 'sales';
  sales: DailySalesRecord[];
  onEdit: (record?: DailySalesRecord) => void;
  onOpenCash: () => void;
}

// Whitelist operational fields so manager exports cannot include owner reports.
export function managerSalesRows(sales: DailySalesRecord[]) {
  return sales.map(record => {
    const payment = salesPayments(record);
    return { Date: record.date, SoftwareSales_BDT: record.grossSales, CashSales_BDT: payment.cash, BankTransfer_BDT: payment.bank, bKash_BDT: payment.bkash, Nagad_BDT: payment.nagad, Card_BDT: payment.card, Orders: record.customerCount ?? 0 };
  });
}

export function ManagerSalesView({ mode, sales, onEdit, onOpenCash }: Props) {
  const [month, setMonth] = useRememberedViewState('sales.month',getTodayString().slice(0, 7),isViewMonth);
  const records = sales.filter(record => record.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const rows = managerSalesRows(records);
  const total = (key: 'SoftwareSales_BDT' | 'CashSales_BDT' | 'BankTransfer_BDT' | 'bKash_BDT' | 'Nagad_BDT' | 'Card_BDT') => rows.reduce((sum, row) => sum + row[key], 0);
  const buttonClass = 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700';
  return <div className="space-y-6 text-slate-900 dark:text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold">{mode === 'overview' ? 'Restaurant Overview' : 'Sales & Cash'}</h2>
      <div className="flex flex-wrap gap-2">
        <input type="month" aria-label="Sales month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
        <button className={buttonClass} onClick={() => exportToCSV(`Mughal_Mahal_sales_${month}`, rows)}>Export Sales</button>
        <button className={buttonClass} onClick={onOpenCash}>Daily Cash</button>
        <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => onEdit()}>Record Sales</button>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Software Sales', total('SoftwareSales_BDT')], ['Cash Sales', total('CashSales_BDT')], ['Digital Payments', total('BankTransfer_BDT') + total('bKash_BDT') + total('Nagad_BDT') + total('Card_BDT')]].map(([label, amount]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{formatBDT(Number(amount))}</p></div>)}
    </div>
    <p className="text-sm text-slate-500">{records.length} sales records this month. Cash sales exclude bank, bKash, Nagad, and card payments. Open Daily Cash for the balance including change float and cash expenses.</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left text-sm"><thead className="bg-slate-100 dark:bg-slate-900"><tr>{['Date', 'Software Sales', 'Cash', 'Bank', 'bKash', 'Nagad', 'Card', 'Actions'].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead>
        <tbody>{records.length ? records.map(record => { const payment = salesPayments(record); return <tr key={record.id} className="border-t border-slate-200 dark:border-slate-800"><td className="whitespace-nowrap px-4 py-3">{formatDatePretty(record.date)}</td>{[record.grossSales, payment.cash, payment.bank, payment.bkash, payment.nagad, payment.card].map((amount, index) => <td key={index} className="whitespace-nowrap px-4 py-3 font-mono">{formatBDT(amount)}</td>)}<td className="px-4 py-3"><button className={buttonClass} aria-label={`Edit sales for ${record.date}`} onClick={() => onEdit(record)}>Edit Sales</button></td></tr>; }) : <tr><td colSpan={8} className="p-6 text-center text-slate-500">No sales recorded for this month.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
