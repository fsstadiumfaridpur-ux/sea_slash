import { supabase } from './supabase';
import { loadAppState } from './appState';
import { sortVendorLedgerByDate, validateVendorLedgerEntry, type VendorLedgerEntry } from '../utils/vendorLedger';

export const VENDOR_LEDGER_KEY = 'sea_slash_vendor_ledger_v1';
const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';

export async function loadVendorLedger() {
  const rows = await loadAppState<VendorLedgerEntry[]>(VENDOR_LEDGER_KEY) ?? [];
  rows.forEach(validateVendorLedgerEntry);
  return sortVendorLedgerByDate(rows);
}

export async function saveVendorLedger(entries: VendorLedgerEntry[]) {
  if (!supabase) throw new Error('Connect to Supabase before saving vendor bills or payments.');
  if (!Array.isArray(entries)) throw new Error('Invalid vendor ledger backup.');
  if (entries.some(entry => entry.sourceExpenseId)) throw new Error('Daily expense payments must be edited in Expenses.');
  entries.forEach(validateVendorLedgerEntry);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate vendor ledger records.');
  if(entries.some(entry=>entry.inventoryUpdateMode==='replace')){
    const {data:ready,error}=await supabase.rpc('vendor_inventory_replace_ready');
    if(error||ready!==true)throw new Error('Run the updated supabase-vendor-inventory.sql in Supabase SQL Editor to enable replacing inventory quantity and value.');
  }
  if (entries.length === 1 && entries[0].createInventoryItem) {
    const { data, error } = await supabase.rpc('save_vendor_bill_inventory_item', { p_bill: entries[0] });
    if (error) throw new Error(error.code === 'PGRST202' ? 'Run supabase-vendor-inventory-create.sql in Supabase SQL Editor before creating inventory from vendor bills.' : error.message);
    return sortVendorLedgerByDate(data.ledger);
  }
  const { data: canManage, error: roleError } = await supabase.rpc('can_manage_restaurant');
  if (roleError || canManage !== true) throw new Error('Administrator or manager access required.');
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_restaurant_admin');
  if (adminError) throw new Error(adminError.message);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from(table).select('value,updated_at').eq('key', VENDOR_LEDGER_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    const rows: VendorLedgerEntry[] = data?.value ?? [];
    rows.forEach(validateVendorLedgerEntry);
    if (isAdmin !== true && entries.some(entry => entry.balanceAdjustment !== undefined || rows.some(row => row.id === entry.id && row.balanceAdjustment !== undefined))) throw new Error('Administrator access required to override vendor balances.');
    if (entries.some(entry => entry.inventoryItemId || rows.some(row => row.id === entry.id && row.inventoryItemId))) {
      const { data: ready, error: syncError } = await supabase.rpc('vendor_inventory_sync_ready');
      if (syncError || ready !== true) throw new Error('Run supabase-vendor-inventory.sql in Supabase SQL Editor before saving inventory-linked bills.');
    }
    const next = sortVendorLedgerByDate([...rows.filter(row => !entries.some(entry => entry.id === row.id)), ...entries]);
    const row = { key: VENDOR_LEDGER_KEY, value: next, updated_at: new Date().toISOString() };
    const result = data
      ? await supabase.from(table).update(row).eq('key', VENDOR_LEDGER_KEY).eq('updated_at', data.updated_at).select('value')
      : await supabase.from(table).insert(row).select('value');
    if (result.error?.code === '23505') continue;
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length) return sortVendorLedgerByDate(result.data[0].value as VendorLedgerEntry[]);
  }
  throw new Error('Vendor ledger changed in another session. Please retry.');
}

