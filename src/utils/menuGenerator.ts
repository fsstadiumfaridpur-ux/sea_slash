export interface MenuPrintOptions { width: number; height: number; dpi: number; columns: number; rows?: number; logoScale?: number; background: 'black'|'burgundy'|'cream'; title: string; footer: string; descriptions: boolean; categories?: boolean }
export function menuBoardCapacity(options:Pick<MenuPrintOptions,'columns'|'rows'>) {
  if(!Number.isInteger(options.columns)||options.columns<1||options.columns>5)throw new Error('Choose 1 to 5 columns.');
  if(options.rows!==undefined&&(!Number.isInteger(options.rows)||options.rows<1||options.rows>5))throw new Error('Choose 1 to 5 rows.');
  return Math.min(20,options.columns*(options.rows??4));
}
export function menuPrintDimensions(options: MenuPrintOptions, count: number) {
  if (![options.width,options.height].every(value=>Number.isFinite(value)&&value>=2&&value<=60)) throw new Error('Enter a width and height between 2 and 60 inches.');
  if (options.logoScale!==undefined&&(!Number.isFinite(options.logoScale)||options.logoScale<.5||options.logoScale>1.5)) throw new Error('Choose a logo size between 50% and 150%.');
  if (![72,150,300].includes(options.dpi)) throw new Error('Choose 72, 150 or 300 DPI.');
  if (!Number.isInteger(options.columns)||options.columns<1||options.columns>5) throw new Error('Choose 1 to 5 columns.');
  if (!Number.isInteger(count)||count<1||count>500) throw new Error('Select at least one dish (up to 500).');
  const capacity=menuBoardCapacity(options);if(options.rows!==undefined&&count>capacity)throw new Error('This board has too many dishes for the chosen rows and columns.');
  const width=Math.round(options.width*options.dpi), height=Math.round(options.height*options.dpi);
  if(width*height>40000000||width>16000||height>16000)throw new Error('This export is too large. Choose a lower DPI or smaller dimensions (maximum 40 megapixels).');
  return {width,height,columns:options.rows===undefined?Math.min(options.columns,count):options.columns,rows:options.rows??Math.ceil(count/Math.min(options.columns,count))};
}
// Canvas PNGs default to 96 DPI. Write a real pHYs chunk so print tools read the chosen inches.
export async function pngWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);view.setUint32(0,9);chunk.set([112,72,89,115],4);
  view.setUint32(8,Math.round(dpi/0.0254));view.setUint32(12,Math.round(dpi/0.0254));chunk[16]=1;
  let crc=0xffffffff;for(const byte of chunk.slice(4,17)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}view.setUint32(17,(crc^0xffffffff)>>>0);
  const parts:BlobPart[]=[bytes.slice(0,8)];let offset=8;
  while(offset+12<=bytes.length){const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);const end=offset+length+12;if(end>bytes.length)throw new Error('Invalid PNG export.');const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=='pHYs')parts.push(bytes.slice(offset,end));if(type==='IHDR')parts.push(chunk);offset=end;}
  return new Blob(parts,{type:'image/png'});
}
