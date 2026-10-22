import test from 'node:test';
import assert from 'node:assert/strict';
import {bkashHistory,validateBkashAccount,type BkashAccount} from './bkashAccount';
import type {DailySalesRecord,MonthlyExpenseItem} from '../types';
import {vendorLedgerWithExpensePayments} from './vendorExpensePayments';
const account:BkashAccount={opening:{date:'2026-10-16',amount:100},transfers:[{id:'topup',date:'2026-10-18',amount:200,direction:'in',description:'Owner deposit',reference:'IN1'},{id:'withdraw',date:'2026-10-19',amount:50,direction:'out',description:'Transfer to bank',reference:'OUT1'}]};
const sale={id:'s1',date:'2026-10-17',bkashSales:1000,grossSales:2000,cashSales:1000,bankSales:0,cardSales:0,nagadSales:0} as DailySalesRecord;
const expense:MonthlyExpenseItem={id:'payment1',date:'2026-10-18',month:'2026-10',category:'ingredients',title:'Vendor payment',amount:300,paymentMode:'bkash',isRecurring:false,vendorId:'v1',vendor:'Vendor One',paymentReference:'PAY1'};
test('bKash balance adds opening, sales and deposits, then subtracts payments and transfers once',()=>{
 const result=bkashHistory(account,[sale,sale],[expense,expense],'2026-10-21');
 assert.equal(result.balance,950);assert.equal(result.incoming,1200);assert.equal(result.outgoing,350);assert.equal(result.rows.length,5);
 assert.equal(result.rows.at(-1)?.balance,950);assert.equal(result.rows.find(row=>row.kind==='expense')?.signed,-300);
 assert.equal(result.rows.find(row=>row.kind==='expense')?.reference,'PAY1');
 const vendors=vendorLedgerWithExpensePayments([], [expense], [{id:'v1',name:'Vendor One'}]);
 assert.equal(vendors.length,1);assert.equal(vendors[0].paid,300);
});
test('tracking start date and as-of date exclude older/future records and other payment methods',()=>{
 const result=bkashHistory({...account,transfers:[]},[{...sale,id:'before',date:'2026-10-15'},sale,{...sale,id:'future',date:'2026-10-22'}],[expense,{...expense,id:'cash',paymentMode:'cash'},{...expense,id:'bank',paymentMode:'bank'},{...expense,id:'credit',paymentMode:'credit'},{...expense,id:'before',date:'2026-10-15'}],'2026-10-21');
 assert.equal(result.balance,800);assert.equal(result.rows.length,3);
 assert.equal(bkashHistory(account,[sale],[expense],'2026-10-15').balance,null);
 assert.equal(bkashHistory({transfers:[]},[sale],[expense],'2026-10-21').balance,null);
});
test('linked bKash expenses stay single entries and edits recalculate the balance',()=>{
 const linked={...expense,id:'purchase:p1',source:'purchase' as const,sourceId:'p1'};
 const copy={...linked,id:'another-projection'};
 assert.equal(bkashHistory({opening:{date:'2026-10-16',amount:0},transfers:[]},[sale],[linked,copy],'2026-10-21').balance,700);
 assert.equal(bkashHistory({...account,transfers:[]},[{...sale,bkashSales:1200}],[{...expense,amount:400}],'2026-10-21').balance,900);
 assert.equal(bkashHistory({...account,transfers:[]},[],[expense],'2026-10-21').balance,-200);
});
test('account validation rejects bad dates, non-money amounts, duplicate IDs and transfers before opening',()=>{
 for(const value of [{opening:{date:'2026-02-30',amount:0},transfers:[]},{opening:{date:'2026-10-16',amount:-1},transfers:[]},{...account,transfers:[{...account.transfers[0],amount:0.001}]},{...account,transfers:[account.transfers[0],account.transfers[0]]},{...account,transfers:[{...account.transfers[0],date:'2026-10-15'}]}])assert.throws(()=>validateBkashAccount(value as BkashAccount));
 validateBkashAccount({opening:{date:'2026-10-16',amount:0},transfers:[]});
});
