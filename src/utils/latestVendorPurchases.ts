import { vendorBillDetails, type VendorLedgerEntry } from './vendorLedger';

export function latestVendorPurchases(ledger: VendorLedgerEntry[], vendors: {id:string;name:string}[]) {
  const latest = new Map<string,VendorLedgerEntry>();
  for (const bill of ledger) {
    if (!bill.inventoryItemId || bill.billed <= 0 || bill.balanceAdjustment !== undefined || bill.sourceExpenseId) continue;
    const previous=latest.get(bill.inventoryItemId);
    // A new bill is appended within its date group by the ledger save operation.
    if (!previous || bill.date >= previous.date) latest.set(bill.inventoryItemId,bill);
  }
  const names=new Map(vendors.map(vendor=>[vendor.id,vendor.name]));
  return new Map([...latest].map(([itemId,bill])=>{
    const details=vendorBillDetails(bill);
    const quantity=details?.quantity ?? bill.inventoryQuantity;
    const unit=details?.unit ?? bill.inventoryUnit;
    return [itemId,{date:bill.date,vendorName:names.get(bill.vendorId) ?? 'Vendor unavailable',quantity,unit,
      unitPrice:quantity && quantity>0 ? bill.billed/quantity : undefined,total:bill.billed}];
  }));
}
