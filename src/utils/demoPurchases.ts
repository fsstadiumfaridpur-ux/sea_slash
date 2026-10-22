import type { PurchaseRecord } from '../types';

export const retiredDemoPurchases: PurchaseRecord[] = [
  {
    id: 'pur-1',
    date: '2026-10-04',
    itemId: 'inv-2',
    itemName: 'Deshi Broiler Chicken (Cleaned)',
    quantity: 20,
    unit: 'kg',
    unitPrice: 220,
    totalCost: 4400,
    supplier: 'Kaptan Bazar Poultry',
    paymentMode: 'cash',
    notes: 'Morning fresh delivery for Friday roast & biryani',
  },
  {
    id: 'inv-pur-2',
    date: '2026-10-03',
    itemId: 'inv-1',
    itemName: 'Fresh Mutton (Khasi Gosht)',
    quantity: 15,
    unit: 'kg',
    unitPrice: 1150,
    totalCost: 17250,
    supplier: 'Mirpur Wholesale Meat Syndicate',
    paymentMode: 'bkash',
    notes: 'High grade khasi for weekend kacchi degh',
  },
  {
    id: 'pur-3',
    date: '2026-10-03',
    itemId: 'inv-10',
    itemName: 'Diamond Red Potatoes (Biryani Alu)',
    quantity: 30,
    unit: 'kg',
    unitPrice: 55,
    totalCost: 1650,
    supplier: 'Karwan Bazar Arat #42',
    paymentMode: 'cash',
  },
  {
    id: 'pur-4',
    date: '2026-10-02',
    itemId: 'inv-6',
    itemName: 'Shahi Pure Cow Ghee',
    quantity: 5,
    unit: 'kg',
    unitPrice: 1400,
    totalCost: 7000,
    supplier: 'Baghabari Milk Producers Coop',
    paymentMode: 'bkash',
  },
];

export function removeDemoPurchases(records: PurchaseRecord[]) {
  return records.filter(record => !retiredDemoPurchases.some(sample => Object.keys(record).length === Object.keys(sample).length && Object.entries(sample).every(([key, value]) => record[key as keyof PurchaseRecord] === value)));
}
