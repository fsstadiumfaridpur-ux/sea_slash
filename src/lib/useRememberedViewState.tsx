import {createContext,useContext,useRef,useState,type Dispatch,type SetStateAction,type ReactNode} from 'react';
import {readViewPreference,viewPreferenceKey} from '../utils/viewPreferences';
const Scope=createContext<string|null>(null);
export function ViewPreferencesProvider({scope,children}:{scope:string;children:ReactNode}){return <Scope.Provider value={scope}>{children}</Scope.Provider>;}
export function useRememberedViewState<T>(name:string,initial:T|(()=>T),valid?:(value:unknown)=>boolean):[T,Dispatch<SetStateAction<T>>]{
  const scope=useContext(Scope);const key=scope?viewPreferenceKey(scope,name):null;
  const [value,setValue]=useState<T>(()=>{const fallback=typeof initial==='function'?(initial as ()=>T)():initial;if(!key)return fallback;try{return readViewPreference(localStorage,key,fallback,valid??(candidate=>typeof candidate===typeof fallback));}catch{return fallback;}});
  const current=useRef(value);current.current=value;
  const remember:Dispatch<SetStateAction<T>>=next=>{const resolved=typeof next==='function'?(next as (value:T)=>T)(current.current):next;current.current=resolved;if(key&&(!valid||valid(resolved))){try{localStorage.setItem(key,JSON.stringify(resolved));}catch{/* Preferences remain usable when browser storage is unavailable. */}}setValue(resolved);};
  return [value,remember];
}
