import React, { useEffect, useState } from 'react';
import { FilePlus2, Printer, Send, X, RefreshCw, Ban, CheckCheck } from 'lucide-react';
import type { StaffAgreement, StaffMember } from '../types';
import { acceptAgreement, listAgreements, publishAgreement, withdrawAgreement } from '../lib/staff';
import { generateStaffAgreement, printStaffDocument } from '../utils/staffPayroll';

export function StaffAgreements({ staff, restaurant, isAdmin }: { staff: StaffMember[]; restaurant: string; isAdmin: boolean }) {
  const [agreements, setAgreements] = useState<StaffAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(staff.find(s => s.active && !s.archivedAt)?.id || '');
  const [title, setTitle] = useState('Employment Agreement');
  const [terms, setTerms] = useState('');
  const [document, setDocument] = useState('');
  const [viewing, setViewing] = useState<StaffAgreement | null>(null);
  const [signedName, setSignedName] = useState('');
  const [consent, setConsent] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try { setAgreements(await listAgreements()); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load agreements.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await action(); setAgreements(await listAgreements()); setComposer(false); setViewing(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save agreement.'); }
    finally { setBusy(false); }
  };
  const generate = () => {
    const member = staff.find(s => s.id === selectedStaff);
    if (!member || !terms.trim()) { setError('Choose a staff member and enter the agreement terms.'); return; }
    setDocument(generateStaffAgreement(member, restaurant, terms));
    setError('');
  };

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">Staff Agreements</h3><div className="flex items-center gap-2"><button aria-label="Refresh agreements" title="Refresh agreements" disabled={loading || busy} onClick={refresh} className="p-2"><RefreshCw size={16} /></button>{isAdmin && <button onClick={() => { setComposer(true); setDocument(''); setTerms(''); setError(''); }} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"><FilePlus2 size={16} />New Agreement</button>}</div></header>
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading agreements...</p> : agreements.length === 0 ? <p className="py-6 text-sm text-slate-500">No agreements issued.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><tr><th className="p-3">Agreement</th>{isAdmin && <th className="p-3">Staff</th>}<th className="p-3">Status</th><th className="p-3">Accepted</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{agreements.map(a => <tr key={a.id} className="border-b border-slate-200 dark:border-slate-800"><td className="p-3"><button onClick={() => { setViewing(a); setSignedName(''); setConsent(false); }} className="text-left font-medium underline decoration-slate-300 underline-offset-4">{a.title}</button><div className="text-xs text-slate-500">Version {a.version}</div></td>{isAdmin && <td className="p-3">{staff.find(s => s.id === a.staff_id)?.name || 'Archived staff'}</td>}<td className="p-3 capitalize">{a.status}</td><td className="p-3 text-xs">{a.accepted_at ? <>{a.accepted_name}<br />{new Date(a.accepted_at).toLocaleString()}</> : '-'}</td><td className="p-3"><div className="flex justify-end gap-2"><button title="Print agreement" aria-label={`Print ${a.title} version ${a.version}`} onClick={() => { try { printStaffDocument(a.title, `${a.document}${a.accepted_at ? `\n\nAccepted by: ${a.accepted_name}\nAccepted at: ${a.accepted_at}\nAccount: ${a.accepted_by}` : ''}`); } catch (e) { setError((e as Error).message); } }} className="p-2"><Printer size={16} /></button>{isAdmin && a.status === 'issued' && <button disabled={busy} title="Withdraw agreement" aria-label={`Withdraw ${a.title} version ${a.version}`} onClick={() => { if (window.confirm('Withdraw this pending agreement?')) perform(() => withdrawAgreement(a.id)); }} className="p-2 text-rose-600"><Ban size={16} /></button>}</div></td></tr>)}</tbody></table></div>}
    {(composer || viewing) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="agreement-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"><header className="mb-4 flex items-center justify-between"><h2 id="agreement-title" className="text-base font-semibold">{composer ? 'Custom Staff Agreement' : viewing?.title}</h2><button disabled={busy} aria-label="Close agreement" title="Close" onClick={() => { setComposer(false); setViewing(null); }} className="p-2"><X size={18} /></button></header>
      {composer ? <form onSubmit={e => { e.preventDefault(); perform(() => publishAgreement(selectedStaff, title, document)); }} className="space-y-4">
        <label className="block text-xs font-medium">Staff Member<select required value={selectedStaff} disabled={busy} onChange={e => { setSelectedStaff(e.target.value); setDocument(''); }} className="staff-input"><option value="">Choose staff</option>{staff.filter(s => s.active && !s.archivedAt).map(s => <option key={s.id} value={s.id}>{s.name} / {s.role}</option>)}</select></label>
        <label className="block text-xs font-medium">Agreement Title<input required disabled={busy} value={title} onChange={e => setTitle(e.target.value)} className="staff-input" /></label>
        <label className="block text-xs font-medium">Custom Terms<textarea value={terms} disabled={busy} onChange={e => { setTerms(e.target.value); setDocument(''); }} rows={5} className="staff-input" /></label>
        <button type="button" disabled={busy} onClick={generate} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><FilePlus2 size={16} />Generate Document</button>
        {document && <label className="block text-xs font-medium">Agreement Document<textarea required disabled={busy} maxLength={50000} rows={12} value={document} onChange={e => setDocument(e.target.value)} className="staff-input" /></label>}
        <button type="submit" disabled={busy || !document.trim()} className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><Send size={16} />{busy ? 'Issuing...' : 'Issue Agreement'}</button>
      </form> : viewing && <div className="space-y-4"><pre className="whitespace-pre-wrap break-words text-sm font-sans leading-relaxed">{viewing.document}</pre>{!isAdmin && viewing.status === 'issued' && <form onSubmit={e => { e.preventDefault(); if (consent) perform(() => acceptAgreement(viewing.id, signedName)); }} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700"><label className="block text-xs font-medium">Your Full Name<input required maxLength={200} disabled={busy} value={signedName} onChange={e => setSignedName(e.target.value)} className="staff-input" /></label><label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} className="mt-1" />I have read and accept this agreement.</label><button disabled={busy || !consent || !signedName.trim()} type="submit" className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCheck size={16} />{busy ? 'Accepting...' : 'Accept Agreement'}</button></form>}{viewing.accepted_at && <p className="text-xs text-emerald-700 dark:text-emerald-400">Accepted by {viewing.accepted_name} on {new Date(viewing.accepted_at).toLocaleString()}.</p>}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </section></div>}
  </section>;
}
