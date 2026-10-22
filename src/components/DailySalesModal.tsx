import {isViewDate} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import { calculateCommission } from '../utils/commission';
import { salesPayments } from '../utils/salesPayments';
import { NumericInput } from './NumericInput';
import React, { useState, useEffect } from 'react';
import { roundMoney } from '../utils/money';
import { X, Calculator, AlertCircle, Check, Info } from 'lucide-react';
import { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import {dailySalesCosts} from '../utils/dailySalesCosts';
import { formatBDT, getTodayString } from '../utils/formatters';

interface DailySalesModalProps {
  canViewProfit?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: DailySalesRecord) => void;
  existingRecord?: DailySalesRecord;
  settings: FoodCourtSettings;
  suggestedStaffDailyCost: number;
  expenses: MonthlyExpenseItem[];
}

export const DailySalesModal: React.FC<DailySalesModalProps> = ({
  canViewProfit = false,
  isOpen,
  onClose,
  onSave,
  existingRecord,
  settings,
  suggestedStaffDailyCost,
  expenses,
}) => {
  const [date, setDate] = useRememberedViewState<string>('sales.entryDate',getTodayString(),isViewDate);
  const [grossSales, setGrossSales] = useState<number>(0);
  const [bankSales, setBankSales] = useState<number>(0);
  const [bkashSales, setBkashSales] = useState<number>(0);
  const [nagadSales, setNagadSales] = useState<number>(0);
  const [cardSales, setCardSales] = useState<number>(0);
  const [staffCost, setStaffCost] = useState<number>(suggestedStaffDailyCost);
  const recordedCosts=dailySalesCosts(expenses,date);
  const cogsCost=recordedCosts.ingredients;
  const otherExpenses=recordedCosts.other;
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [topSellingItem, setTopSellingItem] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (existingRecord) {
      setDate(existingRecord.date);
      setGrossSales(existingRecord.grossSales);
      setBankSales(existingRecord.bankSales ?? 0);
      setBkashSales(existingRecord.bkashSales);
      setNagadSales(existingRecord.nagadSales);
      setCardSales(existingRecord.cardSales);
      setStaffCost(existingRecord.staffCost);
      setCustomerCount(existingRecord.customerCount ?? 0);
      setTopSellingItem(existingRecord.topSellingItem || '');
      setNotes(existingRecord.notes || '');
    } else {
      setGrossSales(0);
      setBankSales(0);
      setBkashSales(0);
      setNagadSales(0);
      setCardSales(0);
      setCustomerCount(0);
      setTopSellingItem('');
      setNotes('');
      setStaffCost(suggestedStaffDailyCost);
    }
  }, [existingRecord, suggestedStaffDailyCost, isOpen]);

  if (!isOpen) return null;

  // Real-time calculations
  const foodCourtCommission = calculateCommission(grossSales, settings.commissionRate);
  const proratedRent = settings.dailyRent; // 1,667
  const netProfit = roundMoney(
    grossSales - foodCourtCommission - proratedRent - cogsCost - staffCost - otherExpenses
  );
  const profitMargin = grossSales > 0 ? ((netProfit / grossSales) * 100).toFixed(1) : '0.0';

  const cashSales = salesPayments({ grossSales, bankSales, bkashSales, nagadSales, cardSales }).cash;
  const sumPaymentChannels = cashSales + bkashSales + nagadSales + cardSales + bankSales;
  const paymentDiff = grossSales - sumPaymentChannels;

  const handleGrossChange = (val: number) => {
    setGrossSales(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cashSales < 0) return;
    const newRecord: DailySalesRecord = {
      id: existingRecord ? existingRecord.id : `sales-${date}`,
      date,
      grossSales,
      cashSales,
      bkashSales,
      nagadSales,
      cardSales,
      bankSales,
      foodCourtCommission,
      proratedRent,
      cogsCost,
      staffCost,
      otherExpenses,
      netProfit,
      customerCount,
      topSellingItem,
      notes,
    };
    onSave(newRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label="Daily sales entry" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>{existingRecord ? (canViewProfit ? 'Edit Daily Sales & P&L Log' : 'Edit Daily Sales') : 'Quick End-of-Day Sales Entry'}</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Commission: {(settings.commissionRate * 100).toFixed(1)}% after 5% VAT deduction · Daily rent: {formatBDT(settings.dailyRent)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sales entry"
            title="Close sales entry"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {/* Top row: Date & Gross Sales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Business Date
                </label>
                <input
                  type="date"
                  aria-label="Business Date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Gross Sales Total (৳)</span>
                  <span className="text-amber-700 dark:text-amber-400 font-semibold text-xs">Total Drawer & Digital</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">৳</span>
                  <NumericInput
                    type="number"
                    min="0"
                    step="any"
                    value={grossSales}
                    onChange={e => handleGrossChange(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-base font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="p-3.5 bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payment Channels Breakdown
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Cash Sales (Automatic)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-500">৳</span>
                    <NumericInput
                      type="number"
                      min="0"
                      value={cashSales}
                      readOnly
                      aria-label="Cash Sales (Automatic)"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded px-2.5 py-1.5 pl-6 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-pink-700 dark:text-pink-400 mb-1 font-medium">bKash Merchant</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-500">৳</span>
                    <NumericInput
                      type="number"
                      min="0"
                      value={bkashSales}
                      onChange={e => setBkashSales(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded px-2.5 py-1.5 pl-6 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-orange-700 dark:text-orange-400 mb-1 font-medium">Nagad</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-500">৳</span>
                    <NumericInput
                      type="number"
                      min="0"
                      value={nagadSales}
                      onChange={e => setNagadSales(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded px-2.5 py-1.5 pl-6 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-blue-700 dark:text-blue-400 mb-1 font-medium">POS Card</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-500">৳</span>
                    <NumericInput
                      type="number"
                      min="0"
                      value={cardSales}
                      onChange={e => setCardSales(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded px-2.5 py-1.5 pl-6 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <label className="block text-xs text-slate-600 dark:text-slate-400">Bank Transfer (৳)
                <NumericInput aria-label="Bank Transfer (৳)" min={0} value={bankSales} onChange={e => setBankSales(Number(e.target.value))} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              <p className="text-xs text-slate-600 dark:text-slate-400">Cash sales = software sales − bank transfer − bKash − Nagad − card. Enter each payment once; card settlements to your bank stay under card. Exclude change float from software sales.</p>
              {cashSales < 0 && <p role="alert" className="text-sm text-rose-600">Digital payments exceed total sales. Correct the breakdown before saving.</p>}
              {paymentDiff !== 0 && (
                <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Channel sum ({formatBDT(sumPaymentChannels)}) differs by {formatBDT(Math.abs(paymentDiff))} from Gross Sales.
                  </span>
                </p>
              )}
            </div>

            {/* Operating Costs Row */}
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-slate-950">
              <p className="font-semibold">Costs from Daily Expenses · {date}</p>
              <p>Ingredient and other costs fill automatically for this date, including credit purchases. Rent, commission and staff payroll are calculated separately.</p>
              <details><summary className="cursor-pointer font-medium">View {recordedCosts.rows.length} recorded cost entries</summary><ul className="mt-2 space-y-1">{recordedCosts.rows.map(row=><li key={row.id} className="flex justify-between gap-3"><span>{row.title}</span><span className="whitespace-nowrap font-mono">{formatBDT(row.amount)}</span></li>)}{!recordedCosts.rows.length && <li>No ingredient or other expenses recorded for this date.</li>}</ul></details>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ingredient COGS (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">৳</span>
                  <NumericInput
                    type="number"
                    min="0"
                    value={cogsCost}
                    readOnly
                    aria-label="Ingredient COGS (Automatic)"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 tabular-nums"
                  />
                </div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block">Automatic: recorded ingredient expenses</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Daily Staff Payroll (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">৳</span>
                  <NumericInput
                    type="number"
                    min="0"
                    value={staffCost}
                    onChange={e => setStaffCost(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 tabular-nums"
                  />
                </div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block">Active staff daily wage allocation</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Other Petty Costs (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">৳</span>
                  <NumericInput
                    type="number"
                    min="0"
                    value={otherExpenses}
                    readOnly
                    aria-label="Other Petty Costs (Automatic)"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 tabular-nums"
                  />
                </div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block">Automatic: gas, packaging, ice, transport, cleaning and other costs</span>
              </div>
            </div>

            {/* LIVE AUTOMATED PROFIT & LOSS PREVIEW */}
            {canViewProfit && <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Automated Food Court P&L Deduction Calculation</span>
                <span className="text-amber-700 dark:text-amber-400">Commission & Daily Rent</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-white/60 dark:bg-slate-900/60 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400 text-[11px] block">Gross Sales</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-sm">
                    {formatBDT(grossSales)}
                  </span>
                </div>

                <div className="p-2 bg-white/60 dark:bg-slate-900/60 rounded border border-amber-200/30 dark:border-amber-900/30">
                  <span className="text-amber-700 dark:text-amber-400 text-[11px] block flex items-center gap-1">
                    <span>Sales Commission (after 5% VAT)</span>
                    <span title="Covers common power, cleaning, tissues, waste disposal" className="cursor-help">
                      <Info className="w-3 h-3 text-amber-500" />
                    </span>
                  </span>
                  <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400 text-sm">
                    -{formatBDT(foodCourtCommission)}
                  </span>
                </div>

                <div className="p-2 bg-white/60 dark:bg-slate-900/60 rounded border border-indigo-200/30 dark:border-indigo-900/30">
                  <span className="text-indigo-700 dark:text-indigo-300 text-[11px] block">Prorated Daily Rent</span>
                  <span className="font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300 text-sm">
                    -{formatBDT(proratedRent)}
                  </span>
                </div>

                <div className={`p-2 rounded border ${
                  netProfit >= 0 ? 'bg-emerald-100/40 dark:bg-emerald-950/40 border-emerald-800/40' : 'bg-rose-100/40 dark:bg-rose-950/40 border-rose-800/40'
                }`}>
                  <span className={`text-[11px] block font-medium ${netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    Net Daily Profit
                  </span>
                  <span className={`font-mono tabular-nums font-bold text-base ${
                    netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}>
                    {formatBDT(netProfit)}
                  </span>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block font-mono">
                    Margin: {profitMargin}%
                  </span>
                </div>
              </div>
            </div>

            }
            {/* Optional Operations Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Total Customer Orders / Tokens
                </label>
                <NumericInput
                  type="number" step="1"
                  min="0"
                  value={customerCount}
                  onChange={e => setCustomerCount(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Top Selling Dish
                </label>
                <input
                  type="text"
                  value={topSellingItem}
                  onChange={e => setTopSellingItem(e.target.value)}
                  placeholder="e.g. Shahi Mutton Kacchi"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Shift & Kitchen Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Special corporate order, rain in the evening, waste note..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Food court auto-deductions are calculated instantaneously.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{canViewProfit ? 'Save Daily P&L' : 'Save Daily Sales'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
