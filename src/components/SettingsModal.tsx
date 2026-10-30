import {AccountSecurity} from './AccountSecurity';
import { roundMoney } from '../utils/money';
import { NumericInput } from './NumericInput';
import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Building,
  DollarSign,
  Download,
  Upload,
  RefreshCw,
  Check,
  Percent,
} from 'lucide-react';
import { FoodCourtSettings } from '../types';
import { formatBDT } from '../utils/formatters';

interface SettingsModalProps {
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  settings: FoodCourtSettings;
  onSaveSettings: (settings: FoodCourtSettings) => void;
  onExportAllData: () => void;
  onImportData: (jsonData: string) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isAdmin,
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onExportAllData,
  onImportData,
  onResetData,
}) => {
  const [panel,setPanel]=useState<'restaurant'|'security'>('restaurant');
  const [stallName, setStallName] = useState(settings.stallName);
  const [foodCourtName, setFoodCourtName] = useState(settings.foodCourtName);
  const [stallNumber, setStallNumber] = useState(settings.stallNumber);
  const [monthlyRent, setMonthlyRent] = useState<number>(settings.monthlyRent);
  const [commissionPct, setCommissionPct] = useState<number>(settings.commissionRate * 100);
  const [managerContact, setManagerContact] = useState(settings.managerContact);

  useEffect(() => {
    if (!isOpen) return;
    setStallName(settings.stallName);
    setFoodCourtName(settings.foodCourtName);
    setStallNumber(settings.stallNumber);
    setMonthlyRent(settings.monthlyRent);
    setCommissionPct(settings.commissionRate * 100);
    setManagerContact(settings.managerContact);
  }, [isOpen, settings]);

  useEffect(()=>{if(isOpen)setPanel('restaurant');},[isOpen]);

  if (!isOpen) return null;

  const calculatedDailyRent = roundMoney(monthlyRent / 30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      ...settings,
      stallName,
      foodCourtName,
      stallNumber,
      monthlyRent,
      dailyRent: calculatedDailyRent,
      commissionRate: commissionPct / 100,
      managerContact,
    });
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        onImportData(content);
        onClose();
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label="Restaurant settings" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-xl my-8 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>Restaurant Settings</span>
          </h2>
          <button aria-label="Close restaurant settings" title="Close restaurant settings" onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="tablist" aria-label="Settings sections" className="flex gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">{([['restaurant','Restaurant settings'],['security','Account security']] as const).map(([value,label])=><button key={value} type="button" role="tab" aria-selected={panel===value} onClick={()=>setPanel(value)} className={`rounded-md px-3 py-2 text-sm font-medium ${panel===value?'bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-100':'text-slate-500'}`}>{label}</button>)}</div>
        {panel==='security'?<AccountSecurity/>:<form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Stall Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Restaurant Identity
            </h3>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Restaurant Name</label>
              <input
                type="text"
                required
                value={stallName}
                onChange={e => setStallName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Location / Venue</label>
                <input
                  type="text"
                  value={foodCourtName}
                  onChange={e => setFoodCourtName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Branch / Unit</label>
                <input
                  type="text"
                  value={stallNumber}
                  onChange={e => setStallNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Lease & Commission Parameters */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Rent & Sales Commission
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">
                  Fixed Monthly Rent (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">৳</span>
                  <NumericInput
                    type="number"
                    min="0"
                    step="any"
                    value={monthlyRent}
                    onChange={e => setMonthlyRent(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block">
                  Prorated Daily Rent: <strong className="text-indigo-700 dark:text-indigo-300">{formatBDT(calculatedDailyRent)} / day</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">
                  Sales Commission Rate (%)
                </label>
                <div className="relative">
                  <NumericInput
                    type="number"
                    min="0"
                    max="50"
                    step="any"
                    value={commissionPct}
                    onChange={e => setCommissionPct(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                  />
                  <span className="absolute right-3 top-2 text-slate-600 dark:text-slate-400 text-xs font-bold">%</span>
                </div>
                <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 block">
                  Set to 0 if no sales commission applies
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Management Contact</label>
              <input
                type="text"
                value={managerContact}
                onChange={e => setManagerContact(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Backup & Data Controls */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Data Management & Backup
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {isAdmin && <button
                type="button"
                onClick={onExportAllData}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>Export JSON Backup</span>
              </button>}

              {isAdmin && <label className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                <span>Import Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>}

              <button
                type="button"
                disabled={!isAdmin}
                title={isAdmin ? 'Reset demo data' : 'Admin login required'}
                onClick={() => {
                  if (confirm('Reset to default stall demo data? Your current changes will be overwritten.')) {
                    onResetData();
                    onClose();
                  }
                }}
                className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 border border-rose-200/40 dark:border-rose-900/40 rounded-lg text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-100/30 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Demo Data</span>
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
};
