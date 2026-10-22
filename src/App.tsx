import {ViewPreferencesProvider,useRememberedViewState} from './lib/useRememberedViewState';
import {isViewMonth} from './utils/viewPreferences';
import {staffScheduledHours} from './utils/staffShiftEarnings';
import {useWorkScheduleHours} from './lib/useWorkScheduleHours';
import { PublicMenu } from './components/PublicMenu';
import { PublicMenuEditor } from './components/PublicMenuEditor';
import { loadCommissionTracking, saveCommissionTracking, emptyCommissionTracking, type CommissionTracking } from './lib/commissionTracking';
import { calculateCommission } from './utils/commission';
import { courtDueNotices, courtStatement } from './utils/courtStatement';
import React, { useState, useEffect } from 'react';
import { roundMoney } from './utils/money';
import { normalizeRestaurantSettings } from './utils/restaurantSettings';
import {
  defaultSettings,
  initialInventory,
  initialPurchases,
  initialSalesHistory,
  initialWastes,
  initialBazaarPhotos,
  initialMonthlyExpenses,
} from './data/seedData';
import {
  BazaarPhoto,
  DailySalesRecord,
  FoodCourtSettings,
  InventoryItem,
  MonthlyExpenseItem,
  PurchaseRecord,
  StaffAdvance,
  StaffAttendance,
  StaffMember,
  WasteRecord,
  RecipeItem,
  RestaurantPlans,
  InventoryCategoryDefinition,
  MenuPricingSettings,
} from './types';
import { Header } from './components/Header';
import { ManagerSalesView } from './components/ManagerSalesView';
import { DailyPnLView } from './components/DailyPnLView';
import { MonthlyExpenseView } from './components/MonthlyExpenseView';
import { InventoryView } from './components/InventoryView';
import { StaffPayrollView } from './components/StaffPayrollView';
import { FoodCourtStatementView } from './components/FoodCourtStatementView';
import { loadVendorLedger, saveVendorLedger } from './lib/vendorLedger';
import { expenseVendor, vendorLedgerWithExpensePayments } from './utils/vendorExpensePayments';
import type { VendorLedgerEntry } from './utils/vendorLedger';
import { VendorsView, type Vendor } from './components/VendorsView';
import { InvestmentView } from './components/InvestmentView';
import { loadInvestments, importInvestments } from './lib/investments';
import { BreakEvenCalculator } from './components/BreakEvenCalculator';
import { DailySalesModal } from './components/DailySalesModal';
import { SettingsModal } from './components/SettingsModal';
import { loadAppState, saveAppState, deleteWasteRecord, deleteInventoryIngredient } from './lib/appState';
import { isSupabaseConfigured } from './lib/supabase';
import { RestaurantDashboard } from './components/RestaurantDashboard';
import { getTodayString } from './utils/formatters';
import { defaultInventoryCategories, normalizeInventoryCategories, removeInventoryCategory } from './utils/inventoryCategories';
import { useAdminAuth } from './lib/adminAuth';
import { AdminLoginModal } from './components/AdminLoginModal';
import { ChefPortal } from './components/ChefPortal';
import { StaffAttendanceGate } from './components/StaffAttendanceGate';
import { canAccessSection } from './utils/access';
import { saveAdminPurchaseEdit } from './lib/adminPurchaseEdit';
import { saveStaffAdvanceChanges } from './lib/staffAdvances';
import { listStaff } from './lib/staff';
import {loadBkashAccount,restoreBkashAccount} from './lib/bkashAccount';
import { ShieldCheck } from 'lucide-react';
import { removeDemoSales } from './utils/demoSales';
import { removeDemoExpenses } from './utils/demoExpenses';
import { removeDemoPurchases } from './utils/demoPurchases';
import { linkedExpenses } from './utils/linkedExpenses';
import { recordExpense, deleteExpense } from './lib/expenses';
import { defaultMenuPricing, validateMenuItem } from './utils/menuPricing';
import { saveMenuItem, deleteMenuItem, saveMenuPricing, MENU_PRICING_KEY } from './lib/menu';

const STORAGE_KEYS = {
  VENDORS: 'sea_slash_vendors_v1',
  VENDOR_CATEGORIES: 'sea_slash_vendor_categories_v1',
  SETTINGS: 'sea_slash_settings_v1',
  SALES: 'sea_slash_sales_v1',
  EXPENSES: 'sea_slash_expenses_v1',
  INVENTORY: 'sea_slash_inventory_v1',
  PURCHASES: 'sea_slash_purchases_v1',
  WASTES: 'sea_slash_wastes_v1',
  STAFF: 'sea_slash_staff_v1',
  ATTENDANCE: 'sea_slash_attendance_v1',
  ADVANCES: 'sea_slash_advances_v1',
  PHOTOS: 'sea_slash_photos_v1',
  RECIPES: 'sea_slash_recipes_v1',
  PLANS: 'sea_slash_plans_v1',
  CATEGORIES: 'sea_slash_inventory_categories_v1',
};

function getStoredState<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

