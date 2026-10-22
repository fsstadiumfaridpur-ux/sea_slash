import { useCallback } from 'react';
import type { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import { dailyCashReceiptHtml, type ReceiptWidth } from '../utils/dailyCashReceipt';
import { ThermalReceiptPreview } from './ThermalReceiptPreview';

interface Props {
  date: string; sales: DailySalesRecord[]; expenses: MonthlyExpenseItem[]; settings: FoodCourtSettings;
  openingCash: number; onClose: () => void;
}
export function DailyCashPrintPreview({ date, sales, expenses, settings, openingCash, onClose }: Props) {
  const renderReceipt = useCallback((width: ReceiptWidth) => dailyCashReceiptHtml({ date, sales, expenses, settings, openingCash, width }), [date, sales, expenses, settings, openingCash]);
  return <ThermalReceiptPreview title="Print Daily Cash Receipt" renderReceipt={renderReceipt} onClose={onClose} />;
}
