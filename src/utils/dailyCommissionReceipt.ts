import type { DailySalesRecord, FoodCourtSettings, MonthlyExpenseItem } from '../types';
import type { CommissionTracking } from '../lib/commissionTracking';
import type { ReceiptWidth } from './dailyCashReceipt';
import { courtStatement, courtPaymentStatus } from './courtStatement';
import { formatDatePretty } from './formatters';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const money = (amount: number) => `Tk ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function dailyCommissionReceiptHtml({ date, sales, expenses, settings, tracking = { paidDates: {} }, width, printedAt = new Date() }: {
  date: string; sales: DailySalesRecord[]; expenses: MonthlyExpenseItem[]; settings: FoodCourtSettings;
  tracking?: CommissionTracking; width: ReceiptWidth; printedAt?: Date;
}) {
  const statement = courtStatement(date.slice(0, 7), sales, expenses, settings, tracking);
  const day = statement.dailyCommissions.find(row => row.date === date);
  const paper = width === 58 ? 58 : 80;
  const available = day?.hasSalesRecord === true;
  const status = day?.adjustment ? (day.due === 0 ? 'Settled' : 'Adjusted') : day?.historicalConfirmation && day.due === 0 ? 'Paid' : available && day ? courtPaymentStatus(day.owed, day.paid) : 'Sales not recorded';
  const payments = statement.payments.filter(payment => payment.category === 'commission' && (payment.commissionDate ?? (statement.days.some(sale => sale.date === payment.date) ? payment.date : null)) === date);
  const line = (label: string, amount: number | undefined, bold = false) => `<div class="line${bold ? ' bold' : ''}"><span>${escape(label)}</span><span class="amount">${amount === undefined ? 'Not recorded' : money(amount)}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Commission - ${escape(date)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}body{width:${paper}mm;max-width:100%;padding:${paper === 58 ? 5 : 4}mm;font:${paper === 58 ? 10 : 12}px/1.4 'Courier New',monospace;overflow-wrap:anywhere}.center{text-align:center}.logo{display:block;width:${paper === 58 ? 30 : 38}mm;max-width:80%;height:auto;margin:0 auto 2mm;filter:grayscale(1)}h1{font:700 ${paper === 58 ? 15 : 18}px Arial,sans-serif;margin:1mm 0}h2{font-size:inherit;margin:2mm 0;text-transform:uppercase}.rule{border:0;border-top:1px dashed #000;margin:3mm 0}.line{display:flex;justify-content:space-between;gap:2mm;align-items:baseline;margin:1mm 0;break-inside:avoid}.line>span:first-child{min-width:0}.amount{white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums}.bold{font-weight:bold}.small{font-size:90%}.payment{margin:3mm 0;break-inside:avoid}.status{padding:2mm 0;border-top:2px solid #000;border-bottom:2px solid #000}.signatures{display:flex;justify-content:space-between;margin-top:7mm;font-size:90%}footer{text-align:center;margin-top:4mm}@page{size:auto;margin:0}@media print{body{max-width:none}}
    </style></head><body><header class="center"><img class="logo" src="/sea-slash-logo.svg" alt="Sea Slash"><h1>${escape(settings.stallName)}</h1><div>${escape(settings.foodCourtName)}</div><div>${escape(settings.stallNumber)}</div><hr class="rule"><h2>Daily Landlord Commission Report</h2><div class="bold">${escape(formatDatePretty(date))}</div><div class="small">Printed: ${escape(printedAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true }))} (Dhaka)</div></header>
    <hr class="rule">${line('Software sales', available ? day.grossSales : undefined, true)}${line('5% VAT deduction (-)', available ? day.vatDeduction : undefined)}${line('Commission base (95%)', available ? day.base : undefined)}<p class="small">Commission rate: ${(settings.commissionRate * 100).toFixed(1)}% after deducting 5% VAT.</p>${line('Commission owed', available ? day.owed : undefined, true)}${line('Paid / confirmed paid', available ? day.paid : day?.paid || undefined)}${day?.adjustment ? line('Balance adjustment', day.adjustment) + `<p class="small">${escape(day.adjustmentReason ?? '')}</p>` : ''}${line('Remaining due', available ? day.due : undefined, true)}${day && day.credit > 0 ? line('Overpayment / credit', day.credit) : ''}<div class="status line bold"><span>Status</span><span>${escape(status)}</span></div>
    ${!available ? '<p class="bold">Sales are not recorded for this date. Commission amounts are unavailable.</p>' : ''}
    <hr class="rule"><h2>Payments for this Sales Day</h2>${payments.length ? payments.map(payment => `<div class="payment">${line(payment.date, payment.amount)}<div class="small">Method: ${escape(payment.paymentMode)}${payment.vendor ? `<br>Recipient: ${escape(payment.vendor)}` : ''}${payment.paymentReference ? `<br>Reference: ${escape(payment.paymentReference)}` : ''}</div></div>`).join('') : '<p class="small">No payment transactions recorded for this sales day.</p>'}
    ${day?.historicalConfirmation ? `<p class="small bold">Previously paid confirmed by owner.${day.confirmedAmount > 0 ? ` Historical confirmation: ${money(day.confirmedAmount)}.` : ''} This confirmation does not create a new cash payment.</p>` : ''}
    ${statement.unallocatedCommissionPaid > 0 ? '<p class="small">Some monthly payments have no assigned sales date and are excluded from this day. Review the statement before paying again.</p>' : ''}
    <p class="small">This report shows recorded payments and confirmations. Printing does not make or record a payment. Monthly rent is separate.</p><div class="signatures"><span>Prepared by: ______</span><span>Received by: ______</span></div><footer><hr class="rule">End of Report<br>Thank You</footer></body></html>`;
}
