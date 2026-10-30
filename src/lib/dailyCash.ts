import { loadAppState } from './appState';
import { isSupabaseConfigured, supabase } from './supabase';

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

export async function addCashFloat(date:string,amount:number,expected:number,id:string):Promise<{total:number;alreadyApplied:boolean}> {
  cashFloatKey(date);
  if(!Number.isFinite(amount)||amount<=0||amount>1e12||Math.abs(amount*100-Math.round(amount*100))>0.0001)throw new Error('Enter an amount greater than zero with up to two decimal places.');
  if(!supabase)throw new Error('Connect to Supabase before adding change float.');
  const {data,error}=await supabase.rpc('add_daily_cash_float',{p_id:id,p_date:date,p_amount:amount,p_expected:expected});
  if(error)throw new Error(error.code==='PGRST202'?'Run supabase-cash-float-topups.sql in Supabase SQL Editor to enable cash top-ups.':error.message);
  validateAmount(data.total);
  return data;
}
