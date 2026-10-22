import { supabase } from './supabase';
import type { StaffAdvance } from '../types';
import { mergeAdvanceChanges } from '../utils/staffAdvances';
const key = 'sea_slash_advances_v1';
const table = import.meta.env.VITE_SUPABASE_APP_STATE_TABLE || 'app_state';

export async function saveStaffAdvanceChanges(previous: StaffAdvance[], next: StaffAdvance[]) {
  if (!supabase) throw new Error('Connect to Supabase before recording salary advances.');
  const { data: manager, error: roleError } = await supabase.rpc('can_manage_restaurant');
  if (roleError || manager !== true) throw new Error('Administrator or manager access required.');
  const { data: admin, error: adminError } = await supabase.rpc('is_restaurant_admin');
  if (adminError) throw new Error(adminError.message);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from(table).select('value,updated_at').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    const value = mergeAdvanceChanges(previous, next, data?.value ?? [], admin === true);
    const row = { key, value, updated_at: new Date().toISOString() };
    const result = data ? await supabase.from(table).update(row).eq('key', key).eq('updated_at', data.updated_at).select('value') : await supabase.from(table).insert(row).select('value');
    if (result.error?.code === '23505') continue;
    if (result.error) throw new Error(result.error.message);
    if (result.data?.length) return result.data[0].value as StaffAdvance[];
  }
  throw new Error('Salary advances changed in another session. Please retry.');
}
