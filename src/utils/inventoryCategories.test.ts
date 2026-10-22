import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialInventory, initialRecipes } from '../data/demoFixtures';
import { categoryNameError, defaultInventoryCategories, normalizeInventoryCategories, removeInventoryCategory } from './inventoryCategories';
import { recipeCost } from './restaurantFinance';

test('custom names reject blank values and case-insensitive duplicates', () => {
  assert.equal(categoryNameError('  ', defaultInventoryCategories), 'Enter a category name.');
  assert.equal(categoryNameError(' meat & POULTRY ', defaultInventoryCategories), 'This category already exists.');
  assert.equal(categoryNameError('Kebab Marinades', defaultInventoryCategories), null);
});

test('category deletion moves ingredients without deleting stock or changing values', () => {
  const custom = { id: 'custom', name: 'Indian & Kebab' };
  const categories = [...defaultInventoryCategories, custom];
  const result = removeInventoryCategory(categories, initialInventory, 'meat', custom.id);
  assert.equal(result.categories.some(category => category.id === 'meat'), false);
  assert.equal(result.inventory.length, initialInventory.length);
  for (const item of initialInventory) {
    const next = result.inventory.find(stock => stock.id === item.id)!;
    assert.deepEqual(next, item.category === 'meat' ? { ...item, category: custom.id } : item);
  }
  assert.deepEqual(categories, [...defaultInventoryCategories, custom]);
});

test('unused categories can be deleted and fallback categories cannot', () => {
  const result = removeInventoryCategory(defaultInventoryCategories, initialInventory, 'seafood', 'uncategorized');
  assert.equal(result.categories.some(category => category.id === 'seafood'), false);
  assert.deepEqual(result.inventory, initialInventory);
  assert.throws(() => removeInventoryCategory(defaultInventoryCategories, initialInventory, 'uncategorized', 'meat'));
  assert.throws(() => removeInventoryCategory(defaultInventoryCategories, initialInventory, 'meat', 'meat'));
  assert.throws(() => removeInventoryCategory(defaultInventoryCategories, initialInventory, 'meat', 'missing'));
});

test('restoring a backup recovers referenced categories without restoring removed unused categories', () => {
  const inventory = [{ ...initialInventory[0], category: 'custom_kebab' }];
  const result = normalizeInventoryCategories([], inventory);
  assert.deepEqual(result, [{ id: 'uncategorized', name: 'Uncategorized' }, { id: 'custom_kebab', name: 'custom kebab' }]);
  assert.deepEqual(normalizeInventoryCategories(result, inventory), result);
});

test('deleted ingredients make affected recipe costs unavailable', () => {
  const remaining = initialInventory.filter(item => item.id !== 'inv-1');
  assert.equal(recipeCost(initialRecipes[0], remaining), null);
  assert.equal(recipeCost(initialRecipes[1], remaining), recipeCost(initialRecipes[1], initialInventory));
});
