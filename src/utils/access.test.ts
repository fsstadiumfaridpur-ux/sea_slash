import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessSection, isRestaurantRole, managementSections } from './access';

test('anonymous and unknown roles never gain management section access', () => {
  for (const section of [...managementSections, 'attendance', 'profile']) assert.equal(canAccessSection(null, section), false);
  for (const value of ['staff', 'owner', '', null, true, { role: 'admin' }]) assert.equal(isRestaurantRole(value), false);
});
test('managers see operating sections without owner financial reports', () => {
  for (const section of managementSections) assert.equal(canAccessSection('manager', section), !['overview', 'investment', 'planning', 'breakeven', 'publicmenu'].includes(section));
  assert.equal(canAccessSection('admin', 'investment'), true);
  assert.equal(canAccessSection('admin', 'unknown'), false);
});
test('chef access is limited to own attendance, profile and quick-adjust inventory', () => {
  for (const section of ['attendance', 'profile', 'inventory']) assert.equal(canAccessSection('chef', section), true);
  for (const section of managementSections.filter(section => section !== 'inventory')) assert.equal(canAccessSection('chef', section), false);
});
