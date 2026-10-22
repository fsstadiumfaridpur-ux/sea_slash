import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { InventoryCategoryDefinition, InventoryItem } from '../types';
import { categoryNameError } from '../utils/inventoryCategories';

interface Props {
  categories: InventoryCategoryDefinition[];
  inventory: InventoryItem[];
  onAdd: (category: InventoryCategoryDefinition) => void;
  onDelete: (id: string, replacementId: string) => void;
  onClose: () => void;
}

const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm';

export function InventoryCategoryManager({ categories, inventory, onAdd, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState('uncategorized');
  const deleting = categories.find(category => category.id === deletingId);
  const affectedCount = inventory.filter(item => item.category === deletingId).length;

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = categoryNameError(name, categories);
    if (validationError) { setError(validationError); return; }
    onAdd({ id: crypto.randomUUID(), name: name.trim() });
    setName('');
    setError(null);
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="category-manager-title" className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
        <h3 id="category-manager-title" className="text-base font-semibold">{deleting ? 'Delete Category' : 'Inventory Categories'}</h3>
        <button onClick={onClose} title="Close categories" aria-label="Close categories" className="p-2"><X size={18} /></button>
      </div>
      {deleting ? <div className="space-y-4 overflow-y-auto p-5">
        <p className="text-sm">Delete <strong>{deleting.name}</strong>?</p>
        <p className="text-sm text-slate-500">{affectedCount ? `${affectedCount} ingredient(s) will move to the category selected below.` : 'This category has no ingredients.'} Ingredients and purchase history will be kept.</p>
        {affectedCount > 0 && <label className="block text-xs font-medium">Move Ingredients To
          <select aria-label="Move ingredients to" value={replacementId} onChange={event => setReplacementId(event.target.value)} className={`${inputClass} mt-2`}>
            {categories.filter(category => category.id !== deletingId).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>}
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeletingId(null)} className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs">Cancel</button>
          <button onClick={() => { onDelete(deleting.id, replacementId); setDeletingId(null); }} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white"><Trash2 size={16} /> Delete Category</button>
        </div>
      </div> : <>
        <form onSubmit={add} className="space-y-2 border-b border-slate-200 dark:border-slate-800 p-5">
          <label htmlFor="custom-category-name" className="block text-xs font-medium">Custom Category Name</label>
          <div className="flex items-center gap-2">
            <input id="custom-category-name" maxLength={80} value={name} onChange={event => { setName(event.target.value); setError(null); }} className={inputClass} placeholder="e.g. Kebab Marinades" />
            <button type="submit" title="Add category" aria-label="Add category" className="shrink-0 rounded-md bg-amber-500 p-2.5 text-slate-950"><Plus size={18} /></button>
          </div>
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
        </form>
        <div className="overflow-y-auto px-5 py-2">
          {categories.map(category => <div key={category.id} className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 py-3 last:border-0">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{category.name}</p><p className="text-xs text-slate-500">{inventory.filter(item => item.category === category.id).length} ingredients</p></div>
            {category.id !== 'uncategorized' && <button title={`Delete ${category.name}`} aria-label={`Delete category ${category.name}`} onClick={() => { setDeletingId(category.id); setReplacementId('uncategorized'); }} className="shrink-0 rounded-md p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 size={16} /></button>}
          </div>)}
        </div>
      </>}
    </section>
  </div>;
}
