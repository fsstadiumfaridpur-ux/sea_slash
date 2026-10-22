import test from 'node:test';
import assert from 'node:assert/strict';
import type { RecipeItem, InventoryItem, StaffMember } from '../types';
import { defaultSettings } from '../data/demoFixtures';
import { menuItemFinancials, menuPriceForMargin, validateMenuItem, validateMenuPricing, menuOverhead } from './menuPricing';

const item: InventoryItem = { id: 'ingredient', name: 'Chicken', category: 'meat', currentStock: 1, unit: 'kg', minThreshold: 0, unitCost: 400, lastUpdated: '2026-10-05' };
const recipe: RecipeItem = { id: 'dish', dishName: 'Chicken Kebab', portionSize: '1 plate', sellingPrice: 300, estimatedCOGS: 0, extraPortionCost: 0, ingredients: [{ inventoryItemId: item.id, itemName: item.name, quantity: 250, unit: 'gram' }] };
const staff: StaffMember[] = [{ id: 'chef', name: 'Chef', role: 'Cook', phone: '', salaryType: 'monthly', baseSalary: 25000, joinDate: '2026-01-01', active: true }];
const pricing = { monthlyPortions: 1500, monthlyLpgCost: 12000, operatingDays: 30 };

test('direct costing needs no recipe, inventory or monthly portion budget', () => {
  const direct: RecipeItem = { ...recipe, costingMode: 'direct', directCost: 80, ingredients: [] };
  assert.doesNotThrow(() => validateMenuItem(direct));
  const f = menuItemFinancials(direct, [], { ...pricing, monthlyPortions: 0 }, defaultSettings, staff);
  assert.equal(f.foodCost, 80);
  assert.equal(f.fullCost, 80);
  assert.equal(f.overhead.total, 0);
  assert.equal(f.commission, 0);
  assert.equal(f.netProfit, 220);
  assert.equal(menuPriceForMargin(f.foodCost, 35, true, f.overhead.total, f.commissionRate), 130);
  assert.equal(menuItemFinancials({ ...direct, ingredients: recipe.ingredients, extraPortionCost: 999 }, [], pricing, defaultSettings, staff).foodCost, 80);
  for (const directCost of [undefined, NaN, Infinity, -1, 0]) assert.throws(() => validateMenuItem({ ...direct, directCost }), /Direct cost/);
});

test('direct items persist individual operating cost choices without adding excluded costs', () => {
  const direct: RecipeItem = { ...recipe, costingMode: 'direct', directCost: 80, ingredients: [], operatingCosts: { rent: false, lpg: false, staff: false, commission: true } };
  const f = menuItemFinancials(direct, [], { ...pricing, monthlyPortions: 0 }, defaultSettings, staff);
  assert.equal(f.fullCost, 108.5);
  assert.equal(f.netProfit, 191.5);
  const withStaff = { ...direct, operatingCosts: { ...direct.operatingCosts!, staff: true } };
  assert.equal(menuItemFinancials(withStaff, [], { ...pricing, monthlyPortions: 0 }, defaultSettings, staff).fullCost, null);
  const allocated = menuItemFinancials(withStaff, [], pricing, defaultSettings, staff);
  assert.equal(allocated.overhead.rent, 0);
  assert.equal(allocated.overhead.lpg, 0);
  assert.equal(allocated.overhead.salary, 25000 / 1500);
  assert.equal(allocated.fullCost, 80 + 28.5 + 25000 / 1500);
  assert.equal(menuItemFinancials(JSON.parse(JSON.stringify(direct)), [], pricing, defaultSettings, staff).fullCost, 108.5);
});

test('saved menu calculates food-only and full operating cost and profit separately', () => {
  const f = menuItemFinancials(recipe, [item], pricing, defaultSettings, staff);
  assert.equal(f.foodCost, 100);
  assert.equal(f.overhead.total, 58);
  assert.equal(f.commission, 28.5);
  assert.equal(f.fullCost, 186.5);
  assert.equal(f.grossProfit, 200);
  assert.equal(f.netProfit, 113.5);
  assert.ok(Math.abs(f.netMargin! - 113.5 / 300 * 100) < 1e-8);
});
test('food-only target pricing excludes commission, rent, LPG and staff entirely', () => {
  assert.equal(menuPriceForMargin(100, 10, false, null, 0.1), 120);
  assert.equal(menuPriceForMargin(100, 200, false, null, 0.1), null);
  assert.equal(menuPriceForMargin(100, 100, false, null, 0.1), null);
  assert.equal(menuPriceForMargin(100, 90, true, 58, 0.1), null);
  assert.equal(menuPriceForMargin(100, 35, false, 58, 0.1), 160);
  assert.equal(menuPriceForMargin(100, 35, true, 58, 0.1), 290);
  for (const margin of [30, 35, 40, 50, 60]) {
    const price = menuPriceForMargin(100, margin, true, 58, 0.1)!;
    assert.ok((price * 0.9 - 158) / price * 100 >= margin);
  }
  assert.equal(menuPriceForMargin(100, 60, true, 58, 0.4), null);
});
test('unknown portion volume and missing recipes cannot produce fictional net profits', () => {
  const f = menuItemFinancials(recipe, [item], { ...pricing, monthlyPortions: 0 }, defaultSettings, staff);
  assert.equal(f.foodCost, 100);
  assert.equal(f.fullCost, null);
  assert.equal(f.netProfit, null);
  assert.equal(menuPriceForMargin(100, 35, true, null, 0.1), null);
  assert.equal(menuItemFinancials(recipe, [], pricing, defaultSettings, staff).netProfit, null);
  assert.equal(menuItemFinancials({ ...recipe, ingredients: [] }, [item], pricing, defaultSettings, staff).foodCost, null);
});
test('daily payroll uses operating days and excludes inactive and archived staff', () => {
  const daily = { ...staff[0], salaryType: 'daily' as const, baseSalary: 1000 };
  assert.equal(menuOverhead({ ...pricing, operatingDays: 26 }, defaultSettings, [daily, { ...staff[0], active: false }, { ...staff[0], archivedAt: '2026-10-05' }]).payroll, 26000);
});
test('invalid menu and budget inputs fail before saving', () => {
  assert.throws(() => validateMenuItem({ ...recipe, dishName: ' ' }), /Dish name/);
  assert.throws(() => validateMenuItem({ ...recipe, sellingPrice: -1 }), /zero or more/);
  assert.throws(() => validateMenuItem({ ...recipe, extraPortionCost: NaN }), /zero or more/);
  assert.throws(() => validateMenuPricing({ ...pricing, monthlyPortions: 0 }), /greater than zero/);
  assert.throws(() => validateMenuPricing({ ...pricing, monthlyLpgCost: -1 }), /LPG/);
  assert.throws(() => validateMenuPricing({ ...pricing, operatingDays: 32 }), /Operating days/);
  assert.doesNotThrow(() => validateMenuItem(recipe));
});
