import { supabase } from './supabase';
import { defaultPublicMenu, validatePublicMenu, type PublicMenuData } from '../utils/publicMenu';
export interface MenuRevision { menu: PublicMenuData; updatedAt: string | null }
export async function getPublicMenu(): Promise<PublicMenuData> {
  if (!supabase) return defaultPublicMenu;
  const {data,error}=await supabase.rpc('get_public_restaurant_menu');
  if (error) throw new Error('The menu is being prepared. Please check back shortly.');
  return data ?? defaultPublicMenu;
}
export async function getAdminPublicMenu(): Promise<MenuRevision> {
  if (!supabase) throw new Error('Connect to Supabase to manage the public menu.');
  const {data,error}=await supabase.rpc('get_admin_restaurant_menu');
  if (error) throw new Error(error.code==='PGRST202'?'Run supabase-public-menu.sql to enable the public menu and photo uploads.':error.message);
  return data;
}
export async function savePublicMenu(menu:PublicMenuData, expectedUpdatedAt:string|null):Promise<MenuRevision> {
  validatePublicMenu(menu);
  if (!supabase) throw new Error('Supabase is not connected.');
  const {data,error}=await supabase.rpc('save_public_restaurant_menu',{p_menu:menu,p_expected_updated_at:expectedUpdatedAt});
  if (error) throw new Error(error.code==='PGRST202'?'Run supabase-public-menu.sql before saving your menu.':error.message);
  return data;
}
export async function uploadMenuPhoto(file: File) {
  if (!supabase) throw new Error('Supabase is not connected.');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024) throw new Error('Choose a JPG, PNG or WebP photo smaller than 8 MB.');
  const image=await createImageBitmap(file);
  let blob:Blob;
  try {
    const scale=Math.min(1,1200/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare this photo.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not prepare this photo.')),'image/webp',0.86));
  } finally {image.close();}
  const path=`dishes/${crypto.randomUUID()}.webp`;
  const {error}=await supabase.storage.from('menu-photos').upload(path,blob,{contentType:'image/webp',upsert:false});
  if(error)throw new Error('Photo upload failed. Check the menu-photos bucket setup in supabase-public-menu.sql.');
  return supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
}
