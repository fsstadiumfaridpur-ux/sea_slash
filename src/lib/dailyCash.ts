import { loadAppState, saveAppState } from './appState';
import { isSupabaseConfigured } from './supabase';

function cashFloatKey(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Select a valid cash date.');
  return `sea_slash_cash_float_v1_${date}`;
}

function validateAmount(amount: unknown): asserts amount is number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('Change float must be a valid amount of zero or more.');
}

export async function loadCashFloat(date: string): Promise<number> {
  const key = cashFloatKey(date);
  const amount = isSupabaseConfigured ? await loadAppState<number>(key) ?? 0 : JSON.parse(localStorage.getItem(key) ?? '0');
  validateAmount(amount);
  return amount;
}

export async function saveCashFloat(date: string, amount: number): Promise<void> {
  const key = cashFloatKey(date);
  validateAmount(amount);
  await saveAppState(key, amount);
  localStorage.setItem(key, JSON.stringify(amount));
}
