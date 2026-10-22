import {isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, Moon, Sun, KeyRound } from 'lucide-react';
import {getMySalarySheetData, type MySalarySheetData} from '../lib/staffSalarySheet';
import {buildStaffSalarySheet} from '../utils/staffSalarySheet';
import {StaffSalarySheetView} from './StaffSalarySheetView';
import { supabase } from '../lib/supabase';
import { StaffAgreements } from './StaffAgreements';
import { getTodayString } from '../utils/formatters';

export function StaffPortal({ onLogout }: { onLogout: () => Promise<void> }) {
  const [data, setData] = useState<MySalarySheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useRememberedViewState('mySalary.month',getTodayString().slice(0,7),isViewMonth);
  const [tab, setTab] = useState<'salary' | 'agreements' | 'account'>('salary');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');

  const refresh = async () => {
    try { setData(await getMySalarySheetData()); setError(''); }
    catch (failure) { setData(null); setError(failure instanceof Error ? failure.message : 'Could not load your profile.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const logout = () => onLogout().catch(failure => setError(failure.message));
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('sea_slash_theme', next ? 'dark' : 'light');
    setDark(next);
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !data?.profile.loginEmail) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: data.profile.loginEmail, password: currentPassword });
      if (reauthError) throw reauthError;
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setCurrentPassword(''); setPassword(''); setNotice('Password updated.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not change password.'); }
    finally { setBusy(false); }
  };
  const [now,setNow] = useState(Date.now());
  useEffect(() => { const timer=window.setInterval(()=>setNow(Date.now()),1000); return ()=>window.clearInterval(timer); },[]);
  const sheet = data ? buildStaffSalarySheet(data.profile,data.attendance,data.advances,data.expenses,month,now) : null;

  return <div className="app-shell min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold">Sea Slash</h1><p className="text-xs text-slate-500">Staff Portal</p></div><div className="flex items-center gap-2"><button title="Refresh your profile" aria-label="Refresh your profile" onClick={refresh} className="p-2"><RefreshCw size={18} /></button><button title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme} className="p-2">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button onClick={logout} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><LogOut size={16} />Sign Out</button></div></div></header>
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {loading ? <p>Loading your staff profile...</p> : !data ? <section className="py-12"><h2 className="text-lg font-semibold">Staff access unavailable</h2><p className="mt-2 text-sm text-slate-500">Your account has no active staff profile. Contact the administrator.</p></section> : <>
        <div><h2 className="text-xl font-semibold">{data.profile.name}</h2><p className="text-sm text-slate-500">{data.profile.role} / Joined {data.profile.joinDate}</p></div>
        <nav aria-label="Your staff views" className="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">{(['salary', 'agreements', 'account'] as const).map(value => <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={`rounded-md px-3 py-2 text-sm capitalize ${tab === value ? 'bg-slate-200 font-semibold dark:bg-slate-800' : 'text-slate-500'}`}>{value}</button>)}</nav>
        {tab === 'salary' && sheet && <section className="space-y-5"><label className="block max-w-52 text-xs font-medium">Salary Month<input required type="month" value={month} onChange={event => {if(event.target.value)setMonth(event.target.value);}} className="staff-input" /></label><StaffSalarySheetView sheet={sheet} restaurant="Sea Slash" /></section>}
        {tab === 'agreements' && <StaffAgreements staff={[data.profile]} restaurant="Sea Slash" isAdmin={false} />}
        {tab === 'account' && <form onSubmit={changePassword} className="max-w-sm space-y-4"><h3 className="text-base font-semibold">Change Password</h3><label className="block text-xs font-medium">Current Password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="staff-input" /></label><label className="block text-xs font-medium">New Password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="staff-input" /></label>{notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}<button disabled={busy} type="submit" className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><KeyRound size={16} />{busy ? 'Updating...' : 'Update Password'}</button></form>}
      </>}
    </main>
  </div>;
}
