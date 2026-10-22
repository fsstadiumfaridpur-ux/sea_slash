import { supabase } from './supabase';
import type { MonthlyExpenseItem } from '../types';
import { removeDemoExpenses } from '../utils/demoExpenses';
import { validateExpense } from '../utils/linkedExpenses';

const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';
const key = 'sea_slash_expenses_v1';

async function updateExpenses(change: (rows: MonthlyExpenseItem[]) => MonthlyExpenseItem[]) {
  if (!supabase) throw new Error('Connect to Supabase before recording expenses.');
  const { data: admin, error: authError } = await supabase.rpc('can_manage_restaurant');
  if (authError || admin !== true) throw new Error('Administrator or manager login required.');
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from(table).select('value,updated_at').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    const next = change(removeDemoExpenses(data?.value ?? []));
    const row = { key, value: next, updated_at: new Date().toISOString() };
    const result = data ? await supabase.from(table).update(row).eq('key', key).eq('updated_at', data.updated_at).select('value') : await supabase.from(table).insert(row).select('value');
    if (result.error?.code === '23505') continue;
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length) return result.data[0].value as MonthlyExpenseItem[];
  }
  throw new Error('Expense records changed in another session. Please retry.');
}

export async function recordExpense(expense: MonthlyExpenseItem) {
  validateExpense(expense);
  if (expense.category === 'payroll') {
    if (!supabase) throw new Error('Connect to Supabase before saving salary payments.');
    const { data, error } = await supabase.rpc('restaurant_expense_security_ready');
    if (error || data !== true) throw new Error('Run supabase-expense-security.sql in Supabase SQL Editor before recording private salary payments.');
  }
  return updateExpenses(rows => rows.some(row => row.id === expense.id) ? rows.map(row => row.id === expense.id ? expense : row) : [expense, ...rows]);
}

export function deleteExpense(id: string) {
  return updateExpenses(rows => rows.filter(row => row.id !== id));
}
