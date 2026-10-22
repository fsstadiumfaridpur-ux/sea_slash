import { InventoryCategoryDefinition, InventoryItem } from '../types';

export const defaultInventoryCategories: InventoryCategoryDefinition[] = [
  { id: 'meat', name: 'Meat & Poultry' },
  { id: 'rice_grain', name: 'Rice & Grains' },
  { id: 'dairy_fat', name: 'Dairy, Ghee & Oils' },
  { id: 'spices_masala', name: 'Spices & Masala' },
  { id: 'produce', name: 'Vegetables & Herbs' },
  { id: 'packaging', name: 'Packaging' },
  { id: 'flour_bread', name: 'Flour & Bread' },
  { id: 'lentils_pulses', name: 'Lentils & Pulses' },
  { id: 'sauces_marinades', name: 'Sauces & Marinades' },
  { id: 'seafood', name: 'Fish & Seafood' },
  { id: 'desserts', name: 'Dessert Ingredients' },
  { id: 'beverages', name: 'Beverages' },
  { id: 'uncategorized', name: 'Uncategorized' },
];

export function normalizeInventoryCategories(categories: InventoryCategoryDefinition[], inventory: InventoryItem[]): InventoryCategoryDefinition[] {
  const result = [...categories];
  if (!result.some(category => category.id === 'uncategorized')) result.push({ id: 'uncategorized', name: 'Uncategorized' });
  for (const item of inventory) {
    if (!result.some(category => category.id === item.category)) {
      result.push({ id: item.category, name: item.category.replaceAll('_', ' ') });
    }
  }
  return result;
}

export function categoryNameError(name: string, categories: InventoryCategoryDefinition[]): string | null {
  if (!name.trim()) return 'Enter a category name.';
  if (categories.some(category => category.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return 'This category already exists.';
  return null;
}

export function removeInventoryCategory(categories: InventoryCategoryDefinition[], inventory: InventoryItem[], id: string, replacementId: string) {
  if (id === 'uncategorized' || id === replacementId || !categories.some(category => category.id === id) || !categories.some(category => category.id === replacementId)) {
    throw new Error('Choose a different existing replacement category.');
  }
  return {
    categories: categories.filter(category => category.id !== id),
    inventory: inventory.map(item => item.category === id ? { ...item, category: replacementId } : item),
  };
}
