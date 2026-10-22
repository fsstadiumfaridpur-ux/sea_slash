export type RestaurantRole = 'chef' | 'manager' | 'admin' | 'partner';
export const managementSections = ['overview', 'pnl', 'expenses', 'inventory', 'staff', 'foodcourt', 'breakeven', 'planning', 'investment', 'vendors', 'publicmenu'];
export function isRestaurantRole(value: unknown): value is RestaurantRole {
  return value === 'partner' || value === 'chef' || value === 'manager' || value === 'admin';
}
export function canAccessSection(role: RestaurantRole | null, section: string) {
  if (role === 'partner') return section === 'investment';
  if (role === 'chef') return ['attendance', 'profile', 'inventory'].includes(section);
  return !!role && managementSections.includes(section) && (role === 'admin' || !['overview', 'investment', 'planning', 'breakeven', 'publicmenu'].includes(section));
}
