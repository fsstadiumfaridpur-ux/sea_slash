import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRestaurantSettings } from './restaurantSettings.ts';
import type { FoodCourtSettings } from '../types';

test('correct food-court names in saved settings without changing restaurant finances', () => {
  const original = { stallName: 'Mughal Mahal', foodCourtName: 'Faridpur Stadium Food Court (Stall #06)', monthlyRent: 50000, commissionRate: 0.1, stallNumber: 'Shop #06' } as FoodCourtSettings;
  assert.deepEqual(normalizeRestaurantSettings(original), { ...original, foodCourtName: "Chef's Canvas" });
  assert.equal(original.foodCourtName, 'Faridpur Stadium Food Court (Stall #06)');
  for (const name of ["Chef's Canvas", 'Another Court']) assert.equal(normalizeRestaurantSettings({ ...original, foodCourtName: name }).foodCourtName, name);
});
