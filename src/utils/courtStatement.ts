import type { CommissionTracking } from '../lib/commissionTracking';
import { calculateCommission, commissionBase } from './commission';
import type { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import { removeDemoSales } from './demoSales';
import { removeDemoExpenses } from './demoExpenses';

const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function courtStatement(month: string, sales: DailySalesRecord[], expenses: MonthlyExpenseItem[], settings: FoodCourtSettings, tracking: CommissionTracking = { paidDates: {} }) {
  const days = removeDemoSales(sales).filter(row => row.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date));
  const sum = (field: keyof DailySalesRecord) => round(days.reduce((total, row) => total + Number(row[field] ?? 0), 0));
  const gross = sum('grossSales');
  const salesDates = [...new Set(days.map(day => day.date))];
  const commission = round(salesDates.reduce((sum, date) => sum + calculateCommission(days.filter(day => day.date === date).reduce((sum, day) => sum + day.grossSales, 0), settings.commissionRate), 0));
  const rent = settings.monthlyRent;
  const payments = removeDemoExpenses(expenses).filter(row => !row.source && (row.category === 'rent' || row.category === 'commission') &&
    (row.category === 'commission' && row.commissionDate ? row.commissionDate.slice(0, 7) : row.statementMonth ?? row.month) === month && ['cash', 'bkash', 'bank', 'card'].includes(row.paymentMode)).sort((a, b) => a.date.localeCompare(b.date));
  const rentPaid = round(payments.filter(row => row.category === 'rent').reduce((total, row) => total + row.amount, 0));
  const actualCommissionPaid = round(payments.filter(row => row.category === 'commission').reduce((total, row) => total + row.amount, 0));
  const rentAdjustment = tracking.rentAdjustments?.[month]?.amount ?? 0;
  const rentDue = round(Math.max(0, rent - rentPaid + rentAdjustment));
  const commissionPayments = payments.filter(row => row.category === 'commission');
  const paymentDay = (row: MonthlyExpenseItem) => row.commissionDate ?? (salesDates.includes(row.date) ? row.date : null);
  const commissionDates = [...new Set([...Object.keys(tracking.paidDates).filter(date => date.startsWith(month)), ...Object.keys(tracking.balanceAdjustments ?? {}).filter(date => date.startsWith(month)), ...salesDates, ...commissionPayments.map(paymentDay).filter((date): date is string => !!date)])].sort();
  const dailyCommissions = commissionDates.map(date => {
    const grossSales = round(days.filter(day => day.date === date).reduce((sum, day) => sum + day.grossSales, 0));
    const owed = calculateCommission(grossSales, settings.commissionRate);
    const recordedPaid = round(commissionPayments.filter(payment => paymentDay(payment) === date).reduce((sum, payment) => sum + payment.amount, 0));
    const historicalConfirmation = tracking.paidDates[date];
    const confirmedAmount = historicalConfirmation === undefined ? 0 : Math.max(0, historicalConfirmation - recordedPaid);
    const paid = round(recordedPaid + confirmedAmount);
    const adjustment = tracking.balanceAdjustments?.[date]?.amount ?? 0;
    const finalBalance = round(owed - paid + adjustment);
    return { adjustment, adjustmentReason: tracking.balanceAdjustments?.[date]?.reason, hasSalesRecord: salesDates.includes(date), historicalConfirmation: historicalConfirmation !== undefined, confirmedAmount, date, grossSales, vatDeduction: round(grossSales * 0.05), base: round(commissionBase(grossSales)), owed, paid, due: Math.max(0, finalBalance), credit: Math.max(0, -finalBalance) };
  });
  const unallocatedCommissionPayments = commissionPayments.filter(payment => !paymentDay(payment));
  const unallocatedCommissionPaid = round(unallocatedCommissionPayments.reduce((sum, payment) => sum + payment.amount, 0));
  const confirmedCommissionPaid = round(dailyCommissions.reduce((sum, day) => sum + day.confirmedAmount, 0));
  const commissionPaid = round(actualCommissionPaid + confirmedCommissionPaid);
  const commissionDue = round(dailyCommissions.reduce((sum, day) => sum + day.due, 0));
  const cash = sum('cashSales'), bkash = sum('bkashSales'), nagad = sum('nagadSales'), card = sum('cardSales'), bank = sum('bankSales');
  return { rentAdjustment, actualCommissionPaid, confirmedCommissionPaid, dailyCommissions, unallocatedCommissionPayments, unallocatedCommissionPaid, days, payments, gross, commission, rent, rentPaid, commissionPaid, rentDue, commissionDue,
    totalOwed: round(rent + commission), totalPaid: round(rentPaid + commissionPaid), remaining: round(rentDue + commissionDue),
    rentCredit: round(Math.max(0, rentPaid - rent - rentAdjustment)), commissionCredit: round(dailyCommissions.reduce((sum, day) => sum + day.credit, 0)),
    cash, bkash, nagad, card, bank, collectionDifference: round(gross - cash - bkash - nagad - card - bank), recordedCommission: sum('foodCourtCommission') };
}

export function courtPaymentStatus(owed: number, paid: number) {
  return paid > owed ? 'Overpaid' : owed === 0 ? 'Nothing due' : paid >= owed ? 'Paid' : paid > 0 ? 'Part-paid' : 'Unpaid';
}

export interface CourtDueNotice {
  month: string;
  category: 'rent' | 'commission';
  date?: string;
  label: string;
  amount: number;
}

export function courtDueNotices(currentMonth: string, sales: DailySalesRecord[], expenses: MonthlyExpenseItem[], settings: FoodCourtSettings, tracking: CommissionTracking = { paidDates: {} }): CourtDueNotice[] {
  // Include current obligations and older months with real operating/payment records.
  const months = new Set([currentMonth]);
  removeDemoSales(sales).forEach(record => { if (record.date.slice(0, 7) <= currentMonth) months.add(record.date.slice(0, 7)); });
  removeDemoExpenses(expenses).filter(record => record.category === 'rent' || record.category === 'commission').forEach(record => {
    const month = record.commissionDate?.slice(0, 7) ?? record.statementMonth ?? record.month;
    if (month <= currentMonth) months.add(month);
  });
  Object.keys(tracking.balanceAdjustments ?? {}).forEach(date => { if (date.slice(0, 7) <= currentMonth) months.add(date.slice(0, 7)); });
  Object.keys(tracking.rentAdjustments ?? {}).forEach(month => { if (month <= currentMonth) months.add(month); });
  return [...months].sort().flatMap(month => {
    const statement = courtStatement(month, sales, expenses, settings, tracking);
    const notices: CourtDueNotice[] = [];
    if (statement.rentDue > 0) notices.push({ month, category: 'rent', label: 'Rent due', amount: statement.rentDue });
    statement.dailyCommissions.filter(day => day.due > 0 && (!tracking.startDate || day.date >= tracking.startDate)).forEach(day => notices.push({ month, date: day.date, category: 'commission', label: 'Daily commission due', amount: day.due }));
    return notices;
  });
}
