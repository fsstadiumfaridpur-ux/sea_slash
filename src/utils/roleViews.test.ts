import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function component(path: string, name: string) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env': '{}' } });
  const module = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), Date, Intl, Number, Error, document: { documentElement: { dataset: { theme: 'light' } } } });
  return module.exports[name];
}
test('manager navigation hides overview and financial reports in desktop tabs and mobile options', async () => {
  const Header = await component('../components/Header.tsx', 'Header');
  const props = { isAdmin: false, role: 'manager', authReady: true, onAdminLogin() {}, onAdminLogout() {}, theme: 'light', onToggleTheme() {}, settings: { stallName: 'Mughal Mahal', stallNumber: '06', foodCourtName: 'Food Court', monthlyRent: 50000, commissionRate: 0.1 }, salesHistory: [], inventory: [], activeTab: 'overview', setActiveTab() {}, onOpenSalesModal() {}, onOpenSettingsModal() {} };
  const manager = renderToStaticMarkup(React.createElement(Header, props));
  assert.doesNotMatch(manager, /Overview|Total Investment|Today Net Profit|Sales &amp; Profit|Targets &amp; Feasibility|Food Cost &amp; Pricing/);
  assert.match(manager, /Sales &amp; Cash/);
  assert.match(manager, /Expenses/);
  assert.match(manager, /Commission Statement/);
  assert.match(manager, /Staff &amp; Salary/);
  assert.match(renderToStaticMarkup(React.createElement(Header, { ...props, role: 'admin', isAdmin: true })), /Total Investment/);
});
test('login page has no restaurant data or prefilled admin credentials', async () => {
  const Login = await component('../components/AdminLoginModal.tsx', 'AdminLoginModal');
  const html = renderToStaticMarkup(React.createElement(Login, { page: true, onClose() {} }));
  assert.match(html, /Sign In/);
  assert.doesNotMatch(html, /officialmughalmahal|Total Investment|Monthly Expenses|Sales &amp; Profit|Close admin login/);
});
test('chef workspace exposes only attendance, inventory and profile navigation', async () => {
  const ChefPortal = await component('../components/ChefPortal.tsx', 'ChefPortal');
  const html = renderToStaticMarkup(React.createElement(ChefPortal, { onLogout: async () => {} }));
  assert.match(html, /Profile Settings/);
  assert.match(html, /attendance/);
  assert.match(html, /inventory/);
  assert.doesNotMatch(html, /Total Investment|Sales &amp; Profit|Staff &amp; Salary|Add New Item|Delete ingredient/);
});
test('manager staff view cannot create accounts, change roles or fire profiles', async () => {
  const Staff = await component('../components/StaffPayrollView.tsx', 'StaffPayrollView');
  const props = { isAdmin: false, expenses: [], onRecordSalary() {}, staffList: [{ id: 'chef', name: 'Chef', role: 'Chef', appRole: 'chef', baseSalary: 20000, salaryType: 'monthly', joinDate: '2026-01-01', active: true }], attendanceList: [], advancesList: [], stallName: 'Mughal Mahal', loading: false, loadError: '', onReload: async () => {}, onUpdateStaff() {}, onUpdateAttendance: async () => {}, onUpdateAdvances: async () => {} };
  const html = renderToStaticMarkup(React.createElement(Staff, props));
  assert.doesNotMatch(html, /Create Staff|Manage login for|Fire Chef|Delete Chef|Edit Chef/);
  assert.match(html, /chef access/);
  assert.match(renderToStaticMarkup(React.createElement(Staff, { ...props, isAdmin: true })), /Create Staff/);
});

