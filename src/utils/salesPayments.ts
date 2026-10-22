import type { DailySalesRecord } from '../types';
import { roundMoney } from './money';

// Software sales include every channel. Only the remainder enters the drawer.
export function salesPayments(record: Pick<DailySalesRecord, 'grossSales' | 'bkashSales' | 'nagadSales' | 'cardSales' | 'bankSales'>) {
  const bkash = record.bkashSales ?? 0;
  const nagad = record.nagadSales ?? 0;
  const card = record.cardSales ?? 0;
  const bank = record.bankSales ?? 0;
  const digital = roundMoney(bkash + nagad + card + bank);
  return { bkash, nagad, card, bank, digital, cash: roundMoney(record.grossSales - digital) };
}
