import { effectiveCommissionRate } from './commission';
import type { FoodCourtSettings, InventoryItem, RecipeItem, MenuPricingSettings, StaffMember } from '../types';
import { monthlyPayroll, recipeCost, priceForMargin } from './restaurantFinance';

export const defaultMenuPricing: MenuPricingSettings = { monthlyPortions: 0, monthlyLpgCost: 0, operatingDays: 30 };

export function validateMenuPricing(settings: MenuPricingSettings) {
  if (!Number.isInteger(settings.monthlyPortions) || settings.monthlyPortions < 1) throw new Error('Enter expected monthly portions greater than zero.');
  if (!Number.isFinite(settings.monthlyLpgCost) || settings.monthlyLpgCost < 0) throw new Error('LPG budget must be zero or more.');
  if (!Number.isInteger(settings.operatingDays) || settings.operatingDays < 1 || settings.operatingDays > 31) throw new Error('Operating days must be between 1 and 31.');
}

export function validateMenuItem(recipe: RecipeItem) {
  if (!recipe.id || !recipe.dishName.trim() || !recipe.portionSize.trim()) throw new Error('Dish name and portion size are required.');
  if (recipe.costingMode && !['recipe', 'direct'].includes(recipe.costingMode)) throw new Error('Choose a valid costing method.');
  if (recipe.operatingCosts && ['rent', 'lpg', 'staff', 'commission'].some(key => typeof recipe.operatingCosts![key as keyof typeof recipe.operatingCosts] !== 'boolean')) throw new Error('Choose valid operating cost options.');
  if (recipe.costingMode === 'direct') {
    if (!Number.isFinite(recipe.directCost) || recipe.directCost! <= 0) throw new Error('Direct cost must be greater than zero.');
    if (!Number.isFinite(recipe.sellingPrice) || recipe.sellingPrice < 0) throw new Error('Selling price must be zero or more.');
    return;
  }
  for (const amount of [recipe.sellingPrice, recipe.extraPortionCost ?? 0, ...recipe.ingredients.map(i => i.quantity)]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Prices, extra costs and ingredient quantities must be zero or more.');
  }
  if (recipe.ingredients.some(i => !i.inventoryItemId || !i.unit)) throw new Error('Choose an ingredient and unit for every recipe line.');
}

export function menuOverhead(pricing: MenuPricingSettings, settings: FoodCourtSettings, staff: StaffMember[]) {
  const payroll = monthlyPayroll(staff, pricing.operatingDays);
  const valid = Number.isInteger(pricing.monthlyPortions) && pricing.monthlyPortions > 0 &&
    Number.isInteger(pricing.operatingDays) && pricing.operatingDays >= 1 && pricing.operatingDays <= 31 &&
    [settings.monthlyRent, payroll, pricing.monthlyLpgCost].every(n => Number.isFinite(n) && n >= 0);
  const rent = valid ? settings.monthlyRent / pricing.monthlyPortions : null;
  const lpg = valid ? pricing.monthlyLpgCost / pricing.monthlyPortions : null;
  const salary = valid ? payroll / pricing.monthlyPortions : null;
  return { payroll, rent, lpg, salary, total: valid ? rent! + lpg! + salary! : null };
}

export function menuItemFinancials(recipe: RecipeItem, inventory: InventoryItem[], pricing: MenuPricingSettings, settings: FoodCourtSettings, staff: StaffMember[]) {
  const calculated = recipeCost(recipe, inventory);
  const foodCost = calculated !== null && Number.isFinite(calculated) && calculated > 0 ? calculated : null;
  const allocation = menuOverhead(pricing, settings, staff);
  const included = recipe.operatingCosts ?? { rent: recipe.costingMode !== 'direct', lpg: recipe.costingMode !== 'direct', staff: recipe.costingMode !== 'direct', commission: recipe.costingMode !== 'direct' };
  const rent = included.rent ? allocation.rent : 0;
  const lpg = included.lpg ? allocation.lpg : 0;
  const salary = included.staff ? allocation.salary : 0;
  const overhead = { payroll: allocation.payroll, rent, lpg, salary, total: rent === null || lpg === null || salary === null ? null : rent + lpg + salary };
  const commissionRate = included.commission ? effectiveCommissionRate(settings.commissionRate) : 0;
  const commission = recipe.sellingPrice * commissionRate;
  const fullCost = foodCost !== null && overhead.total !== null && Number.isFinite(commission) && commission >= 0 ? foodCost + overhead.total + commission : null;
  const grossProfit = foodCost === null ? null : recipe.sellingPrice - foodCost;
  const netProfit = fullCost === null ? null : recipe.sellingPrice - fullCost;
  return { foodCost, overhead, commission, commissionRate, fullCost, grossProfit, netProfit, netMargin: recipe.sellingPrice > 0 && netProfit !== null ? netProfit / recipe.sellingPrice * 100 : null };
}

export function menuPriceForMargin(foodCost: number | null, margin: number, includeOperatingCosts: boolean, overhead: number | null, commissionRate: number) {
  if (foodCost === null || (includeOperatingCosts && overhead === null)) return null;
  const exact = priceForMargin(foodCost, margin, includeOperatingCosts ? commissionRate : 0, includeOperatingCosts ? overhead! : 0);
  return exact === null ? null : Math.ceil(exact / 10) * 10;
}
