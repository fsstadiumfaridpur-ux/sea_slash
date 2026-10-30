import {useRememberedViewState} from '../lib/useRememberedViewState';
import { roundMoney } from '../utils/money';
import { NumericInput } from './NumericInput';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  ChartNoAxesCombined,
  PlusCircle,
  Search,
  ShoppingCart,
  TrendingDown,
  Trash2,
  Edit2,
  RefreshCw,
  Clock,
  CheckCircle,
  Tags,
  LockKeyhole,
} from 'lucide-react';
import {
  Camera,
  Image as ImageIcon,
  Upload,
  X,
  Eye,
} from 'lucide-react';
import { InventoryItem, InventoryCategory, InventoryCategoryDefinition, RecipeItem, PurchaseRecord, WasteRecord, BazaarPhoto, ExpenseCategory } from '../types';
import { vendorBillUnits, type VendorLedgerEntry } from '../utils/vendorLedger';
import { latestVendorPurchases } from '../utils/latestVendorPurchases';
import { purchaseExpenseCategory } from '../utils/linkedExpenses';
import { formatBDT, formatNumber, getTodayString } from '../utils/formatters';
import { InventoryCategoryManager } from './InventoryCategoryManager';
import { ItemPriceHistory } from './ItemPriceHistory';

interface InventoryViewProps {
  onOpenCostOverview: () => void;
  isAdmin: boolean;
  onAdminLogin: () => void;
  onDeleteIngredient: (id: string) => Promise<void>;
  onDeleteWaste: (id: string, restoreStock: boolean) => Promise<void>;
  categories: InventoryCategoryDefinition[];
  recipes: RecipeItem[];
  onAddCategory: (category: InventoryCategoryDefinition) => void;
  onDeleteCategory: (id: string, replacementId: string) => void;
  inventory: InventoryItem[];
  vendorLedger: VendorLedgerEntry[];
  vendors: {id:string;name:string}[];
  purchases: PurchaseRecord[];
  wastes: WasteRecord[];
  bazaarPhotos: BazaarPhoto[];
  stallNumber?: string;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onAddPurchase: (purchase: PurchaseRecord, updatedItemStock: number) => void;
  onAddWaste: (waste: WasteRecord, updatedItemStock: number) => void;
  onAddBazaarPhoto: (photo: BazaarPhoto) => void;
  onDeleteBazaarPhoto: (id: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onOpenCostOverview,
  isAdmin,
  onAdminLogin,
  onDeleteIngredient,
  onDeleteWaste,
  categories,
  recipes,
  onAddCategory,
  onDeleteCategory,
  inventory,
  vendorLedger,
  vendors,
  purchases,
  wastes,
  bazaarPhotos,
  stallNumber = 'Shop #06',
  onUpdateInventory,
  onAddPurchase,
  onAddWaste,
  onAddBazaarPhoto,
  onDeleteBazaarPhoto,
}) => {
  const [activeTab, setActiveTab] = useRememberedViewState<'stock' | 'purchases' | 'waste' | 'photos'>('inventory.tab','stock',value=>['stock','purchases','waste','photos'].includes(String(value)));
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const latestPurchases=useMemo(()=>latestVendorPurchases(vendorLedger,vendors),[vendorLedger,vendors]);

  const [priceHistoryItemId, setPriceHistoryItemId] = useState<string | null>(null);
  const priceHistoryItem = inventory.find(item => item.id === priceHistoryItemId);

  // Modals state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [wasteToDelete, setWasteToDelete] = useState<WasteRecord | null>(null);
  const [restoreWasteStock, setRestoreWasteStock] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      setIsCategoryManagerOpen(false);
      setItemToDelete(null);
      setWasteToDelete(null);
    }
  }, [isAdmin]);

  // Photo gallery state
  const [isUploadPhotoOpen, setIsUploadPhotoOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<BazaarPhoto | null>(null);
  const [newPhotoTitle, setNewPhotoTitle] = useState('');
  const [newPhotoCategory, setNewPhotoCategory] = useState('Fresh Meat & Poultry');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [newPhotoImageData, setNewPhotoImageData] = useState('');

  // New Purchase Form State
  const [purchaseItemId, setPurchaseItemId] = useState<string>(inventory[0]?.id || '');
  const [purchaseQty, setPurchaseQty] = useState<number>(0);
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState<number>(0);
  const [purchaseSupplier, setPurchaseSupplier] = useState<string>('');
  const [purchaseExpenseCategoryId, setPurchaseExpenseCategoryId] = useState<ExpenseCategory>('ingredients');
  const [purchasePayMode, setPurchasePayMode] = useState<'cash' | 'bkash' | 'credit'>('cash');
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');

  // Waste Form State
  const [wasteItemId, setWasteItemId] = useState<string>(inventory[0]?.id || '');
  const [wasteQty, setWasteQty] = useState<number>(1);
  const [wasteReason, setWasteReason] = useState<'spoilage' | 'burnt_overcooked' | 'end_of_day_unsold' | 'quality_rejection'>('spoilage');

  // New Item State
  const [newItemName, setNewItemName] = useState('');
  const [newItemBangla, setNewItemBangla] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<InventoryCategory>(categories[0]?.id ?? 'uncategorized');
  const [newItemStock, setNewItemStock] = useState<number>(10);
  const [newItemUnit, setNewItemUnit] = useState<InventoryItem['unit']>('kg');
  const [newItemThreshold, setNewItemThreshold] = useState<number>(0);
  const [newItemUnitCost, setNewItemUnitCost] = useState<number>(200);

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.banglaName && item.banglaName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [inventory, categoryFilter, searchQuery]);

  // Aggregate stats
  const totalStockValue = useMemo(() => {
    return inventory.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0);
  }, [inventory]);

  const totalWasteLoss = useMemo(() => {
    return wastes.reduce((sum, w) => sum + w.estimatedLoss, 0);
  }, [wastes]);

  const totalPurchaseThisMonth = useMemo(() => {
    return purchases.reduce((sum, p) => sum + p.totalCost, 0);
  }, [purchases]);

  // Quick adjust stock
  const handleAdjustStock = (itemId: string, delta: number) => {
    const updated = inventory.map(item => {
      if (item.id === itemId) {
        const nextStock = Math.max(0, Number((item.currentStock + delta).toFixed(2)));
        return { ...item, currentStock: nextStock, lastUpdated: getTodayString() };
      }
      return item;
    });
    onUpdateInventory(updated);
  };

  // Open restock for specific item
  const openRestockForItem = (item: InventoryItem) => {
    setPurchaseItemId(item.id);
    setPurchaseExpenseCategoryId(purchaseExpenseCategory(item));
    setPurchaseUnitPrice(item.unitCost);
    setPurchaseQty(0);
    setIsPurchaseModalOpen(true);
  };

  // Submit Purchase
  const handlePurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const item = inventory.find(i => i.id === purchaseItemId);
    if (!item || !Number.isFinite(purchaseQty) || !Number.isFinite(purchaseUnitPrice) || purchaseQty <= 0 || purchaseUnitPrice <= 0) return;

    const totalCost = roundMoney(purchaseQty * purchaseUnitPrice);
    const newPurchase: PurchaseRecord = {
      id: `pur-${crypto.randomUUID()}`,
      date: getTodayString(),
      itemId: item.id,
      itemName: item.name,
      quantity: purchaseQty,
      unit: item.unit,
      unitPrice: purchaseUnitPrice,
      totalCost,
      supplier: purchaseSupplier,
      paymentMode: purchasePayMode,
      notes: purchaseNotes,
      expenseCategory: purchaseExpenseCategoryId,
    };

    const newStock = Number((item.currentStock + purchaseQty).toFixed(6));
    onAddPurchase(newPurchase, newStock);
    setIsPurchaseModalOpen(false);
    setPurchaseNotes('');
  };

  // Submit Waste
  const handleWasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const item = inventory.find(i => i.id === wasteItemId);
    if (!item) return;

    const estimatedLoss = roundMoney(wasteQty * item.unitCost);
    const newWaste: WasteRecord = {
      id: `wst-${Date.now()}`,
      date: getTodayString(),
      itemId: item.id,
      itemName: item.name,
      quantity: wasteQty,
      unit: item.unit,
      estimatedLoss,
      reason: wasteReason,
    };

    const newStock = Math.max(0, Number((item.currentStock - wasteQty).toFixed(2)));
    onAddWaste(newWaste, newStock);
    setIsWasteModalOpen(false);
  };

  // Add Item Submit
  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    if (!categories.some(category => category.id === newItemCategory)) return;

    if (editingItem) {
      const updated = inventory.map(item => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            name: newItemName,
            banglaName: newItemBangla,
            category: newItemCategory,
            currentStock: newItemStock,
            unit: newItemUnit,
            minThreshold: newItemThreshold,
            unitCost: newItemUnitCost,
            lastUpdated: getTodayString(),
          };
        }
        return item;
      });
      onUpdateInventory(updated);
      setEditingItem(null);
    } else {
      const newItem: InventoryItem = {
        id: `inv-${Date.now()}`,
        name: newItemName,
        banglaName: newItemBangla,
        category: newItemCategory,
        currentStock: newItemStock,
        unit: newItemUnit,
        minThreshold: newItemThreshold,
        unitCost: newItemUnitCost,
        lastUpdated: getTodayString(),
      };
      onUpdateInventory([...inventory, newItem]);
    }

    setIsAddItemModalOpen(false);
    setNewItemName('');
    setNewItemBangla('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Raw Inventory & Bazaar Purchases
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Track ingredient quantities, unit prices, and regular bazaar purchases.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onOpenCostOverview} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"><ChartNoAxesCombined className="w-3.5 h-3.5"/>Overall Costs & Alerts</button>
          <button disabled={!inventory.length} onClick={() => setPriceHistoryItemId(inventory[0]?.id ?? null)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg disabled:opacity-50">
            <ChartNoAxesCombined className="w-3.5 h-3.5" /> Price History
          </button>
          <button onClick={() => isAdmin ? setIsCategoryManagerOpen(true) : onAdminLogin()} title={isAdmin ? 'Manage categories' : 'Admin login required'} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            {isAdmin ? <Tags className="w-3.5 h-3.5" /> : <LockKeyhole className="w-3.5 h-3.5" />}
            <span>Manage Categories</span>
          </button>
          <button
            disabled={!inventory.length}
            onClick={() => {
              if (inventory.length > 0) {
                setPurchaseItemId(inventory[0].id);
                setPurchaseExpenseCategoryId(purchaseExpenseCategory(inventory[0]));
                setPurchaseUnitPrice(inventory[0].unitCost);
              }
              setIsPurchaseModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Record Bazaar Restock</span>
          </button>

          <button
            disabled={!inventory.length}
            onClick={() => setIsWasteModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <TrendingDown className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
            <span>Log Spoilage / Waste</span>
          </button>

          <button
            onClick={() => {
              setEditingItem(null);
              setNewItemName('');
              setNewItemBangla('');
              setNewItemCategory(categories[0]?.id ?? 'uncategorized');
              setNewItemStock(10);
              setNewItemUnitCost(200);
              setIsAddItemModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>Add New Item</span>
          </button>

          <button
            onClick={() => {
              setNewPhotoTitle('');
              setNewPhotoCaption('');
              setNewPhotoImageData('');
              setIsUploadPhotoOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Add Bazaar / Kitchen Photo</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Total Inventory Value</span>
          <span className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1 block tabular-nums">
            {formatBDT(totalStockValue)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {inventory.length} active ingredients & supplies
          </span>
        </div>

        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-medium">Bazaar Spend Logged</span>
          <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1 block tabular-nums">
            {formatBDT(totalPurchaseThisMonth)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {purchases.length} restock transactions
          </span>
        </div>

        <div className="p-3.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">Spoilage & Waste Loss</span>
          <span className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400 mt-1 block tabular-nums">
            {formatBDT(totalWasteLoss)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {wastes.length} logged waste events
          </span>
        </div>
      </div>

      {/* Sub Tabs: Stock vs Purchases vs Waste */}
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <select aria-label="Inventory view" value={activeTab} onChange={event => setActiveTab(event.target.value as typeof activeTab)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:hidden dark:border-slate-700 dark:bg-slate-900">
          <option value="stock">Raw Stock Ledger ({inventory.length})</option>
          <option value="purchases">Bazaar Restock History ({purchases.length})</option>
          <option value="waste">Waste & Spoilage Log ({wastes.length})</option>
          <option value="photos">Bazaar & Kitchen Photos ({bazaarPhotos.length})</option>
        </select>
        <div className="hidden min-w-0 sm:flex overflow-x-auto space-x-1 text-xs">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'stock'
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Raw Stock Ledger ({inventory.length})
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Bazaar Restock History ({purchases.length})
          </button>
          <button
            onClick={() => setActiveTab('waste')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'waste'
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Waste & Spoilage Log ({wastes.length})
          </button>
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'photos'
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>Bazaar & Kitchen Photos ({bazaarPhotos.length})</span>
          </button>
        </div>

        {activeTab === 'stock' && (
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <div className="relative w-full min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filter ingredients..."
                aria-label="Filter ingredients"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* VIEW: STOCK LEDGER */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            {[{ id: 'all', name: 'All Items' }, ...categories].map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Stock Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-medium">
                  <th className="py-3 px-3.5">Ingredient / Material</th>
                  <th className="py-3 px-3.5">Category</th>
                  <th className="py-3 px-3.5 text-right">Current Stock</th>
                  <th className="py-3 px-3.5 text-right">Unit Price</th>
                  <th className="py-3 px-3.5 text-right">Stock Valuation</th>
                  <th className="py-3 px-3.5">Latest Vendor Purchase</th>
                  <th className="py-3 px-3.5 text-center">Quick Adjust</th>
                  <th className="py-3 px-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {!filteredInventory.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No ingredients in this selection.</td></tr>}
                {filteredInventory.map(item => {
                  const itemVal = item.currentStock * item.unitCost;
                  const latest=latestPurchases.get(item.id);
                  return (
                    <tr key={item.id} className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                        {item.banglaName && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-400">{item.banglaName}</div>
                        )}
                      </td>

                      <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400 capitalize">
                        {categories.find(category => category.id === item.category)?.name ?? item.category}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <span className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                          {item.currentStock} {item.unit}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatBDT(item.unitCost)} / {item.unit}
                      </td>

                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatBDT(itemVal)}
                      </td>

                      <td className="min-w-48 py-3 px-3.5">
                        {latest ? <div className="space-y-1"><p className="font-semibold text-slate-900 dark:text-white">{latest.vendorName}</p><p className="font-mono text-[11px] text-slate-500">{latest.date}</p><p className="text-slate-700 dark:text-slate-300">{latest.quantity !== undefined && latest.unit ? <><span className="font-mono">{formatNumber(latest.quantity)} {latest.unit}</span> · {formatBDT(latest.unitPrice ?? 0)}/{latest.unit}</> : 'Quantity not recorded'}</p><p className="text-[11px] text-slate-500">Bill total: {formatBDT(latest.total)}</p></div> : <span className="text-slate-500">No linked vendor purchase</span>}
                      </td>

                      <td className="py-3 px-3.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
                          <button
                            onClick={() => handleAdjustStock(item.id, -1)}
                            title="Decrease 1 unit"
                            className="px-1.5 py-0.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 font-mono font-bold"
                          >
                            -1
                          </button>
                          <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 px-1">
                            {item.currentStock}
                          </span>
                          <button
                            onClick={() => handleAdjustStock(item.id, 1)}
                            title="Increase 1 unit"
                            className="px-1.5 py-0.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 font-mono font-bold"
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setPriceHistoryItemId(item.id)} title="Price History" aria-label={`Price history for ${item.name}`} className="p-1 text-amber-700 dark:text-amber-400 rounded hover:bg-slate-200 dark:hover:bg-slate-800">
                            <ChartNoAxesCombined className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openRestockForItem(item)}
                            title="Bazaar Restock"
                            className="p-1 text-amber-700 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setNewItemName(item.name);
                              setNewItemBangla(item.banglaName || '');
                              setNewItemCategory(item.category);
                              setNewItemStock(item.currentStock);
                              setNewItemUnit(item.unit);
                              setNewItemThreshold(item.minThreshold);
                              setNewItemUnitCost(item.unitCost);
                              setIsAddItemModalOpen(true);
                            }}
                            title="Edit Item"
                            className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && <button onClick={() => { setItemToDelete(item); setDeleteError(''); }} title={`Delete ${item.name}`} aria-label={`Delete ingredient ${item.name}`} className="p-1 text-rose-600 dark:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-950 transition cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: BAZAAR PURCHASES */}
      {activeTab === 'purchases' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-medium">
                <th className="py-3 px-3.5">Purchase Date</th>
                <th className="py-3 px-3.5">Ingredient</th>
                <th className="py-3 px-3.5 text-right">Quantity</th>
                <th className="py-3 px-3.5 text-right">Rate / Unit</th>
                <th className="py-3 px-3.5 text-right">Total Cost</th>
                <th className="py-3 px-3.5">Supplier / Bazar</th>
                <th className="py-3 px-3.5">Payment</th>
                <th className="py-3 px-3.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {purchases.map(p => (
                <tr key={p.id} className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3.5 font-mono text-slate-900 dark:text-white">{p.date}</td>
                  <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">{p.itemName}</td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {p.quantity} {p.unit}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatBDT(p.unitPrice)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatBDT(p.totalCost)}
                  </td>
                  <td className="py-3 px-3.5 text-slate-700 dark:text-slate-300">{p.supplier}</td>
                  <td className="py-3 px-3.5 uppercase font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {p.paymentMode}
                  </td>
                  <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400 text-[11px]">{p.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW: SPOILAGE & WASTE */}
      {activeTab === 'waste' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-medium">
                <th className="py-3 px-3.5">Date</th>
                <th className="py-3 px-3.5">Discarded Item</th>
                <th className="py-3 px-3.5 text-right">Lost Quantity</th>
                <th className="py-3 px-3.5 text-right">Financial Loss</th>
                <th className="py-3 px-3.5">Reason</th>
                {isAdmin && <th className="py-3 px-3.5 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {!wastes.length && <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-slate-500">No waste or spoilage records.</td></tr>}
              {wastes.map(w => (
                <tr key={w.id} className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3.5 font-mono text-slate-900 dark:text-white">{w.date}</td>
                  <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">{w.itemName}</td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums text-rose-700 dark:text-rose-300">
                    {w.quantity} {w.unit}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold tabular-nums text-rose-700 dark:text-rose-400">
                    -{formatBDT(w.estimatedLoss)}
                  </td>
                  <td className="py-3 px-3.5 capitalize text-slate-600 dark:text-slate-400">
                    {w.reason.replace('_', ' ')}
                  </td>
                  {isAdmin && <td className="py-3 px-3.5 text-center"><button onClick={() => { setWasteToDelete(w); setRestoreWasteStock(false); setDeleteError(''); }} title="Delete waste record" aria-label={`Delete waste record ${w.id}`} className="rounded p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 size={16} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW: BAZAAR & INVENTORY PHOTOS */}
      {activeTab === 'photos' && (
        <div className="space-y-5">
          <div className="p-4 bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-800 font-bold">
                  {stallNumber}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Morning Bazaar & Kitchen Inventory Photo Archive
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Visual proof of raw meat cuts, basmati rice sacks, shahi spices, and kitchen preparation at Chef's Canvas.
              </p>
            </div>

            <button
              onClick={() => {
                setNewPhotoTitle('');
                setNewPhotoCaption('');
                setNewPhotoImageData('');
                setIsUploadPhotoOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Fresh Bazaar Photo</span>
            </button>
          </div>

          {/* Photo Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Add New Card */}
            <div
              onClick={() => {
                setNewPhotoTitle('');
                setNewPhotoCaption('');
                setNewPhotoImageData('');
                setIsUploadPhotoOpen(true);
              }}
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 bg-slate-50/40 dark:bg-slate-950/40 hover:bg-white/40 dark:hover:bg-slate-900/40 transition cursor-pointer min-h-[220px]"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white">Upload New Bazaar Photo</span>
              <span className="text-[11px] text-slate-500 max-w-xs">
                Snap or upload photos of meat delivery, rice sacks, bazaar vouchers, or kitchen prep
              </span>
            </div>

            {/* Photo Cards */}
            {bazaarPhotos.map(photo => (
              <div
                key={photo.id}
                className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition group"
              >
                <div
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-video w-full bg-slate-50 dark:bg-slate-950 overflow-hidden cursor-pointer"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end justify-between p-3">
                    <span className="text-xs text-white flex items-center gap-1 font-medium">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Click to enlarge</span>
                    </span>
                  </div>
                </div>

                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">{photo.category}</span>
                      <span className="font-mono">{photo.date}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{photo.title}</h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">{photo.caption}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-850 flex items-center justify-between">
                    <button
                      onClick={() => setSelectedPhoto(photo)}
                      className="text-[11px] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                      <span>View Full Size</span>
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('Delete this photo from archive?')) {
                          onDeleteBazaarPhoto(photo.id);
                        }
                      }}
                      title="Delete photo"
                      className="p-1 text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: FULLSIZE PHOTO VIEWER */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
              <div>
                <span className="text-[11px] text-amber-700 dark:text-amber-400 font-mono block">{selectedPhoto.category} · {selectedPhoto.date}</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedPhoto.title}</h3>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black max-h-[65vh] flex items-center justify-center overflow-hidden">
              <img
                src={selectedPhoto.imageUrl}
                alt={selectedPhoto.title}
                referrerPolicy="no-referrer"
                className="w-full h-auto max-h-[65vh] object-contain"
              />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-700 dark:text-slate-300 max-w-xl">{selectedPhoto.caption}</p>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD BAZAAR PHOTO */}
      {isUploadPhotoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Upload inventory photo" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>Upload Bazaar or Inventory Photo ({stallNumber})</span>
              </h3>
              <button aria-label="Close photo upload" title="Close photo upload" onClick={() => setIsUploadPhotoOpen(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (!newPhotoImageData && !newPhotoTitle) return;
                const photo: BazaarPhoto = {
                  id: `photo-${Date.now()}`,
                  title: newPhotoTitle || 'Bazaar Restock',
                  category: newPhotoCategory,
                  date: getTodayString(),
                  imageUrl: newPhotoImageData || 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1000&q=80',
                  caption: newPhotoCaption || `Daily inventory capture for ${stallNumber}`,
                };
                onAddBazaarPhoto(photo);
                setIsUploadPhotoOpen(false);
                setActiveTab('photos');
              }}
              className="p-6 space-y-4"
            >
              {/* Photo Input Area */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Image File or Photo
                </label>
                <div className="border border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-950 space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setNewPhotoImageData(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                  />

                  {newPhotoImageData && (
                    <div className="relative aspect-video w-full rounded overflow-hidden bg-black border border-slate-200 dark:border-slate-800">
                      <img
                        src={newPhotoImageData}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500">
                    Or paste direct image URL below:
                  </div>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newPhotoImageData.startsWith('data:') ? '' : newPhotoImageData}
                    onChange={e => setNewPhotoImageData(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Photo Title
                </label>
                <input
                  type="text"
                  required
                  value={newPhotoTitle}
                  onChange={e => setNewPhotoTitle(e.target.value)}
                  placeholder="e.g. Morning Khasi Meat Delivery at Faridpur Bazar"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={newPhotoCategory}
                  onChange={e => setNewPhotoCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Fresh Meat & Poultry">Fresh Meat & Poultry</option>
                  <option value="Rice & Grains">Rice & Grains (Basmati/Chinigura)</option>
                  <option value="Spices & Zafran">Spices, Saffron & Masala</option>
                  <option value="Vegetables & Produce">Vegetables & Produce</option>
                  <option value="Dairy & Pure Ghee">Dairy, Tok Doi & Pure Ghee</option>
                  <option value="Food Court Kitchen">Food Court Kitchen & Live Counter</option>
                  <option value="Packaging & Supplies">Packaging & Parcel Supplies</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Caption / Supplier Notes
                </label>
                <textarea
                  rows={2}
                  value={newPhotoCaption}
                  onChange={e => setNewPhotoCaption(e.target.value)}
                  placeholder="e.g. 20kg fresh mutton received from wholesale supplier, excellent marbling."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUploadPhotoOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
                >
                  Save Photo to Archive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD BAZAAR PURCHASE */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Record restock purchase" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>Log Bazaar Restock Purchase</span>
              </h3>
              <button
                onClick={() => setIsPurchaseModalOpen(false)}
                aria-label="Close restock purchase"
                title="Close restock purchase"
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="p-6 space-y-4">
              <label className="block text-xs font-medium">Monthly Expense Category
                <select aria-label="Purchase expense category" value={purchaseExpenseCategoryId} onChange={e => setPurchaseExpenseCategoryId(e.target.value as ExpenseCategory)} className="staff-input">
                  <option value="ingredients">Ingredients</option><option value="packaging">Packaging</option><option value="gas_utilities">LPG / Utilities</option><option value="ice_beverage">Ice / Beverages</option><option value="transport">Bazaar Transport / Van</option><option value="maintenance">Maintenance</option><option value="other">Other Expenses</option>
                </select>
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Ingredient / Item
                </label>
                <select
                  value={purchaseItemId}
                  onChange={e => {
                    setPurchaseItemId(e.target.value);
                    const selected = inventory.find(i => i.id === e.target.value);
                    if (selected) {
                      setPurchaseUnitPrice(selected.unitCost);
                      setPurchaseExpenseCategoryId(purchaseExpenseCategory(selected));
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                >
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (Current: {item.currentStock} {item.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Purchased Quantity
                  </label>
                  <NumericInput
                    type="number"
                    min="0.000001"
                    step="any"
                    value={purchaseQty}
                    onChange={e => setPurchaseQty(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Rate per Unit (৳)
                  </label>
                  <NumericInput
                    type="number"
                    min="0.01"
                    value={purchaseUnitPrice}
                    onChange={e => setPurchaseUnitPrice(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Total Purchase Value:</span>
                <span className="text-base font-bold font-mono text-amber-700 dark:text-amber-400">
                  {formatBDT(purchaseQty * purchaseUnitPrice)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Supplier / Market
                  </label>
                  <input
                    type="text"
                    value={purchaseSupplier}
                    onChange={e => setPurchaseSupplier(e.target.value)}
                    placeholder="e.g. Karwan Bazar, Kaptan Bazar"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={purchasePayMode}
                    onChange={e => setPurchasePayMode(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="cash">Cash Payment</option>
                    <option value="bkash">bKash</option>
                    <option value="credit">Supplier Due (Khata)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={purchaseNotes}
                  onChange={e => setPurchaseNotes(e.target.value)}
                  placeholder="e.g. Fresh Friday supply, prime grade"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 rounded-lg"
                >
                  Add to Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG WASTE */}
      {isWasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Record spoilage" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                <span>Log Spoilage / Wastage</span>
              </h3>
              <button
                onClick={() => setIsWasteModalOpen(false)}
                aria-label="Close spoilage entry"
                title="Close spoilage entry"
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleWasteSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Item to Discard
                </label>
                <select
                  value={wasteItemId}
                  onChange={e => setWasteItemId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.currentStock} {item.unit} available)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Discarded Quantity
                  </label>
                  <NumericInput
                    type="number"
                    min="0.000001"
                    step="any"
                    value={wasteQty}
                    onChange={e => setWasteQty(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reason
                  </label>
                  <select
                    value={wasteReason}
                    onChange={e => setWasteReason(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="spoilage">Sour / Expired / Spoiled</option>
                    <option value="burnt_overcooked">Burnt / Bottom of Degh</option>
                    <option value="end_of_day_unsold">Unsold End of Night</option>
                    <option value="quality_rejection">Defective Packaging</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWasteModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 rounded-lg"
                >
                  Deduct from Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ITEM */}
      {isCategoryManagerOpen && isAdmin && <InventoryCategoryManager
        categories={categories}
        inventory={inventory}
        onAdd={onAddCategory}
        onDelete={(id, replacementId) => {
          onDeleteCategory(id, replacementId);
          if (categoryFilter === id) setCategoryFilter('all');
          if (newItemCategory === id) setNewItemCategory(replacementId);
        }}
        onClose={() => setIsCategoryManagerOpen(false)}
      />}

      {itemToDelete && isAdmin && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-ingredient-title" className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xl">
          <h3 id="delete-ingredient-title" className="text-base font-semibold">Delete Ingredient</h3>
          <p className="text-sm">Delete <strong>{itemToDelete.name}</strong> from inventory?</p>
          <p className="text-xs text-slate-500">Current stock: {itemToDelete.currentStock} {itemToDelete.unit}. Purchase and waste history will be kept.</p>
          {recipes.some(recipe => recipe.ingredients.some(ingredient => ingredient.inventoryItemId === itemToDelete.id)) && <div className="text-xs text-amber-700 dark:text-amber-400 space-y-2">
            <p>These recipes will need a replacement ingredient before a selling price can be calculated:</p>
            <ul className="list-disc pl-4 space-y-1">{recipes.filter(recipe => recipe.ingredients.some(ingredient => ingredient.inventoryItemId === itemToDelete.id)).map(recipe => <li key={recipe.id}>{recipe.dishName}</li>)}</ul>
          </div>}
          {deleteError && <p role="alert" className="text-xs text-rose-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button disabled={deleteBusy} onClick={() => setItemToDelete(null)} className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs">Cancel</button>
            <button disabled={deleteBusy} onClick={async () => {
              setDeleteBusy(true);
              try {
                await onDeleteIngredient(itemToDelete.id);
                const remaining = inventory.filter(item => item.id !== itemToDelete.id);
                if (purchaseItemId === itemToDelete.id) setPurchaseItemId(remaining[0]?.id ?? '');
                if (wasteItemId === itemToDelete.id) setWasteItemId(remaining[0]?.id ?? '');
                setItemToDelete(null);
              } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Deletion failed.'); }
              finally { setDeleteBusy(false); }
            }} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Trash2 size={16} /> {deleteBusy ? 'Deleting...' : 'Delete Ingredient'}</button>
          </div>
        </section>
      </div>}

      {wasteToDelete && isAdmin && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-waste-title" className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xl">
          <h3 id="delete-waste-title" className="text-base font-semibold">Delete Waste Record</h3>
          <p className="text-sm">Delete the {wasteToDelete.date} record for <strong>{wasteToDelete.itemName}</strong> ({wasteToDelete.quantity} {wasteToDelete.unit})?</p>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={restoreWasteStock} onChange={event => setRestoreWasteStock(event.target.checked)} disabled={!inventory.some(item => item.id === wasteToDelete.itemId && item.unit === wasteToDelete.unit)} className="mt-0.5 accent-amber-500" /> Restore this quantity to stock (incorrect log only)</label>
          <p className="text-xs text-slate-500">{restoreWasteStock ? 'The recorded quantity will be added back to inventory.' : 'Inventory stock will stay unchanged.'}</p>
          {deleteError && <p role="alert" className="text-xs text-rose-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button disabled={deleteBusy} onClick={() => setWasteToDelete(null)} className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs">Cancel</button>
            <button disabled={deleteBusy} onClick={async () => {
              setDeleteBusy(true);
              try { await onDeleteWaste(wasteToDelete.id, restoreWasteStock); setWasteToDelete(null); }
              catch (error) { setDeleteError(error instanceof Error ? error.message : 'Deletion failed.'); }
              finally { setDeleteBusy(false); }
            }} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Trash2 size={16} /> {deleteBusy ? 'Deleting...' : 'Delete Waste Record'}</button>
          </div>
        </section>
      </div>}

      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Inventory ingredient" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Ingredient'}
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                aria-label="Close ingredient entry"
                title="Close ingredient entry"
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Item Name (English)
                </label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Khasi Kacchi Meat"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Bangla Name (Optional)
                </label>
                <input
                  type="text"
                  value={newItemBangla}
                  onChange={e => setNewItemBangla(e.target.value)}
                  placeholder="e.g. খাসির মাংস"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    aria-label="Ingredient category"
                    value={newItemCategory}
                    onChange={e => setNewItemCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Unit of Measurement
                  </label>
                  <select
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {Array.from(new Set(['gram', ...vendorBillUnits])).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Initial Stock
                  </label>
                  <NumericInput
                    type="number"
                    min="0"
                    step="any"
                    value={newItemStock}
                    onChange={e => setNewItemStock(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cost / Unit (৳)
                  </label>
                  <NumericInput
                    type="number"
                    min="0.01"
                    value={newItemUnitCost}
                    onChange={e => setNewItemUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 rounded-lg"
                >
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {priceHistoryItem && <ItemPriceHistory item={priceHistoryItem} inventory={inventory} ledger={vendorLedger} purchases={purchases} vendors={vendors} onSelectItem={setPriceHistoryItemId} onClose={() => setPriceHistoryItemId(null)} />}
    </div>
  );
};
