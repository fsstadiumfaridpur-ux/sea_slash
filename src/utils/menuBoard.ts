import type { PublicMenuItem } from './publicMenu';
export interface MenuBoardGroup { category: string; items: PublicMenuItem[]; continued: boolean }
export function menuBoardColumns(items: PublicMenuItem[], count = 4): MenuBoardGroup[][] {
  const visible=items.filter(item=>item.published).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('Choose 1 to 8 menu columns.');
  const columns:MenuBoardGroup[][]=Array.from({length:count},()=>[]);
  const categories=[...new Set(visible.map(item=>item.category))];
  const capacity=Math.ceil((visible.length+(categories.length+count-1)*1.5)/count);
  let column=0;let load=0;
  for(const category of categories){
    const group=visible.filter(item=>item.category===category);
    let start=0;
    while(start<group.length){
      let take=column===count-1?group.length-start:Math.min(group.length-start,Math.floor(capacity-load-1.5));
      if(take<1){column++;load=0;continue;}
      columns[column].push({category,items:group.slice(start,start+take),continued:start>0});
      load+=take+1.5;start+=take;
      if(start<group.length){column++;load=0;}
    }
  }
  return columns;
}
export function menuBoardDensity(columns:MenuBoardGroup[][]) {
  const load=Math.max(1,...columns.map(groups=>groups.reduce((sum,group)=>sum+group.items.length+1.5,0)));
  const rowHeight=Math.min(60,780/load);
  return {rowHeight,nameSize:Math.min(25,rowHeight*.42),priceSize:Math.min(29,rowHeight*.48),photoSize:Math.min(48,rowHeight*.8)};
}
