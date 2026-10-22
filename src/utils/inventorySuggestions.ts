import type { InventoryItem } from '../types';
import { vendorBillDetails, type VendorLedgerEntry } from './vendorLedger';

const consonants: Record<string, string> = { 'ক':'k', 'খ':'kh', 'গ':'g', 'ঘ':'gh', 'ঙ':'ng', 'চ':'ch', 'ছ':'ch', 'জ':'j', 'ঝ':'jh', 'ঞ':'n', 'ট':'t', 'ঠ':'th', 'ড':'d', 'ঢ':'dh', 'ণ':'n', 'ত':'t', 'থ':'th', 'দ':'d', 'ধ':'dh', 'ন':'n', 'প':'p', 'ফ':'f', 'ব':'b', 'ভ':'bh', 'ম':'m', 'য':'j', 'র':'r', 'ল':'l', 'শ':'sh', 'ষ':'sh', 'স':'s', 'হ':'h', 'ড়':'r', 'ঢ়':'r', 'য়':'y', 'য়':'y', 'ৎ':'t' };
const vowels: Record<string, string> = { 'অ':'a', 'আ':'a', 'ই':'i', 'ঈ':'i', 'উ':'u', 'ঊ':'u', 'ঋ':'ri', 'এ':'e', 'ঐ':'oi', 'ও':'o', 'ঔ':'ou', 'া':'a', 'ি':'i', 'ী':'i', 'ু':'u', 'ূ':'u', 'ৃ':'ri', 'ে':'e', 'ৈ':'oi', 'ো':'o', 'ৌ':'ou', 'ং':'ng', 'ঃ':'h', 'ঁ':'' };
export function phoneticName(value: string) {
  const letters = [...value.normalize('NFC').toLowerCase()];
  let result = '';
  for (let index = 0; index < letters.length; index++) {
    const char = letters[index];
    if (consonants[char]) result += consonants[char] + (!letters[index + 1] || /\s/.test(letters[index + 1]) || letters[index + 1] === '্' || /[ািীুূৃেৈোৌ]/u.test(letters[index + 1] ?? '') ? '' : 'o');
    else result += vowels[char] ?? (char === '্' || char === '়' ? '' : char);
  }
  return result.replace(/[^a-z0-9]+/g, ' ').trim().replace(/sh/g, 's').replace(/ph/g, 'f').replace(/v/g, 'b').replace(/[ey]/g, 'i').replace(/([a-z])\1+/g, '$1');
}
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length];
}
export function normalizedDescription(value: string) {
  return value.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}
export function matchingInventoryNames(description: string, inventory: InventoryItem[]) {
  const key = (name: string) => normalizedDescription(name).replace(/[\s\p{P}]+/gu, '');
  const name = key(description);
  return name ? inventory.filter(item => key(item.name) === name || (item.banglaName && key(item.banglaName) === name)) : [];
}
function nameScore(query: string, name: string) {
  const raw = normalizedDescription(query).slice(0, 100);
  if (!raw) return 0;
  const text = normalizedDescription(name);
  if (text === raw) return 100;
  if (text.startsWith(raw)) return 95;
  if (text.includes(raw)) return 85;
  const phonetic = phoneticName(raw);
  const target = phoneticName(name);
  if (phonetic && target === phonetic) return 90;
  if (phonetic && target.includes(phonetic)) return 75;
  const skeleton = phonetic.replace(/[aeiou\s]/g, '');
  if (skeleton.length >= 2 && target.replace(/[aeiou\s]/g, '') === skeleton) return 70;
  if (phonetic.length >= 3 && distance(phonetic, target) <= Math.max(1, Math.floor(phonetic.length / 4))) return 60;
  return 0;
}
export function suggestInventory(query: string, inventory: InventoryItem[], bills: VendorLedgerEntry[] = []) {
  if (!query.trim()) return [];
  return inventory.map(item => {
    const names = [item.name, item.banglaName ?? '', ...bills.filter(bill => bill.inventoryItemId === item.id && bill.balanceAdjustment === undefined).map(bill => bill.description)];
    return { item, score: Math.max(...names.filter(Boolean).map(name => nameScore(query, name))) };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, 8).map(row => row.item);
}

// Saved bill/payment descriptions are the reusable catalog, including items not in inventory.
export function suggestVendorDescriptions(query: string, bills: VendorLedgerEntry[], inventory: InventoryItem[], vendorId: string) {
  if (!query.trim()) return [];
  const seen = new Set<string>();
  return [...bills].filter(bill => bill.balanceAdjustment === undefined && !bill.sourceExpenseId && bill.description.trim())
    .sort((a, b) => Number(b.vendorId === vendorId) - Number(a.vendorId === vendorId) || b.date.localeCompare(a.date))
    .filter(bill => {
      const key = normalizedDescription(bill.description);
      if (seen.has(key)) return false;
      seen.add(key);
      return !inventory.some(item => normalizedDescription(item.name) === key || (item.banglaName && normalizedDescription(item.banglaName) === key));
    }).map(bill => ({
      description: bill.description.trim(),
      unit: vendorBillDetails(bill)?.unit,
      inventoryItemId: inventory.some(item => item.id === bill.inventoryItemId) ? bill.inventoryItemId : undefined,
      score: nameScore(query, bill.description),
    })).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

export function inventoryUnitFactor(billUnit: string, stockUnit: string): number | null {
  if (billUnit === stockUnit || (billUnit === 'g' && stockUnit === 'gram')) return 1;
  if (billUnit === 'g' && stockUnit === 'kg') return 0.001;
  if (billUnit === 'kg' && stockUnit === 'gram') return 1000;
  if (billUnit === 'ml' && stockUnit === 'liter') return 0.001;
  if (billUnit === 'dozen' && stockUnit === 'pcs') return 12;
  if (billUnit === 'pair' && stockUnit === 'pcs') return 2;
  return null;
}
