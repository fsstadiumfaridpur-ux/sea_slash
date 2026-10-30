import {svgCanvasRecorder} from './svgCanvasRecorder';
import type { PublicMenuItem } from '../utils/publicMenu';
import { menuPrintDimensions, type MenuPrintOptions } from '../utils/menuGenerator';
function loadPhoto(url:string,label:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';const timer=setTimeout(()=>{image.src='';reject(new Error(`Photo timed out: ${label}. Try again.`));},25000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error(`Could not load photo for ${label}. Upload the photo directly to the menu and try again.`));};image.src=url;});}
function contain(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number){const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight);const iw=image.naturalWidth*ratio,ih=image.naturalHeight*ratio;ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
function lines(ctx:CanvasRenderingContext2D,text:string,width:number):string[]{const result:string[]=[];let current='';for(const word of text.split(/\s+/)){if(ctx.measureText(current?`${current} ${word}`:word).width>width&&current){result.push(current);current=word;}else current=current?`${current} ${word}`:word;}if(current)result.push(current);return result;}
function fittedText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,fontSize:number,color:string,maxLines=2,family='Arial, sans-serif',minimumSize=5){let size=fontSize;let wrapped:string[]=[];do{ctx.font=`600 ${size}px ${family}`;wrapped=lines(ctx,text,width);if(wrapped.length<=maxLines&&wrapped.every(line=>ctx.measureText(line).width<=width))break;size-=0.5;}while(size>minimumSize);if(wrapped.length>maxLines){wrapped=wrapped.slice(0,maxLines);let last=wrapped[maxLines-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);wrapped[maxLines-1]=last+'…';}ctx.fillStyle=color;wrapped.forEach((line,index)=>ctx.fillText(line,x,y+index*size*1.18));return wrapped.length*size*1.18;}
export async function renderGeneratedMenu(items:PublicMenuItem[],options:MenuPrintOptions,customBackground='',logoUrl='',startIndex=0,svgOutput?:(svg:string)=>void) {
  const dimensions=menuPrintDimensions(options,items.length);
  await document.fonts.ready;
  const photos=new Map<string,HTMLImageElement>();
  // Bounded batches avoid opening hundreds of requests together.
  for(let start=0;start<items.length;start+=6)await Promise.all(items.slice(start,start+6).filter(item=>item.photoUrl).map(async item=>{photos.set(item.id,await loadPhoto(item.photoUrl,item.name));}));
  const logo=await loadPhoto(logoUrl||'/sea-slash-logo.svg','Sea Slash logo');
  const background=customBackground?await loadPhoto(customBackground,'background'):null;
  const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
  let ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not create the menu.');
  const logicalWidth=1600,logicalHeight=1600*options.height/options.width;ctx.scale(canvas.width/logicalWidth,canvas.height/logicalHeight);ctx.imageSmoothingQuality='high';
  const recorder=svgOutput?svgCanvasRecorder(ctx,options):null;if(recorder)ctx=recorder.ctx;
  const cream=options.background==='cream',ink=cream?'#431518':'#fff5df',gold=cream?'#97521d':'#e6bc72';
  ctx.fillStyle=cream?'#f8efdc':options.background==='black'?'#080808':'#400c15';ctx.fillRect(0,0,logicalWidth,logicalHeight);
  if(background){const ratio=Math.max(logicalWidth/background.width,logicalHeight/background.height);ctx.drawImage(background,(logicalWidth-background.width*ratio)/2,(logicalHeight-background.height*ratio)/2,background.width*ratio,background.height*ratio);ctx.fillStyle=cream?'rgba(248,239,220,.88)':'rgba(0,0,0,.76)';ctx.fillRect(0,0,logicalWidth,logicalHeight);}
  const logoScale=options.logoScale??1,baseHeader=Math.min(245,logicalHeight*.19);
  const margin=36,header=baseHeader*Math.max(1,logoScale),footer=20;
  // Reference-style heading on the left, with restaurant identity and address at top right.
  const logoWidth=baseHeader*1.4*logoScale,logoHeight=baseHeader*.95*logoScale,logoX=logicalWidth*.49+baseHeader*1.4-logoWidth,logoY=(header-logoHeight)/2;
  const headingWidth=logoX-margin-20;
  contain(ctx,logo,logoX,logoY,logoWidth,logoHeight);
  ctx.textAlign='left';ctx.fillStyle=ink;ctx.font=`italic ${Math.min(70,header*.34)}px "Brush Script MT", "Snell Roundhand", Georgia, serif`;
  const heading=options.title||'Our Menu';let headingSize=Math.min(70,header*.34);while(ctx.measureText(heading).width>headingWidth&&headingSize>14){headingSize--;ctx.font=`italic ${headingSize}px "Brush Script MT", "Snell Roundhand", Georgia, serif`;}ctx.fillText(heading,margin,header*.7);
  ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(margin,header*.79);ctx.quadraticCurveTo(logicalWidth*.25,header*.71,margin+headingWidth,header*.79);ctx.stroke();
  const addressX=logoX+logoWidth+25,addressW=logicalWidth-margin-addressX;ctx.textAlign='center';
  ctx.fillStyle=gold;ctx.font=`italic bold ${Math.min(29,header*.15)}px Georgia, serif`;ctx.fillText('Sea Slash',addressX+addressW/2,header*.34);
  fittedText(ctx,options.footer||"Sea Slash",addressX+addressW/2,header*.53,addressW,Math.min(21,header*.12),ink,3,'Georgia, serif');
  const gap=24,cellW=(logicalWidth-margin*2-gap*(dimensions.columns-1))/dimensions.columns,cellH=Math.min((logicalHeight-header-footer-28)/dimensions.rows,cellW*1.12+(options.descriptions?35:0));
  if(cellH<60)throw new Error('Too many dishes for this layout. Use more columns, a taller page, or select fewer dishes.');
  const nameSize=Math.min(23,cellW*.075,cellH*.085),descSize=Math.min(15,cellH*.07);
  items.forEach((item,index)=>{const x=margin+(index%dimensions.columns)*(cellW+gap),y=header+20+Math.floor(index/dimensions.columns)*cellH;const textHeight=nameSize*2.8+(options.descriptions&&item.description.trim()?descSize*2.8:0)+(options.categories?descSize*1.6:0)+12;const photoH=Math.max(8,cellH-textHeight-16);const photo=photos.get(item.id);if(photo)contain(ctx,photo,x,y,cellW,photoH);else {ctx.fillStyle=cream?'#e8d6b4':'#291d1b';ctx.fillRect(x+8,y+8,cellW-16,photoH-16);ctx.textAlign='center';fittedText(ctx,'Sea Slash',x+cellW/2,y+photoH/2,cellW-20,Math.min(20,photoH*.2),gold,1);}
    if(!item.available){ctx.fillStyle='#b51d2a';const bw=Math.min(88,cellW*.32),bh=Math.min(40,photoH*.3);ctx.fillRect(x+(cellW-bw)/2,y+(photoH-bh)/2,bw,bh);ctx.textAlign='center';ctx.fillStyle='white';ctx.font=`bold ${bh*.6}px Arial`;ctx.fillText('OFF',x+cellW/2,y+photoH/2+bh*.22);}
    ctx.textAlign='center';const ty=y+photoH+nameSize+8;const nameH=fittedText(ctx,`${startIndex+index+1}. ${item.name} — ৳${item.price.toLocaleString('en-BD',{maximumFractionDigits:2})}/-`,x+cellW/2,ty,cellW-6,nameSize,ink,2);let detailsY=ty+nameH+descSize*.5;
    if(options.categories){const categoryH=fittedText(ctx,item.category,x+cellW/2,detailsY,cellW-12,descSize,gold,1);detailsY+=categoryH+descSize*.35;}
    if(options.descriptions&&item.description)fittedText(ctx,item.description,x+cellW/2,detailsY,cellW-12,descSize,ink,2,'Arial, sans-serif',descSize*.85);

  });
  // Fail before preview/export if a remote host prevented canvas export.
  try{ctx.getImageData(0,0,1,1);}catch{throw new Error('A photo prevents export. Please upload its original file directly to your menu.');}
  if(recorder&&svgOutput)svgOutput(recorder.serialize());
  return canvas;
}

export async function renderGeneratedMenuSvg(items:PublicMenuItem[],options:MenuPrintOptions,customBackground='',logoUrl='',startIndex=0):Promise<Blob>{
  let svg='';
  const canvas=await renderGeneratedMenu(items,options,customBackground,logoUrl,startIndex,value=>{svg=value;});
  canvas.width=0;canvas.height=0;
  if(!svg)throw new Error('Could not create the SVG menu.');
  return new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
}
