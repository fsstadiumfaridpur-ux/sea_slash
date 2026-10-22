import {validWorkSchedule} from '../utils/staffShiftEarnings';
import { NumericInput } from './NumericInput';
import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserRoundMinus, Trash2, X } from 'lucide-react';
import type { StaffMember } from '../types';
import { saveStaff, terminateStaff, setStaffLogin, listStaff } from '../lib/staff';
import { getTodayString } from '../utils/formatters';

interface Props {
  staff?: StaffMember;
  mode: 'profile' | 'login' | 'fire' | 'delete';
  onClose: () => void;
  onSaved: (staff: StaffMember[]) => void;
}

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm';

export function StaffProfileModal({ staff, mode, onClose, onSaved }: Props) {
  const [profile, setProfile] = useState<StaffMember>(staff ?? {
    id: `staff-${crypto.randomUUID()}`, name: '', role: '', appRole: 'chef', phone: '', salaryType: 'monthly', baseSalary: 0, joinDate: getTodayString(), active: true,
  });
  const [email, setEmail] = useState(staff?.loginEmail || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [busy, setBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState('');
  const title = mode === 'profile' ? (staff ? 'Edit Staff Profile' : 'Create Staff Profile') : mode === 'login' ? (staff?.loginEmail ? 'Edit Staff Login' : 'Create Staff Login') : mode === 'fire' ? 'Fire Staff Member' : 'Delete Staff Profile';
  const loginFields = mode === 'login' || (mode === 'profile' && !staff && createLogin);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'profile' && profile.salaryType === 'hourly' && profile.hourlyWorkSchedule && !validWorkSchedule(profile.hourlyWorkSchedule)) throw new Error('Choose different valid start and end times for this staff member.');
      if (mode === 'profile' && !profileSaved) {
        const next = await saveStaff(profile);
        onSaved(next);
        setProfileSaved(true);
      }
      if (loginFields) {
        await setStaffLogin(profile.id, email, password, mode === 'login' && !!staff?.loginEmail);
        setPassword('');
        onSaved(await listStaff());
      }
      if (mode === 'fire' || mode === 'delete') onSaved(await terminateStaff(profile.id, date, reason, mode === 'delete'));
      onClose();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not save staff details.';
      setError(mode === 'profile' && loginFields ? `The profile may already be saved. ${message}` : message);
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="staff-profile-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <header className="mb-4 flex items-center justify-between gap-3"><h2 id="staff-profile-title" className="text-base font-semibold">{title}</h2><button type="button" disabled={busy} onClick={onClose} title="Close" aria-label="Close staff dialog" className="p-2"><X size={18} /></button></header>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'profile' && <fieldset disabled={busy || profileSaved} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium sm:col-span-2">Full Name<input required maxLength={200} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} className={inputClass} /></label>
          <label className="text-xs font-medium">Position<input required maxLength={200} list="staff-roles" value={profile.role} onChange={e => setProfile({ ...profile, role: e.target.value })} className={inputClass} /><datalist id="staff-roles"><option>Indian Curry Chef</option><option>Kebab Chef</option><option>Tandoor Chef</option><option>Assistant Cook</option><option>Service Staff</option><option>Cashier</option><option>Cleaner</option><option>Manager</option></datalist></label>
          <label className="text-xs font-medium">Phone<input type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className={inputClass} /></label>
          <label className="text-xs font-medium">Access Role<select value={profile.appRole ?? 'chef'} onChange={e => setProfile({ ...profile, appRole: e.target.value as StaffMember['appRole'] })} className={inputClass}><option value="chef">Chef</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          <label className="text-xs font-medium">Salary Basis<select value={profile.salaryType} onChange={e => setProfile({ ...profile, salaryType: e.target.value as StaffMember['salaryType'] })} className={inputClass}><option value="monthly">Monthly</option><option value="daily">Daily</option><option value="hourly">Hourly</option></select>{profile.salaryType==='hourly'&&<span className="mt-1 block text-xs text-slate-500">Paid for timed attendance within scheduled hours. Rate ÷ 3,600 per second.</span>}</label>
          <label className="text-xs font-medium">{profile.salaryType === 'hourly' ? 'Hourly Rate (BDT/hour)' : 'Base Salary (BDT)'}<NumericInput required type="number" min="0" max="10000000" step="any" value={profile.baseSalary} onChange={e => setProfile({ ...profile, baseSalary: Number(e.target.value) })} className={inputClass} /></label>
          {profile.salaryType==='hourly'&&<div className="col-span-2 space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profile.hourlyWorkSchedule} onChange={event=>setProfile({...profile,hourlyWorkSchedule:event.target.checked?{start:'11:00',end:'23:00'}:undefined})}/>Set individual working hours</label>{profile.hourlyWorkSchedule?<div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">Staff shift start<input required type="time" value={profile.hourlyWorkSchedule.start} onChange={event=>setProfile({...profile,hourlyWorkSchedule:{...profile.hourlyWorkSchedule!,start:event.target.value}})} className={inputClass}/></label><label className="text-xs font-medium">Staff shift end<input required type="time" value={profile.hourlyWorkSchedule.end} onChange={event=>setProfile({...profile,hourlyWorkSchedule:{...profile.hourlyWorkSchedule!,end:event.target.value}})} className={inputClass}/></label><p className="col-span-2 text-xs text-slate-500">Bangladesh time. Overnight shifts are supported. Attendance opens 10 minutes before this staff member’s start time. New check-ins use these hours; existing attendance keeps its saved shift.</p></div>:<p className="text-xs text-slate-500">Uses the restaurant’s office hours.</p>}</div>}
          <label className="text-xs font-medium">Start Date<input required type="date" value={profile.joinDate} onChange={e => setProfile({ ...profile, joinDate: e.target.value })} className={inputClass} /></label>
        </fieldset>}
        {mode === 'profile' && !staff && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createLogin} disabled={busy || profileSaved} onChange={e => setCreateLogin(e.target.checked)} />Create login account</label>}
        {loginFields && <fieldset disabled={busy} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <label className="block text-xs font-medium">Login Email<input required type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></label>
          <div><label htmlFor="staff-login-password" className="block text-xs font-medium">{staff?.loginEmail ? 'New Password (optional)' : 'Initial Password'}</label><div className="relative"><input id="staff-login-password" required={!staff?.loginEmail} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className={`${inputClass} pr-10`} /><button type="button" title={showPassword ? 'Hide password' : 'Show password'} aria-label={showPassword ? 'Hide staff password' : 'Show staff password'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
        </fieldset>}
        {(mode === 'fire' || mode === 'delete') && <>
          <p className="text-sm">{mode === 'delete' ? `${profile.name}'s profile will move to the archive. Salary, attendance and agreement records will be retained.` : `${profile.name} will be marked as fired and removed from active payroll.`} Staff portal access will be disabled immediately.</p>
          <label className="block text-xs font-medium">{mode === 'fire' ? 'Last Working Date' : 'Effective Date'}<input required type="date" min={profile.joinDate} max={getTodayString()} value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
          <label className="block text-xs font-medium">Reason<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} rows={3} /></label>
        </>}
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <footer className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Cancel</button><button disabled={busy} type="submit" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50 ${mode === 'fire' || mode === 'delete' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950'}`}>{mode === 'profile' ? <Save size={16} /> : mode === 'login' ? <KeyRound size={16} /> : mode === 'fire' ? <UserRoundMinus size={16} /> : <Trash2 size={16} />}{busy ? 'Saving...' : profileSaved && loginFields ? 'Retry Login Setup' : mode === 'fire' ? 'Confirm Firing' : mode === 'delete' ? 'Delete Profile' : 'Save'}</button></footer>
      </form>
    </section>
  </div>;
}
