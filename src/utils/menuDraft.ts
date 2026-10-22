import type {PublicMenuItem} from './publicMenu';
import type {MenuPrintOptions} from './menuGenerator';
export interface MenuGenerationSnapshot {items:PublicMenuItem[];options:MenuPrintOptions;background:string;logoUrl:string;key:string}
export interface MenuDraft {selectedIds:string[];options:MenuPrintOptions;background:string;backgroundName:string;logoUrl:string;activeBoard:number;generation:MenuGenerationSnapshot|null}
export interface MenuDraftRecord {updatedAt:string;draft:MenuDraft|null}
const url=(value:unknown)=>typeof value==='string'&&(value===''||/^https:\/\/[^\s]+$/.test(value)||value==='/sea-slash-logo.svg');
function options(value:any):boolean{return !!value&&(value.logoScale===undefined||(Number.isFinite(value.logoScale)&&value.logoScale>=.5&&value.logoScale<=1.5))&&[value.width,value.height,value.dpi,value.columns,value.rows??4].every(Number.isFinite)&&[72,150,300].includes(value.dpi)&&Number.isInteger(value.columns)&&value.columns>=1&&value.columns<=5&&Number.isInteger(value.rows??4)&&(value.rows??4)>=1&&(value.rows??4)<=5&&['black','cream','burgundy'].includes(value.background)&&typeof value.title==='string'&&value.title.length<=100&&typeof value.footer==='string'&&value.footer.length<=160&&typeof value.descriptions==='boolean'&&(value.categories===undefined||typeof value.categories==='boolean');}
export function isMenuDraft(value:any):value is MenuDraft {
  if(!value||!Array.isArray(value.selectedIds)||value.selectedIds.length>500||value.selectedIds.some((id:unknown)=>typeof id!=='string'||id.length>100)||new Set(value.selectedIds).size!==value.selectedIds.length||!options(value.options)||!url(value.background)||!url(value.logoUrl)||typeof value.backgroundName!=='string'||value.backgroundName.length>255||!Number.isInteger(value.activeBoard)||value.activeBoard<0)return false;
  const generation=value.generation;if(generation===null)return true;
  return !!generation&&options(generation.options)&&url(generation.background)&&url(generation.logoUrl)&&typeof generation.key==='string'&&generation.key.length<2000000&&Array.isArray(generation.items)&&generation.items.length<=500&&generation.items.every((item:any)=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.name.length<=100&&typeof item.category==='string'&&item.category.length<=60&&typeof item.description==='string'&&item.description.length<=300&&Number.isFinite(item.price)&&item.price>=0&&url(item.photoUrl)&&typeof item.available==='boolean');
}
export function isMenuDraftRecord(value:any):value is MenuDraftRecord{return !!value&&typeof value.updatedAt==='string'&&Number.isFinite(Date.parse(value.updatedAt))&&(value.draft===null||isMenuDraft(value.draft));}
export function newestMenuDraft(remote:MenuDraftRecord|null,local:MenuDraftRecord|null):MenuDraftRecord|null {
  if(!remote)return local;if(!local)return remote;
  // A newer deletion marker wins over an older browser backup.
  return Date.parse(local.updatedAt)>Date.parse(remote.updatedAt)?local:remote;
}
// Supabase JSON objects may return keys in a different order from browser objects.
export function menuDraftSignature(value:unknown):string{return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
export function menuSnapshotKey(options:MenuPrintOptions,items:PublicMenuItem[],background:string,logoUrl:string){return menuDraftSignature([options,items,background,logoUrl]);}
