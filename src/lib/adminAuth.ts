import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isRestaurantRole, type RestaurantRole } from '../utils/access';


function clearBusinessCache() {
  for (const key of Object.keys(localStorage)) if (key.startsWith('sea_slash_') && key !== 'sea_slash_theme') localStorage.removeItem(key);
}

export function useAdminAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<RestaurantRole | null>(null);
  const [roleError, setRoleError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const currentUser = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') clearBusinessCache();
      if (currentUser.current !== (nextSession?.user.id ?? null)) {
        setRole(null);
        setAuthReady(!nextSession);
      }
      currentUser.current = nextSession?.user.id ?? null;
      setSession(nextSession);
      setSessionLoaded(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    let cancelled = false;
    async function verifyRole() {
      if (!supabase || !session) {
        if (!cancelled) { setRole(null); setRoleError(''); setAuthReady(true); }
        return;
      }
      const { data, error } = await supabase.rpc('restaurant_access_role');
      if (!cancelled) {
        setRole(!error && isRestaurantRole(data) ? data : null);
        if (error || !isRestaurantRole(data) || (data === 'chef' || data === 'partner')) clearBusinessCache();
        setRoleError(error ? 'Access setup is unavailable. Run supabase-role-security.sql in Supabase, then refresh.' : !isRestaurantRole(data) ? 'This account has no active restaurant role. Contact an administrator.' : '');
        setAuthReady(true);
      }
    }
    verifyRole();
    const timer = window.setInterval(verifyRole, 30000);
    window.addEventListener('focus', verifyRole);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', verifyRole); };
  }, [session, sessionLoaded]);

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearBusinessCache();
    setRole(null);
  };

  return { isAdmin: role === 'admin', canManage: role === 'admin' || role === 'manager', role, roleError, authReady, session, signOut };
}
