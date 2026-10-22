import { salesPayments } from './salesPayments';
import { roundMoney } from './money';
import type { DailySalesRecord, MonthlyExpenseItem } from '../types';

export function calculateDailyCash(sales: DailySalesRecord[], expenses: MonthlyExpenseItem[], date: string, openingCash = 0) {
  const dailySales = sales.filter(record => record.date === date);
  const dailyExpenses = expenses.filter(expense => expense.date === date);
  const totalSales = dailySales.reduce((sum, record) => sum + record.grossSales, 0);
  const channels = dailySales.map(salesPayments);
  const digitalSales = roundMoney(channels.reduce((sum, payment) => sum + payment.digital, 0));
  const cashSales = roundMoney(totalSales - digitalSales);
  const bankSales = roundMoney(channels.reduce((sum, payment) => sum + payment.bank, 0));
  const bkashSales = roundMoney(channels.reduce((sum, payment) => sum + payment.bkash, 0));
  const nagadSales = roundMoney(channels.reduce((sum, payment) => sum + payment.nagad, 0));
  const cardSales = roundMoney(channels.reduce((sum, payment) => sum + payment.card, 0));
  const invalidBreakdown = channels.some(payment => payment.cash < 0);
  const totalExpenses = dailyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const cashExpenses = dailyExpenses.filter(expense => expense.paymentMode === 'cash').reduce((sum, expense) => sum + expense.amount, 0);
  const unpaidExpenses = dailyExpenses.filter(expense => expense.paymentMode === 'credit').reduce((sum, expense) => sum + expense.amount, 0);
  const unknownExpenses = dailyExpenses.filter(expense => expense.paymentMode === 'unknown').reduce((sum, expense) => sum + expense.amount, 0);
  return { digitalSales, bankSales, bkashSales, nagadSales, cardSales, invalidBreakdown, totalSales, cashSales, totalExpenses, cashExpenses, unpaidExpenses, unknownExpenses, remainingBalance: totalSales - totalExpenses, cashInHand: roundMoney(openingCash + cashSales - cashExpenses), openingCash, hasSales: dailySales.length > 0 };
}
