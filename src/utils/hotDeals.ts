import type {PublicMenuData} from './publicMenu';
export function hotDealItems(menu:PublicMenuData){
  return (menu.settings.hotDealIds??[]).map(id=>menu.items.find(item=>item.id===id&&item.published)).filter((item):item is PublicMenuData['items'][number]=>!!item);
}

export function hotDealPages(menu:PublicMenuData){
  const items=hotDealItems(menu);
  return Array.from({length:Math.ceil(items.length/2)},(_,index)=>{
    const pair=items.slice(index*2,index*2+2);
    if(pair.length===1&&items.length>1)pair.push(items[0]);
    return pair;
  });
}
export function hotDealSeconds(value?:number){return Number.isInteger(value)&&value!>=5&&value!<=300?value!:10;}
