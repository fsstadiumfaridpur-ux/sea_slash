import type { StaffAdvance } from '../types';

export function sameAdvance(a: StaffAdvance, b: StaffAdvance) {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
}
export function validateStaffAdvance(entry: StaffAdvance) {
  if (!entry || !entry.id || !entry.staffId || typeof entry.reason !== 'string' || !entry.reason.trim() || !Number.isFinite(entry.amount) || entry.amount <= 0 || typeof entry.repaid !== 'boolean') throw new Error('Choose a staff member and enter a reason and positive amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw new Error('Choose a valid advance date.');
  if (entry.paymentMode !== undefined && !['cash', 'bkash', 'bank', 'card'].includes(entry.paymentMode)) throw new Error('Choose a valid payment method.');
}

// Apply only the caller's changes, retaining advances added in other sessions.
export function mergeAdvanceChanges(previous: StaffAdvance[], next: StaffAdvance[], current: StaffAdvance[], isAdmin: boolean) {
  next.forEach(validateStaffAdvance);
  if (new Set(next.map(row => row.id)).size !== next.length) throw new Error('Duplicate advance IDs.');
  const changed = next.filter(row => !previous.some(old => old.id === row.id && sameAdvance(old, row)));
  const removed = previous.filter(old => !next.some(row => row.id === old.id));
  if (!isAdmin && (removed.length || changed.some(row => previous.some(old => old.id === row.id)) || changed.some(row => row.repaid))) throw new Error('Only administrators can edit salary advances or change repayment status.');
  for (const row of [...changed, ...removed]) {
    const old = previous.find(candidate => candidate.id === row.id);
    const live = current.find(candidate => candidate.id === row.id);
    if (old ? !live || !sameAdvance(old, live) : live !== undefined) throw new Error('This advance changed in another session. Reload before saving.');
  }
  return [...changed, ...current.filter(row => !changed.some(change => change.id === row.id) && !removed.some(change => change.id === row.id))];
}
