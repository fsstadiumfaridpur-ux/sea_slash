import type { InventoryItem, MonthlyExpenseItem, PurchaseRecord, StaffAdvance, StaffMember } from '../types';

export function purchaseExpenseCategory(item?: InventoryItem) {
  return item?.category === 'packaging' ? 'packaging' : item?.category === 'beverages' ? 'ice_beverage' : 'ingredients';
}

export function linkedExpenses(manual: MonthlyExpenseItem[], purchases: PurchaseRecord[], advances: StaffAdvance[], staff: StaffMember[], inventory: InventoryItem[]): MonthlyExpenseItem[] {
  // Linked rows are projections of their source, never duplicate persisted payments.
  const rows = manual.filter(row => !row.source);
  const seen = new Set<string>();
  for (const purchase of purchases) {
    if (seen.has(`purchase:${purchase.id}`)) continue;
    seen.add(`purchase:${purchase.id}`);
    rows.push({ id: `purchase:${purchase.id}`, source: 'purchase', sourceId: purchase.id,
      month: purchase.date.slice(0, 7), date: purchase.date,
      category: purchase.expenseCategory ?? purchaseExpenseCategory(inventory.find(item => item.id === purchase.itemId)),
      title: `${purchase.itemName} / ${purchase.quantity} ${purchase.unit}`, amount: purchase.totalCost,
      paymentMode: purchase.paymentMode, vendor: purchase.supplier, notes: purchase.notes, isRecurring: false });
  }
  for (const advance of advances) {
    if (seen.has(`advance:${advance.id}`)) continue;
    seen.add(`advance:${advance.id}`);
    const member = staff.find(s => s.id === advance.staffId);
    rows.push({ id: `advance:${advance.id}`, source: 'advance', sourceId: advance.id, staffId: advance.staffId,
      month: advance.date.slice(0, 7), date: advance.date, category: 'payroll', title: 'Salary Payment', amount: advance.amount,
      paymentMode: advance.paymentMode ?? 'unknown', vendor: member?.name ?? 'Archived staff', notes: `${advance.reason}${advance.repaid ? ' / Repaid' : ''}`, isRecurring: false });
  }
  return rows;
}

export function salaryPayments(expenses: MonthlyExpenseItem[], staffId: string, month: string) {
  return expenses.filter(e => !e.source && e.category === 'payroll' && e.staffId === staffId && e.salaryMonth === month && e.paymentMode !== 'credit')
    .reduce((sum, e) => sum + e.amount, 0);
}

export function validateExpense(expense: MonthlyExpenseItem) {
  if (!expense.id || !expense.title.trim() || !Number.isFinite(expense.amount) || expense.amount <= 0) throw new Error('Enter a description and amount greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date) || expense.month !== expense.date.slice(0, 7)) throw new Error('Choose a valid payment date.');
  if (expense.source) throw new Error('Linked expenses must be changed at their source.');
  if (expense.category === 'payroll' && (!expense.staffId || !/^\d{4}-\d{2}$/.test(expense.salaryMonth ?? ''))) throw new Error('Select a staff member and salary month.');
  if (expense.commissionDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expense.commissionDate) || Number.isNaN(Date.parse(expense.commissionDate + 'T00:00:00Z')) || new Date(expense.commissionDate + 'T00:00:00Z').toISOString().slice(0, 10) !== expense.commissionDate || (expense.statementMonth && expense.commissionDate.slice(0, 7) !== expense.statementMonth))) throw new Error('Choose a valid commission sales date within the statement month.');
  if (expense.statementMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(expense.statementMonth)) throw new Error('Choose a valid statement month.');
}
