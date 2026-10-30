import type { InventoryItem, PurchaseRecord, RecipeItem } from "../types";
import type { VendorLedgerEntry } from "./vendorLedger";
import {
  itemPriceHistory,
  priceHistoryQuantity,
  type ItemPricePoint,
} from "./itemPriceHistory";
export interface CostItemTrend {
  item: InventoryItem;
  points: ItemPricePoint[];
  baseline: ItemPricePoint;
  latest: ItemPricePoint;
  change: number;
  comparable: boolean;
}
export interface RecipeCostTrend {
  id: string;
  name: string;
  baseCost: number;
  currentCost: number;
  change: number;
  foodCostPercent: number | null;
  sellingPrice: number;
  suggestedPrice: number | null;
  review: boolean;
}
export function overallFoodCosts(
  inventory: InventoryItem[],
  ledger: VendorLedgerEntry[],
  purchases: PurchaseRecord[],
  recipes: RecipeItem[],
  from: string,
  to: string,
  riseThreshold = 5,
  targetFoodCost = 35,
) {
  const trends: CostItemTrend[] = [];
  let excludedRecords = 0;
  for (const item of inventory) {
    const history = itemPriceHistory(item, ledger, purchases, []);
    excludedRecords += history.excluded;
    const points = history.points.filter((point) => point.date <= to);
    if (!points.length) continue;
    const baseline =
        points.filter((point) => point.date <= from).at(-1) ?? points[0],
      latest = points.at(-1)!;
    trends.push({
      item,
      points,
      baseline,
      latest,
      change: (latest.unitPrice / baseline.unitPrice - 1) * 100,
      comparable: baseline.id !== latest.id,
    });
  }
  // Chain-link a basket of known prices. A newly observed item joins after its
  // first price, so a different purchase mix cannot masquerade as inflation.
  const events = new Map<string, Map<string, ItemPricePoint>>();
  for (const trend of trends)
    for (const point of trend.points) {
      if (!events.has(point.date)) events.set(point.date, new Map());
      events.get(point.date)!.set(trend.item.id, point);
    }
  const known = new Map<string, { price: number; quantity: number }>();
  let index = 100;
  const fullSeries: { date: string; index: number; items: number }[] = [];
  for (const [date, updates] of [...events.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    let oldCost = 0,
      newCost = 0;
    for (const [id, previous] of known) {
      oldCost += previous.price * previous.quantity;
      newCost +=
        (updates.get(id)?.unitPrice ?? previous.price) * previous.quantity;
    }
    if (oldCost > 0) index *= newCost / oldCost;
    for (const [id, point] of updates) {
      known.set(id, {
        price: point.unitPrice,
        quantity: known.get(id)?.quantity ?? point.quantity,
      });
    }
    fullSeries.push({ date, index, items: known.size });
  }
  const carry = fullSeries.filter((point) => point.date <= from).at(-1);
  const visible = fullSeries.filter(
    (point) => point.date > from && point.date <= to,
  );
  const raw = carry ? [{ ...carry, date: from }, ...visible] : visible;
  if (raw.length && raw.at(-1)!.date < to)
    raw.push({ ...raw.at(-1)!, date: to });
  const base = raw[0]?.index ?? 100;
  const series = raw.map((point) => ({
    ...point,
    index: (point.index / base) * 100,
  }));
  const map = new Map(trends.map((trend) => [trend.item.id, trend]));
  const dishes: RecipeCostTrend[] = [];
  let uncostedRecipes = 0;
  for (const recipe of recipes) {
    if (recipe.costingMode === "direct" || !recipe.ingredients.length) {
      uncostedRecipes++;
      continue;
    }
    let baseCost = recipe.extraPortionCost ?? 0,
      currentCost = baseCost,
      complete = Number.isFinite(baseCost) && baseCost >= 0,
      changed = false;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.quantity === 0) continue;
      const trend = map.get(ingredient.inventoryItemId);
      const quantity = trend
        ? priceHistoryQuantity(
            ingredient.quantity,
            ingredient.unit,
            trend.item.unit,
          )
        : null;
      if (!trend || quantity === null) {
        complete = false;
        break;
      }
      baseCost += quantity * trend.baseline.unitPrice;
      currentCost += quantity * trend.latest.unitPrice;
      changed = changed || trend.comparable;
    }
    if (
      !complete ||
      baseCost <= 0 ||
      !Number.isFinite(currentCost) ||
      !Number.isFinite(recipe.sellingPrice) ||
      recipe.sellingPrice < 0
    ) {
      uncostedRecipes++;
      continue;
    }
    const change = (currentCost / baseCost - 1) * 100;
    const foodCostPercent =
      recipe.sellingPrice > 0
        ? (currentCost / recipe.sellingPrice) * 100
        : null;
    const review =
      (changed && change + 1e-8 >= riseThreshold) ||
      (foodCostPercent !== null && foodCostPercent > targetFoodCost + 0.005);
    // Preserve at least the old food-cost ratio, and meet the chosen food-cost
    // target. This is a review guide, not a full profit or tax calculation.
    const suggestedPrice =
      recipe.sellingPrice > 0
        ? Math.ceil(
            Math.max(
              recipe.sellingPrice,
              (currentCost / baseCost) * recipe.sellingPrice,
              currentCost / (targetFoodCost / 100),
            ) / 5,
          ) * 5
        : null;
    dishes.push({
      id: recipe.id,
      name: recipe.dishName,
      baseCost,
      currentCost,
      change,
      foodCostPercent,
      sellingPrice: recipe.sellingPrice,
      suggestedPrice,
      review,
    });
  }
  const comparable = trends.filter((trend) => trend.comparable);
  return {
    series,
    trends: trends.sort((a, b) => b.change - a.change),
    dishes,
    uncostedRecipes,
    excludedRecords,
    tracked: trends.length,
    untracked: inventory.length - trends.length,
    rising: comparable.filter((trend) => trend.change > 0.005).length,
    falling: comparable.filter((trend) => trend.change < -0.005).length,
    unchanged: comparable.filter((trend) => Math.abs(trend.change) <= 0.005)
      .length,
    ingredientAlerts: comparable.filter(
      (trend) => trend.change + 1e-8 >= riseThreshold,
    ),
    recipeAlerts: dishes.filter((dish) => dish.review),
    change: series.length > 1 ? series.at(-1)!.index - 100 : null,
  };
}
export type OverallFoodCosts = ReturnType<typeof overallFoodCosts>;
