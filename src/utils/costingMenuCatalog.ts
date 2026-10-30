import type { RecipeItem } from "../types";
import type { PublicMenuItem } from "./publicMenu";
const nameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
/** Link by durable ID, or one unambiguous exact name. Never guess a recipe. */
export function syncCostingCatalog(
  current: RecipeItem[],
  items: PublicMenuItem[],
): RecipeItem[] {
  const result = current.map((recipe) => ({ ...recipe }));
  const used = new Set<string>();
  const nameCounts = new Map<string, number>();
  for (const item of items)
    nameCounts.set(
      nameKey(item.name),
      (nameCounts.get(nameKey(item.name)) ?? 0) + 1,
    );
  for (const item of [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  )) {
    let recipe = result.find((row) => row.publicMenuItemId === item.id);
    if (!recipe && nameCounts.get(nameKey(item.name)) === 1) {
      const matches = result.filter(
        (row) =>
          !row.publicMenuItemId &&
          !used.has(row.id) &&
          nameKey(row.dishName) === nameKey(item.name),
      );
      if (matches.length === 1) recipe = matches[0];
    }
    if (!recipe) {
      recipe = {
        id: `public-menu:${item.id}`,
        dishName: item.name,
        sellingPrice: item.price,
        estimatedCOGS: 0,
        portionSize: "1 portion",
        ingredients: [],
        costingMode: "recipe",
        extraPortionCost: 0,
      };
      result.push(recipe);
    }
    Object.assign(recipe, {
      publicMenuItemId: item.id,
      dishName: item.name,
      sellingPrice: item.price,
      photoUrl: item.photoUrl,
      menuCategory: item.category,
    });
    used.add(recipe.id);
  }
  return result;
}