export default function App() {
  const [route,setRoute] = React.useState(window.location.hash);
  React.useEffect(() => { const changed=()=>setRoute(window.location.hash); window.addEventListener('hashchange',changed); return()=>window.removeEventListener('hashchange',changed); },[]);
  if (!route.startsWith('#/admin')) return <PublicMenu key={route} />;
  return <StaffApplication />;
}

function StaffApplication() {
  React.useEffect(() => { document.title='Sea Slash | Restaurant Manager'; },[]);
  const auth = useAdminAuth();
  if (!auth.authReady) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200">Checking login...</div>;
  if (!auth.session) return <AdminLoginModal page onClose={() => {}} />;
  if (!auth.role) return <div className="app-shell flex items-center justify-center bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><section className="max-w-md space-y-4"><h1 className="text-xl font-semibold">Restaurant Access Unavailable</h1><p role="alert" className="text-sm">{auth.roleError}</p><button onClick={() => auth.signOut().catch(error => alert(error.message))} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Back to Sign In</button></section></div>;
  if (auth.role === 'partner') return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><div className="mx-auto max-w-6xl space-y-6"><header className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Sea Slash</h1><p className="text-sm text-slate-500">Partner · investment access · view only</p></div><button className="rounded-md border px-3 py-2" onClick={()=>auth.signOut().catch(error=>alert(error.message))}>Sign Out</button></header><InvestmentView readOnly/></div></main>;
  if (auth.role !== 'admin') return <ViewPreferencesProvider key={auth.session.user.id+auth.role} scope={auth.session.user.id+':'+auth.role}><StaffAttendanceGate key={auth.session.user.id + auth.role} onLogout={auth.signOut}>{auth.role === 'chef' ? <ChefPortal onLogout={auth.signOut} /> : <ManagementApp auth={auth} />}</StaffAttendanceGate></ViewPreferencesProvider>;
  return <ViewPreferencesProvider key={auth.session.user.id+auth.role} scope={auth.session.user.id+':'+auth.role}><ManagementApp auth={auth}/></ViewPreferencesProvider>;
}

