import { CourtDueNotifications } from './CourtDueNotifications';
import type { CourtDueNotice } from '../utils/courtStatement';
import React from 'react';
import { RestaurantLogo } from './RestaurantLogo';
import {
  BookOpen,
  UtensilsCrossed,
  DollarSign,
  Receipt,
  Building2,
  Calendar,
  Settings,
  Sun,
  Moon,
  LayoutDashboard,
  Target,
  LogIn,
  LogOut,
  ShieldCheck,
  Wallet,
  Store,
} from 'lucide-react';
import { FoodCourtSettings, DailySalesRecord } from '../types';
import { formatBDT, getTodayString } from '../utils/formatters';
import { canAccessSection, type RestaurantRole } from '../utils/access';

interface HeaderProps {
  dueNotices?: CourtDueNotice[];
  onOpenStatement?: (month: string) => void;
  role: RestaurantRole;
  isAdmin: boolean;
  authReady: boolean;
  onAdminLogin: () => void;
  onAdminLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  settings: FoodCourtSettings;
  salesHistory: DailySalesRecord[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSettingsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  dueNotices = [],
  onOpenStatement,
  role,
  isAdmin,
  authReady,
  onAdminLogin,
  onAdminLogout,
  theme,
  onToggleTheme,
  settings,
  salesHistory,
  activeTab,
  setActiveTab,
  onOpenSettingsModal,
}) => {
  const todayStr = getTodayString();
  const todayRecord = salesHistory.find(r => r.date === todayStr);

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'pnl', label: role === 'admin' ? 'Sales & Profit' : 'Sales & Cash', icon: DollarSign },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'inventory', label: 'Inventory & Bazaar', icon: UtensilsCrossed },
    { id: 'staff', label: 'Staff & Salary', icon: Building2 },
    { id: 'foodcourt', label: 'Commission Statement', icon: Building2, badge: dueNotices.length > 0 ? dueNotices.length : undefined },
    { id: 'breakeven', label: 'Food Cost & Pricing', icon: Calendar },
    { id: 'planning', label: 'Targets & Feasibility', icon: Target },
    { id: 'investment', label: 'Total Investment', icon: Wallet },
    { id: 'vendors', label: 'Vendors', icon: Store },
    { id: 'publicmenu', label: 'Public Menu', icon: BookOpen },
  ].filter(tab => canAccessSection(role, tab.id));

  return (
    <header className="app-header border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur sm:sticky sm:top-0 z-30">
      {/* Top Brand Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Stall Name & Food Court Info */}
          <div className="flex min-w-0 items-center gap-3">
            <RestaurantLogo />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {settings.stallName}
                </h1>
                <span className="text-xs text-amber-700/90 dark:text-amber-400/90 font-medium shrink-0">
                  {settings.stallNumber}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>{settings.foodCourtName}</span>

              </p>
            </div>
          </div>

          {/* KPI Strip & Action Buttons */}
          <div className="header-actions flex items-center gap-2 flex-wrap md:justify-end">
            <button disabled={!authReady} onClick={onAdminLogout} aria-label="Sign out" title="Sign out" className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-xs disabled:opacity-50">
              {isAdmin ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <LogIn className="w-4 h-4" />}
              <span className="hidden sm:inline capitalize">{role}</span>
              <LogOut className="hidden sm:block w-3.5 h-3.5" />
            </button>
            {/* Quick Metrics */}
            <div className="hidden 2xl:flex items-center gap-4 py-1.5 px-3 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Today Gross</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {todayRecord ? formatBDT(todayRecord.grossSales) : '৳0'}
                </span>
              </div>
              {role === 'admin' && <>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Today Net Profit</span>
                <span className={`font-mono tabular-nums font-semibold ${
                  (todayRecord?.netProfit ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                }`}>
                  {todayRecord ? formatBDT(todayRecord.netProfit) : '৳0'}
                </span>
              </div>
              </>}
            </div>

            {/* Facebook Page link */}
            {settings.facebookUrl && (
              <a
                href={settings.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
              title="Open Stall Facebook Page"
                aria-label="Open Stall Facebook Page"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-950/60 border border-blue-800/60 hover:bg-blue-100/60 dark:hover:bg-blue-900/60 rounded-lg transition"
              >
                <span className="font-bold text-blue-700 dark:text-blue-400">f</span>
                <span className="hidden sm:inline">Facebook</span>
              </a>
            )}

            {onOpenStatement && canAccessSection(role, 'foodcourt') && <CourtDueNotifications notices={dueNotices} onOpenStatement={onOpenStatement} />}
            {/* Settings & Backup */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg transition hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onOpenSettingsModal}
              title="Settings & Data Management"
              aria-label="Settings & Data Management"
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg transition hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav aria-label="Mobile sections" className="border-t border-slate-200 px-4 py-2 sm:hidden dark:border-slate-800">
        <select aria-label="Restaurant section" value={activeTab} onChange={event => setActiveTab(event.target.value)} className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
          {navItems.map(tab => <option key={tab.id} value={tab.id}>{tab.label}{tab.badge !== undefined ? ` (${tab.badge})` : ''}</option>)}
        </select>
      </nav>
      <div className="hidden sm:flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-200 dark:border-slate-850 overflow-x-auto">
        <nav className="flex space-x-1 py-1" aria-label="Tabs">
          {navItems.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-900/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="flex items-center justify-center bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
