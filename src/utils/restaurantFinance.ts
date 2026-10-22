import {staffScheduledHours} from './staffShiftEarnings';
import { effectiveCommissionRate } from './commission';
import { FoodCourtSettings, InventoryItem, RecipeItem, RestaurantPlan, StaffMember } from '../types';

export const MARGIN_OPTIONS = [30, 35, 40, 50, 60] as const;

export const defaultRestaurantPlan: RestaurantPlan = {
  operatingDays: 30,
  monthlySalesTarget: 900000,
  monthlyProfitTarget: 150000,
  averageOrderValue: 350,
  foodCostPct: 40,
  variableCostPct: 5,
  otherFixedCosts: 20000,
  initialInvestment: 500000,
};

export function monthlyPayroll(staff: StaffMember[], operatingDays: number, scheduledHours = 12): number {
  return staff.filter(member => member.active && !member.archivedAt).reduce((sum, member) =>
    sum + member.baseSalary * (member.salaryType === 'hourly' ? operatingDays * staffScheduledHours(member,scheduledHours) : member.salaryType === 'daily' ? operatingDays : 1), 0);
}

export function ingredientCost(quantity: number, unit: string, item: InventoryItem): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (unit === item.unit) return quantity * item.unitCost;
  if (unit === 'gram' && item.unit === 'kg') return quantity / 1000 * item.unitCost;
  if (unit === 'kg' && item.unit === 'gram') return quantity * 1000 * item.unitCost;
  return null;
}

export function recipeCost(recipe: RecipeItem, inventory: InventoryItem[]): number | null {
  if (recipe.costingMode === 'direct') return Number.isFinite(recipe.directCost) && recipe.directCost! >= 0 ? recipe.directCost! : null;
  let total = recipe.extraPortionCost ?? 0;
  for (const ingredient of recipe.ingredients) {
    const item = inventory.find(stock => stock.id === ingredient.inventoryItemId);
    if (!item) return null;
    const cost = ingredientCost(ingredient.quantity, ingredient.unit, item);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

export function priceForMargin(foodCost: number, marginPct: number, commissionRate: number, overheadPerPortion = 0, variableCostRate = 0): number | null {
  const denominator = 1 - commissionRate - variableCostRate - marginPct / 100;
  if (![foodCost, marginPct, commissionRate, overheadPerPortion, variableCostRate].every(Number.isFinite) || denominator <= 0 || foodCost <= 0 || overheadPerPortion < 0) return null;
  return (foodCost + overheadPerPortion) / denominator;
}

export function feasibility(plan: RestaurantPlan, settings: FoodCourtSettings, staff: StaffMember[], scheduledHours = 12) {
  const payroll = monthlyPayroll(staff, plan.operatingDays, scheduledHours);
  const fixedCosts = settings.monthlyRent + payroll + plan.otherFixedCosts;
  const contributionRate = 1 - effectiveCommissionRate(settings.commissionRate) - (plan.foodCostPct + plan.variableCostPct) / 100;
  const breakEvenSales = contributionRate > 0 ? fixedCosts / contributionRate : null;
  const requiredSales = contributionRate > 0 ? (fixedCosts + plan.monthlyProfitTarget) / contributionRate : null;
  const projectedProfit = plan.monthlySalesTarget * contributionRate - fixedCosts;
  return { payroll, fixedCosts, contributionRate, breakEvenSales, requiredSales, projectedProfit };
}