test('attendance gate does not mount the restaurant workspace before verification', async () => {
  const Gate = await component('../components/StaffAttendanceGate.tsx', 'StaffAttendanceGate');
  const html = renderToStaticMarkup(React.createElement(Gate, { onLogout: async () => {}, children: React.createElement('p', null, 'Private restaurant workspace') }));
  assert.match(html, /Today's Attendance|Today&#x27;s Attendance/);
  assert.match(html, /Checking attendance/);
  assert.match(html, /Sign Out/);
  assert.doesNotMatch(html, /Private restaurant workspace/);
});


test('manager overview and sales show cash collections without owner earnings or export fields', async () => {
  const View = await component('../components/ManagerSalesView.tsx', 'ManagerSalesView');
  const exportRows = await component('../components/ManagerSalesView.tsx', 'managerSalesRows');
  const date = new Date().toLocaleDateString('en-CA');
  const record = { id: 'sale', date, grossSales: 10000, cashSales: 6000, bankSales: 500, bkashSales: 2000, nagadSales: 500, cardSales: 1000, netProfit: 987654321, cogsCost: 1000, staffCost: 200, foodCourtCommission: 1000, proratedRent: 1000, otherExpenses: 50, notes: 'private financial notes' };
  for (const mode of ['overview', 'sales']) {
    const html = renderToStaticMarkup(React.createElement(View, { mode, sales: [record], onEdit() {}, onOpenCash() {} }));
    assert.match(html, /Software Sales/);
    assert.match(html, /Cash Sales/);
    assert.match(html, /Daily Cash/);
    assert.doesNotMatch(html, /Profit|Margin|987654321|98,76,54,321|private financial notes/);
  }
  assert.deepEqual(Object.keys(exportRows([record])[0]), ['Date', 'SoftwareSales_BDT', 'CashSales_BDT', 'BankTransfer_BDT', 'bKash_BDT', 'Nagad_BDT', 'Card_BDT', 'Orders']);
});

test('sales entry shows earnings only with explicit admin permission', async () => {
  const Modal = await component('../components/DailySalesModal.tsx', 'DailySalesModal');
  const props = { isOpen: true, onClose() {}, onSave() {}, settings: { commissionRate: 0.1, dailyRent: 1667 }, suggestedStaffDailyCost: 0, expenses: [] };
  const manager = renderToStaticMarkup(React.createElement(Modal, { ...props, canViewProfit: false }));
  assert.doesNotMatch(manager, /Net Daily Profit|Margin:|Save Daily P&amp;L/);
  assert.match(manager, /Save Daily Sales/);
  assert.match(renderToStaticMarkup(React.createElement(Modal, { ...props, canViewProfit: true })), /Net Daily Profit/);
});

test('sales entry renders read-only daily expense totals for ingredients and other costs',async()=>{
  const Modal=await component('../components/DailySalesModal.tsx','DailySalesModal');
  const date=new Date(); const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const expense={id:'food',date:day,month:day.slice(0,7),category:'ingredients',amount:1234,title:'Recorded rice purchase',paymentMode:'cash',isRecurring:false};
  const html=renderToStaticMarkup(React.createElement(Modal,{isOpen:true,onClose(){},onSave(){},settings:{commissionRate:0.1,dailyRent:1667},suggestedStaffDailyCost:500,expenses:[expense,{...expense,id:'gas',category:'gas_utilities',amount:450,title:'Recorded gas refill'}]}));
  assert.match(html,/readOnly="" aria-label="Ingredient COGS \(Automatic\)"[^>]*value="1234"/);
  assert.match(html,/readOnly="" aria-label="Other Petty Costs \(Automatic\)"[^>]*value="450"/);
  assert.match(html,/Recorded rice purchase/);assert.match(html,/Recorded gas refill/);
});

test('statement disables settled payment actions while keeping partial balances payable', async () => {
  const Statement = await component('../components/FoodCourtStatementView.tsx', 'FoodCourtStatementView');
  const props = { initialMonth: '2026-10', salesHistory: [{ id: 'sale', date: '2026-10-05', grossSales: 10000, cashSales: 10000, bkashSales: 0, nagadSales: 0, cardSales: 0, foodCourtCommission: 1000 }], expenses: [{ id: 'rent', date: '2026-10-06', month: '2026-10', category: 'rent', amount: 50000, paymentMode: 'bank' }, { id: 'part', date: '2026-10-06', commissionDate: '2026-10-05', month: '2026-10', category: 'commission', amount: 400, paymentMode: 'cash' }], settings: { monthlyRent: 50000, commissionRate: 0.1 }, onRecordPayment() {}, onOpenExpenses() {} };
  const html = renderToStaticMarkup(React.createElement(Statement, props));
  assert.match(html, /disabled=""[^>]*title="No outstanding balance/);
  assert.match(html, /Paid/);
  assert.match(html, /Part-paid/);
  assert.match(html, /View Daily Commission/);
  assert.doesNotMatch(html, /Record Rent/);
  assert.match(html, /৳550 due/);
});

test('due payment count appears alongside Commission Statement for managers', async () => {
  const Header = await component('../components/Header.tsx', 'Header');
  const html = renderToStaticMarkup(React.createElement(Header, { role: 'manager', isAdmin: false, authReady: true, onAdminLogin() {}, onAdminLogout() {}, theme: 'light', onToggleTheme() {}, settings: { stallName: 'Mughal Mahal', monthlyRent: 50000, commissionRate: 0.1 }, salesHistory: [], inventory: [], activeTab: 'pnl', setActiveTab() {}, onOpenSalesModal() {}, onOpenSettingsModal() {}, dueNotices: [{ month: '2026-10', category: 'commission', label: 'Commission due', amount: 600 }], onOpenStatement() {} }));
  assert.match(html, /Payment notifications: 1 due/);
  assert.match(html, /Commission Statement \(1\)/);
});

test('commission and recorded sales start newest first with older rows collapsed and historical tools admin-only', async () => {
  const Statement = await component('../components/FoodCourtStatementView.tsx', 'FoodCourtStatementView');
  const sales = Array.from({ length: 8 }, (_, index) => ({ id: `sale-${index}`, date: `2026-10-${String(index + 8).padStart(2, '0')}`, grossSales: 100, cashSales: 100, bkashSales: 0, nagadSales: 0, cardSales: 0, foodCourtCommission: 9.5 }));
  const props = { initialMonth: '2026-10', salesHistory: sales, expenses: [], settings: { monthlyRent: 50000, commissionRate: 0.1 }, onRecordPayment() {}, onOpenExpenses() {}, onSaveTracking: async () => {} };
  const manager = renderToStaticMarkup(React.createElement(Statement, { ...props, isAdmin: false }));
  assert.doesNotMatch(manager, /Historical Commission &amp; Reminder Start|Commission paid from|Commission reminder start/);
  assert.match(manager, /aria-label="Print commission for 2026-10-15"/);
  assert.match(manager, /Expand all 8 dates/);
  assert.match(manager, /Expand all 8 sales/);
  for (const id of ['daily-commission-rows', 'recorded-sales-rows']) {
    const section = manager.slice(manager.indexOf(`id="${id}"`)).split('</table>')[0];
    assert.ok(section.indexOf('2026-10-15') < section.indexOf('2026-10-14'));
    assert.doesNotMatch(section, /2026-10-08|2026-10-09|2026-10-10/);
  }
  const admin = renderToStaticMarkup(React.createElement(Statement, { ...props, isAdmin: true }));
  assert.match(admin, /Historical Commission &amp; Reminder Start/);
});
