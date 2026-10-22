import React, { useState } from 'react';
import { RestaurantLogo } from './RestaurantLogo';
import { Eye, EyeOff, LogIn, Mail, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isRestaurantRole } from '../utils/access';

export function AdminLoginModal({ onClose, page = false }: { onClose: () => void; page?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const resendConfirmation = async () => {
    setError('');
    setConfirmationSent(false);
    if (!supabase) { setError('Supabase is not connected.'); return; }
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (resendError) throw resendError;
      setConfirmationSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send the confirmation email. Please try again.');
    } finally { setResending(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setConfirmationSent(false);
    if (!supabase) { setError('Supabase is not connected.'); return; }
    setBusy(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError?.code === 'email_not_confirmed') {
        setError('Confirm your email before signing in. Check your inbox and spam folder, or resend the confirmation email below.');
        return;
      }
      if (loginError) throw loginError;
      const { data, error: roleError } = await supabase.rpc('restaurant_access_role');
      if (roleError || !isRestaurantRole(data)) {
        await supabase.auth.signOut();
        throw new Error(roleError ? 'Run supabase-role-security.sql before signing in.' : 'This account has no active restaurant access.');
      }
      setPassword('');
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed. Please try again.');
    } finally { setBusy(false); }
  };

  return <div className={page ? 'app-shell flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm'}>
    <section role={page ? undefined : 'dialog'} aria-modal={page ? undefined : true} aria-labelledby="admin-login-title" className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl">
      {page && <div className="mb-6"><RestaurantLogo large /><h1 className="sr-only">Sea Slash</h1></div>}
      <div className="mb-5 flex items-center justify-between"><h2 id="admin-login-title" className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} /> Sign In</h2>{!page && <button aria-label="Close admin login" title="Close" onClick={onClose} disabled={busy || resending} className="p-2"><X size={18} /></button>}</div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs font-medium">Email<input autoFocus type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" /></label>
        <div><label htmlFor="admin-password" className="block text-xs font-medium">Password</label><div className="relative mt-1"><input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-3 pr-10 text-sm" /><button type="button" title={showPassword ? 'Hide password' : 'Show password'} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(current => !current)} className="absolute right-2 top-2">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
        {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        {confirmationSent && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">Confirmation email sent. Check your inbox and spam folder.</p>}
        <button disabled={busy || resending} type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"><LogIn size={16} />{busy ? 'Signing In...' : 'Sign In'}</button>
        <button disabled={busy || resending} type="button" onClick={resendConfirmation} className="flex w-full items-center justify-center gap-2 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 disabled:opacity-50"><Mail size={16} />{resending ? 'Sending...' : 'Resend Confirmation Email'}</button>
      </form>
    </section>
  </div>;
}
