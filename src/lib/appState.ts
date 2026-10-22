import { isSupabaseConfigured, supabase } from './supabase';
import type { InventoryItem, WasteRecord } from '../types';

const TABLE_NAME = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';

export async function loadAppState<T>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.value as T) ?? null;
}

export async function saveAppState<T>(key: string, value: T): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    throw error;
  }
}

export async function deleteWasteRecord(id: string, restoreStock: boolean): Promise<{ inventory: InventoryItem[]; wastes: WasteRecord[] }> {
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data, error } = await supabase.rpc('delete_restaurant_waste', { p_record_id: id, p_restore_stock: restoreStock });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteInventoryIngredient(id: string): Promise<InventoryItem[]> {
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data: admin, error } = await supabase.rpc('is_restaurant_admin');
  if (error || admin !== true) throw new Error('Administrator access required.');
  const current = await loadAppState<InventoryItem[]>('sea_slash_inventory_v1');
  if (!current || !current.some(item => item.id === id)) throw new Error('Ingredient no longer exists.');
  const next = current.filter(item => item.id !== id);
  await saveAppState('sea_slash_inventory_v1', next);
  return next;
}
