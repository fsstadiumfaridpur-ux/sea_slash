import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSettings, initialInventory, initialRecipes, initialStaff, initialAttendances, initialAdvances } from '../data/demoFixtures';
import type { StaffMember } from '../types';
import { defaultRestaurantPlan, feasibility, ingredientCost, MARGIN_OPTIONS, monthlyPayroll, priceForMargin, recipeCost } from './restaurantFinance';

const payrollFixture: StaffMember[] = [26000, 20000, 16000, 15000, 12000].map((baseSalary, index) => ({
  id: `test-staff-${index}`, name: `Test Employee ${index}`, role: 'Test Chef', phone: '', salaryType: 'monthly', baseSalary, joinDate: '2026-01-01', active: true,
}));

test('new installations never seed fictional employees or payroll records', () => {
  assert.deepEqual(initialStaff, []);
  assert.deepEqual(initialAttendances, []);
  assert.deepEqual(initialAdvances, []);
});

test('recipe costing uses stock prices instead of the old dish estimate', () => {
  assert.ok(Math.abs(recipeCost(initialRecipes[0], initialInventory)! - 356.2) < 1e-8);
  assert.equal(ingredientCost(250, 'gram', initialInventory[0]), 287.5);
  assert.equal(ingredientCost(1, 'liter', initialInventory[0]), null);
  assert.equal(recipeCost(initialRecipes[0], initialInventory.slice(1)), null);
});

test('every requested margin includes commission, variable costs and overhead', () => {
  for (const margin of MARGIN_OPTIONS) {
    const price = priceForMargin(150, margin, 0.1, 50, 0.05)!;
    const net = price - 150 - 50 - price * 0.1 - price * 0.05;
    assert.ok(Math.abs(net / price * 100 - margin) < 1e-8);
  }
  assert.equal(priceForMargin(150, 60, 0.4), null);
  assert.equal(priceForMargin(0, 35, 0), null);
  assert.equal(priceForMargin(Number.NaN, 35, 0), null);
});

test('monthly feasibility counts rent and payroll once and treats non-positive contribution as impossible', () => {
  const result = feasibility(defaultRestaurantPlan, defaultSettings, payrollFixture);
  assert.equal(result.payroll, 89000);
  assert.equal(result.fixedCosts, 159000);
  assert.ok(Math.abs(result.breakEvenSales! - 349450.5494505495) < 1e-6);
  assert.ok(Math.abs(result.requiredSales! - 679120.8791208791) < 1e-6);
  assert.equal(result.projectedProfit, 250500);
  const impossible = feasibility({ ...defaultRestaurantPlan, foodCostPct: 95 }, defaultSettings, payrollFixture);
  assert.equal(impossible.breakEvenSales, null);
  assert.equal(impossible.requiredSales, null);
});

test('daily salaries use planned operating days while monthly salaries stay fixed', () => {
  const staff = [
    { ...payrollFixture[0], salaryType: 'daily' as const, baseSalary: 500 },
    { ...payrollFixture[1], salaryType: 'monthly' as const, baseSalary: 20000 },
    { ...payrollFixture[2], active: false },
  ];
  assert.equal(monthlyPayroll(staff, 26), 33000);
});

test('hourly payroll estimates use scheduled hours and operating days',()=>{
 const hourly={...payrollFixture[0],salaryType:'hourly' as const,baseSalary:100};
 assert.equal(monthlyPayroll([hourly],30,8),24000);
 assert.equal(monthlyPayroll([hourly],30,12),36000);
});
