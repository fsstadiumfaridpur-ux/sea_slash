import { useEffect, useState } from 'react';
import { RestaurantLogo } from './RestaurantLogo';
import { Check, LogOut, Minus, Moon, RefreshCw, Save, Sun } from 'lucide-react';
import { adjustChefInventory, checkInChef, getChefWorkspace, saveChefProfile, type ChefWorkspace } from '../lib/staff';

export function ChefPortal({ onLogout }: { onLogout: () => Promise<void> }) {
  const [data, setData] = useState<ChefWorkspace | null>(null);
  const [tab, setTab] = useState<'attendance' | 'inventory' | 'profile'>('attendance');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  async function refresh() {
    setLoading(true); setError('');
    try { const next = await getChefWorkspace(); setData(next); setName(next.profile.name); setPhone(next.profile.phone); }
    catch (failure) { setData(null); setError(failure instanceof Error ? failure.message : 'Could not load chef workspace.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { let cancelled = false; getChefWorkspace().then(next => { if (!cancelled) { setData(next); setName(next.profile.name); setPhone(next.profile.phone); } }).catch(failure => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, []);
  async function perform(action: () => Promise<ChefWorkspace>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { setData(await action()); setNotice(message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save changes.'); }
    finally { setBusy(false); }
  }
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const today = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
  const todaysAttendance = data?.attendance.find(row => row.date === today);
  const input = 'staff-input';
  return <div className="app-shell bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><RestaurantLogo /><div className="min-w-0"><h1 className="text-lg font-semibold">Sea Slash</h1><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Chef / {data?.profile.name}</p></div></div><div className="flex gap-2"><button disabled={busy || loading} title="Refresh workspace" aria-label="Refresh workspace" onClick={refresh} className="p-2"><RefreshCw size={18} /></button><button title="Toggle theme" aria-label="Toggle theme" onClick={() => { document.documentElement.dataset.theme = dark ? 'light' : 'dark'; localStorage.setItem('sea_slash_theme', dark ? 'light' : 'dark'); setDark(!dark); }} className="p-2">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button onClick={() => onLogout().catch(failure => setError(failure.message))} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><LogOut size={16} />Sign Out</button></div></div></header>
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <nav aria-label="Chef sections" className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">{(['attendance', 'inventory', 'profile'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setNotice(''); }} className={`shrink-0 rounded-md px-3 py-2 text-sm capitalize ${tab === value ? 'bg-slate-200 font-semibold dark:bg-slate-800' : 'text-slate-500 dark:text-slate-400'}`}>{value === 'profile' ? 'Profile Settings' : value}</button>)}</nav>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {loading ? <p role="status">Loading chef workspace...</p> : data && <>
        {tab === 'attendance' && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">My Attendance</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{today} / {todaysAttendance ? todaysAttendance.status.replace('_', ' ') : 'Not checked in'}</p></div><button disabled={busy || !!todaysAttendance} onClick={() => perform(checkInChef, 'Today’s attendance recorded.')} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><Check size={18} />{todaysAttendance ? 'Recorded' : 'Check In Today'}</button></div><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 dark:border-slate-800"><tr><th className="py-3">Date</th><th className="py-3">Status</th></tr></thead><tbody>{[...data.attendance].sort((a, b) => b.date.localeCompare(a.date)).map(row => <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800"><td className="py-3">{row.date}</td><td className="py-3 capitalize">{row.status.replace('_', ' ')}</td></tr>)}</tbody></table>{!data.attendance.length && <p className="py-6 text-sm text-slate-500">No attendance recorded.</p>}</section>}
        {tab === 'inventory' && <section className="space-y-4"><h2 className="text-xl font-semibold">Inventory Quick Adjust</h2><label className="block max-w-sm text-sm">Search Ingredients<input type="search" value={search} onChange={event => setSearch(event.target.value)} className={input} /></label><div className="divide-y divide-slate-200 dark:divide-slate-800">{data.inventory.filter(item => `${item.name} ${item.banglaName ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1 basis-40"><h3 className="break-words text-sm font-semibold">{item.name}</h3>{item.banglaName && <p className="text-xs text-slate-500">{item.banglaName}</p>}<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.currentStock} {item.unit}</p></div><div className="flex shrink-0 gap-2"><button title={`Remove 1 ${item.unit}`} aria-label={`Decrease ${item.name} by 1 ${item.unit}`} disabled={busy || item.currentStock < 1} onClick={() => perform(() => adjustChefInventory(item.id, -1), 'Stock quantity updated.')} className="rounded-md border border-slate-300 p-3 disabled:opacity-40 dark:border-slate-700"><Minus size={18} /></button></div></div>)}</div>{!data.inventory.length && <p className="text-sm text-slate-500">No ingredients available.</p>}</section>}
        {tab === 'profile' && <form onSubmit={event => { event.preventDefault(); perform(() => saveChefProfile(name, phone), 'Profile saved.'); }} className="max-w-lg space-y-4"><h2 className="text-xl font-semibold">Profile Settings</h2><label className="block text-sm">Full Name<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} className={input} /></label><label className="block text-sm">Phone<input type="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} className={input} /></label><dl className="space-y-3 border-y border-slate-200 py-4 text-sm dark:border-slate-800"><div><dt className="text-slate-500">Login Email</dt><dd className="break-all">{data.profile.loginEmail}</dd></div><div><dt className="text-slate-500">Position</dt><dd>{data.profile.role}</dd></div><div><dt className="text-slate-500">Joined</dt><dd>{data.profile.joinDate}</dd></div></dl><button disabled={busy} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><Save size={18} />{busy ? 'Saving...' : 'Save Profile'}</button></form>}
      </>}
    </main>
  </div>;
}
