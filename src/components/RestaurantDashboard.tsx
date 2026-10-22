import {isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import {useWorkScheduleHours} from '../lib/useWorkScheduleHours';
import { NumericInput } from './NumericInput';
import React, { useState } from 'react';
import { Download, Target } from 'lucide-react';
import { DailySalesRecord, FoodCourtSettings, InventoryItem, RestaurantPlan, RestaurantPlans, StaffMember } from '../types';
import { exportToCSV, formatBDT, getTodayString } from '../utils/formatters';
import { defaultRestaurantPlan, feasibility } from '../utils/restaurantFinance';

interface Props {
  mode: 'overview' | 'planning';
  settings: FoodCourtSettings;
  sales: DailySalesRecord[];
  inventory: InventoryItem[];
  staff: StaffMember[];
  plans: RestaurantPlans;
  onUpdatePlans: (plans: RestaurantPlans) => void;
  onNavigate: (tab: string) => void;
}

const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white';

export function RestaurantDashboard({ mode, settings, sales, inventory, staff, plans, onUpdatePlans, onNavigate }: Props) {
  const today = getTodayString();
  const [month, setMonth] = useRememberedViewState('dashboard.month',today.slice(0, 7),isViewMonth);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const storedPlan = plans[month] ?? defaultRestaurantPlan;
  const plan = { ...storedPlan, operatingDays: Math.min(storedPlan.operatingDays, daysInMonth) };
  const rows = sales.filter(record => record.date.startsWith(month) && record.date <= today);
  const totalSales = rows.reduce((sum, row) => sum + row.grossSales, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.netProfit, 0);
  const recordedFoodCost = rows.reduce((sum, row) => sum + row.cogsCost, 0);
  const scheduledHours=useWorkScheduleHours();
  const result = feasibility(plan, settings, staff, scheduledHours);
  const effectiveOperatingDays = Math.min(plan.operatingDays, daysInMonth);
  const remainingDays = month < today.slice(0, 7) ? 0 : month > today.slice(0, 7) ? daysInMonth : daysInMonth - Number(today.slice(8)) + 1;
  const remainingSales = Math.max(0, plan.monthlySalesTarget - totalSales);
  const progress = plan.monthlySalesTarget > 0 ? totalSales / plan.monthlySalesTarget * 100 : 0;
  const stockValue = inventory.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0);
  const updatePlan = (key: keyof RestaurantPlan, value: number) => onUpdatePlans({ ...plans, [month]: { ...plan, [key]: value } });
  const scenarios = [0.8, 1, 1.2].map(multiplier => {
    const revenue = plan.monthlySalesTarget * multiplier;
    const profit = revenue * result.contributionRate - result.fixedCosts;
    return { label: multiplier === 1 ? 'Base Target' : multiplier < 1 ? 'Lower Sales (-20%)' : 'Higher Sales (+20%)', revenue, profit, margin: revenue > 0 ? profit / revenue * 100 : 0, payback: profit > 0 && plan.initialInvestment > 0 ? plan.initialInvestment / profit : null };
  });
  const exportReport = () => {
    const report: Record<string, unknown>[] = [
      { Section: 'Restaurant', Metric: 'Name', Value: settings.stallName },
      { Section: 'Period', Metric: 'Month', Value: month },
      { Section: 'Actual (recorded days)', Metric: 'Sales', Value: totalSales },
      { Section: 'Actual (recorded days)', Metric: 'Net profit', Value: totalProfit },
      { Section: 'Actual (recorded days)', Metric: 'Days logged', Value: new Set(rows.map(row => row.date)).size },
      { Section: 'Assumptions', Metric: 'Monthly rent', Value: settings.monthlyRent },
      { Section: 'Assumptions', Metric: 'Monthly payroll budget', Value: result.payroll },
      { Section: 'Assumptions', Metric: 'Other monthly fixed costs', Value: plan.otherFixedCosts },
      { Section: 'Assumptions', Metric: 'Food cost percent', Value: plan.foodCostPct },
      { Section: 'Assumptions', Metric: 'Other variable cost percent', Value: plan.variableCostPct },
      { Section: 'Assumptions', Metric: 'Commission percent', Value: settings.commissionRate * 100 },
      { Section: 'Assumptions', Metric: 'Operating days', Value: plan.operatingDays },
      { Section: 'Assumptions', Metric: 'Average order value', Value: plan.averageOrderValue },
      { Section: 'Assumptions', Metric: 'Initial investment', Value: plan.initialInvestment },
      { Section: 'Targets', Metric: 'Monthly sales', Value: plan.monthlySalesTarget },
      { Section: 'Targets', Metric: 'Monthly profit', Value: plan.monthlyProfitTarget },
      { Section: 'Projection', Metric: 'Break-even sales', Value: result.breakEvenSales ?? 'Not achievable' },
      { Section: 'Projection', Metric: 'Sales required for profit target', Value: result.requiredSales ?? 'Not achievable' },
      ...scenarios.flatMap(scenario => [
        { Section: scenario.label, Metric: 'Projected sales', Value: scenario.revenue },
        { Section: scenario.label, Metric: 'Projected operating profit', Value: scenario.profit },
        { Section: scenario.label, Metric: 'Projected margin percent', Value: scenario.margin },
        { Section: scenario.label, Metric: 'Payback months (steady profit)', Value: scenario.payback ?? 'Unavailable' },
      ]),
    ];
    exportToCSV(`Mughal_Mahal_feasibility_${month}`, report);
  };
  const numberField = (label: string, key: keyof RestaurantPlan, max?: number, min = 0) => <label className="text-xs font-medium" key={key}>{label}
    <NumericInput aria-label={label} type="number" min={min} max={max} step={key === 'operatingDays' ? 1 : 'any'} value={plan[key]} className={inputClass} onChange={event => { const raw = Number(event.target.value); const next = Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, raw)); updatePlan(key, key === 'operatingDays' ? Math.round(next) : next); }} />
  </label>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{mode === 'overview' ? 'Restaurant Overview' : 'Monthly Targets & Feasibility'}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Report month" type="month" value={month} className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs" onChange={event => { if (event.target.value) setMonth(event.target.value); }} />
        <button onClick={exportReport} className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs"><Download size={16} /> Export Report</button>
      </div>
    </div>
    {mode === 'overview' && <p className="text-xs text-slate-500">All-Time Recorded Sales: <strong className="font-mono">{formatBDT(sales.reduce((sum, record) => sum + record.grossSales, 0))}</strong> · All-Time Recorded Profit: <strong className="font-mono">{formatBDT(sales.reduce((sum, record) => sum + record.netProfit, 0))}</strong></p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Recorded Sales', value: formatBDT(totalSales), detail: `${new Set(rows.map(row => row.date)).size} days logged` },
        { label: 'Recorded Net Profit', value: formatBDT(totalProfit), detail: totalSales > 0 ? `${(totalProfit / totalSales * 100).toFixed(1)}% recorded margin` : 'No sales recorded' },
        { label: 'Monthly Sales Target', value: formatBDT(plan.monthlySalesTarget), detail: `${progress.toFixed(1)}% achieved` },
        { label: 'Monthly Payroll Budget', value: formatBDT(result.payroll), detail: `${staff.filter(member => member.active).length} active staff` },
      ].map(metric => <div key={metric.label} className="min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <span className="text-xs text-slate-500">{metric.label}</span><p className="my-2 break-words text-lg font-bold font-mono">{metric.value}</p><span className="text-[11px] text-slate-500">{metric.detail}</span>
      </div>)}
    </div>
    <section className="space-y-3 border-y border-slate-200 dark:border-slate-800 py-5">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><h3 className="flex gap-2 font-semibold"><Target size={18} /> Monthly Sales Progress</h3><span>{formatBDT(remainingSales)} remaining</span></div>
      <progress aria-label="Monthly sales progress" max="100" value={Math.min(100, progress)} className="h-3 w-full accent-emerald-600" />
      <div className="grid gap-3 sm:grid-cols-3 text-xs">
        <p>Planned sales / operating day <strong className="block mt-1 font-mono text-base">{formatBDT(plan.monthlySalesTarget / effectiveOperatingDays)}</strong></p>
        <p>Estimated orders / operating day <strong className="block mt-1 font-mono text-base">{Math.ceil(plan.monthlySalesTarget / plan.averageOrderValue / effectiveOperatingDays)}</strong></p>
        <p>Required sales / remaining calendar day <strong className="block mt-1 font-mono text-base">{remainingDays > 0 ? formatBDT(remainingSales / remainingDays) : remainingSales > 0 ? 'Month ended' : 'Target met'}</strong></p>
      </div>
    </section>
    {mode === 'overview' ? <>
      <div className="space-y-6">
        <section className="space-y-3"><h3 className="text-sm font-semibold">Operations</h3><dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt>Inventory Value</dt><dd className="font-mono">{formatBDT(stockValue)}</dd></div>
          <div className="flex justify-between"><dt>Recorded Food Cost</dt><dd className="font-mono">{formatBDT(recordedFoodCost)}</dd></div>
          <div className="flex justify-between"><dt>Food Cost / Recorded Sales</dt><dd>{totalSales > 0 ? `${(recordedFoodCost / totalSales * 100).toFixed(1)}%` : 'Unavailable'}</dd></div>
          <div className="flex justify-between"><dt>Projected Monthly Operating Profit</dt><dd className="font-mono">{formatBDT(result.projectedProfit)}</dd></div>
        </dl><p className="text-xs text-slate-500">Recorded profit covers logged days only. Projection uses the monthly budget; expense payments are not deducted a second time.</p></section>
      </div>
      <button onClick={() => onNavigate('planning')} className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs"><Target size={16} /> Edit Targets & Feasibility</button>
    </> : <>
      <section className="space-y-4"><h3 className="text-sm font-semibold">Monthly Plan</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {numberField('Monthly Sales Target (Tk)', 'monthlySalesTarget')}
        {numberField('Monthly Profit Target (Tk)', 'monthlyProfitTarget')}
        {numberField('Operating Days', 'operatingDays', daysInMonth, 1)}
        {numberField('Average Order Value (Tk)', 'averageOrderValue', undefined, 1)}
        {numberField('Food Cost (%)', 'foodCostPct', 100)}
        {numberField('Other Variable Costs (%)', 'variableCostPct', 100)}
        {numberField('Other Fixed Costs / Month (Tk)', 'otherFixedCosts')}
        {numberField('Initial Investment (Tk)', 'initialInvestment')}
      </div><p className="text-xs text-slate-500">Rent: {formatBDT(settings.monthlyRent)} · Payroll: {formatBDT(result.payroll)} · Commission: {(settings.commissionRate * 100).toFixed(1)}%. Other fixed costs exclude rent and payroll; variable costs exclude food and commission.</p></section>
      <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
        <h3 className="text-sm font-semibold">Projected Feasibility</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><span className="text-xs text-slate-500">Break-Even Monthly Sales</span><p className="mt-1 font-mono text-lg font-bold">{result.breakEvenSales === null ? 'Not achievable' : formatBDT(result.breakEvenSales)}</p></div>
          <div><span className="text-xs text-slate-500">Sales Needed for Profit Target</span><p className="mt-1 font-mono text-lg font-bold">{result.requiredSales === null ? 'Not achievable' : formatBDT(result.requiredSales)}</p></div>
          <div><span className="text-xs text-slate-500">Monthly Fixed Cost Budget</span><p className="mt-1 font-mono text-lg font-bold">{formatBDT(result.fixedCosts)}</p></div>
        </div>
        <p className={`text-sm font-medium ${result.projectedProfit > 0 && result.contributionRate > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>{result.contributionRate <= 0 ? 'Variable costs consume all revenue; break-even is not achievable.' : result.projectedProfit <= 0 ? 'The sales target does not cover the monthly cost budget.' : result.projectedProfit < plan.monthlyProfitTarget ? 'The sales target covers costs but falls short of the profit target.' : 'The sales target covers the cost budget and profit target.'}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">{['Scenario', 'Sales', 'Operating Profit', 'Margin', 'Payback'].map(label => <th key={label} className="py-3 pr-4 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>
          {scenarios.map(scenario => <tr key={scenario.label} className="border-b border-slate-200 dark:border-slate-800"><td className="py-3 pr-4 whitespace-nowrap">{scenario.label}</td><td className="pr-4 font-mono whitespace-nowrap">{formatBDT(scenario.revenue)}</td><td className={`pr-4 font-mono whitespace-nowrap ${scenario.profit < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatBDT(scenario.profit)}</td><td className="pr-4">{scenario.margin.toFixed(1)}%</td><td className="whitespace-nowrap">{scenario.payback === null ? 'Unavailable' : `${scenario.payback.toFixed(1)} months`}</td></tr>)}
        </tbody></table></div>
        <p className="text-xs text-slate-500">Operating estimates before tax, loan interest, depreciation, and owner drawings. Payback assumes steady monthly profit. Sales demand and food-cost percentages are planning assumptions.</p>
      </section>
    </>}
  </div>;
}
