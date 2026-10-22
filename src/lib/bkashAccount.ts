import {supabase} from './supabase';
import {loadAppState} from './appState';
import type {DailySalesRecord,MonthlyExpenseItem,PurchaseRecord,StaffAdvance} from '../types';
import {linkedExpenses} from '../utils/linkedExpenses';
import {removeDemoSales} from '../utils/demoSales';
import {removeDemoExpenses} from '../utils/demoExpenses';
import {removeDemoPurchases} from '../utils/demoPurchases';
import {emptyBkashAccount,validateBkashAccount,type BkashAccount,type BkashTransfer} from '../utils/bkashAccount';
const key='sea_slash_bkash_account_v1';
const table=import.meta.env.VITE_SUPABASE_APP_STATE_TABLE||'app_state';
export async function loadBkashAccount():Promise<BkashAccount>{
  if(!supabase)throw new Error('Connect to Supabase to track the bKash account.');
  const {data,error}=await supabase.from(table).select('value').eq('key',key).maybeSingle();
  if(error)throw error;
  const account=data?.value??emptyBkashAccount;validateBkashAccount(account);return account;
}
export async function loadBkashSnapshot(){
  const [account,sales,expenses,purchases,advances]=await Promise.all([loadBkashAccount(),loadAppState<DailySalesRecord[]>('sea_slash_sales_v1'),loadAppState<MonthlyExpenseItem[]>('sea_slash_expenses_v1'),loadAppState<PurchaseRecord[]>('sea_slash_purchases_v1'),loadAppState<StaffAdvance[]>('sea_slash_advances_v1')]);
  return {account,sales:removeDemoSales(sales??[]),expenses:linkedExpenses(removeDemoExpenses(expenses??[]),removeDemoPurchases(purchases??[]),advances??[],[],[]).map(expense=>expense.source==='advance'?{...expense,vendor:undefined}:expense)};
}
async function updateAccount(change:(current:BkashAccount)=>BkashAccount,adminOnly=false){
  if(!supabase)throw new Error('Connect to Supabase before recording bKash transfers.');
  const {data:allowed,error:roleError}=await supabase.rpc(adminOnly?'is_restaurant_admin':'can_manage_restaurant');
  if(roleError||allowed!==true)throw new Error(adminOnly?'Administrator access required to set the opening balance.':'Administrator or manager access required.');
  for(let attempt=0;attempt<3;attempt++){
    const {data,error}=await supabase.from(table).select('value,updated_at').eq('key',key).maybeSingle();if(error)throw error;
    const current=data?.value??emptyBkashAccount;validateBkashAccount(current);
    const next=change(current);validateBkashAccount(next);
    const row={key,value:next,updated_at:new Date().toISOString()};
    const result=data?await supabase.from(table).update(row).eq('key',key).eq('updated_at',data.updated_at).select('value'):await supabase.from(table).insert(row).select('value');
    if(result.error?.code==='23505')continue;if(result.error)throw result.error;
    if(result.data?.length)return result.data[0].value as BkashAccount;
  }
  throw new Error('The bKash account changed in another session. Reload and try again.');
}
export function setBkashOpening(date:string,amount:number){return updateAccount(current=>{
  if(current.opening)throw new Error('The opening balance is already set. Reload the account.');
  return {...current,opening:{date,amount}};
},true);}
export function addBkashTransfer(transfer:BkashTransfer){return updateAccount(current=>{
  if(!current.opening)throw new Error('Set the opening balance before recording transfers.');
  const existing=current.transfers.find(row=>row.id===transfer.id);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(transfer))throw new Error('This transfer ID already exists.');return current;}
  return {...current,transfers:[...current.transfers,transfer]};
});}
export function restoreBkashAccount(account:BkashAccount){validateBkashAccount(account);return updateAccount(()=>account,true);}
