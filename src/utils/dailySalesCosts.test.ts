import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySalesCosts} from './dailySalesCosts';
import {linkedExpenses} from './linkedExpenses';
import type {MonthlyExpenseItem,PurchaseRecord} from '../types';
const row:MonthlyExpenseItem={id:'food',month:'2026-10',date:'2026-10-19',category:'ingredients',amount:1000,title:'Food',paymentMode:'cash',isRecurring:false};
test('daily sales costs split same-day ingredients and other costs and exclude separate deductions',()=>{
 const categories=['gas_utilities','packaging','ice_beverage','maintenance','transport','other'] as const;
 const rows=[row,...categories.map(category=>({...row,id:category,category,amount:100})),...(['rent','commission','payroll'] as const).map(category=>({...row,id:category,category,amount:9999})),{...row,id:'previous',date:'2026-10-18',amount:5000}];
 const result=dailySalesCosts(rows,'2026-10-19');
 assert.equal(result.ingredients,1000);assert.equal(result.other,600);assert.equal(result.rows.length,7);
 assert.equal(dailySalesCosts(rows,'2026-10-18').ingredients,5000);
 assert.deepEqual(dailySalesCosts(rows,'2026-10-20'),{ingredients:0,other:0,rows:[]});
});
test('linked purchases and manual expenses count once, including credit costs',()=>{
 const purchase:PurchaseRecord={id:'p1',date:row.date,itemId:'rice',itemName:'Rice',quantity:5,unit:'kg',unitPrice:100,totalCost:500,supplier:'Vendor',paymentMode:'credit'};
 const expenses=linkedExpenses([row,{...row,id:'purchase:p1',source:'purchase',sourceId:'p1',amount:500}], [purchase,purchase],[],[],[]);
 const result=dailySalesCosts([...expenses,expenses[0]],row.date);
 assert.equal(result.ingredients,1500);assert.equal(result.rows.length,2);
 assert.equal(dailySalesCosts([{...row,amount:NaN}],row.date).ingredients,0);
});
