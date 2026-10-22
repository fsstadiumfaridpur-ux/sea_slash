import { roundMoney } from './money';
import { vendorBillDetails, sortVendorLedgerByDate, vendorLedgerSummary, type VendorLedgerEntry } from './vendorLedger';
import type { Vendor } from '../components/VendorsView';

// Load the spreadsheet library only when exporting, keeping the ledger fast to open.
export async function buildVendorLedgerExcel(vendor: Vendor, entries: VendorLedgerEntry[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sea Slash';
  workbook.created = new Date();
  const summary = vendorLedgerSummary(entries, vendor.id);
  const records = sortVendorLedgerByDate(entries.filter(entry => entry.vendorId === vendor.id));
  const moneyFormat = '"৳"#,##0.00;[Red]-"৳"#,##0.00';

  const overview = workbook.addWorksheet('Vendor Summary');
  overview.columns = [{ header: 'Vendor Ledger', width: 30 }, { header: 'Details', width: 55 }];
  overview.addRows([
    ['Vendor', vendor.name], ['Category', vendor.category], ['Phone', vendor.phone],
    ['Address', vendor.address], ['Notes', vendor.notes], ['Currency', 'BDT'],
    ['History', 'All recorded dates, newest first'],
    ['Total Bills', summary.billed], ['Total Paid', summary.paid],
    ['Remaining Due', Math.max(summary.balance, 0)], ['Advance / Credit', Math.max(-summary.balance, 0)],
  ]);
  for (let row = 9; row <= 12; row++) overview.getCell(row, 2).numFmt = moneyFormat;

  const daily = workbook.addWorksheet('Daily Bills & Payments');
  daily.columns = [
    { header: 'Date', width: 16 }, { header: 'Previous Due / Credit', width: 26 },
    { header: 'Daily Bills (BDT)', width: 24 }, { header: 'Total Including Previous Due', width: 34 },
    { header: 'Daily Paid (BDT)', width: 24 }, { header: 'Remaining Due / Credit', width: 28 }, { header: 'Balance Adjustment (BDT)', width: 28 },
  ];
  for (const day of [...summary.daily].reverse()) {
    const adjustment = entries.filter(entry => entry.vendorId === vendor.id && entry.date === day.date).reduce((sum, entry) => sum + (entry.balanceAdjustment ?? 0), 0);
    const previous = roundMoney(day.balance - day.billed + day.paid - adjustment);
    daily.addRow([day.date, previous, day.billed, roundMoney(previous + day.billed), day.paid, day.balance, adjustment]);
  }
  for (let column = 2; column <= 7; column++) daily.getColumn(column).numFmt = moneyFormat;

  const history = workbook.addWorksheet('Bill & Payment History');
  history.columns = [
    { header: 'Date', width: 16 }, { header: 'Description / Bill Reference', width: 50 },
    { header: 'Quantity', width: 20 }, { header: 'Unit Price (BDT)', width: 24 },
    { header: 'Bill Amount (BDT)', width: 24 }, { header: 'Paid Amount (BDT)', width: 24 }, { header: 'Balance Adjustment (BDT)', width: 28 }, { header: 'Unit', width: 14 }, { header: 'Inventory Item ID', width: 28 }, { header: 'Stock Received', width: 20 }, { header: 'Stock Unit', width: 16 }, { header: 'Daily Expense ID', width: 30 },
  ];
  for (const entry of records) history.addRow([entry.date, entry.description, vendorBillDetails(entry)?.quantity ?? null, vendorBillDetails(entry)?.unitPrice ?? null, entry.billed, entry.paid, entry.balanceAdjustment ?? 0, vendorBillDetails(entry)?.unit ?? null, entry.inventoryItemId ?? null, entry.inventoryQuantity ?? null, entry.inventoryUnit ?? null, entry.sourceExpenseId ?? null]);
  history.getColumn(3).numFmt = '0.######';
  for (let column = 4; column <= 7; column++) history.getColumn(column).numFmt = moneyFormat;

  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).height = 32;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      row.alignment = { vertical: 'top', wrapText: true };
      let height = 24;
      row.eachCell((cell, column) => {
        const width = sheet.getColumn(column).width ?? 20;
        const value = String(cell.value ?? '');
        height = Math.max(height, (Math.ceil(value.length / Math.max(width - 3, 1)) + value.split('\n').length - 1) * 16);
      });
      row.height = height;
    });
    if (sheet !== overview) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export function vendorLedgerExcelFilename(name: string, date: string) {
  const safeName = name.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'vendor';
  return `${safeName}-ledger-${date}.xlsx`;
}
