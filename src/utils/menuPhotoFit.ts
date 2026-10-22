export function fitDishPhoto(width:number,height:number,canvasWidth=1200,canvasHeight=800) {
  if(width<=0||height<=0||![width,height,canvasWidth,canvasHeight].every(Number.isFinite)||canvasWidth<=0||canvasHeight<=0)throw new Error('Invalid photo size.');
  const scale=Math.min(canvasWidth*.92/width,canvasHeight*.92/height);
  const drawWidth=width*scale,drawHeight=height*scale;
  return {x:(canvasWidth-drawWidth)/2,y:(canvasHeight-drawHeight)/2,width:drawWidth,height:drawHeight};
}
