import {preparePhotoWithFallback} from '../utils/preparePhotoFallback';
import {supabase} from './supabase';
import {removeDishBackground} from './menuPhotoPreparation';
import {uploadMenuPhoto} from './publicMenu';
export interface GeneratedMenuPhoto {photoUrl:string;sourcePhotoUrl:string;custom:boolean;preparation?:'cutout'|'original'}
export type GeneratedMenuPhotos=Record<string,GeneratedMenuPhoto>;
const key='sea_slash_generated_menu_photos_v1';
const table=import.meta.env.VITE_SUPABASE_APP_STATE_TABLE||'app_state';
export async function loadGeneratedMenuPhotos():Promise<GeneratedMenuPhotos>{
  if(!supabase)throw new Error('Sign in to load generated-menu photos.');
  const {data,error}=await supabase.from(table).select('value').eq('key',key).maybeSingle();if(error)throw error;
  return data?.value??{};
}
export async function saveGeneratedMenuPhoto(id:string,photo:GeneratedMenuPhoto|null){
  if(!supabase)throw new Error('Sign in to save generated-menu photos.');
  const {data:admin,error:roleError}=await supabase.rpc('is_restaurant_admin');if(roleError||admin!==true)throw new Error('Administrator access required.');
  for(let attempt=0;attempt<3;attempt++){
    const {data,error}=await supabase.from(table).select('value,updated_at').eq('key',key).maybeSingle();if(error)throw error;
    const photos:GeneratedMenuPhotos={...(data?.value??{})};if(photo)photos[id]=photo;else delete photos[id];
    const row={key,value:photos,updated_at:new Date().toISOString()};
    const result=data?await supabase.from(table).update(row).eq('key',key).eq('updated_at',data.updated_at).select('value'):await supabase.from(table).insert(row).select('value');
    if(result.error?.code==='23505')continue;if(result.error)throw result.error;if(result.data?.length)return photos;
  }
  throw new Error('Photos changed in another session. Reload and try again.');
}
export async function fetchGeneratedMenuPhoto(url:string):Promise<File>{
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Could not load the original dish photo. Upload a photo for this menu instead.');
  const blob=await response.blob();return new File([blob],'dish-photo',{type:blob.type});
}
async function transparentDish(blob:Blob):Promise<File|null>{
  const bitmap=await createImageBitmap(blob);try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Could not prepare photo.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let clear=0,left=canvas.width,top=canvas.height,right=-1,bottom=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const alpha=pixels[(y*canvas.width+x)*4+3];if(alpha<24)clear++;if(alpha>24){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
    if(clear/(canvas.width*canvas.height)<.02)return null;
    if(right<left||bottom<top)throw new Error('No plate or food found in this photo.');
    const out=document.createElement('canvas');out.width=right-left+1;out.height=bottom-top+1;const output=out.getContext('2d');if(!output)throw new Error('Could not prepare photo.');output.drawImage(canvas,left,top,out.width,out.height,0,0,out.width,out.height);
    const result=await new Promise<Blob>((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create cutout.')),'image/png'));
    return new File([result],'dish-cutout.png',{type:'image/png'});
  }finally{bitmap.close();}
}
export async function prepareGeneratedMenuPhoto(file:File):Promise<string>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choose JPG, PNG or WebP under 8 MB.');
  let cutout=await transparentDish(file);
  if(!cutout){const removed=await removeDishBackground(file);cutout=await transparentDish(removed);if(!cutout)throw new Error('AI did not return a transparent dish. Try a clearer photo of the plate and food.');}
  return uploadMenuPhoto(cutout);
}

export function prepareGeneratedMenuPhotoForBoard(file:File,skipAI=false){
  return preparePhotoWithFallback(file,{transparent:transparentDish,remove:removeDishBackground,upload:uploadMenuPhoto},skipAI);
}

const logoKey='sea_slash_generated_menu_logo_v1';
interface MenuLogoState {url:string;cutouts:Record<string,string>}
async function readLogoState(){
  if(!supabase)throw new Error('Sign in to load your menu logo.');
  const {data,error}=await supabase.from(table).select('value,updated_at').eq('key',logoKey).maybeSingle();if(error)throw error;
  const state:MenuLogoState=typeof data?.value==='string'?{url:data.value,cutouts:{}}:data?.value??{url:'',cutouts:{}};
  return {data,state};
}
export async function loadGeneratedMenuLogo():Promise<string>{return (await readLogoState()).state.url;}
export async function saveGeneratedMenuLogo(url:string,source?:string){
  if(!supabase)throw new Error('Sign in to save your logo.');
  const {data:admin,error:roleError}=await supabase.rpc('is_restaurant_admin');if(roleError||admin!==true)throw new Error('Administrator access required.');
  for(let attempt=0;attempt<3;attempt++){
    const {data,state}=await readLogoState();const value={url,cutouts:{...state.cutouts,...(source?{[source]:url}:{})}};const row={key:logoKey,value,updated_at:new Date().toISOString()};
    const result=data?await supabase.from(table).update(row).eq('key',logoKey).eq('updated_at',data.updated_at).select('value'):await supabase.from(table).insert(row).select('value');
    if(result.error?.code==='23505')continue;if(result.error)throw result.error;if(result.data?.length)return;
  }
  throw new Error('The logo changed in another session. Try again.');
}
// Plain logo backgrounds can be removed locally, preserving the lettering without a paid API call.
async function removePlainLogoBackground(file:File):Promise<Blob|null>{
  const bitmap=await createImageBitmap(file);try{
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Could not prepare logo.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);const pixels=image.data;const corners=[0,canvas.width-1,(canvas.height-1)*canvas.width,canvas.width*canvas.height-1];const color=[0,1,2].map(channel=>corners.reduce((sum,index)=>sum+pixels[index*4+channel],0)/4);
    if(corners.some(index=>Math.hypot(...color.map((value,c)=>value-pixels[index*4+c]))>20))return null;
    let removed=0;for(let i=0;i<pixels.length;i+=4){const difference=Math.hypot(...color.map((value,c)=>value-pixels[i+c]));if(difference<55){pixels[i+3]=Math.round(pixels[i+3]*Math.max(0,(difference-18)/37));removed++;}}
    if(removed/(canvas.width*canvas.height)<.1)return null;
    ctx.putImageData(image,0,0);return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare logo.')),'image/png'));
  }finally{bitmap.close();}
}
export async function ensureGeneratedMenuLogo(source:string):Promise<string>{
  if(source==='/sea-slash-logo.svg'){await saveGeneratedMenuLogo(source);return source;}
  const {state}=await readLogoState();const cached=state.cutouts[source];if(cached)return cached;if(Object.values(state.cutouts).includes(source))return source;
  let file:File;if(source.startsWith('/')){const response=await fetch(source);if(!response.ok)throw new Error('Could not load logo.');const blob=await response.blob();file=new File([blob],'logo',{type:blob.type});}else file=await fetchGeneratedMenuPhoto(source);
  let transparent=await transparentDish(file);if(!transparent){const plain=await removePlainLogoBackground(file);if(plain)transparent=await transparentDish(plain);}
  const url=transparent?await uploadMenuPhoto(transparent):(await prepareGeneratedMenuPhotoForBoard(file)).photoUrl;
  await saveGeneratedMenuLogo(url,source);return url;
}
