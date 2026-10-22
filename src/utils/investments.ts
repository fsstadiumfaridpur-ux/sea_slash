export interface InvestmentEntry {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  notes: string;
}

export const investmentCategories = ['Equipment', 'Kitchen setup', 'Furniture & decor', 'Renovation', 'Rent deposit', 'Licences & permits', 'Opening stock', 'Marketing', 'Other'];

export function validateInvestment(entry: InvestmentEntry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) throw new Error('Invalid investment record.');
  if (typeof entry.description !== 'string' || !entry.description.trim()) throw new Error('Enter an investment description.');
  if (typeof entry.category !== 'string' || !entry.category.trim()) throw new Error('Choose a category.');
  if (typeof entry.notes !== 'string') throw new Error('Invalid notes.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw new Error('Enter a valid date.');
  if (!Number.isFinite(entry.amount) || entry.amount <= 0 || Math.round(entry.amount * 100) / 100 !== entry.amount) throw new Error('Enter an amount greater than zero with at most two decimal places.');
}

export function investmentTotals(entries: InvestmentEntry[]) {
  const categories: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    validateInvestment(entry);
    total = Math.round((total + entry.amount) * 100) / 100;
    categories[entry.category] = Math.round(((categories[entry.category] ?? 0) + entry.amount) * 100) / 100;
  }
  return { total, categories };
}
