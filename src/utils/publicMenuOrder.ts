import type { PublicMenuItem } from './publicMenu';

/** Move one dish to another dish’s position, retaining every hidden or filtered dish. */
export function reorderPublicMenuItems(items:PublicMenuItem[], sourceId:string, targetId:string):PublicMenuItem[] {
  const ordered=[...items].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  const source=ordered.findIndex(item=>item.id===sourceId);
  const target=ordered.findIndex(item=>item.id===targetId);
  if(source<0||target<0||source===target)return items;
  const [moved]=ordered.splice(source,1);
  ordered.splice(target,0,moved);
  return ordered.map((item,sortOrder)=>({...item,sortOrder}));
}
