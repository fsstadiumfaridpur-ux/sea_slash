import {test} from 'node:test';import assert from 'node:assert/strict';import {vendorStockUpdateMode,type VendorLedgerEntry} from './vendorLedger';
const bill:VendorLedgerEntry={id:'b',vendorId:'v',date:'2026-10-20',description:'Rice',quantity:10,unit:'kg',unitPrice:100,billed:1000,paid:0,inventoryItemId:'rice',inventoryQuantity:10,inventoryUnit:'kg'};
test('new or corrected stock bills replace inventory but payment-only edits preserve old behavior',()=>{
 assert.equal(vendorStockUpdateMode(undefined,bill),'replace');
 assert.equal(vendorStockUpdateMode(bill,{...bill,paid:300}),undefined);
 assert.equal(vendorStockUpdateMode({...bill,inventoryUpdateMode:'replace'},{...bill,paid:300}),'replace');
 assert.equal(vendorStockUpdateMode(bill,{...bill,quantity:5,inventoryQuantity:5,billed:500}),'replace');
 assert.equal(vendorStockUpdateMode(undefined,{...bill,quantity:0,billed:0,paid:100}),undefined);
});
