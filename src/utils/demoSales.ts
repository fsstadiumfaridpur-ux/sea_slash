import type { DailySalesRecord } from '../types';

const fields: (keyof DailySalesRecord)[] = ['id', 'date', 'grossSales', 'cashSales', 'bkashSales', 'nagadSales', 'cardSales', 'foodCourtCommission', 'proratedRent', 'cogsCost', 'staffCost', 'otherExpenses', 'netProfit', 'customerCount', 'topSellingItem', 'notes'];
// Exact fingerprints of the retired demo entries; edited and real entries are preserved.
const fingerprints = new Set([
  ['2026-10-03', 38400, 16500, 15400, 3500, 3000, 3840, 1667, 15800, 2967, 950, 13176, 118, 'Shahi Mutton Kacchi (Basmati)', 'Friday crowd in food court was huge; 2 full deghs sold out by 9:30 PM.'],
  ['2026-10-02', 32600, 14000, 12800, 2800, 3000, 3260, 1667, 13400, 2967, 800, 10506, 96, 'Special Beef Tehari with Egg', 'Good corporate lunch order from 5th floor office.'],
  ['2026-10-01', 29800, 13500, 11500, 2800, 2000, 2980, 1667, 12200, 2967, 700, 9286, 88, 'Chicken Roast with Polao', 'Steady weekday sales. Borhani was very popular.'],
  ['2026-09-30', 34500, 15000, 13500, 3000, 3000, 3450, 1667, 14100, 2967, 900, 11416, 104, 'Shahi Mutton Kacchi', 'Month-end salary rush at food court.'],
  ['2026-09-29', 27500, 12000, 10500, 2500, 2500, 2750, 1667, 11500, 2967, 650, 7966, 79, 'Chicken Reshmi Kebab & Naan', 'Rain in the evening slowed evening footfall slightly.'],
  ['2026-09-28', 31200, 13000, 12200, 3000, 3000, 3120, 1667, 12900, 2967, 750, 9796, 92, 'Shahi Mutton Kacchi', 'Normal healthy sales turnover.'],
  ['2026-09-27', 41200, 18000, 16200, 4000, 3000, 4120, 1667, 16900, 2967, 1100, 14446, 130, 'Shahi Mutton Kacchi (Double Mutton)', 'Saturday family dining peaked between 2:00 PM and 4:30 PM.'],
].map(row => JSON.stringify([`sales-${row[0]}`, ...row])));

export function removeDemoSales(records: DailySalesRecord[]): DailySalesRecord[] {
  return records.filter(record => Object.keys(record).length !== fields.length || !fingerprints.has(JSON.stringify(fields.map(field => record[field]))));
}
