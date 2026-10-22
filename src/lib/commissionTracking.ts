import { loadAppState } from './appState';
import { supabase } from './supabase';

export const COMMISSION_TRACKING_KEY = 'sea_slash_commission_tracking_v1';
export interface BalanceAdjustment { amount: number; reason: string }
export interface CommissionTracking {
  balanceAdjustments?: Record<string, BalanceAdjustment>;
  rentAdjustments?: Record<string, BalanceAdjustment>;
  paidDates: Record<string, number>;
  startDate?: string;
}
export const emptyCommissionTracking: CommissionTracking = { paidDates: {} };
export function validateCommissionTracking(value: CommissionTracking) {
  for (const [kind, adjustments] of [['daily', value?.balanceAdjustments], ['rent', value?.rentAdjustments]] as const) {
    if (adjustments === undefined) continue;
    if (!adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments) || Object.entries(adjustments).some(([date, entry]) => !(kind === 'rent' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(date) : /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) || !entry || !Number.isFinite(entry.amount) || Math.abs(entry.amount) > Number.MAX_SAFE_INTEGER / 100 || Math.abs(Math.round(entry.amount * 100) / 100 - entry.amount) > 0.0000001 || typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 500)) throw new Error('Enter a valid balance adjustment and reason.');
  }
  const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
  if (!value || !value.paidDates || typeof value.paidDates !== 'object' || Array.isArray(value.paidDates) || (value.startDate && !dateValid(value.startDate)) || Object.entries(value.paidDates).some(([date, amount]) => !dateValid(date) || !Number.isFinite(amount) || amount < 0)) throw new Error('Invalid commission tracking records.');
}
export async function loadCommissionTracking() {
  const value = await loadAppState<CommissionTracking>(COMMISSION_TRACKING_KEY) ?? emptyCommissionTracking;
  validateCommissionTracking(value);
  return value;
}
export async function saveCommissionTracking(change: CommissionTracking) {
  validateCommissionTracking(change);
  if (!supabase) throw new Error('Connect to Supabase before overriding commission balances.');
  const { data: admin, error: roleError } = await supabase.rpc('is_restaurant_admin');
  if (roleError || admin !== true) throw new Error('Administrator access required to change historical commission or reminder start.');
  const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from(table).select('value,updated_at').eq('key', COMMISSION_TRACKING_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    const current: CommissionTracking = data?.value ?? emptyCommissionTracking;
    validateCommissionTracking(current);
    const next = { ...current, ...change, paidDates: { ...current.paidDates, ...change.paidDates }, balanceAdjustments: { ...current.balanceAdjustments, ...change.balanceAdjustments }, rentAdjustments: { ...current.rentAdjustments, ...change.rentAdjustments } };
    const row = { key: COMMISSION_TRACKING_KEY, value: next, updated_at: new Date().toISOString() };
    const result = data ? await supabase.from(table).update(row).eq('key', COMMISSION_TRACKING_KEY).eq('updated_at', data.updated_at).select('value') : await supabase.from(table).insert(row).select('value');
    if (result.error?.code === '23505') continue;
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length) return next;
  }
  throw new Error('Commission tracking changed in another session. Please retry.');
}
