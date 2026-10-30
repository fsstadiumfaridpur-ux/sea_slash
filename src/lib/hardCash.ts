import {supabase} from './supabase';
export interface HardCashEntry {id:string;date:string;direction:'in'|'out';amount:number;reason:string;created_at:string}
export interface HardCashSnapshot {entries:HardCashEntry[];balance:number;totalIn:number;totalOut:number}
async function call(name:string,args?:Record<string,unknown>):Promise<HardCashSnapshot>{
  if(!supabase)throw new Error('Connect to Supabase to use Hard Cash.');
  const {data,error}=await supabase.rpc(name,args);
  if(error)throw new Error(error.code==='PGRST202'?'Run supabase-hard-cash.sql in Supabase SQL Editor to enable the admin-only Hard Cash account.':error.message);
  return data as HardCashSnapshot;
}
export const loadHardCash=()=>call('hard_cash_snapshot');
export const addHardCash=(entry:Omit<HardCashEntry,'created_at'>)=>call('add_hard_cash_entry',{p_id:entry.id,p_date:entry.date,p_direction:entry.direction,p_amount:entry.amount,p_reason:entry.reason});
export const deleteHardCash=(id:string)=>call('delete_hard_cash_entry',{p_id:id});
