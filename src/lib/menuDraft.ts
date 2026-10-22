import {supabase} from './supabase';
import {isMenuDraftRecord,type MenuDraftRecord} from '../utils/menuDraft';
const key='sea_slash_generated_menu_draft_v1';
const table=import.meta.env.VITE_SUPABASE_APP_STATE_TABLE||'app_state';
export async function loadMenuDraft():Promise<MenuDraftRecord|null>{
  if(!supabase)throw new Error('Sign in to load your menu draft.');
  const {data,error}=await supabase.from(table).select('value').eq('key',key).maybeSingle();if(error)throw error;if(!data)return null;
  if(!isMenuDraftRecord(data.value))throw new Error('The saved menu draft is invalid.');return data.value;
}
export async function saveMenuDraft(record:MenuDraftRecord):Promise<void>{
  if(!isMenuDraftRecord(record))throw new Error('Could not save these draft settings.');
  if(!supabase)throw new Error('Sign in to save your menu draft.');
  const {data:admin,error:roleError}=await supabase.rpc('is_restaurant_admin');if(roleError||admin!==true)throw new Error('Administrator access required.');
  const {error}=await supabase.from(table).upsert({key,value:record,updated_at:record.updatedAt},{onConflict:'key'});if(error)throw error;
}
