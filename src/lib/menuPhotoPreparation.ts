import {supabase} from './supabase';
import {requestMenuPhoto} from '../utils/requestMenuPhoto';
import {fitDishPhoto} from '../utils/menuPhotoFit';
export async function removeDishBackground(file:File):Promise<Blob>{
  if(!supabase)throw new Error('Connect Supabase to use AI photo preparation.');
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session)throw new Error('Sign in again to prepare a photo.');
  const url=import.meta.env.VITE_SUPABASE_URL.replace(/\/$/,'');
  return requestMenuPhoto(`${url}/functions/v1/prepare-menu-photo`,session.access_token,import.meta.env.VITE_SUPABASE_ANON_KEY,file);
}
export async function makeDishBackgrounds(cutout:Blob):Promise<{cream:File;burgundy:File}>{
  const image=await createImageBitmap(cutout);
  try{
    const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
    const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Could not prepare your photo.');
    ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    let left=image.width,top=image.height,right=-1,bottom=-1;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top)throw new Error('No dish was found in this photo. Please use the original or try another.');
    const width=right-left+1,height=bottom-top+1;
    const fit=fitDishPhoto(width,height);
    async function render(style:'cream'|'burgundy'){
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
      const out=canvas.getContext('2d');if(!out)throw new Error('Could not prepare your photo.');
      if(style==='cream'){out.fillStyle='#f5ecdd';}else{const background=out.createRadialGradient(600,340,60,600,400,800);background.addColorStop(0,'#702723');background.addColorStop(1,'#290a0b');out.fillStyle=background;}
      out.fillRect(0,0,1200,800);
      out.drawImage(image,left,top,width,height,fit.x,fit.y,fit.width,fit.height);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create photo preview.')),'image/webp',.92));
      return new File([blob],`menu-${style}.webp`,{type:'image/webp'});
    }
    return {cream:await render('cream'),burgundy:await render('burgundy')};
  }finally{image.close();}
}
