import {getAdminPublicMenu} from './publicMenu';
import {syncCostingCatalog} from '../utils/costingMenuCatalog';
import { supabase } from './supabase';
import type { RecipeItem, MenuPricingSettings } from '../types';
import { validateMenuItem, validateMenuPricing } from '../utils/menuPricing';
import { saveAppState } from './appState';

const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';
const key = 'sea_slash_recipes_v1';
export const MENU_PRICING_KEY = 'sea_slash_menu_pricing_v1';

async function requireAdmin() {
  if (!supabase) throw new Error('Connect to Supabase before saving the menu.');
  const { data, error } = await supabase.rpc('can_manage_restaurant');
  if (error || data !== true) throw new Error('Administrator or manager login required to save menu changes.');
}

async function updateMenu(transform: (current: RecipeItem[]) => RecipeItem[]): Promise<RecipeItem[]> {
  await requireAdmin();
  // Merge into the latest list and compare revisions, so another dish is not overwritten.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase!.from(table).select('value,updated_at').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    const next = transform(data?.value ?? []);
    const row = { key, value: next, updated_at: new Date().toISOString() };
    if (!data) {
      const result = await supabase!.from(table).insert(row);
      if (!result.error) return next;
      if (result.error.code === '23505') continue;
      throw new Error(result.error.message);
    }
    const result = await supabase!.from(table).update(row).eq('key', key).eq('updated_at', data.updated_at).select('value');
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length === 1) return result.data[0].value as RecipeItem[];
  }
  throw new Error('The menu changed in another session. Try saving again.');
}

export function saveMenuItem(recipe: RecipeItem) {
  validateMenuItem(recipe);
  const saved = { ...recipe, dishName: recipe.dishName.trim(), portionSize: recipe.portionSize.trim() };
  return updateMenu(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]);
}

export function deleteMenuItem(id: string) {
  return updateMenu(current => current.filter(item => item.id !== id));
}

export async function saveMenuPricing(settings: MenuPricingSettings) {
  validateMenuPricing(settings);
  await requireAdmin();
  await saveAppState(MENU_PRICING_KEY, settings);
}

export async function syncPublicMenuCosting(): Promise<RecipeItem[]> {
  const {menu} = await getAdminPublicMenu();
  return updateMenu(current => syncCostingCatalog(current, menu.items));
}
