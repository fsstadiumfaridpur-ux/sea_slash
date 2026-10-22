import {isViewDate,isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import { LinkedExpenseEditModal } from './LinkedExpenseEditModal';
import type { PurchaseRecord } from '../types';
import { expensesForPeriod, type ExpensePeriod } from '../utils/expensePeriods';
import type { Vendor } from './VendorsView';
import type { VendorLedgerEntry } from '../utils/vendorLedger';
import { DailyCashView } from './DailyCashView';
import { NumericInput } from './NumericInput';
import React, { useState, useMemo, useEffect } from "react";
import {BkashAccountView} from './BkashAccountView';
import {
  DollarSign,
  PlusCircle,
  Pencil,
  Download,
  Filter,
  Trash2,
  Building,
  Users,
  Flame,
  Package,
  Truck,
  Wrench,
  Sparkles,
  PieChart,
  CheckCircle2,
  Calendar,
  CreditCard,
  ExternalLink,
  X,
} from "lucide-react";
import {
  DailySalesRecord,
  MonthlyExpenseItem,
  ExpenseCategory,
  FoodCourtSettings,
  StaffMember,
  StaffAttendance,
  StaffAdvance,
} from "../types";
import { calculateStaffEarnings } from "../utils/staffPayroll";
import { salaryPayments } from "../utils/linkedExpenses";
import {
  formatBDT,
  formatNumber,
  exportToCSV,
  getTodayString,
} from "../utils/formatters";

interface MonthlyExpenseViewProps {
  isAdmin: boolean;
  purchases: PurchaseRecord[];
  onEditPurchase: (previous: PurchaseRecord, next: PurchaseRecord) => Promise<void>;
  onEditAdvance: (previous: StaffAdvance, next: StaffAdvance) => Promise<void>;
  expenses: MonthlyExpenseItem[];
  sales: DailySalesRecord[];
  vendors: Vendor[];
  vendorLedger: VendorLedgerEntry[];
  onEditSales: (record: DailySalesRecord) => void;
  settings: FoodCourtSettings;
  staff: StaffMember[];
  attendance: StaffAttendance[];
  advances: StaffAdvance[];
  salaryRequest: { staffId: string; month: string } | null;
  courtRequest: { category: "rent" | "commission"; month: string; date?: string; amount?: number } | null;
  onCourtRequestHandled: () => void;
  onSalaryRequestHandled: () => void;
  onOpenSource: (source: "purchase" | "advance") => void;
  onAddExpense: (expense: MonthlyExpenseItem) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

export const MonthlyExpenseView: React.FC<MonthlyExpenseViewProps> = ({
  expenses,
  isAdmin,
  purchases,
  onEditPurchase,
  onEditAdvance,
  sales,
  vendors,
  vendorLedger,
  onEditSales,
  settings,
  onAddExpense,
  onDeleteExpense,
  staff,
  attendance,
  advances,
  salaryRequest,
  onSalaryRequestHandled,
  courtRequest,
  onCourtRequestHandled,
  onOpenSource,
}) => {
  const [activeView, setActiveView] = useRememberedViewState<'cash' | 'bkash' | ExpensePeriod>('expenses.view','cash',value=>['cash','bkash','daily','monthly'].includes(String(value)));
  const [bkashSummaryTarget,setBkashSummaryTarget]=useState<HTMLDivElement|null>(null);
  const [period, setPeriod] = useRememberedViewState<ExpensePeriod>('expenses.period','daily',value=>['daily','monthly'].includes(String(value)));
  const [selectedDate, setSelectedDate] = useRememberedViewState('expenses.date',getTodayString(),isViewDate);
  const [selectedMonth, setSelectedMonth] = useRememberedViewState<string>('expenses.month',() => getTodayString().slice(0,7),isViewMonth);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Add modal state
  const [linkedEdit, setLinkedEdit] = useState<MonthlyExpenseItem | null>(null);
  const [editingExpense, setEditingExpense] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] =
    useState<ExpenseCategory>("gas_utilities");
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newDate, setNewDate] = useState<string>(getTodayString());
  const [newPaymentMode, setNewPaymentMode] = useState<
    MonthlyExpenseItem["paymentMode"]
  >("cash");
  const [newVendor, setNewVendor] = useState<string>("");
  const [newVendorId, setNewVendorId] = useState("");
  const [billDate, setBillDate] = useState(getTodayString());
  const [newBillId, setNewBillId] = useState("");
  const ingredientVendor = vendors.find(vendor => vendor.id === newVendorId);
  const vendorBills = vendorLedger.filter(bill => bill.vendorId === newVendorId && bill.date === billDate && bill.billed > 0);
  const selectedBill = vendorBills.find(bill => bill.id === newBillId);
  const [newNotes, setNewNotes] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [newStaffId, setNewStaffId] = useState("");
  const [newExpenseId, setNewExpenseId] = useState(
    () => `exp-${crypto.randomUUID()}`,
  );
  const [salaryMonth, setSalaryMonth] = useState(getTodayString().slice(0, 7));
  const [statementMonth, setStatementMonth] = useState(
    getTodayString().slice(0, 7),
  );
  const [commissionDate, setCommissionDate] = useState(getTodayString());
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const member = staff.find((s) => s.id === newStaffId);
  const payroll = member
    ? calculateStaffEarnings(member, attendance, advances, salaryMonth)
    : null;
  const paid = salaryPayments(expenses, newStaffId, salaryMonth);
  useEffect(() => {
    if (!salaryRequest) return;
    setEditingExpense(false); setNewExpenseId(`exp-${crypto.randomUUID()}`);
    setNewCategory("payroll");
    setNewStaffId(salaryRequest.staffId);
    setSalaryMonth(salaryRequest.month);
    setNewTitle("Salary Payment");
    setNewAmount(0);
    setNewDate(getTodayString());
    setNewNotes("");
    setNewVendor("");
    setError("");
    setIsAddModalOpen(true);
    onSalaryRequestHandled();
  }, [salaryRequest, onSalaryRequestHandled]);
  useEffect(() => {
    if (!courtRequest) return;
    setEditingExpense(false); setNewExpenseId(`exp-${crypto.randomUUID()}`);
    setNewCategory(courtRequest.category);
    setStatementMonth(courtRequest.month);
    setCommissionDate(courtRequest.date ?? `${courtRequest.month}-01`);
    setNewTitle(
      courtRequest.category === "rent"
        ? "Food Court Rent Payment"
        : "Food Court Commission Payment",
    );
    setNewAmount(courtRequest.amount ?? 0);
    setNewDate(getTodayString());
    setNewVendor("");
    setNewNotes("");
    setPaymentReference("");
    setIsRecurring(false);
    setError("");
    setIsAddModalOpen(true);
    onCourtRequestHandled();
  }, [courtRequest, onCourtRequestHandled]);

  const periodExpenses = useMemo(() => expensesForPeriod(expenses, period, selectedDate, selectedMonth), [expenses, period, selectedDate, selectedMonth]);
  const periodLabel = period === 'daily' ? 'Daily' : 'Monthly';

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return periodExpenses
      .filter(
        (exp) => categoryFilter === "all" || exp.category === categoryFilter,
      )
      .filter((exp) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          exp.title.toLowerCase().includes(q) ||
          (exp.vendor && exp.vendor.toLowerCase().includes(q)) ||
          (exp.notes && exp.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [periodExpenses, categoryFilter, searchQuery]);

  // Aggregate Category Totals
  const categoryTotals = useMemo(() => {
    const monthItems = periodExpenses;
    const sumBy = (cat: ExpenseCategory) =>
      monthItems
        .filter((e) => e.category === cat)
        .reduce((acc, e) => acc + e.amount, 0);

    const rent = sumBy("rent");
    const commission = sumBy("commission");
    const payroll = sumBy("payroll");
    const ingredients = sumBy("ingredients");
    const gas = sumBy("gas_utilities");
    const packaging = sumBy("packaging");
    const ice = sumBy("ice_beverage");
    const maintenance = sumBy("maintenance");
    const transport = sumBy("transport");
    const other = sumBy("other");

    const total = monthItems.reduce((acc, e) => acc + e.amount, 0);

    return {
      total,
      rent,
      commission,
      payroll,
      ingredients,
      gas,
      packaging,
      ice,
      maintenance,
      transport,
      other,
      fixedOverhead: rent + commission + payroll,
      directFoodCourtBurden: rent + commission,
      kitchenOperating: gas + packaging + ice + maintenance + transport + other,
    };
  }, [periodExpenses]);

  const handleExportCSV = () => {
    const rows = filteredExpenses.map((e) => ({
      Date: e.date,
      Month: e.month,
      Category: e.category,
      Title: e.title,
      Amount_BDT: e.amount,
      PaymentMethod: e.paymentMode,
      Vendor: e.vendor || "",
      VendorId: e.vendorId ?? "",
      VendorBillId: e.vendorBillId ?? "",
      VendorBillDate: e.vendorBillDate ?? "",
      Notes: e.notes || "",
      Recurring: e.isRecurring ? "Yes" : "No",
      Source: e.source ?? (e.staffId ? "salary_payment" : "manual"),
      SourceId: e.sourceId ?? "",
      StaffId: e.staffId ?? "",
      SalaryMonth: e.salaryMonth ?? "",
      StatementMonth: e.statementMonth ?? "",
      CommissionSalesDate: e.commissionDate ?? "",
      PaymentReference: e.paymentReference ?? "",
      PaymentStatus: e.paymentMode === "credit" ? "Unpaid" : "Paid",
    }));
    exportToCSV(`stall_${period}_expenses_${period === 'daily' ? selectedDate : selectedMonth}`, rows);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !Number.isFinite(newAmount) || newAmount <= 0)
      return;

    if (newCategory === "ingredients" && ((!editingExpense && !ingredientVendor) || (newBillId && !selectedBill && !editingExpense))) {
      setError("Select a vendor and a valid bill, or choose a manual entry.");
      return;
    }

    const original = editingExpense ? expenses.find(row => row.id === newExpenseId) : undefined;
    const newExpense: MonthlyExpenseItem = {
      ...(newCategory === 'ingredients' && original?.category === 'ingredients' && newBillId === original.vendorBillId ? { vendorBillId: original.vendorBillId, vendorBillDate: original.vendorBillDate, vendorId: original.vendorId } : {}),
      id: newExpenseId,
      month: newDate.slice(0, 7),
      date: newDate,
      category: newCategory,
      title: newTitle.trim(),
      amount: newAmount,
      paymentMode: newPaymentMode,
      vendor: newCategory === "payroll" ? member?.name : newCategory === "ingredients" ? ingredientVendor?.name ?? newVendor : newVendor,
      ...(newCategory === "ingredients" ? { ...(ingredientVendor ? { vendorId: ingredientVendor.id } : {}), ...(selectedBill ? { vendorBillId: selectedBill.id, vendorBillDate: selectedBill.date } : {}) } : {}),
      ...(newCategory === "payroll"
        ? { staffId: newStaffId, salaryMonth }
        : {}),
      ...(["rent", "commission"].includes(newCategory)
        ? { statementMonth: newCategory === "commission" ? commissionDate.slice(0, 7) : statementMonth, ...(newCategory === "commission" ? { commissionDate } : {}), paymentReference: paymentReference.trim() }
        : {}),
      notes: newNotes,
      isRecurring,
    };

    setBusy(true);
    setError("");
    try {
      await onAddExpense(newExpense);
      setSelectedMonth(newExpense.month);
      setSelectedDate(newExpense.date);
      setIsAddModalOpen(false);
      setEditingExpense(false);
      setNewTitle("");
      setNewVendor("");
      setNewVendorId("");
      setNewBillId("");
      setNewNotes("");
      setNewAmount(0);
      setNewCategory("gas_utilities");
      setNewDate(getTodayString());
      setNewPaymentMode("cash");
      setIsRecurring(false);
      setNewStaffId("");
      setPaymentReference("");
      setNewExpenseId(`exp-${crypto.randomUUID()}`);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not record expense.",
      );
    } finally {
      setBusy(false);
    }
  };

  const categoriesConfig: {
    id: ExpenseCategory | "all";
    label: string;
    icon: any;
  }[] = [
    { id: "all", label: "All Expenses", icon: PieChart },
    { id: "rent", label: "Rent", icon: Building },
    { id: "commission", label: "Food Court Commission", icon: DollarSign },
    { id: "payroll", label: "Staff Salaries", icon: Users },
    { id: "ingredients", label: "Food Ingredients (Bazaar)", icon: Sparkles },
    { id: "gas_utilities", label: "LP Gas Cylinders", icon: Flame },
    { id: "packaging", label: "Foil Boxes & Bags", icon: Package },
    { id: "transport", label: "Bazaar Transport / Van", icon: Truck },
    { id: "maintenance", label: "Cleaning & Repairs", icon: Wrench },
    { id: "ice_beverage", label: "Ice & Beverages", icon: CreditCard },
    { id: "other", label: "Other Expenses", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Expenses</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Daily entries automatically contribute to monthly expenses.</p></div><div ref={setBkashSummaryTarget} className="ml-auto shrink-0" /></div>
      <div role="tablist" aria-label="Expense views" className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 dark:border-slate-800">
        {(['cash', 'daily', 'monthly', 'bkash'] as const).map(value => <button key={value} type="button" role="tab" id={`expense-${value}-tab`} aria-selected={activeView === value} aria-controls={value === 'cash' ? 'expense-cash-panel' : value === 'bkash' ? 'expense-bkash-panel' : 'expense-period-panel'} onClick={() => { setActiveView(value); if (value !== 'cash' && value !== 'bkash') setPeriod(value); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${activeView === value ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>{value === 'cash' ? 'Daily Cash' : value === 'daily' ? 'Daily Expenses' : value === 'bkash' ? 'bKash Account' : 'Monthly Expenses'}</button>)}
      </div>
      <BkashAccountView summaryTarget={bkashSummaryTarget} isAdmin={isAdmin} expanded={activeView==='bkash'} onOpen={()=>setActiveView('bkash')} sales={sales} expenses={expenses} vendors={vendors} onAddExpense={onAddExpense}/>
      {activeView === 'cash' && <DailyCashView settings={settings} onEditSales={onEditSales} sales={sales} expenses={expenses} date={selectedDate} onDateChange={date => { setSelectedDate(date); setSelectedMonth(date.slice(0, 7)); }} />}
      {(activeView === 'daily' || activeView === 'monthly') && <div role="tabpanel" id="expense-period-panel" aria-labelledby={`expense-${period}-tab`} className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {periodLabel} Expenses
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {periodExpenses.length}{" "}
            recorded expenses
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 mr-2" />
            <input
              type={period === "daily" ? "date" : "month"}
              aria-label={period === "daily" ? "Expense date" : "Expense month"}
              required
              value={period === 'daily' ? selectedDate : selectedMonth}
              onChange={(e) => {
                if (!e.target.value) return;
                if (period === 'daily') {
                  setSelectedDate(e.target.value);
                  setSelectedMonth(e.target.value.slice(0, 7));
                } else {
                  setSelectedMonth(e.target.value);
                  if (!selectedDate.startsWith(e.target.value)) setSelectedDate(`${e.target.value}-01`);
                }
              }}
              className="bg-transparent text-slate-900 dark:text-white font-mono font-bold focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span>Export Statement</span>
          </button>

          <button
            onClick={() => {
              setError("");
              setEditingExpense(false);
              setNewExpenseId(`exp-${crypto.randomUUID()}`);
              setNewTitle(""); setNewAmount(0); setNewVendor(""); setNewVendorId(""); setNewBillId(""); setNewStaffId(""); setNewNotes(""); setNewCategory("gas_utilities"); setPaymentReference("");
              setStatementMonth(selectedMonth);
              setBillDate(period === 'daily' ? selectedDate : selectedDate.startsWith(selectedMonth) ? selectedDate : `${selectedMonth}-01`);
              setNewBillId("");
              setNewDate(period === 'daily' ? selectedDate : selectedDate.startsWith(selectedMonth) ? selectedDate : `${selectedMonth}-01`);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{period === 'daily' ? 'Add Daily Expense' : 'Add Expense'}</span>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 py-3 text-xs dark:border-slate-800">
        <button
          onClick={() => onOpenSource("purchase")}
          className="flex items-center gap-1 font-medium"
        >
          <ExternalLink size={14} />
          Ingredient Purchases
        </button>
        <button
          onClick={() => onOpenSource("advance")}
          className="flex items-center gap-1 font-medium"
        >
          <ExternalLink size={14} />
          Staff & Salary
        </button>
        <span className="ml-auto">
          Unpaid Purchases:{" "}
          {formatBDT(
            periodExpenses
              .filter((e) => e.paymentMode === "credit")
              .reduce((sum, e) => sum + e.amount, 0),
          )}
        </span>
      </div>
      {error && !isAddModalOpen && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Monthly Spend */}
        <div className="p-4 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs text-slate-600 dark:text-slate-400 block font-medium">
            Total {periodLabel} Expenses
          </span>
          <span className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1 block tabular-nums">
            {formatBDT(categoryTotals.total)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {periodExpenses.length}{" "}
            recorded line items
          </span>
        </div>

        {/* Food Court Fixed & 10% Cut */}
        <div className="p-4 bg-white/90 dark:bg-slate-900/90 border border-amber-200/40 dark:border-amber-900/40 rounded-xl">
          <span className="text-xs text-amber-700 dark:text-amber-400 block font-medium flex items-center justify-between">
            <span>Food Court Rent & Commission</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-800">
              {(settings.commissionRate * 100).toFixed(1)}% after 5% VAT
            </span>
          </span>
          <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1 block tabular-nums">
            {formatBDT(categoryTotals.directFoodCourtBurden)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Rent {formatBDT(categoryTotals.rent)} + Commission{" "}
            {formatBDT(categoryTotals.commission)}
          </span>
        </div>

        {/* Staff Payroll Total */}
        <div className="p-4 bg-white/90 dark:bg-slate-900/90 border border-indigo-200/40 dark:border-indigo-900/40 rounded-xl">
          <span className="text-xs text-indigo-700 dark:text-indigo-300 block font-medium">
            Staff Salary Payments
          </span>
          <span className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-300 mt-1 block tabular-nums">
            {formatBDT(categoryTotals.payroll)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {
              periodExpenses.filter(exp => exp.category === "payroll").length
            }{" "}
            recorded payroll payments
          </span>
        </div>

        {/* Raw Ingredients COGS */}
        <div className="p-4 bg-white/90 dark:bg-slate-900/90 border border-rose-200/40 dark:border-rose-900/40 rounded-xl">
          <span className="text-xs text-rose-700 dark:text-rose-300 block font-medium">
            Ingredient Purchases
          </span>
          <span className="text-xl font-bold font-mono text-rose-700 dark:text-rose-300 mt-1 block tabular-nums">
            {formatBDT(categoryTotals.ingredients)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Mutton, chicken, basmati, ghee, spices
          </span>
        </div>
      </div>

      {/* Visual Cost Allocation Breakdown */}
      <div className="p-5 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {periodLabel} Expense Distribution (Where every Taka goes)
          </span>
          <span className="font-mono text-slate-600 dark:text-slate-400">
            Total: {formatBDT(categoryTotals.total)}
          </span>
        </div>

        {categoryTotals.total > 0 && (
          <div className="space-y-2">
            <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-50 dark:bg-slate-950">
              <div
                style={{
                  width: `${(categoryTotals.rent / categoryTotals.total) * 100}%`,
                }}
                title={`Rent: ${formatBDT(categoryTotals.rent)}`}
                className="bg-indigo-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${(categoryTotals.commission / categoryTotals.total) * 100}%`,
                }}
                title={`Commission: ${formatBDT(categoryTotals.commission)}`}
                className="bg-amber-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${(categoryTotals.payroll / categoryTotals.total) * 100}%`,
                }}
                title={`Payroll: ${formatBDT(categoryTotals.payroll)}`}
                className="bg-blue-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${(categoryTotals.ingredients / categoryTotals.total) * 100}%`,
                }}
                title={`Food Ingredients: ${formatBDT(categoryTotals.ingredients)}`}
                className="bg-rose-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${(categoryTotals.gas / categoryTotals.total) * 100}%`,
                }}
                title={`LP Gas Cylinders: ${formatBDT(categoryTotals.gas)}`}
                className="bg-orange-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${(categoryTotals.packaging / categoryTotals.total) * 100}%`,
                }}
                title={`Packaging: ${formatBDT(categoryTotals.packaging)}`}
                className="bg-emerald-500 hover:opacity-90"
              />
              <div
                style={{
                  width: `${((categoryTotals.ice + categoryTotals.maintenance + categoryTotals.transport + categoryTotals.other) / categoryTotals.total) * 100}%`,
                }}
                title={`Other: ${formatBDT(categoryTotals.kitchenOperating - categoryTotals.gas - categoryTotals.packaging)}`}
                className="bg-purple-500 hover:opacity-90"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap text-[11px] text-slate-600 dark:text-slate-400 gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                <span>
                  Rent: {formatBDT(categoryTotals.rent)} (
                  {((categoryTotals.rent / categoryTotals.total) * 100).toFixed(
                    0,
                  )}
                  %)
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span>
                  Court Commission: {formatBDT(categoryTotals.commission)} (
                  {(
                    (categoryTotals.commission / categoryTotals.total) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span>
                  Salaries: {formatBDT(categoryTotals.payroll)} (
                  {(
                    (categoryTotals.payroll / categoryTotals.total) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                <span>
                  Ingredients: {formatBDT(categoryTotals.ingredients)} (
                  {(
                    (categoryTotals.ingredients / categoryTotals.total) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
                <span>LP Gas: {formatBDT(categoryTotals.gas)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Boxes: {formatBDT(categoryTotals.packaging)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Category Pills & Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          {categoriesConfig.map((cat) => {
            const Icon = cat.icon;
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Search expenses, vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-52"
        />
      </div>

      {/* Main Expense Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-medium">
              <th className="py-3 px-3.5">Date</th>
              <th className="py-3 px-3.5">Category</th>
              <th className="py-3 px-3.5">Expense Description</th>
              <th className="py-3 px-3.5">Vendor / Payee</th>
              <th className="py-3 px-3.5">Payment</th>
              <th className="py-3 px-3.5 text-right font-bold text-slate-900 dark:text-white">
                Amount (৳)
              </th>
              <th className="py-3 px-3.5 text-center">Type</th>
              <th className="py-3 px-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No expense items match your criteria. Click {period === 'daily' ? '"Add Daily Expense"' : '"Add Expense"'} to log one.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp) => (
                <tr
                  key={exp.id}
                  className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition"
                >
                  <td className="py-3 px-3.5 font-mono text-slate-900 dark:text-white">
                    {exp.date}
                  </td>

                  <td className="py-3 px-3.5">
                    <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 capitalize">
                      {exp.category.replace("_", " ")}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {exp.title}
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                      {exp.source === "purchase"
                        ? "Linked purchase"
                        : exp.source === "advance"
                          ? "Linked salary payment"
                          : exp.staffId
                            ? `Salary / ${exp.salaryMonth}`
                            : exp.commissionDate
                              ? `Commission sales day / ${exp.commissionDate}`
                            : exp.statementMonth
                              ? `Statement / ${exp.statementMonth}`
                              : "Manual expense"}
                    </div>
                    {exp.notes && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {exp.notes}
                      </div>
                    )}
                    {exp.vendorBillId && <p className="mt-1 text-[11px] text-slate-500">Vendor bill: {exp.vendorBillDate} / {exp.vendorBillId}</p>}
                    {exp.paymentReference && (
                      <p className="mt-1 break-all text-[11px] text-slate-500">
                        Reference: {exp.paymentReference}
                      </p>
                    )}
                  </td>

                  <td className="py-3 px-3.5 text-slate-700 dark:text-slate-300 text-[11px]">
                    {exp.vendor || "-"}
                  </td>

                  <td className="py-3 px-3.5 uppercase font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {exp.paymentMode}
                    {exp.paymentMode === "credit" && (
                      <span className="block text-rose-600">Unpaid</span>
                    )}
                  </td>

                  <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400 text-sm tabular-nums">
                    {formatBDT(exp.amount)}
                  </td>

                  <td className="py-3 px-3.5 text-center">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        exp.isRecurring
                          ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-800/60"
                          : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {exp.isRecurring ? "Monthly Fixed" : "Variable/Bazaar"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5 text-center">
                    {isAdmin && exp.source && <button type="button" disabled={busy} aria-label={`Edit ${exp.title}`} title="Edit linked transaction" onClick={() => setLinkedEdit(exp)} className="mr-2 p-1 text-amber-700"><Pencil className="w-3.5 h-3.5" /></button>}
                    {exp.source ? (
                      <button
                        title="Open source record"
                        aria-label={`Open source for ${exp.title}`}
                        onClick={() => onOpenSource(exp.source!)}
                        className="p-1 text-emerald-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <>
                      {(isAdmin || ["rent", "commission"].includes(exp.category)) && <button type="button" disabled={busy} aria-label={`Edit ${exp.title}`} title="Edit payment" className="mr-2 p-1 text-amber-700" onClick={() => {
                        setEditingExpense(true); setNewExpenseId(exp.id); setNewTitle(exp.title); setNewCategory(exp.category); setNewAmount(exp.amount); setNewDate(exp.date);
                        setNewPaymentMode(exp.paymentMode); setNewVendor(exp.vendor ?? ""); setNewNotes(exp.notes ?? ""); setIsRecurring(exp.isRecurring);
                        setNewStaffId(exp.staffId ?? ""); setSalaryMonth(exp.salaryMonth ?? exp.month); setNewVendorId(exp.vendorId ?? ""); setBillDate(exp.vendorBillDate ?? exp.date); setNewBillId(exp.vendorBillId ?? "");
                        setStatementMonth(exp.statementMonth ?? exp.month); setCommissionDate(exp.commissionDate ?? exp.date); setPaymentReference(exp.paymentReference ?? ""); setError(""); setIsAddModalOpen(true);
                      }}><Pencil className="w-3.5 h-3.5" /></button>}
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (confirm(`Delete "${exp.title}"?`)) {
                            setBusy(true);
                            setError("");
                            try {
                              await onDeleteExpense(exp.id);
                            } catch (failure) {
                              setError(
                                failure instanceof Error
                                  ? failure.message
                                  : "Could not delete expense.",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }
                        }}
                        title="Delete expense entry"
                        className="p-1 text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      </div>}

      {isAdmin && linkedEdit && <LinkedExpenseEditModal expense={linkedEdit} purchase={purchases.find(row => row.id === linkedEdit.sourceId)} advance={advances.find(row => row.id === linkedEdit.sourceId)} staff={staff} onSavePurchase={async (previous, next) => { await onEditPurchase(previous, next); setSelectedDate(next.date); setSelectedMonth(next.date.slice(0, 7)); }} onSaveAdvance={async (previous, next) => { await onEditAdvance(previous, next); setSelectedDate(next.date); setSelectedMonth(next.date.slice(0, 7)); }} onClose={() => setLinkedEdit(null)} />}
      {/* MODAL: ADD EXPENSE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={period === 'daily' ? 'Record daily expense' : 'Record expense'}
            className="max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl w-full max-w-lg"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>{editingExpense ? "Edit" : "Record"} {periodLabel} Expense</span>
              </h3>
              <button
                disabled={busy}
                aria-label="Close expense form"
                title="Close"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                {["rent", "commission"].includes(newCategory) && (
                  <section className="space-y-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                    {newCategory === "commission" ? <label className="block text-xs font-medium">Commission Sales Date<input aria-label="Commission sales date" type="date" required value={commissionDate} onChange={event => { setCommissionDate(event.target.value); setStatementMonth(event.target.value.slice(0, 7)); }} className="staff-input" /><span className="mt-1 block text-xs text-slate-500">The sales day this payment settles. Payment date below records when cash was actually paid.</span></label> : <label className="block text-xs font-medium">
                      Statement Month
                      <input
                        required
                        type="month"
                        value={statementMonth}
                        onChange={(e) => setStatementMonth(e.target.value)}
                        className="staff-input"
                      />
                    </label>}
                    <label className="block text-xs font-medium">
                      Transaction / Receipt Reference
                      <input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="staff-input"
                      />
                    </label>
                  </section>
                )}
                {newCategory === "payroll" && (
                  <section className="space-y-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                    <label className="block text-xs font-medium">
                      Staff Member
                      <select
                        required
                        aria-label="Salary staff member"
                        value={newStaffId}
                        onChange={(e) => setNewStaffId(e.target.value)}
                        className="staff-input"
                      >
                        <option value="">Select staff</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.archivedAt
                              ? " (Archived)"
                              : !s.active
                                ? " (Inactive)"
                                : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium">
                      Salary Month
                      <input
                        required
                        type="month"
                        value={salaryMonth}
                        onChange={(e) => setSalaryMonth(e.target.value)}
                        className="staff-input"
                      />
                    </label>
                    {payroll && (
                      <p className="text-xs tabular-nums">
                        Total salary earned: {formatBDT(payroll.earned)} / Total paid:{" "}
                        {formatBDT(payroll.totalAdvance + paid)} / Salary still to pay:{" "}
                        {formatBDT(Math.max(0, payroll.netPayable - paid))}
                      </p>
                    )}
                  </section>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Expense Description / Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Commercial LP Gas Cylinder Refill, Ice block delivery"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Expense Category
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => {
                        setNewCategory(e.target.value as ExpenseCategory);
                        setNewBillId("");
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="rent">Stall Rent</option>
                      <option value="commission">Food Court Commission</option>
                      <option value="payroll">Staff Salaries</option>
                      <option value="ingredients">
                        Food Ingredients (Meat, Rice, Oil)
                      </option>
                      <option value="gas_utilities">LP Gas Cylinders</option>
                      <option value="packaging">Packaging, Boxes & Bags</option>
                      <option value="ice_beverage">Ice Blocks & Water</option>
                      <option value="transport">Bazaar Transport / Van</option>
                      <option value="maintenance">
                        Cleaning & Maintenance
                      </option>
                      <option value="other">Other Petty Expenses</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Amount (৳ Bangladeshi Taka)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 font-bold">
                        ৳
                      </span>
                      <NumericInput
                        type="number"
                        min="0.01"
                        value={newAmount}
                        onChange={(e) => setNewAmount(Number(e.target.value))}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500 tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {newCategory === "ingredients" && (
                  <section aria-label="Ingredient vendor bills" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <label className="block text-xs font-medium">
                      Vendor Name
                      <select aria-label="Ingredient vendor" required={!editingExpense} value={newVendorId} onChange={event => { setNewVendorId(event.target.value); setNewBillId(""); if (newBillId) { setNewTitle(""); setNewAmount(0); } }} className="staff-input">
                        <option value="">{editingExpense && newVendor ? `Recorded vendor: ${newVendor}` : "Select vendor"}</option>
                        {[...vendors].sort((a, b) => a.name.localeCompare(b.name)).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name} — {vendor.category}</option>)}
                      </select>
                    </label>
                    {vendors.length === 0 && <p className="text-xs text-slate-500">Add a vendor in Vendors before recording an ingredient expense.</p>}
                    <label className="block text-xs font-medium">
                      Vendor Bill Date
                      <input aria-label="Vendor bill date" type="date" required value={billDate} onChange={event => { setBillDate(event.target.value); setNewBillId(""); if (newBillId) { setNewTitle(""); setNewAmount(0); } }} className="staff-input" />
                    </label>
                    <label className="block text-xs font-medium">
                      Vendor Bills
                      <select aria-label="Vendor bill" disabled={!ingredientVendor} value={newBillId} onChange={event => {
                        setNewBillId(event.target.value);
                        const bill = vendorBills.find(row => row.id === event.target.value);
                        if (bill) { setNewTitle(bill.description); setNewAmount(bill.billed); }
                      }} className="staff-input">
                        <option value="">Enter expense manually</option>
                        {vendorBills.map(bill => <option key={bill.id} value={bill.id}>{bill.description} — {formatBDT(bill.billed)}</option>)}
                      </select>
                    </label>
                    {!ingredientVendor ? <p className="text-xs text-slate-500">Select a vendor to see their bills.</p> : vendorBills.length === 0 ? <p className="text-xs text-slate-500">No bills for {ingredientVendor.name} on this date. Choose another bill date or enter the expense manually.</p> : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <caption className="sr-only">Bills for {ingredientVendor.name} on {billDate}</caption>
                          <thead><tr><th className="py-2 pr-2">Bill</th><th className="py-2 text-right">Billed</th><th className="py-2 text-right">Paid</th></tr></thead>
                          <tbody>{vendorBills.map(bill => <tr key={bill.id} className="border-t border-slate-200 dark:border-slate-700"><td className="py-2 pr-2">{bill.description}</td><td className="py-2 text-right">{formatBDT(bill.billed)}</td><td className="py-2 text-right">{formatBDT(bill.paid)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                    {selectedBill && <p className="text-xs text-slate-500">The bill total fills the expense amount. Adjust it to the amount paid. Vendor ledger payments are managed in Vendors.</p>}
                  </section>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      required
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={newPaymentMode}
                      onChange={(e) => setNewPaymentMode(e.target.value as any)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="cash">Cash from Register</option>
                      <option value="bkash">bKash Merchant / Personal</option>
                      <option value="bank">Bank Transfer / Cheque</option>
                      <option value="card">Card POS</option>
                      {editingExpense && <option value="credit">Unpaid / Credit</option>}
                      {editingExpense && <option value="unknown">Not recorded</option>}
                    </select>
                  </div>
                </div>

                {newCategory !== "ingredients" && <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vendor / Supplier / Person Paid
                  </label>
                  <input
                    type="text"
                    disabled={newCategory === "payroll"}
                    value={
                      newCategory === "payroll"
                        ? (member?.name ?? "")
                        : newVendor
                    }
                    onChange={(e) => setNewVendor(e.target.value)}
                    placeholder="e.g. Faridpur Gas Agency, Chawkbazar Packaging"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Notes / Receipt Details
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="e.g. Memo #8942, emergency cylinder refill"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500"
                  />
                  <label
                    htmlFor="recurring"
                    className="text-xs text-slate-700 dark:text-slate-300"
                  >
                    This is a regular fixed monthly recurring expense
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
                  >
                    {busy ? "Saving..." : editingExpense ? "Save Changes" : "Record Expense"}
                  </button>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-rose-600">
                    {error}
                  </p>
                )}
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
