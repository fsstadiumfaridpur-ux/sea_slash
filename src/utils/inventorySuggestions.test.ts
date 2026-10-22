import test from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../types';
import { inventoryUnitFactor, suggestInventory, suggestVendorDescriptions } from './inventorySuggestions';
const item: InventoryItem = { id: 'one', name: 'আমী', banglaName: 'আমি', category: 'food', currentStock: 1, unit: 'kg', minThreshold: 0, unitCost: 10, lastUpdated: '2026-10-18' };
test('Bangla, romanized spelling, short fragments and typos suggest existing inventory', () => {
  for (const query of ['আমি', 'ami', 'ame', 'amy', 'i']) assert.equal(suggestInventory(query, [item])[0]?.id, 'one', query);
  const rice = { ...item, id: 'rice', name: 'Basmati Rice', banglaName: 'বাসমতি চাল' };
  assert.equal(suggestInventory('basmati', [rice])[0]?.id, 'rice');
  assert.equal(suggestInventory('Basmti Rice', [rice])[0]?.id, 'rice');
  assert.equal(suggestInventory('রসুন', [{ ...item, name: 'Chinese Rosun', banglaName: undefined }])[0]?.id, 'one');
  assert.equal(suggestInventory('তেল', [{ ...item, name: 'Soyabin Tel', banglaName: undefined }])[0]?.id, 'one');
  assert.deepEqual(suggestInventory('unrelatedproduct', [rice]), []);
  assert.deepEqual(suggestInventory('', [rice]), []);
  assert.equal(suggestInventory('old label', [rice], [{ id: 'bill', vendorId: 'v', date: '2026-10-18', description: 'Old label', billed: 10, paid: 0, inventoryItemId: 'rice' }])[0]?.id, 'rice');
});
test('compatible units convert to inventory units while package sizes require confirmation', () => {
  assert.equal(inventoryUnitFactor('g', 'kg'), 0.001);
  assert.equal(inventoryUnitFactor('kg', 'gram'), 1000);
  assert.equal(inventoryUnitFactor('ml', 'liter'), 0.001);
  assert.equal(inventoryUnitFactor('dozen', 'pcs'), 12);
  assert.equal(inventoryUnitFactor('bottle', 'liter'), null);
  assert.equal(inventoryUnitFactor('packet', 'kg'), null);
});


test('new descriptions become reusable suggestions after a saved ledger reload', () => {
  const bill = { id: 'new', vendorId: 'vendor', date: '2026-10-19', description: 'Fresh Milk Bottle', quantity: 2, unitPrice: 60, unit: 'bottle' as const, billed: 120, paid: 0 };
  assert.deepEqual(suggestVendorDescriptions('Fresh', [], [], 'vendor'), []);
  const reloaded = JSON.parse(JSON.stringify([bill]));
  const matches = suggestVendorDescriptions('fresh milk', reloaded, [], 'vendor');
  assert.equal(matches[0].description, 'Fresh Milk Bottle');
  assert.equal(matches[0].unit, 'bottle');
  assert.equal(matches[0].inventoryItemId, undefined);
  assert.equal(suggestVendorDescriptions('Fresh Mlk Bottle', reloaded, [], 'vendor').length, 1);
  const bangla = { ...bill, id: 'bangla', description: 'আমি' };
  for (const query of ['ami', 'ame', 'amy', 'i']) assert.equal(suggestVendorDescriptions(query, [bangla], [], 'vendor')[0]?.description, 'আমি');
});
test('saved suggestions deduplicate repeated descriptions and exclude balance adjustments', () => {
  const bill = { id: 'one', vendorId: 'vendor', date: '2026-10-19', description: 'Delivery Charge', billed: 0, paid: 50 };
  const entries = [bill, { ...bill, id: 'two', description: '  delivery   CHARGE ' }, { ...bill, id: 'adjust', description: 'Delivery Adjustment', paid: 0, balanceAdjustment: -10 }];
  assert.equal(suggestVendorDescriptions('delivery', entries, [], 'vendor').length, 1);
  assert.equal(suggestVendorDescriptions('delivery', entries, [], 'vendor')[0].description, 'Delivery Charge');
  assert.equal(suggestVendorDescriptions('Delivery', [{ ...bill, inventoryItemId: item.id }], [item], 'vendor')[0].inventoryItemId, item.id);
  assert.equal(suggestVendorDescriptions(item.name, [{ ...bill, description: item.name, inventoryItemId: item.id }], [item], 'vendor').length, 0);
});
