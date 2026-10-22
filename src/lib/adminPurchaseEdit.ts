import { supabase } from './supabase';
import type { InventoryItem, PurchaseRecord } from '../types';
export async function saveAdminPurchaseEdit(previous: PurchaseRecord, next: PurchaseRecord): Promise<{ purchases: PurchaseRecord[]; inventory: InventoryItem[] }> {
  if (!supabase) throw new Error('Connect to Supabase before editing purchases.');
  const { data, error } = await supabase.rpc('edit_restaurant_purchase', { p_previous: previous, p_purchase: next });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Run supabase-admin-purchase-edit.sql in Supabase SQL Editor before editing purchase transactions.' : error.message);
  return data;
}
