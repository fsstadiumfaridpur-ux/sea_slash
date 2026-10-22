import type {DailySalesRecord,MonthlyExpenseItem} from '../types';
import {roundMoney} from './money';

export interface BkashTransfer {id:string;date:string;direction:'in'|'out';amount:number;description:string;reference:string}
export interface BkashAccount {opening?:{date:string;amount:number};transfers:BkashTransfer[]}
export const emptyBkashAccount: BkashAccount={transfers:[]};
export function validAccountDate(date:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
}
export function validateBkashAccount(account:BkashAccount) {
  const money=(amount:number)=>Number.isFinite(amount)&&amount>=0&&amount<=1e12&&Math.abs(roundMoney(amount)-amount)<1e-7;
  if(!account||!Array.isArray(account.transfers))throw new Error('Invalid bKash account records.');
  if(account.opening&&(!validAccountDate(account.opening.date)||!money(account.opening.amount)))throw new Error('Enter a valid opening date and balance.');
  const ids=new Set<string>();
  for(const transfer of account.transfers){
    if(!transfer.id||ids.has(transfer.id)||!validAccountDate(transfer.date)||!['in','out'].includes(transfer.direction)||!money(transfer.amount)||transfer.amount<=0||!transfer.description?.trim()||transfer.description.length>500||typeof transfer.reference!=='string'||transfer.reference.length>200||!account.opening||transfer.date<account.opening.date)throw new Error('Enter a valid amount, date and description for the bKash transfer.');
    ids.add(transfer.id);
  }
}
export function bkashHistory(account:BkashAccount,sales:DailySalesRecord[],expenses:MonthlyExpenseItem[],through:string) {
  validateBkashAccount(account);
  const opening=account.opening;
  type Row={id:string;date:string;description:string;reference:string;kind:'sale'|'expense'|'transfer'|'opening';signed:number};
  if(!opening)return {balance:null,incoming:0,outgoing:0,rows:[] as (Row&{balance:number})[]};
  const rows:Row[]=[]; const seen=new Set<string>();
  const add=(row:Row)=>{if(row.date>=opening.date&&row.date<=through&&!seen.has(row.id)&&Number.isFinite(row.signed)&&row.signed!==0){seen.add(row.id);rows.push(row);}};
  for(const sale of sales)if(sale.bkashSales>0)add({id:`sale:${sale.id}`,date:sale.date,description:'bKash sales receipts',reference:'',kind:'sale',signed:roundMoney(sale.bkashSales)});
  for(const expense of expenses)if(expense.paymentMode==='bkash'&&expense.amount>0)add({id:`expense:${expense.source ? `${expense.source}:${expense.sourceId??expense.id}` : expense.id}`,date:expense.date,description:`${expense.title}${expense.vendor ? ` · ${expense.vendor}` : ''}`,reference:expense.paymentReference??'',kind:'expense',signed:-roundMoney(expense.amount)});
  for(const transfer of account.transfers)add({id:`transfer:${transfer.id}`,date:transfer.date,description:transfer.description,reference:transfer.reference,kind:'transfer',signed:transfer.direction==='in'?transfer.amount:-transfer.amount});
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let balance=opening.amount;
  const running=rows.map(row=>{balance=roundMoney(balance+row.signed);return {...row,balance};});
  return {balance:through<opening.date?null:balance,incoming:roundMoney(rows.filter(row=>row.signed>0).reduce((sum,row)=>sum+row.signed,0)),outgoing:roundMoney(rows.filter(row=>row.signed<0).reduce((sum,row)=>sum-row.signed,0)),rows:[{id:'opening',date:opening.date,description:'Opening balance',reference:'',kind:'opening' as const,signed:opening.amount,balance:opening.amount},...running].filter(row=>row.date<=through)};
}
