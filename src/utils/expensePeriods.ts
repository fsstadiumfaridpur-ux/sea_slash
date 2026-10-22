import type { MonthlyExpenseItem } from '../types';

export type ExpensePeriod = 'daily' | 'monthly';

// Both views use the same records. The payment date determines the daily and
// monthly totals; switching views never creates a second expense record.
export function expensesForPeriod(expenses: MonthlyExpenseItem[], period: ExpensePeriod, date: string, month: string) {
  return expenses.filter(expense => period === 'daily' ? expense.date === date : expense.date.slice(0, 7) === month);
}
