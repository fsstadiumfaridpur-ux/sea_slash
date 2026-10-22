import test from 'node:test';
import assert from 'node:assert/strict';
import {latestVendorPurchases} from './latestVendorPurchases';
import type {VendorLedgerEntry} from './vendorLedger';

const bill:VendorLedgerEntry={id:'b1',vendorId:'v1',date:'2026-10-18',description:'Rice',billed:1000,paid:0,inventoryItemId:'rice',inventoryQuantity:10000,inventoryUnit:'g',quantity:10,unit:'kg',unitPrice:100};
test('latest purchases use linked item IDs, most recent bill date and matching bill units',()=>{
  const newer={...bill,id:'b2',date:'2026-10-19',vendorId:'v2',billed:1200,quantity:8,unitPrice:150};
  const result=latestVendorPurchases([newer,bill,{...bill,id:'other',inventoryItemId:'different',description:'Rice'}],[{id:'v2',name:'Rice supplier'}]);
  assert.deepEqual(result.get('rice'),{date:'2026-10-19',vendorName:'Rice supplier',quantity:8,unit:'kg',unitPrice:150,total:1200});
  assert.equal(result.size,2);
});
test('payments, balance corrections and unlinked descriptions cannot replace purchase details',()=>{
  const rows=[bill,{...bill,id:'pay',date:'2026-10-20',billed:0,paid:1000},{...bill,id:'adjust',date:'2026-10-20',balanceAdjustment:10},{...bill,id:'expense',date:'2026-10-20',sourceExpenseId:'e1'},{...bill,id:'unlinked',inventoryItemId:undefined,date:'2026-10-20'}];
  assert.equal(latestVendorPurchases(rows,[]).get('rice')?.date,'2026-10-18');
  assert.equal(latestVendorPurchases(rows,[]).get('rice')?.vendorName,'Vendor unavailable');
  assert.equal(latestVendorPurchases([],[]).size,0);
});
test('same-day bills follow append order and older kilogram records retain their bill rate',()=>{
  const later={...bill,id:'later',billed:2000,quantity:20};
  assert.equal(latestVendorPurchases([bill,later],[]).get('rice')?.quantity,20);
  const legacy={...bill,quantity:undefined,unit:undefined,unitPrice:undefined,quantityKg:5,pricePerKg:200};
  assert.equal(latestVendorPurchases([legacy],[]).get('rice')?.unit,'kg');
  assert.equal(latestVendorPurchases([legacy],[]).get('rice')?.unitPrice,200);
});
