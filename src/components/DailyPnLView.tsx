import {useRememberedViewState} from '../lib/useRememberedViewState';
import { salesPayments } from '../utils/salesPayments';
import React, { useState, useMemo } from 'react';
import {
  Calendar,
  DollarSign,
  Download,
  Filter,
  PlusCircle,
  TrendingUp,
  Building,
  Users,
  Trash2,
  Edit2,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { DailySalesRecord, FoodCourtSettings } from '../types';
import { formatBDT, formatDatePretty, exportToCSV, getTodayString } from '../utils/formatters';

interface DailyPnLViewProps {
  salesHistory: DailySalesRecord[];
  settings: FoodCourtSettings;
  onOpenSalesModal: (record?: DailySalesRecord) => void;
  onDeleteRecord: (id: string) => void;
}

export const DailyPnLView: React.FC<DailyPnLViewProps> = ({
  salesHistory,
  settings,
  onOpenSalesModal,
  onDeleteRecord,
}) => {
  const [filterPeriod, setFilterPeriod] = useRememberedViewState<'all' | 'month' | '7days'>('sales.period','all',value=>['all','month','7days'].includes(String(value)));
  const [viewMode, setViewMode] = useRememberedViewState<'daily' | 'monthly'>('sales.view','daily',value=>['daily','monthly'].includes(String(value)));
  const [searchQuery, setSearchQuery] = useState('');
  const today = getTodayString();
  const currentMonth = today.slice(0, 7);

  // Filter records
  const filteredRecords = useMemo(() => {
    let records = [...salesHistory].sort((a, b) => b.date.localeCompare(a.date));

    if (filterPeriod === 'month') {
      records = records.filter(r => r.date.startsWith(currentMonth));
    } else if (filterPeriod === '7days') {
      const start = new Date(`${today}T12:00:00`);
      start.setDate(start.getDate() - 6);
      const since = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      records = records.filter(r => r.date >= since && r.date <= today);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      records = records.filter(
        r =>
          r.date.includes(q) ||
          (r.topSellingItem && r.topSellingItem.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q))
      );
    }

    return records;
  }, [salesHistory, filterPeriod, searchQuery, currentMonth, today]);

  // Aggregate Totals
  const totals = useMemo(() => {
    const gross = filteredRecords.reduce((acc, r) => acc + r.grossSales, 0);
    const commission = filteredRecords.reduce((acc, r) => acc + r.foodCourtCommission, 0);
    const rent =
      viewMode === 'monthly'
        ? settings.monthlyRent * new Set(filteredRecords.map(record => record.date.slice(0, 7))).size
        : filteredRecords.reduce((acc, r) => acc + r.proratedRent, 0);
    const cogs = filteredRecords.reduce((acc, r) => acc + r.cogsCost, 0);
    const staff = filteredRecords.reduce((acc, r) => acc + r.staffCost, 0);
    const other = filteredRecords.reduce((acc, r) => acc + r.otherExpenses, 0);
    const net = gross - commission - rent - cogs - staff - other;
    const margin = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0';

    const cash = filteredRecords.reduce((acc, r) => acc + salesPayments(r).cash, 0);
    const bkash = filteredRecords.reduce((acc, r) => acc + r.bkashSales, 0);
    const nagad = filteredRecords.reduce((acc, r) => acc + r.nagadSales, 0);
    const card = filteredRecords.reduce((acc, r) => acc + r.cardSales + (r.bankSales ?? 0), 0);

    return { gross, commission, rent, cogs, staff, other, net, margin, cash, bkash, nagad, card };
  }, [filteredRecords, viewMode, settings.monthlyRent]);

  const handleExportCSV = () => {
    const rows = filteredRecords.map(r => ({
      Date: r.date,
      GrossSales_BDT: r.grossSales,
      Cash_BDT: salesPayments(r).cash,
      bKash_BDT: r.bkashSales,
      Nagad_BDT: r.nagadSales,
      Card_BDT: r.cardSales,
      BankTransfer_BDT: r.bankSales ?? 0,
      SalesCommission_BDT: r.foodCourtCommission,
      ProratedRent_BDT: r.proratedRent,
      COGS_Ingredients_BDT: r.cogsCost,
      StaffWages_BDT: r.staffCost,
      OtherExpenses_BDT: r.otherExpenses,
      NetProfit_BDT: r.netProfit,
      ProfitMargin: `${((r.netProfit / (r.grossSales || 1)) * 100).toFixed(1)}%`,
      CustomerTokens: r.customerCount || 0,
      TopItem: r.topSellingItem || '',
      Notes: r.notes || '',
    }));
    exportToCSV(`food_court_stall_pnl_${filterPeriod}`, rows);
  };

  return (
    <div className="space-y-6">
      {/* View Switcher & Period Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Daily Profit & Loss Ledger
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Recorded sales, ingredient costs, payroll, rent, and commission.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rent View Mode Toggle */}
          <div className="grid w-full grid-cols-2 sm:flex sm:w-auto items-center p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Daily Prorated ({formatBDT(settings.dailyRent)})
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'monthly'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Monthly Rent ({formatBDT(settings.monthlyRent)})
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Gross Sales */}
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Total Gross Sales</span>
          <span className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1 block tabular-nums">
            {formatBDT(totals.gross)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {filteredRecords.length} business days
          </span>
        </div>

        {/* 10% Food Court Commission */}
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-amber-200/30 dark:border-amber-900/30 rounded-xl">
          <span className="text-[11px] text-amber-700/90 dark:text-amber-400/90 block font-medium flex items-center gap-1">
            <span>Sales Commission (after 5% VAT)</span>
            <span className="text-[10px] text-amber-500/70 font-mono">Recorded</span>
          </span>
          <span className="text-lg font-bold font-mono text-amber-700 dark:text-amber-400 mt-1 block tabular-nums">
            -{formatBDT(totals.commission)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Utility, power, waste
          </span>
        </div>

        {/* Prorated Rent */}
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block font-medium">
            {viewMode === 'monthly' ? 'Monthly Rent' : 'Prorated Rent'}
          </span>
          <span className="text-lg font-bold font-mono text-indigo-700 dark:text-indigo-300 mt-1 block tabular-nums">
            -{formatBDT(totals.rent)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {viewMode === 'monthly' ? `${formatBDT(settings.monthlyRent)} monthly` : 'Daily recorded allocation'}
          </span>
        </div>

        {/* Raw Ingredients COGS */}
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Raw Ingredients (COGS)</span>
          <span className="text-lg font-bold font-mono text-rose-700/90 dark:text-rose-300/90 mt-1 block tabular-nums">
            -{formatBDT(totals.cogs)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {totals.gross > 0 ? ((totals.cogs / totals.gross) * 100).toFixed(0) : '0'}% of sales
          </span>
        </div>

        {/* Staff Payroll Share */}
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Staff Payroll Share</span>
          <span className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300 mt-1 block tabular-nums">
            -{formatBDT(totals.staff)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Recorded payroll allocation
          </span>
        </div>

        {/* Net Profit */}
        <div className={`p-3.5 rounded-xl border ${
          totals.net >= 0 ? 'bg-emerald-100/40 dark:bg-emerald-950/40 border-emerald-800/40' : 'bg-rose-100/40 dark:bg-rose-950/40 border-rose-800/40'
        }`}>
          <span className={`text-[11px] block font-semibold ${
            totals.net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
          }`}>
            Total Net Take-Home
          </span>
          <span className={`text-lg font-bold font-mono mt-1 block tabular-nums ${
            totals.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          }`}>
            {formatBDT(totals.net)}
          </span>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 block mt-0.5 font-mono">
            Net Margin: {totals.margin}%
          </span>
        </div>
      </div>

      {/* REVENUE SINK & EXPENSE WATERFALL STRIP */}
      <div className="p-4 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Revenue Allocation Waterfall (How your sales ৳ are distributed)
          </span>
          <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px]">
            Gross: {formatBDT(totals.gross)}
          </span>
        </div>

        {totals.gross > 0 && (
          <div className="space-y-1.5">
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-50 dark:bg-slate-950">
              <div
                style={{ width: `${(totals.commission / totals.gross) * 100}%` }}
                title={`Sales Commission: ${formatBDT(totals.commission)}`}
                className="bg-amber-500 hover:opacity-90 transition"
              />
              <div
                style={{ width: `${(totals.rent / totals.gross) * 100}%` }}
                title={`Rent: ${formatBDT(totals.rent)}`}
                className="bg-indigo-500 hover:opacity-90 transition"
              />
              <div
                style={{ width: `${(totals.cogs / totals.gross) * 100}%` }}
                title={`COGS / Ingredients: ${formatBDT(totals.cogs)}`}
                className="bg-rose-500 hover:opacity-90 transition"
              />
              <div
                style={{ width: `${(totals.staff / totals.gross) * 100}%` }}
                title={`Staff Cost: ${formatBDT(totals.staff)}`}
                className="bg-blue-500 hover:opacity-90 transition"
              />
              <div
                style={{ width: `${Math.max(0, (totals.net / totals.gross) * 100)}%` }}
                title={`Net Profit: ${formatBDT(totals.net)}`}
                className="bg-emerald-500 hover:opacity-90 transition"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap text-[11px] text-slate-600 dark:text-slate-400 pt-1 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                <span>Commission ({((totals.commission / totals.gross) * 100).toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                <span>Stall Rent ({((totals.rent / totals.gross) * 100).toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                <span>Ingredients COGS ({((totals.cogs / totals.gross) * 100).toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                <span>Staff Wages ({((totals.staff / totals.gross) * 100).toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Net Take-Home ({totals.margin}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Channel Total Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white/50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 rounded-lg">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Total Cash Collected</span>
          <span className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5 block tabular-nums">
            {formatBDT(totals.cash)}
          </span>
          <span className="text-[10px] text-slate-500 block">In drawer register</span>
        </div>
        <div className="p-3 bg-white/50 dark:bg-slate-900/50 border border-pink-200/30 dark:border-pink-900/30 rounded-lg">
          <span className="text-[11px] text-pink-700 dark:text-pink-400 block font-medium">bKash Merchant Total</span>
          <span className="text-base font-bold font-mono text-pink-700 dark:text-pink-400 mt-0.5 block tabular-nums">
            {formatBDT(totals.bkash)}
          </span>
          <span className="text-[10px] text-slate-500 block">Direct wallet settlement</span>
        </div>
        <div className="p-3 bg-white/50 dark:bg-slate-900/50 border border-orange-200/30 dark:border-orange-900/30 rounded-lg">
          <span className="text-[11px] text-orange-700 dark:text-orange-400 block font-medium">Nagad Total</span>
          <span className="text-base font-bold font-mono text-orange-700 dark:text-orange-400 mt-0.5 block tabular-nums">
            {formatBDT(totals.nagad)}
          </span>
          <span className="text-[10px] text-slate-500 block">Digital collection</span>
        </div>
        <div className="p-3 bg-white/50 dark:bg-slate-900/50 border border-blue-200/30 dark:border-blue-900/30 rounded-lg">
          <span className="text-[11px] text-blue-700 dark:text-blue-400 block font-medium">Card / Bank Total</span>
          <span className="text-base font-bold font-mono text-blue-700 dark:text-blue-400 mt-0.5 block tabular-nums">
            {formatBDT(totals.card)}
          </span>
          <span className="text-[10px] text-slate-500 block">Card and direct bank receipts</span>
        </div>
      </div>

      {/* Filters and Table Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {/* Quick Period Tabs */}
          <div className="flex items-center p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setFilterPeriod('all')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                filterPeriod === 'all'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setFilterPeriod('month')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                filterPeriod === 'month'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setFilterPeriod('7days')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                filterPeriod === '7days'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Last 7 Days
            </button>
          </div>

          <span className="text-xs text-slate-500">
            {filteredRecords.length} records shown
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search date, dish, or notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-52"
          />

          <button
            onClick={() => onOpenSalesModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Log Daily Sales</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-medium">
              <th className="py-3 px-3.5">Date</th>
              <th className="py-3 px-3.5 text-right">Gross Sales</th>
              <th className="py-3 px-3.5 text-right text-pink-700/90 dark:text-pink-400/90">bKash / Cash</th>
              <th className="py-3 px-3.5 text-right text-amber-700 dark:text-amber-400">Commission</th>
              <th className="py-3 px-3.5 text-right text-indigo-700 dark:text-indigo-300">Prorated Rent</th>
              <th className="py-3 px-3.5 text-right">Ingredients (COGS)</th>
              <th className="py-3 px-3.5 text-right">Staff Wages</th>
              <th className="py-3 px-3.5 text-right">Other</th>
              <th className="py-3 px-3.5 text-right font-bold text-slate-800 dark:text-slate-200">Net Profit</th>
              <th className="py-3 px-3.5 text-right">Margin</th>
              <th className="py-3 px-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-500">
                  No sales entries recorded for this period.
                </td>
              </tr>
            ) : (
              filteredRecords.map(r => {
                const margin = r.grossSales > 0 ? ((r.netProfit / r.grossSales) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={r.id} className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white font-mono">{r.date}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.topSellingItem ? r.topSellingItem : 'Regular shift'}
                      </div>
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatBDT(r.grossSales)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-[11px] tabular-nums">
                      <span className="text-pink-700 dark:text-pink-400">{formatBDT(r.bkashSales)}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-700 dark:text-slate-300">{formatBDT(salesPayments(r).cash)}</span>
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                      -{formatBDT(r.foodCourtCommission)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-indigo-700 dark:text-indigo-300 tabular-nums">
                      -{formatBDT(r.proratedRent)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      -{formatBDT(r.cogsCost)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      -{formatBDT(r.staffCost)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-slate-500 tabular-nums">
                      -{formatBDT(r.otherExpenses)}
                    </td>

                    <td className={`py-3 px-3.5 text-right font-mono font-bold text-sm tabular-nums ${
                      r.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {formatBDT(r.netProfit)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      {margin}%
                    </td>

                    <td className="py-3 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenSalesModal(r)}
                          title="Edit Sales Entry"
                          className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteRecord(r.id)}
                          title="Delete Record"
                          className="p-1 text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
