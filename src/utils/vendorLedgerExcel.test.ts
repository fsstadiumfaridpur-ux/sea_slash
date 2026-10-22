import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildVendorLedgerExcel, vendorLedgerExcelFilename } from './vendorLedgerExcel';

const vendor = { id: 'vendor', name: '=Vendor', category: 'Chicken Vendors', phone: '01700123456', address: '', notes: '' };
test('Excel export includes all dates, correct balances, numeric amounts and literal text', async () => {
  const entries = [
    { id: 'one', vendorId: 'vendor', date: '2026-10-01', description: '=1+1', billed: 100, paid: 20 },
    { id: 'two', vendorId: 'vendor', date: '2026-10-02', description: 'Chicken', quantityKg: 2, pricePerKg: 150, billed: 300, paid: 100 },
    { id: 'three', vendorId: 'vendor', date: '2026-10-03', description: 'Payment', billed: 0, paid: 30 },
    { id: 'other', vendorId: 'other', date: '2026-10-04', description: 'Other vendor', billed: 999, paid: 0 },
  ];
  const buffer = await buildVendorLedgerExcel(vendor, entries);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  assert.equal(workbook.worksheets.length, 3);
  const overview = workbook.getWorksheet('Vendor Summary')!;
  assert.equal(overview.getCell('B2').value, '=Vendor');
  assert.equal(overview.getCell('B4').value, '01700123456');
  assert.equal(overview.getCell('B9').value, 400);
  assert.equal(overview.getCell('B10').value, 150);
  assert.equal(overview.getCell('B11').value, 250);
  const daily = workbook.getWorksheet('Daily Bills & Payments')!;
  assert.equal(daily.rowCount, 4);
  assert.equal(daily.getCell('A2').value, '2026-10-03');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(column => daily.getCell(2, column).value), ['2026-10-03', 280, 0, 280, 30, 250]);
  const history = workbook.getWorksheet('Bill & Payment History')!;
  assert.equal(history.rowCount, 4);
  assert.equal(history.getCell('B4').value, '=1+1');
  assert.equal(history.getCell('C3').value, 2);
  assert.equal(history.getCell('D3').value, 150);
  assert.equal(history.getCell('E3').value, 300);
  assert.equal(history.getCell('H3').value, 'kg');
});
test('export filename is safe and retains Bangla vendor names', () => {
  assert.equal(vendorLedgerExcelFilename('../Acme / Vendor', '2026-10-15'), 'Acme-Vendor-ledger-2026-10-15.xlsx');
  assert.equal(vendorLedgerExcelFilename('মাছ', '2026-10-15'), 'মাছ-ledger-2026-10-15.xlsx');
});


test('Excel keeps pcs and length units beside numeric quantities and prices', async () => {
  const buffer = await buildVendorLedgerExcel(vendor, [{ id: 'length', vendorId: vendor.id, date: '2026-10-18', description: 'Material', quantity: 12, unit: 'inch', unitPrice: 5, billed: 60, paid: 0 }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const history = workbook.getWorksheet('Bill & Payment History')!;
  assert.equal(history.getCell('C2').value, 12);
  assert.equal(history.getCell('D2').value, 5);
  assert.equal(history.getCell('H2').value, 'inch');
});
