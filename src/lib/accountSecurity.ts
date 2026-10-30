import {createClient} from '@supabase/supabase-js';
import {supabase} from './supabase';
export interface AccountSession {id:string;createdAt:string|null;refreshedAt:string|null;userAgent:string|null;ip:string|null;current:boolean}
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{
 if(!supabase)throw new Error('Connect to Supabase to manage account security.');
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw new Error(error.code==='PGRST202'?'Run supabase-account-security.sql in Supabase SQL Editor to enable device security.':error.message);
 return data as T;
}
export const listAccountSessions=()=>rpc<AccountSession[]>('list_my_account_sessions');
export const revokeAccountSession=(id:string)=>rpc<void>('revoke_my_account_session',{p_session_id:id});
export const revokeOtherSessions=()=>rpc<number>('revoke_my_other_sessions');
export function deviceName(agent:string|null){
 if(!agent)return 'Unknown browser / device';
 const os=/iPhone|iPad/i.test(agent)?'iPhone / iPad':/Android/i.test(agent)?'Android':/Windows/i.test(agent)?'Windows':/Macintosh|Mac OS/i.test(agent)?'Mac':/Linux/i.test(agent)?'Linux':'Device';
 const browser=/Edg\//.test(agent)?'Edge':/OPR\//.test(agent)?'Opera':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Browser / app';
 return `${os} · ${browser}`;
}

// Verify the existing password without replacing the browser's active session.
// The short-lived verification session is immediately signed out.
export async function verifyAccountPassword(email:string,password:string){
 const verifier=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {error}=await verifier.auth.signInWithPassword({email,password});
 if(error)throw new Error('Current password could not be verified. Check it and try again.');
 const {error:logoutError}=await verifier.auth.signOut({scope:'local'});
 if(logoutError)throw new Error('Could not complete password verification. Please try again.');
}