function ManagementApp({ auth }: { auth: ReturnType<typeof useAdminAuth> }) {
  const scheduledHours=useWorkScheduleHours();
  const { isAdmin, canManage, role, authReady, signOut } = auth;
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('sea_slash_theme');
    return saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sea_slash_theme', theme);
  }, [theme]);

  // State with LocalStorage initialization
  const [settings, setSettings] = useState<FoodCourtSettings>(() => {
    const saved = getStoredState(STORAGE_KEYS.SETTINGS, defaultSettings);
    return normalizeRestaurantSettings(saved);
  });

  const [recipes, setRecipes] = useState<RecipeItem[]>(() => getStoredState(STORAGE_KEYS.RECIPES, []));
  const [menuPricing, setMenuPricing] = useState<MenuPricingSettings>(() => getStoredState(MENU_PRICING_KEY, defaultMenuPricing));
  const [plans, setPlans] = useState<RestaurantPlans>(() => getStoredState(STORAGE_KEYS.PLANS, {}));

  const [salesHistory, setSalesHistory] = useState<DailySalesRecord[]>(() => {
    return removeDemoSales(getStoredState(STORAGE_KEYS.SALES, initialSalesHistory));
  });

  useEffect(() => {
    setSalesHistory(current => {
      const next = current.map(record => {
        const commission = calculateCommission(record.grossSales, settings.commissionRate);
        const netProfit = roundMoney(record.grossSales - commission - record.proratedRent - record.cogsCost - record.staffCost - record.otherExpenses);
        return record.foodCourtCommission === commission && record.netProfit === netProfit ? record : { ...record, foodCourtCommission: commission, netProfit };
      });
      return next.every((record, index) => record === current[index]) ? current : next;
    });
  }, [salesHistory, settings.commissionRate]);

  const [expenses, setExpenses] = useState<MonthlyExpenseItem[]>(() => {
    return canManage ? removeDemoExpenses(getStoredState(STORAGE_KEYS.EXPENSES, initialMonthlyExpenses)) : [];
  });
  useEffect(() => {
    let cancelled = false;
    if (!canManage) { setExpenses([]); localStorage.removeItem(STORAGE_KEYS.EXPENSES); return; }
    loadAppState<MonthlyExpenseItem[]>(STORAGE_KEYS.EXPENSES).then(rows => { if (!cancelled) setExpenses(removeDemoExpenses(rows ?? [])); }).catch(() => setSyncStatus('Expense sync failed'));
    return () => { cancelled = true; };
  }, [canManage]);

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    return getStoredState(STORAGE_KEYS.INVENTORY, initialInventory);
  });

  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategoryDefinition[]>(() =>
    normalizeInventoryCategories(getStoredState(STORAGE_KEYS.CATEGORIES, defaultInventoryCategories), inventory)
  );

  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
    return removeDemoPurchases(getStoredState(STORAGE_KEYS.PURCHASES, initialPurchases));
  });

  const [wastes, setWastes] = useState<WasteRecord[]>(() => {
    return getStoredState(STORAGE_KEYS.WASTES, initialWastes);
  });

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [attendanceList, setAttendanceList] = useState<StaffAttendance[]>([]);
  const [advancesList, setAdvancesList] = useState<StaffAdvance[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');

  const reloadStaff = async () => {
    if (!canManage) throw new Error('Administrator access required.');
    setStaffLoading(true);
    setStaffError('');
    try {
      const members = await listStaff();
      const attendance = await loadAppState<StaffAttendance[]>(STORAGE_KEYS.ATTENDANCE);
      const advances = await loadAppState<StaffAdvance[]>(STORAGE_KEYS.ADVANCES);
      setStaffList(members);
      setAttendanceList(attendance || []);
      setAdvancesList(advances || []);
    } catch (failure) {
      setStaffError(failure instanceof Error ? failure.message : 'Could not load staff.');
    } finally { setStaffLoading(false); }
  };

  useEffect(() => {
    // Private payroll is never hydrated from shared browser storage.
    for (const key of [STORAGE_KEYS.STAFF, STORAGE_KEYS.ATTENDANCE, STORAGE_KEYS.ADVANCES]) localStorage.removeItem(key);
    if (canManage) reloadStaff();
    else { setStaffList([]); setAttendanceList([]); setAdvancesList([]); }
  }, [canManage]);

  const [bazaarPhotos, setBazaarPhotos] = useState<BazaarPhoto[]>(() => {
    return getStoredState(STORAGE_KEYS.PHOTOS, initialBazaarPhotos);
  });

  const [vendorCategories, setVendorCategories] = useState<string[]>([]);
  const [vendorLedger, setVendorLedger] = useState<VendorLedgerEntry[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useRememberedViewState<string>('section',() => role === 'manager' ? 'pnl' : 'overview',value=>typeof value==='string'&&canAccessSection(role,value));
  const needsStaffBudget = ['overview', 'planning', 'breakeven', 'expenses', 'foodcourt'].includes(activeTab);
  const [salaryRequest, setSalaryRequest] = useState<{ staffId: string; month: string } | null>(null);
  const [commissionTracking, setCommissionTracking] = useState<CommissionTracking>(emptyCommissionTracking);
  const [statementMonth, setStatementMonth] = useRememberedViewState('commission.month',() => getTodayString().slice(0, 7),isViewMonth);
  const [courtRequest, setCourtRequest] = useState<{ category: 'rent' | 'commission'; month: string; date?: string; amount?: number } | null>(null);
  const syncedAdminPurchases = React.useRef<PurchaseRecord[] | null>(null);
  const syncedVendorInventory = React.useRef<InventoryItem[] | null>(null);
  const displayVendorLedger = React.useMemo(() => vendorLedgerWithExpensePayments(vendorLedger, expenses, vendors), [vendorLedger, expenses, vendors]);
  const expenseLedger = linkedExpenses(expenses, removeDemoPurchases(purchases), canManage ? advancesList : [], canManage ? staffList : [], inventory);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState<boolean>(false);
  const [editingSalesRecord, setEditingSalesRecord] = useState<DailySalesRecord | undefined>(undefined);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [hasLoadedRemoteState, setHasLoadedRemoteState] = useState<boolean>(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<string>(
    isSupabaseConfigured ? 'Connecting to Supabase...' : 'Local mode: add Supabase env vars to sync online'
  );

  const persistState = <T,>(key: string, value: T) => {
    localStorage.setItem(key, JSON.stringify(value));

    if (!hasLoadedRemoteState || !isSupabaseConfigured) {
      return;
    }

    saveAppState(key, value)
      .then(() => setSyncStatus('Supabase synced'))
      .catch(error => {
        console.error('Supabase save failed:', error);
        setSyncStatus('Supabase sync failed');
      });
  };

  useEffect(() => {
    let isCancelled = false;

    if (!isSupabaseConfigured) {
      return;
    }

    async function hydrateFromSupabase() {
      try {
        const [
          remoteSettings,
          remoteSales,
          remoteExpenses,
          remoteInventory,
          remotePurchases,
          remoteWastes,
          remotePhotos,
          remoteRecipes,
          remotePlans,
          remoteCategories,
          remoteMenuPricing,
          remoteVendors,
          remoteVendorCategories,
          remoteVendorLedger,
          remoteCommissionTracking,
        ] = await Promise.all([
          loadAppState<FoodCourtSettings>(STORAGE_KEYS.SETTINGS),
          loadAppState<DailySalesRecord[]>(STORAGE_KEYS.SALES),
          loadAppState<MonthlyExpenseItem[]>(STORAGE_KEYS.EXPENSES),
          loadAppState<InventoryItem[]>(STORAGE_KEYS.INVENTORY),
          loadAppState<PurchaseRecord[]>(STORAGE_KEYS.PURCHASES),
          loadAppState<WasteRecord[]>(STORAGE_KEYS.WASTES),
          loadAppState<BazaarPhoto[]>(STORAGE_KEYS.PHOTOS),
          loadAppState<RecipeItem[]>(STORAGE_KEYS.RECIPES),
          loadAppState<RestaurantPlans>(STORAGE_KEYS.PLANS),
          loadAppState<InventoryCategoryDefinition[]>(STORAGE_KEYS.CATEGORIES),
          loadAppState<MenuPricingSettings>(MENU_PRICING_KEY),
          loadAppState<Vendor[]>(STORAGE_KEYS.VENDORS),
          loadAppState<string[]>(STORAGE_KEYS.VENDOR_CATEGORIES),
          loadVendorLedger(),
          loadCommissionTracking(),
        ]);

        if (isCancelled) {
          return;
        }

        setCommissionTracking(remoteCommissionTracking);
        setVendors(remoteVendors ?? []);
        setVendorLedger(remoteVendorLedger);
        setVendorCategories(remoteVendorCategories ?? []);
        if (remoteSettings) setSettings(normalizeRestaurantSettings(remoteSettings));
        if (remoteSales) setSalesHistory(removeDemoSales(remoteSales));
        setExpenses(removeDemoExpenses(remoteExpenses ?? []));
        if (remoteInventory) setInventory(remoteInventory);
        setPurchases(removeDemoPurchases(remotePurchases ?? []));
        if (remoteWastes) setWastes(remoteWastes);
        if (remotePhotos) setBazaarPhotos(remotePhotos);
        setRecipes(remoteRecipes ?? []);
        if (remotePlans) setPlans(remotePlans);
        setMenuPricing(remoteMenuPricing ?? defaultMenuPricing);
        setInventoryCategories(normalizeInventoryCategories(remoteCategories ?? inventoryCategories, remoteInventory ?? inventory));

        setHasLoadedRemoteState(true);
        setSyncStatus('Supabase connected');
      } catch (error) {
        console.error('Supabase load failed:', error);
        setSyncStatus('Supabase connection failed');
      }
    }

    hydrateFromSupabase();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Sync to LocalStorage
  useEffect(() => {
    if (isAdmin) persistState(STORAGE_KEYS.CATEGORIES, inventoryCategories);
    else localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(inventoryCategories));
  }, [inventoryCategories, hasLoadedRemoteState, isAdmin]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
  }, [recipes]);

  useEffect(() => {
    localStorage.setItem(MENU_PRICING_KEY, JSON.stringify(menuPricing));
  }, [menuPricing]);

  useEffect(() => {
    persistState(STORAGE_KEYS.PLANS, plans);
  }, [plans, hasLoadedRemoteState]);

  useEffect(() => {
    persistState(STORAGE_KEYS.SETTINGS, settings);
  }, [settings, hasLoadedRemoteState]);

  useEffect(() => {
    const cleaned = removeDemoSales(salesHistory);
    if (cleaned.length !== salesHistory.length) setSalesHistory(cleaned);
    persistState(STORAGE_KEYS.SALES, cleaned);
  }, [salesHistory, hasLoadedRemoteState]);

  useEffect(() => {
    if (syncedVendorInventory.current === inventory) {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
      return;
    }
    persistState(STORAGE_KEYS.INVENTORY, inventory);
  }, [inventory, hasLoadedRemoteState]);

  useEffect(() => {
    const cleaned = removeDemoPurchases(purchases);
    if (cleaned.length !== purchases.length) setPurchases(cleaned);
    if (syncedAdminPurchases.current === purchases) localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(cleaned));
    else persistState(STORAGE_KEYS.PURCHASES, cleaned);
  }, [purchases, hasLoadedRemoteState]);

  useEffect(() => {
    persistState(STORAGE_KEYS.WASTES, wastes);
  }, [wastes, hasLoadedRemoteState]);

  useEffect(() => {
    persistState(STORAGE_KEYS.PHOTOS, bazaarPhotos);
  }, [bazaarPhotos, hasLoadedRemoteState]);

  useEffect(() => {
    const cleaned = removeDemoExpenses(expenses);
    if (cleaned.length !== expenses.length) setExpenses(cleaned);
    if (canManage) localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(cleaned));
    else localStorage.removeItem(STORAGE_KEYS.EXPENSES);
  }, [expenses, canManage]);

  // Handlers for Monthly Expenses
  const handleAddExpense = async (expense: MonthlyExpenseItem) => {
    const vendor = expenseVendor(expense, vendors);
    setExpenses(await recordExpense(vendor ? { ...expense, vendorId: vendor.id, vendor: vendor.name } : expense));
  };

  const handleDeleteExpense = async (id: string) => {
    setExpenses(await deleteExpense(id));
  };

  // Daily staff cost allocation
  const dailyStaffCost = roundMoney(
    staffList.filter(s => s.active).reduce((sum, s) => {
      return sum + (s.salaryType === 'monthly' ? s.baseSalary / 30 : s.baseSalary * (s.salaryType === 'hourly' ? staffScheduledHours(s,scheduledHours) : 1));
    }, 0)
  );

  // Handlers for Sales
  const handleSaveSalesRecord = (record: DailySalesRecord) => {
    const existingIndex = salesHistory.findIndex(r => r.id === record.id || r.date === record.date);
    if (existingIndex >= 0) {
      const updated = [...salesHistory];
      updated[existingIndex] = record;
      setSalesHistory(updated);
    } else {
      setSalesHistory([record, ...salesHistory]);
    }
  };

  const handleDeleteSalesRecord = (id: string) => {
    if (confirm('Are you sure you want to delete this sales record?')) {
      setSalesHistory(salesHistory.filter(r => r.id !== id));
    }
  };

  const handleOpenSalesModal = (record?: DailySalesRecord) => {
    setEditingSalesRecord(record);
    setIsSalesModalOpen(true);
  };

  // Handlers for Inventory & Purchases
  const handleDeleteInventoryCategory = (id: string, replacementId: string) => {
    if (!isAdmin) throw new Error('Administrator access required.');
    const next = removeInventoryCategory(inventoryCategories, inventory, id, replacementId);
    setInventoryCategories(next.categories);
    setInventory(next.inventory);
  };

  const handleDeleteIngredient = async (id: string) => {
    if (!isAdmin) throw new Error('Administrator access required.');
    setInventory(await deleteInventoryIngredient(id));
  };

  const handleDeleteWaste = async (id: string, restoreStock: boolean) => {
    if (!isAdmin) throw new Error('Administrator access required.');
    const next = await deleteWasteRecord(id, restoreStock);
    setInventory(next.inventory);
    setWastes(next.wastes);
  };

  const handleUpdateInventory = (next: InventoryItem[]) => {
    if (!isAdmin && inventory.some(item => !next.some(candidate => candidate.id === item.id))) return;
    setInventory(next);
  };

  const handleAddPurchase = (purchase: PurchaseRecord, updatedStock: number) => {
    setPurchases([purchase, ...purchases]);
    setInventory(
      inventory.map(item =>
        item.id === purchase.itemId
          ? { ...item, currentStock: updatedStock, unitCost: purchase.unitPrice }
          : item
      )
    );
  };

  const handleAddWaste = (waste: WasteRecord, updatedStock: number) => {
    setWastes([waste, ...wastes]);
    setInventory(
      inventory.map(item =>
        item.id === waste.itemId ? { ...item, currentStock: updatedStock } : item
      )
    );
  };

  // Handlers for Staff
  const handleSaveMenuItem = async (recipe: RecipeItem) => {
    if (!canManage || !hasLoadedRemoteState) throw new Error('Wait for the administrator connection before saving.');
    setRecipes(await saveMenuItem(recipe));
    setSyncStatus('Supabase synced');
  };

  const handleDeleteMenuItem = async (id: string) => {
    if (!canManage || !hasLoadedRemoteState) throw new Error('Wait for the administrator connection before deleting.');
    setRecipes(await deleteMenuItem(id));
  };

  const handleSaveMenuPricing = async (next: MenuPricingSettings) => {
    if (!canManage || !hasLoadedRemoteState) throw new Error('Wait for the administrator connection before saving.');
    await saveMenuPricing(next);
    setMenuPricing(next);
    setSyncStatus('Supabase synced');
  };

  const handleUpdateAttendance = async (next: StaffAttendance[]) => {
    if (!canManage || staffLoading || staffError) throw new Error('Staff data must be loaded by an administrator first.');
    await saveAppState(STORAGE_KEYS.ATTENDANCE, next);
    setAttendanceList(next);
  };

  const handleUpdateAdvances = async (next: StaffAdvance[]) => {
    if (!canManage || staffLoading || staffError) throw new Error('Staff data must be loaded by an administrator first.');
    setAdvancesList(await saveStaffAdvanceChanges(advancesList, next));
  };

  // Handlers for Bazaar Photos
  const handleAddBazaarPhoto = (photo: BazaarPhoto) => {
    setBazaarPhotos([photo, ...bazaarPhotos]);
  };

  const handleDeleteBazaarPhoto = (id: string) => {
    setBazaarPhotos(bazaarPhotos.filter(p => p.id !== id));
  };

  // Full Data Export & Import
  const handleExportAllData = async () => {
    if (!isAdmin) { alert('Administrator access required to export data.'); return; }
    let investments, bkashAccount;
    try { [investments,bkashAccount] = await Promise.all([loadInvestments(),loadBkashAccount()]); }
    catch (error) { alert(error instanceof Error ? error.message : 'Data backup failed.'); return; }
    const fullBackup = {
      investments,
      bkashAccount,
      commissionTracking,
      vendors,
      vendorLedger,
      vendorCategories,
      settings,
      salesHistory,
      expenses,
      inventory,
      purchases,
      wastes,
      staffList,
      attendanceList,
      advancesList,
      bazaarPhotos,
      recipes,
      menuPricing,
      plans,
      inventoryCategories,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `food_court_stall_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (jsonStr: string) => {
    if (!isAdmin) { alert('Administrator access required to import data.'); return; }
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.bkashAccount) await restoreBkashAccount(parsed.bkashAccount);
      if (parsed.vendorLedger) setVendorLedger(await saveVendorLedger(parsed.vendorLedger));
      if (parsed.vendorCategories) {
        if (!Array.isArray(parsed.vendorCategories) || parsed.vendorCategories.some((name: unknown) => typeof name !== 'string' || !name.trim() || name.length > 100)) throw new Error('Invalid vendor categories backup.');
        await saveAppState(STORAGE_KEYS.VENDOR_CATEGORIES, parsed.vendorCategories);
        setVendorCategories(parsed.vendorCategories);
      }
      if (parsed.vendors) {
        if (!Array.isArray(parsed.vendors) || parsed.vendors.some((vendor: Vendor) => !vendor || typeof vendor.id !== 'string' || !vendor.id || typeof vendor.name !== 'string' || !vendor.name.trim() || typeof vendor.category !== 'string' || !vendor.category.trim() || ['phone', 'address', 'notes'].some(field => typeof vendor[field as keyof Vendor] !== 'string')) || new Set(parsed.vendors.map((vendor: Vendor) => vendor.id)).size !== parsed.vendors.length) throw new Error('Invalid vendor backup.');
        await saveAppState(STORAGE_KEYS.VENDORS, parsed.vendors);
        setVendors(parsed.vendors);
      }
      if (parsed.commissionTracking) setCommissionTracking(await saveCommissionTracking(parsed.commissionTracking));
      if (parsed.investments) await importInvestments(parsed.investments);
      if (parsed.recipes) {
        if (!Array.isArray(parsed.recipes)) throw new Error('Invalid menu backup.');
        parsed.recipes.forEach(validateMenuItem);
        await saveAppState(STORAGE_KEYS.RECIPES, parsed.recipes);
      }
      if (parsed.menuPricing) await saveMenuPricing(parsed.menuPricing);
      if (parsed.settings) setSettings(normalizeRestaurantSettings(parsed.settings));
      if (parsed.salesHistory) setSalesHistory(removeDemoSales(parsed.salesHistory));
      if (parsed.expenses) { const clean = removeDemoExpenses(parsed.expenses); await saveAppState(STORAGE_KEYS.EXPENSES, clean); setExpenses(clean); }
      if (parsed.inventory) setInventory(parsed.inventory);
      if (parsed.inventoryCategories || parsed.inventory) {
        setInventoryCategories(normalizeInventoryCategories(parsed.inventoryCategories ?? inventoryCategories, parsed.inventory ?? inventory));
      }
      if (parsed.purchases) setPurchases(removeDemoPurchases(parsed.purchases));
      if (parsed.wastes) setWastes(parsed.wastes);
      if (parsed.bazaarPhotos) setBazaarPhotos(parsed.bazaarPhotos);
      if (parsed.recipes) setRecipes(parsed.recipes);
      if (parsed.menuPricing) setMenuPricing(parsed.menuPricing);
      if (parsed.plans) setPlans(parsed.plans);
      alert('Operational data restored. Staff, login accounts and payroll history are managed separately and were not overwritten.');
    } catch (e) {
      alert('Invalid backup JSON file.');
    }
  };

  const handleResetData = () => {
    if (!isAdmin) { alert('Administrator access required to reset data.'); return; }
    setSettings(defaultSettings);
    setSalesHistory(initialSalesHistory);
    setExpenses(initialMonthlyExpenses);
    setInventory(initialInventory);
    setPurchases(initialPurchases);
    setWastes(initialWastes);
    setBazaarPhotos(initialBazaarPhotos);
    setPlans({});
    setInventoryCategories(defaultInventoryCategories);
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
  };

  return (
    <div className="app-shell min-h-screen bg-slate-50 dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 flex flex-col selection:bg-amber-500/30 selection:text-amber-800 dark:selection:text-amber-200">
      {/* Header with Navigation and Quick Actions */}
      <Header
        dueNotices={canManage && hasLoadedRemoteState ? courtDueNotices(getTodayString().slice(0, 7), salesHistory, expenses, settings, commissionTracking) : []}
        onOpenStatement={month => { setStatementMonth(month); setActiveTab('foodcourt'); }}
        isAdmin={isAdmin}
        role={role!}
        authReady={authReady}
        onAdminLogin={() => setIsAdminLoginOpen(true)}
        onAdminLogout={() => signOut().catch(error => alert(error.message))}
        theme={theme}
        onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
        settings={settings}
        salesHistory={salesHistory}
        activeTab={activeTab}
        setActiveTab={tab => { if (canAccessSection(role, tab)) setActiveTab(tab); }}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'publicmenu' && isAdmin && <PublicMenuEditor recipes={recipes} />}
        {activeTab === 'vendors' && canManage && <VendorsView inventoryCategories={inventoryCategories} inventory={inventory} isAdmin={isAdmin} vendors={vendors} ledger={displayVendorLedger} onSaveLedger={async entry => {
          if (!canManage || !hasLoadedRemoteState) throw new Error('Administrator or manager access and a database connection are required.');
          if (!isAdmin && (entry.balanceAdjustment !== undefined || vendorLedger.some(row => row.id === entry.id && row.balanceAdjustment !== undefined))) throw new Error('Administrator access required to override vendor balances.');
          if (!vendors.some(vendor => vendor.id === entry.vendorId)) throw new Error('Vendor no longer exists.');
          const affectsInventory = !!entry.createInventoryItem || !!entry.inventoryItemId || vendorLedger.some(row => row.id === entry.id && row.inventoryItemId);
          setVendorLedger(await saveVendorLedger([entry]));
          if (affectsInventory) {
            const [updated, updatedCategories] = await Promise.all([
              loadAppState<InventoryItem[]>(STORAGE_KEYS.INVENTORY),
              entry.inventoryCategoryName ? loadAppState<InventoryCategoryDefinition[]>(STORAGE_KEYS.CATEGORIES) : Promise.resolve(null),
            ]);
            if (!updated) throw new Error('Bill saved, but inventory could not be refreshed. Reload the page.');
            syncedVendorInventory.current = updated;
            setInventory(updated);
            if (updatedCategories) setInventoryCategories(normalizeInventoryCategories(updatedCategories, updated));
          }
        }} categories={vendorCategories} onAddCategory={async name => {
          if (!canManage || !hasLoadedRemoteState) throw new Error('Administrator or manager access and a database connection are required.');
          if (!isSupabaseConfigured) throw new Error('Connect to Supabase before saving vendor categories.');
          const next = [...vendorCategories, name];
          await saveAppState(STORAGE_KEYS.VENDOR_CATEGORIES, next);
          setVendorCategories(next);
        }} canEdit={canManage && hasLoadedRemoteState} onSave={async vendor => {
          if (!canManage || !hasLoadedRemoteState) throw new Error('Administrator or manager access and a database connection are required.');
          if (!isSupabaseConfigured) throw new Error('Connect to Supabase before saving vendors.');
          const next = vendors.some(row => row.id === vendor.id) ? vendors.map(row => row.id === vendor.id ? vendor : row) : [...vendors, vendor];
          await saveAppState(STORAGE_KEYS.VENDORS, next);
          setVendors(next);
        }} onDelete={async id => {
          if (!canManage || !hasLoadedRemoteState) throw new Error('Administrator or manager access and a database connection are required.');
          if (displayVendorLedger.some(entry => entry.vendorId === id)) throw new Error('Vendors with bills or payments cannot be deleted.');
          const next = vendors.filter(vendor => vendor.id !== id);
          await saveAppState(STORAGE_KEYS.VENDORS, next);
          setVendors(next);
        }} />}
        {activeTab === 'investment' && !isAdmin && <p role="alert">Administrator access required.</p>}
        {activeTab === 'investment' && isAdmin && <InvestmentView />}
        {needsStaffBudget && !canManage && <section className="py-12 text-center"><ShieldCheck size={28} className="mx-auto mb-3 text-amber-600" /><h2 className="text-lg font-semibold">Restaurant Finance</h2><button onClick={() => setIsAdminLoginOpen(true)} className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Admin / Staff Login</button></section>}
        {needsStaffBudget && canManage && (staffLoading || staffError) && <p role="status" className="py-8 text-sm">{staffLoading ? 'Loading payroll budget...' : staffError}</p>}
        {role === 'manager' && activeTab === 'pnl' && <ManagerSalesView mode="sales" sales={salesHistory} onEdit={handleOpenSalesModal} onOpenCash={() => setActiveTab('expenses')} />}
        {(activeTab === 'overview' || activeTab === 'planning') && isAdmin && !staffLoading && !staffError && (
          <RestaurantDashboard
            mode={activeTab === 'overview' ? 'overview' : 'planning'}
            settings={settings}
            sales={salesHistory}
            inventory={inventory}
            staff={staffList}
            plans={plans}
            onUpdatePlans={setPlans}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'pnl' && isAdmin && (
          <DailyPnLView
            salesHistory={salesHistory}
            settings={settings}
            onOpenSalesModal={handleOpenSalesModal}
            onDeleteRecord={handleDeleteSalesRecord}
          />
        )}

        {activeTab === 'expenses' && canManage && !staffLoading && !staffError && (
          <MonthlyExpenseView
            isAdmin={isAdmin}
            purchases={purchases}
            onEditPurchase={async (previous, next) => {
              if (!isAdmin) throw new Error('Administrator access required.');
              const result = await saveAdminPurchaseEdit(previous, next);
              const clean = removeDemoPurchases(result.purchases);
              syncedAdminPurchases.current = clean; syncedVendorInventory.current = result.inventory;
              setPurchases(clean); setInventory(result.inventory);
            }}
            onEditAdvance={async (previous, next) => {
              if (!isAdmin) throw new Error('Administrator access required.');
              setAdvancesList(await saveStaffAdvanceChanges([previous], [next]));
            }}
            onEditSales={handleOpenSalesModal}
            sales={salesHistory}
            expenses={expenseLedger}
            vendors={vendors}
            vendorLedger={vendorLedger}
            staff={staffList}
            attendance={attendanceList}
            advances={advancesList}
            salaryRequest={salaryRequest}
            courtRequest={courtRequest}
            onCourtRequestHandled={() => setCourtRequest(null)}
            onSalaryRequestHandled={() => setSalaryRequest(null)}
            onOpenSource={source => setActiveTab(source === 'purchase' ? 'inventory' : 'staff')}
            settings={settings}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            isAdmin={isAdmin}
            onAdminLogin={() => setIsAdminLoginOpen(true)}
            onDeleteIngredient={handleDeleteIngredient}
            onDeleteWaste={handleDeleteWaste}
            categories={inventoryCategories}
            recipes={recipes}
            onAddCategory={category => { if (isAdmin) setInventoryCategories(current => [...current, category]); }}
            onDeleteCategory={handleDeleteInventoryCategory}
            inventory={inventory}
            purchases={purchases}
            vendorLedger={vendorLedger}
            vendors={vendors}
            wastes={wastes}
            bazaarPhotos={bazaarPhotos}
            stallNumber={settings.stallNumber}
            onUpdateInventory={handleUpdateInventory}
            onAddPurchase={handleAddPurchase}
            onAddWaste={handleAddWaste}
            onAddBazaarPhoto={handleAddBazaarPhoto}
            onDeleteBazaarPhoto={handleDeleteBazaarPhoto}
          />
        )}

        {activeTab === 'staff' && !canManage && <section className="py-12 text-center"><ShieldCheck size={28} className="mx-auto mb-3 text-amber-600" /><h2 className="text-lg font-semibold">Staff & Salary</h2><button onClick={() => setIsAdminLoginOpen(true)} className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Admin / Staff Login</button></section>}
        {activeTab === 'staff' && canManage && (
          <StaffPayrollView
            isAdmin={isAdmin}
            expenses={expenses}
            onRecordSalary={(staffId, month) => { setSalaryRequest({ staffId, month }); setActiveTab('expenses'); }}
            loading={staffLoading}
            loadError={staffError}
            onReload={reloadStaff}
            staffList={staffList}
            attendanceList={attendanceList}
            advancesList={advancesList}
            stallName={settings.stallName}
            onUpdateStaff={setStaffList}
            onUpdateAttendance={handleUpdateAttendance}
          />
        )}

        {activeTab === 'foodcourt' && canManage && !staffLoading && !staffError && !hasLoadedRemoteState && <p role="status" className="py-8 text-sm">{syncStatus}</p>}
        {activeTab === 'foodcourt' && canManage && !staffLoading && !staffError && hasLoadedRemoteState && (
          <FoodCourtStatementView
            isAdmin={isAdmin}
            key={statementMonth}
            onRecordMissingSales={date => handleOpenSalesModal({ id: `sales-${date}`, date, grossSales: 0, cashSales: 0, bankSales: 0, bkashSales: 0, nagadSales: 0, cardSales: 0, foodCourtCommission: 0, proratedRent: settings.dailyRent, cogsCost: 0, staffCost: dailyStaffCost, otherExpenses: 0, netProfit: 0 })}
            tracking={commissionTracking}
            onSaveTracking={isAdmin ? async change => { if (!isAdmin) throw new Error('Administrator access required.'); if (!hasLoadedRemoteState) throw new Error('Wait for data to load.'); setCommissionTracking(await saveCommissionTracking(change)); } : undefined}
            onAssignPaymentDate={async (payment, date) => { setExpenses(await recordExpense({ ...payment, commissionDate: date, statementMonth: date.slice(0, 7) })); }}
            initialMonth={statementMonth}
            onMonthChange={setStatementMonth}
            salesHistory={salesHistory}
            settings={settings}
            expenses={expenses}
            onRecordPayment={(category, month, date) => { const statement = courtStatement(month, salesHistory, expenses, settings, commissionTracking); const amount = category === 'rent' ? statement.rentDue : statement.dailyCommissions.find(day => day.date === date)?.due ?? 0; if (amount <= 0) return; setCourtRequest({ category, month, date, amount }); setActiveTab('expenses'); }}
            onOpenExpenses={() => setActiveTab('expenses')}
          />
        )}

        {activeTab === 'breakeven' && isAdmin && !staffLoading && !staffError && !hasLoadedRemoteState && <p role="status" className="py-8 text-sm">{syncStatus}</p>}
        {activeTab === 'breakeven' && isAdmin && !staffLoading && !staffError && hasLoadedRemoteState && (
          <BreakEvenCalculator
            settings={settings}
            inventory={inventory}
            recipes={recipes}
            pricing={menuPricing}
            ready={hasLoadedRemoteState}
            onSaveRecipe={handleSaveMenuItem}
            onDeleteRecipe={handleDeleteMenuItem}
            onSavePricing={handleSaveMenuPricing}
            staff={staffList}
          />
        )}
      </main>

      {/* Global Modals */}
      {isAdminLoginOpen && <AdminLoginModal onClose={() => setIsAdminLoginOpen(false)} />}
      <DailySalesModal
        canViewProfit={isAdmin}
        isOpen={isSalesModalOpen}
        onClose={() => {
          setIsSalesModalOpen(false);
          setEditingSalesRecord(undefined);
        }}
        onSave={handleSaveSalesRecord}
        existingRecord={editingSalesRecord}
        settings={settings}
        suggestedStaffDailyCost={dailyStaffCost}
        expenses={expenseLedger}
      />

      <SettingsModal
        isAdmin={isAdmin}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={setSettings}
        onExportAllData={handleExportAllData}
        onImportData={handleImportData}
        onResetData={handleResetData}
      />

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-slate-50/60 dark:bg-slate-950/60 py-4 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600 dark:text-slate-400">{settings.stallName}</span>
            <span>·</span>
            <span>{settings.stallNumber}</span>
            <span>·</span>
            <span>{settings.foodCourtName}</span>
          </div>

        </div>
      </footer>
    </div>
  );
}
