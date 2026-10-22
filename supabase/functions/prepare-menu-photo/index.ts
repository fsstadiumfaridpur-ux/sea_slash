import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const fail=(error:string,status:number)=>Response.json({error},{status,headers:cors});
Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return fail('POST required.',405);
  const url=Deno.env.get('SUPABASE_URL');const anon=Deno.env.get('SUPABASE_ANON_KEY');
  const authorization=request.headers.get('Authorization');
  if(!url||!anon)return fail('Photo service is not configured.',503);
  if(!authorization?.startsWith('Bearer '))return fail('Administrator login required.',401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await caller.auth.getUser();
  if(identityError||!identity.user)return fail('Sign in again to prepare a photo.',401);
  const {data:admin,error:roleError}=await caller.rpc('is_restaurant_admin');
  if(roleError||admin!==true)return fail('Administrator access required.',403);
  const apiKey=Deno.env.get('REMOVE_BG_API_KEY');
  if(!apiKey)return fail('AI photo setup needed: configure REMOVE_BG_API_KEY for the prepare-menu-photo Edge Function.',503);
  if(Number(request.headers.get('content-length'))>9*1024*1024)return fail('Photo must be smaller than 8 MB.',413);
  try{
    const form=await request.formData();const image=form.get('image');
    if(!(image instanceof File)||!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>8*1024*1024||!image.size)return fail('Choose a JPG, PNG or WebP photo smaller than 8 MB.',400);
    const body=new FormData();body.append('image_file',image);body.append('size','auto');body.append('format','png');
    const result=await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':apiKey},body,signal:AbortSignal.timeout(60000)});
    if(!result.ok)return fail(result.status===402?'The AI photo service needs credits. You can still upload the original.':result.status===429?'The AI service is busy. Try again shortly.':'AI could not isolate this dish. Try a clearer photo or keep the original.',502);
    const photo=await result.blob();
    if(!photo.type.startsWith('image/'))return fail('AI returned an invalid photo. Please try again.',502);
    return new Response(photo,{headers:{...cors,'Content-Type':'image/png','Cache-Control':'no-store'}});
  }catch{return fail('Photo preparation failed. Try again or keep the original.',502);}
});
