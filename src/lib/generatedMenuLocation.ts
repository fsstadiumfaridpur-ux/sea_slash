import {supabase} from './supabase';
const table=import.meta.env.VITE_SUPABASE_APP_STATE_TABLE||'app_state';
const key='sea_slash_generated_menu_location_v1';
export async function loadGeneratedMenuLocation():Promise<string|null>{
  if(!supabase)throw new Error('Sign in to load your menu location.');
  const {data,error}=await supabase.from(table).select('value').eq('key',key).maybeSingle();if(error)throw error;
  if(!data)return null;
  if(typeof data.value!=='string'||data.value.length>160)throw new Error('The saved menu location is invalid.');
  return data.value;
}
export async function saveGeneratedMenuLocation(location:string):Promise<void>{
  if(typeof location!=='string'||location.length>160)throw new Error('Use a location up to 160 characters.');
  if(!supabase)throw new Error('Sign in to save your menu location.');
  const {data:admin,error:roleError}=await supabase.rpc('is_restaurant_admin');if(roleError||admin!==true)throw new Error('Administrator access required.');
  const {error}=await supabase.from(table).upsert({key,value:location,updated_at:new Date().toISOString()},{onConflict:'key'});if(error)throw error;
}
