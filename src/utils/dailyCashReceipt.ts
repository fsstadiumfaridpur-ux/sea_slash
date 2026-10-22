import type { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import { calculateDailyCash } from './dailyCash';
import { formatDatePretty } from './formatters';

export type ReceiptWidth = 58 | 80;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const money = (value: number) => `Tk ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const methods: Record<MonthlyExpenseItem['paymentMode'], string> = { cash: 'Cash', bank: 'Bank', bkash: 'bKash', card: 'Card', credit: 'Unpaid / Credit', unknown: 'Unknown method' };

export function dailyCashReceiptHtml({ date, sales, expenses, settings, openingCash, width, printedAt = new Date() }: {
  date: string; sales: DailySalesRecord[]; expenses: MonthlyExpenseItem[]; settings: FoodCourtSettings;
  openingCash: number; width: ReceiptWidth; printedAt?: Date;
}) {
  const paper = width === 58 ? 58 : 80;
  const totals = calculateDailyCash(sales, expenses, date, openingCash);
  const rows = expenses.filter(expense => expense.date === date);
  const line = (label: string, amount: number, emphasis = false) => `<div class="line${emphasis ? ' bold' : ''}"><span>${escapeHtml(label)}</span><span class="amount">${money(amount)}</span></div>`;
  const warnings = [
    !totals.hasSales ? 'No software sales recorded for this date. Sales and cash totals are incomplete.' : '',
    totals.invalidBreakdown ? 'Digital payments exceed software sales. Correct the breakdown; cash balance unavailable.' : '',
    totals.unknownExpenses > 0 ? `${money(totals.unknownExpenses)} has an unknown payment method and is excluded from cash expenses.` : '',
    totals.unpaidExpenses > 0 ? `${money(totals.unpaidExpenses)} is unpaid / credit and has not left the cash box.` : '',
  ].filter(Boolean);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Cash - ${escapeHtml(date)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}body{width:${paper}mm;max-width:100%;padding:${paper === 58 ? 5 : 4}mm;font-family:'Courier New',monospace;font-size:${paper === 58 ? 10 : 12}px;line-height:1.4;overflow-wrap:anywhere}.center{text-align:center}.logo{display:block;width:${paper === 58 ? 30 : 38}mm;max-width:80%;height:auto;margin:0 auto 2mm;filter:grayscale(1)}h1{font:700 ${paper === 58 ? 15 : 18}px Arial,sans-serif;margin:1mm 0}h2{font-size:inherit;margin:2mm 0;text-transform:uppercase}.rule{border:0;border-top:1px dashed #000;margin:3mm 0}.line{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0;align-items:baseline}.line>span:first-child{min-width:0}.amount{white-space:nowrap;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.bold{font-weight:700}.small{font-size:90%}.expense{margin:2mm 0;break-inside:avoid}.expense .line{margin-bottom:0}.note{margin:2mm 0}.balance{border-top:2px solid #000;border-bottom:2px solid #000;padding:2mm 0;font-size:115%;font-weight:bold}.signatures{margin-top:7mm;display:flex;justify-content:space-between;font-size:90%}footer{margin-top:4mm;text-align:center}.line,.balance{break-inside:avoid}@page{size:auto;margin:0}@media print{html,body{background:white}body{max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <header class="center"><img class="logo" src="/sea-slash-logo.svg" alt="Sea Slash"><h1>${escapeHtml(settings.stallName)}</h1><div>${escapeHtml(settings.foodCourtName)}</div><div>${escapeHtml(settings.stallNumber)}</div>${settings.managerContact ? `<div class="small">Contact: ${escapeHtml(settings.managerContact)}</div>` : ''}<hr class="rule"><h2>Daily Cash &amp; Expense Report</h2><div class="bold">${escapeHtml(formatDatePretty(date))}</div><div class="small">Printed: ${escapeHtml(printedAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true }))} (Dhaka)</div></header>
    <hr class="rule"><h2>Sales Collections</h2>
    ${line('Total software sales', totals.totalSales, true)}${line('Bank transfer', totals.bankSales)}${line('bKash', totals.bkashSales)}${line('Nagad', totals.nagadSales)}${line('Card', totals.cardSales)}${line('Total digital payments', totals.digitalSales, true)}${line('Cash sales', totals.cashSales, true)}
    <hr class="rule"><h2>All Daily Expenses (${rows.length})</h2>
    ${rows.length ? rows.map((expense, index) => `<div class="expense"><div class="line"><span>${index + 1}. ${escapeHtml(expense.title)}</span><span class="amount">${money(expense.amount)}</span></div><div class="small">${escapeHtml(methods[expense.paymentMode])}${expense.vendor ? ` | ${escapeHtml(expense.vendor)}` : ''}</div>${expense.commissionDate ? `<div class="small">Commission sales day: ${escapeHtml(expense.commissionDate)}</div>` : ''}</div>`).join('') : '<p>No expenses recorded for this date.</p>'}
    <hr class="rule">${line('Total daily expenses', totals.totalExpenses, true)}${line('Paid from cash box', totals.cashExpenses)}${line('Paid by digital methods', rows.filter(row => ['bkash', 'bank', 'card'].includes(row.paymentMode)).reduce((sum, row) => sum + row.amount, 0))}${line('Unpaid / credit', totals.unpaidExpenses)}${line('Unknown payment method', totals.unknownExpenses)}
    <hr class="rule"><h2>Cash Box Reconciliation</h2>${line('Opening / change float (+)', totals.openingCash)}${line('Cash sales (+)', totals.cashSales)}${line('Cash expenses (-)', totals.cashExpenses)}
    <div class="balance line"><span>Cash in hand</span><span class="amount">${totals.invalidBreakdown || !totals.hasSales ? 'Unavailable' : money(totals.cashInHand)}</span></div>
    <p class="small note">Includes change float. Digital collections and unpaid expenses do not enter this cash balance. Previous handovers are not deducted.</p>
    ${totals.cashInHand < 0 && !totals.invalidBreakdown && totals.hasSales ? `<p class="bold">Cash shortage: ${money(-totals.cashInHand)}</p>` : ''}
    ${warnings.map(warning => `<p class="small bold note">${escapeHtml(warning)}</p>`).join('')}
    <p class="small note">Cash sales assume all digital collections have been entered.</p>
    <div class="signatures"><span>Prepared by: ______</span><span>Received by: ______</span></div><footer><hr class="rule">End of Report<br>Thank You</footer>
  </body></html>`;
}
