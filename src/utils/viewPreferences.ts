export const isViewDate=(value:unknown):value is string=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
export const isViewMonth=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function viewPreferenceKey(scope:string,name:string){return `sea_slash_ui_v1:${scope}:${name}`;}
export function readViewPreference<T>(storage:Pick<Storage,'getItem'>,key:string,fallback:T,valid:(value:unknown)=>boolean):T{
  try{const raw=storage.getItem(key);if(raw===null)return fallback;const value:unknown=JSON.parse(raw);return valid(value)?value as T:fallback;}catch{return fallback;}
}
