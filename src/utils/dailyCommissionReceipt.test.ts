import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyCommissionReceiptHtml } from './dailyCommissionReceipt';
import { defaultSettings } from '../data/demoFixtures';
import type { DailySalesRecord, MonthlyExpenseItem } from '../types';

const sale: DailySalesRecord = { id: 'sale', date: '2026-10-12', grossSales: 66748, cashSales: 66748, bkashSales: 0, nagadSales: 0, cardSales: 0, foodCourtCommission: 6341.06, proratedRent: 1667, cogsCost: 0, staffCost: 0, otherExpenses: 0, netProfit: 58739.94 };
const payment: MonthlyExpenseItem = { id: 'payment', date: '2026-10-17', month: '2026-10', commissionDate: '2026-10-12', statementMonth: '2026-10', category: 'commission', title: 'Commission', amount: 1000, paymentMode: 'bank', isRecurring: false, paymentReference: 'reference <script>alert(1)</script>' };
const props = { date: sale.date, sales: [sale], expenses: [payment], settings: defaultSettings, width: 80 as const };

test('daily commission receipt prints the selected sales day with VAT deduction, later payment and exact remaining balance', () => {
  const html = dailyCommissionReceiptHtml({ ...props, sales: [sale, { ...sale, id: 'other', date: '2026-10-13', grossSales: 111111 }], expenses: [payment, { ...payment, id: 'other', commissionDate: '2026-10-13', paymentReference: 'other-day-reference' }] });
  for (const amount of ['66,748.00', '3,337.40', '63,410.60', '6,341.06', '1,000.00', '5,341.06']) assert.ok(html.includes(amount), amount);
  assert.match(html, /Part-paid/);
  assert.match(html, /2026-10-17/);
  assert.doesNotMatch(html, /other-day-reference|1,11,111|<script>|Net Profit/);
  assert.match(html, /&lt;script&gt;/);
});

test('historical confirmation prints Paid without inventing a payment transaction', () => {
  const html = dailyCommissionReceiptHtml({ ...props, expenses: [], tracking: { paidDates: { '2026-10-12': 6341.06 } }, width: 58 });
  assert.match(html, /width:58mm/);
  assert.match(html, /<span>Status<\/span><span>Paid<\/span>/);
  assert.match(html, /No payment transactions recorded/);
  assert.match(html, /Previously paid confirmed by owner/);
  assert.match(html, /Remaining due<\/span><span class="amount">Tk 0.00/);
});

test('missing daily sales print unavailable amounts and preserve the manual paid status', () => {
  const html = dailyCommissionReceiptHtml({ ...props, sales: [], expenses: [], tracking: { paidDates: { '2026-10-12': 0 } } });
  assert.match(html, /Sales are not recorded/);
  assert.match(html, /Software sales<\/span><span class="amount">Not recorded/);
  assert.match(html, /<span>Status<\/span><span>Paid<\/span>/);
});
