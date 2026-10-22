import { supabase } from './supabase';
import { loadAppState } from './appState';
import { validateInvestment, type InvestmentEntry } from '../utils/investments';

export const INVESTMENT_KEY = 'sea_slash_investments_v1';
const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';

async function requireInvestmentSecurity() {
  if (!supabase) throw new Error('Connect to Supabase before saving investments.');
  const { data, error } = await supabase.rpc('restaurant_investment_security_ready');
  if (error || data !== true) throw new Error('Run supabase-investment-security.sql in Supabase SQL Editor, then retry while logged in as admin.');
}

export async function loadInvestments() {
  if (!supabase) throw new Error('Sign in to view investments.');
  const workspace=await supabase.rpc('get_investment_workspace');
  if (!workspace.error) {const rows:InvestmentEntry[]=workspace.data.entries;rows.forEach(validateInvestment);return rows;}
  if (workspace.error.code!=='PGRST202') throw new Error(workspace.error.message);
  await requireInvestmentSecurity();
  const rows = await loadAppState<InvestmentEntry[]>(INVESTMENT_KEY) ?? [];
  rows.forEach(validateInvestment);
  return rows;
}

async function updateInvestments(change: (rows: InvestmentEntry[]) => InvestmentEntry[]) {
  await requireInvestmentSecurity();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase!.from(table).select('value,updated_at').eq('key', INVESTMENT_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    const rows: InvestmentEntry[] = data?.value ?? [];
    rows.forEach(validateInvestment);
    const next = change(rows);
    next.forEach(validateInvestment);
    const row = { key: INVESTMENT_KEY, value: next, updated_at: new Date().toISOString() };
    const result = data
      ? await supabase!.from(table).update(row).eq('key', INVESTMENT_KEY).eq('updated_at', data.updated_at).select('value')
      : await supabase!.from(table).insert(row).select('value');
    if (result.error?.code === '23505') continue;
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length) return result.data[0].value as InvestmentEntry[];
  }
  throw new Error('Investment records changed in another session. Please retry.');
}

export function recordInvestment(entry: InvestmentEntry) {
  validateInvestment(entry);
  return updateInvestments(rows => rows.some(row => row.id === entry.id) ? rows.map(row => row.id === entry.id ? entry : row) : [entry, ...rows]);
}

export function deleteInvestment(id: string) {
  return updateInvestments(rows => rows.filter(row => row.id !== id));
}

export function importInvestments(entries: InvestmentEntry[]) {
  if (!Array.isArray(entries)) throw new Error('Invalid investment backup.');
  entries.forEach(validateInvestment);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate investment records in backup.');
  return updateInvestments(rows => [...entries, ...rows.filter(row => !entries.some(entry => entry.id === row.id))]);
}
