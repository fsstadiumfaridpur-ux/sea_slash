import { useCallback } from 'react';
import type { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import type { CommissionTracking } from '../lib/commissionTracking';
import type { ReceiptWidth } from '../utils/dailyCashReceipt';
import { dailyCommissionReceiptHtml } from '../utils/dailyCommissionReceipt';
import { ThermalReceiptPreview } from './ThermalReceiptPreview';

export function DailyCommissionPrintPreview({ date, sales, expenses, settings, tracking, onClose }: {
  date: string; sales: DailySalesRecord[]; expenses: MonthlyExpenseItem[]; settings: FoodCourtSettings;
  tracking: CommissionTracking; onClose: () => void;
}) {
  const renderReceipt = useCallback((width: ReceiptWidth) => dailyCommissionReceiptHtml({ date, sales, expenses, settings, tracking, width }), [date, sales, expenses, settings, tracking]);
  return <ThermalReceiptPreview title="Print Daily Commission Receipt" renderReceipt={renderReceipt} onClose={onClose} />;
}
