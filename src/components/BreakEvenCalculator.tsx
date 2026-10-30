import { NumericInput } from "./NumericInput";
import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Check,
  Download,
  Save,
  Pencil,
  X,
  Settings2,
  Search,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import type {
  FoodCourtSettings,
  InventoryItem,
  RecipeItem,
  MenuPricingSettings,
  StaffMember,
} from "../types";
import { exportToCSV, formatBDT } from "../utils/formatters";
import { ingredientCost, MARGIN_OPTIONS } from "../utils/restaurantFinance";
import {
  menuOverhead,
  menuItemFinancials,
  menuPriceForMargin,
} from "../utils/menuPricing";

interface Props {
  onSyncPublicMenu: () => Promise<void>;
  settings: FoodCourtSettings;
  inventory: InventoryItem[];
  recipes: RecipeItem[];
  pricing: MenuPricingSettings;
  staff: StaffMember[];
  ready: boolean;
  onSaveRecipe: (recipe: RecipeItem) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
  onSavePricing: (pricing: MenuPricingSettings) => Promise<void>;
}

const inputClass =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const money = (value: number | null) =>
  value === null ? "Unavailable" : formatBDT(value);
const profitColor = (value: number | null) =>
  value === null
    ? "text-slate-500"
    : value < 0
      ? "text-rose-600 dark:text-rose-400"
      : "text-emerald-700 dark:text-emerald-400";

export function BreakEvenCalculator({
  settings,
  inventory,
  recipes,
  pricing,
  staff,
  ready,
  onSaveRecipe,
  onDeleteRecipe,
  onSavePricing,
  onSyncPublicMenu,
}: Props) {
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const syncCatalog = async () => {
    setCatalogBusy(true);
    setCatalogError("");
    try {
      await onSyncPublicMenu();
    } catch (failure) {
      setCatalogError(
        failure instanceof Error
          ? failure.message
          : "Could not load the public menu.",
      );
    } finally {
      setCatalogBusy(false);
    }
  };
  useEffect(() => {
    if (ready) void syncCatalog();
  }, [ready]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"menu" | "calculator">("menu");
  const [draft, setDraft] = useState<RecipeItem | null>(null);
  const [originalDraft, setOriginalDraft] = useState("");
  const [budget, setBudget] = useState(pricing);
  const [budgetOpen, setBudgetOpen] = useState(pricing.monthlyPortions <= 0);
  const [margin, setMargin] = useState(35);
  const [includeOperating, setIncludeOperating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [error, setError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [notice, setNotice] = useState("");
  const overhead = menuOverhead(pricing, settings, staff);
  const preview = draft
    ? menuItemFinancials(draft, inventory, pricing, settings, staff)
    : null;
  const recommendation = preview
    ? menuPriceForMargin(
        preview.foodCost,
        margin,
        includeOperating,
        preview.overhead.total,
        preview.commissionRate,
      )
    : null;
  const filtered = recipes.filter((r) =>
    `${r.dishName} ${r.portionSize}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const canDiscard = () =>
    !draft ||
    JSON.stringify(draft) === originalDraft ||
    window.confirm("Discard unsaved menu changes?");
  const openEditor = (recipe?: RecipeItem, inline = view === "calculator") => {
    if (!canDiscard()) return;
    const next = recipe
      ? structuredClone(recipe)
      : {
          id: crypto.randomUUID(),
          dishName: "",
          sellingPrice: 0,
          estimatedCOGS: 0,
          portionSize: "1 portion",
          ingredients: [],
          extraPortionCost: 0,
        };
    setDraft(next);
    setOriginalDraft(JSON.stringify(next));
    setError("");
    setNotice("");
    setView(inline ? "calculator" : "menu");
    if (inline) setBudgetOpen(false);
  };
  const closeEditor = () => {
    if (!canDiscard()) return;
    setDraft(null);
    setError("");
    setView("menu");
  };
  const update = (changes: Partial<RecipeItem>) =>
    setDraft((current) => (current ? { ...current, ...changes } : null));
  const updateIngredient = (
    index: number,
    changes: Partial<RecipeItem["ingredients"][number]>,
  ) => {
    if (draft)
      update({
        ingredients: draft.ingredients.map((ingredient, i) =>
          i === index ? { ...ingredient, ...changes } : ingredient,
        ),
      });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await onSaveRecipe(draft);
      setNotice(`${draft.dishName.trim()} saved to Supabase.`);
      if (view === "calculator") {
        const saved = {
          ...draft,
          dishName: draft.dishName.trim(),
          portionSize: draft.portionSize.trim(),
        };
        setDraft(saved);
        setOriginalDraft(JSON.stringify(saved));
      } else setDraft(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save the menu item. Your edits are still open.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (recipe: RecipeItem) => {
    if (
      !window.confirm(
        recipe.publicMenuItemId
          ? `Clear the recipe for ${recipe.dishName}? Its photo, menu price and public menu item will stay.`
          : `Delete ${recipe.dishName} from the saved menu?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (recipe.publicMenuItemId) {
        await onSaveRecipe({
          ...recipe,
          ingredients: [],
          costingMode: "recipe",
          directCost: undefined,
          extraPortionCost: 0,
          estimatedCOGS: 0,
        });
        setNotice(
          `${recipe.dishName}: recipe cleared. Add ingredients when ready.`,
        );
      } else {
        await onDeleteRecipe(recipe.id);
        setNotice(`${recipe.dishName} removed from the saved menu.`);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not remove menu item.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    setBudgetBusy(true);
    setBudgetError("");
    setNotice("");
    try {
      await onSavePricing(budget);
      setNotice("Cost setup saved to Supabase.");
    } catch (failure) {
      setBudgetError(
        failure instanceof Error
          ? failure.message
          : "Could not save cost setup.",
      );
    } finally {
      setBudgetBusy(false);
    }
  };
  const exportMenu = () =>
    exportToCSV(
      "mughal_mahal_menu_costs",
      recipes.map((recipe) => {
        const f = menuItemFinancials(
          recipe,
          inventory,
          pricing,
          settings,
          staff,
        );
        const row: Record<string, unknown> = {
          Dish: recipe.dishName,
          Portion: recipe.portionSize,
          CostingMethod: recipe.costingMode ?? "recipe",
          FoodOnlyCost_BDT: f.foodCost ?? "Unavailable",
          RentPerPortion_BDT: f.overhead.rent ?? "Unavailable",
          LPGPerPortion_BDT: f.overhead.lpg ?? "Unavailable",
          StaffPerPortion_BDT: f.overhead.salary ?? "Unavailable",
          CommissionPercent: f.commissionRate * 100,
          CommissionPerPortion_BDT: f.commission,
          FullCost_BDT: f.fullCost ?? "Unavailable",
          SellingPrice_BDT: recipe.sellingPrice,
          FoodOnlyProfit_BDT: f.grossProfit ?? "Unavailable",
          NetProfit_BDT: f.netProfit ?? "Unavailable",
          NetMarginPercent: f.netMargin ?? "Unavailable",
          ExpectedMonthlyPortions: pricing.monthlyPortions,
        };
        for (const pct of MARGIN_OPTIONS)
          row[`FullCostPriceAt${pct}PercentMargin`] =
            menuPriceForMargin(
              f.foodCost,
              pct,
              true,
              f.overhead.total,
              f.commissionRate,
            ) ?? "Unavailable";
        return row;
      }),
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Saved Menu & Pricing</h2>
          <p className="mt-1 text-xs text-slate-500">
            {recipes.length} saved menu items / Add recipes to calculate food
            cost and profit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={!ready || busy || catalogBusy}
            onClick={() => {
              if (canDiscard()) {
                setDraft(null);
                void syncCatalog();
              }
            }}
            className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {catalogBusy ? "Loading menu..." : "Refresh from Public Menu"}
          </button>
          <button
            title="Cost setup"
            aria-label="Cost setup"
            onClick={() => {
              setBudget(pricing);
              setBudgetOpen(!budgetOpen);
            }}
            className="rounded-md border border-slate-300 p-2 dark:border-slate-700"
          >
            <Settings2 size={18} />
          </button>
          <button
            disabled={!recipes.length || !ready}
            onClick={exportMenu}
            className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 disabled:opacity-50"
          >
            <Download size={16} />
            Export Menu
          </button>
          <button
            disabled={!ready || busy || catalogBusy}
            onClick={() => openEditor()}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            <Plus size={16} />
            Add Menu Item
          </button>
        </div>
      </header>
      <p className="text-xs text-slate-500">
        Photos, names and selling prices are loaded from Public Menu, including
        hidden and unavailable dishes. Existing recipes are preserved. Update
        photos and live prices in Public Menu; add ingredients here when ready.
      </p>
      {catalogError && (
        <p role="alert" className="text-sm text-rose-600">
          {catalogError} Use “Refresh from Public Menu” to retry.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}
      {error && !draft && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {!ready && (
        <p role="status" className="text-sm text-slate-500">
          Waiting for Supabase menu data...
        </p>
      )}
      {budgetOpen && (
        <section className="space-y-4 border-y border-slate-200 py-5 dark:border-slate-800">
          <h3 className="text-base font-semibold">Monthly Cost Setup</h3>
          <form onSubmit={saveBudget} className="space-y-4">
            <fieldset
              disabled={budgetBusy || !ready}
              className="grid gap-4 sm:grid-cols-3"
            >
              <label className="text-xs font-medium">
                Expected Portions Sold / Month
                <NumericInput
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={budget.monthlyPortions}
                  onChange={(e) =>
                    setBudget({
                      ...budget,
                      monthlyPortions: Number(e.target.value),
                    })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium">
                LPG Budget / Month (BDT)
                <NumericInput
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={budget.monthlyLpgCost}
                  onChange={(e) =>
                    setBudget({
                      ...budget,
                      monthlyLpgCost: Number(e.target.value),
                    })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium">
                Operating Days / Month
                <NumericInput
                  required
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={budget.operatingDays}
                  onChange={(e) =>
                    setBudget({
                      ...budget,
                      operatingDays: Number(e.target.value),
                    })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
            </fieldset>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Monthly Rent</dt>
                <dd className="mt-1 font-semibold">
                  {formatBDT(settings.monthlyRent)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Monthly Staff Budget</dt>
                <dd className="mt-1 font-semibold">
                  {formatBDT(menuOverhead(budget, settings, staff).payroll)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sales Commission</dt>
                <dd className="mt-1 font-semibold">
                  {(settings.commissionRate * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  Saved Rent + LPG + Staff / Portion
                </dt>
                <dd className="mt-1 font-semibold">{money(overhead.total)}</dd>
              </div>
            </dl>
            {budgetError && (
              <p
                role="alert"
                className="text-sm text-rose-600 dark:text-rose-400"
              >
                {budgetError}
              </p>
            )}
            <button
              disabled={budgetBusy || !ready}
              type="submit"
              className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-200 dark:text-slate-950 disabled:opacity-50"
            >
              <Save size={16} />
              {budgetBusy ? "Saving..." : "Save Cost Setup"}
            </button>
          </form>
        </section>
      )}
      <div
        role="tablist"
        aria-label="Menu pricing views"
        className="flex gap-4 border-b border-slate-200 dark:border-slate-700"
      >
        <button
          role="tab"
          aria-selected={view === "menu"}
          disabled={busy}
          onClick={closeEditor}
          className={`px-1 py-3 text-sm font-semibold ${view === "menu" ? "border-b-2 border-amber-500" : "text-slate-500"}`}
        >
          Saved Menu
        </button>
        <button
          role="tab"
          aria-selected={view === "calculator"}
          disabled={busy || !ready || catalogBusy}
          onClick={() => {
            if (view !== "calculator") openEditor(recipes[0], true);
          }}
          className={`px-1 py-3 text-sm font-semibold ${view === "calculator" ? "border-b-2 border-amber-500" : "text-slate-500"}`}
        >
          Recipe Calculator
        </button>
      </div>
      {view === "menu" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Menu Items</h3>
            <div className="relative w-full max-w-xs">
              <Search
                size={16}
                className="absolute left-3 top-2.5 text-slate-500"
              />
              <input
                aria-label="Search menu items"
                placeholder="Search menu"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
          {overhead.total === null && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Monthly portion volume not set. Full cost and net profit
              unavailable.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-300 text-xs text-slate-500 dark:border-slate-700">
                <tr>
                  {[
                    "Menu Item",
                    "Food-Only Cost",
                    "Full Cost",
                    "Selling Price",
                    "Food-Only Profit",
                    "Net Profit",
                    "Net Margin",
                    "Actions",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((recipe) => {
                  const f = menuItemFinancials(
                    recipe,
                    inventory,
                    pricing,
                    settings,
                    staff,
                  );
                  return (
                    <tr
                      key={recipe.id}
                      className="border-b border-slate-200 dark:border-slate-800"
                    >
                      <td className="min-w-64 max-w-80 break-words px-3 py-4">
                        <div className="flex items-start gap-3">
                          {recipe.photoUrl ? (
                            <img
                              src={recipe.photoUrl}
                              alt={recipe.dishName}
                              loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-contain dark:bg-slate-800"
                            />
                          ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                              <ImageIcon size={22} />
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => openEditor(recipe)}
                              disabled={!ready || busy || catalogBusy}
                              className="text-left font-semibold underline decoration-slate-300 underline-offset-4"
                            >
                              {recipe.dishName}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">
                              {recipe.portionSize}
                            </p>
                            {recipe.costingMode === "direct" && (
                              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                                Direct cost
                              </p>
                            )}
                            {recipe.menuCategory && (
                              <p className="mt-1 text-xs text-slate-500">
                                {recipe.menuCategory}
                              </p>
                            )}
                            {f.foodCost === null && (
                              <p className="mt-1 text-xs text-rose-600">
                                {recipe.costingMode !== "direct" &&
                                !recipe.ingredients.length
                                  ? "Recipe needed"
                                  : "Costing incomplete"}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 tabular-nums">
                        {money(f.foodCost)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 tabular-nums">
                        {money(f.fullCost)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 font-semibold tabular-nums">
                        {formatBDT(recipe.sellingPrice)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-4 tabular-nums ${profitColor(f.grossProfit)}`}
                      >
                        {money(f.grossProfit)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-4 font-semibold tabular-nums ${profitColor(f.netProfit)}`}
                      >
                        {money(f.netProfit)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        {f.netMargin === null
                          ? "Unavailable"
                          : `${f.netMargin.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex gap-1">
                          <button
                            title="Edit menu item"
                            aria-label={`Edit ${recipe.dishName}`}
                            disabled={busy || !ready || catalogBusy}
                            onClick={() => openEditor(recipe)}
                            className="p-2"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            title={
                              recipe.publicMenuItemId
                                ? "Clear recipe"
                                : "Delete menu item"
                            }
                            aria-label={`${recipe.publicMenuItemId ? "Clear recipe for" : "Delete"} ${recipe.dishName}`}
                            disabled={busy || !ready || catalogBusy}
                            onClick={() => remove(recipe)}
                            className="p-2 text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="py-8 text-sm text-slate-500">
                {recipes.length
                  ? "No matching menu items."
                  : "No saved menu items."}
              </p>
            )}
          </div>
        </section>
      )}
      {draft && preview && (
        <div
          className={
            view === "menu"
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5"
              : "space-y-4"
          }
        >
          <section
            role={view === "menu" ? "dialog" : "tabpanel"}
            aria-modal={view === "menu" ? true : undefined}
            aria-labelledby="menu-edit-title"
            className={
              view === "menu"
                ? "flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100"
                : "w-full text-slate-900 dark:text-slate-100"
            }
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 id="menu-edit-title" className="text-base font-semibold">
                {view === "calculator"
                  ? "Recipe Calculator"
                  : recipes.some((r) => r.id === draft.id)
                    ? "Edit Menu Item"
                    : "New Menu Item"}
              </h2>
              <button
                type="button"
                disabled={busy}
                title="Close"
                aria-label="Close menu editor"
                onClick={closeEditor}
                className="p-2"
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={save} className="flex min-h-0 flex-col">
              <div
                className={
                  view === "menu" ? "overflow-y-auto p-5" : "space-y-5 py-5"
                }
              >
                {view === "calculator" && (
                  <label className="block max-w-xl text-xs font-medium">
                    Menu Item
                    <select
                      disabled={busy}
                      value={draft.id}
                      onChange={(e) =>
                        openEditor(
                          recipes.find((r) => r.id === e.target.value),
                          true,
                        )
                      }
                      className={`${inputClass} mt-1`}
                    >
                      {!recipes.some((r) => r.id === draft.id) && (
                        <option value={draft.id}>New Menu Item</option>
                      )}
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.dishName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <fieldset
                  disabled={busy}
                  className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
                >
                  <section className="min-w-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium">
                        Dish Name
                        <input
                          required
                          disabled={!!draft.publicMenuItemId}
                          value={draft.dishName}
                          onChange={(e) => update({ dishName: e.target.value })}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Portion Size
                        <input
                          required
                          value={draft.portionSize}
                          onChange={(e) =>
                            update({ portionSize: e.target.value })
                          }
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                    </div>
                    <div
                      role="group"
                      aria-label="Costing method"
                      className="flex gap-2"
                    >
                      {(["recipe", "direct"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={
                            (draft.costingMode ?? "recipe") === mode
                          }
                          onClick={() => {
                            if ((draft.costingMode ?? "recipe") !== mode)
                              update({
                                costingMode: mode,
                                operatingCosts: undefined,
                              });
                            setIncludeOperating(true);
                          }}
                          className={`rounded-md px-3 py-2 text-sm font-semibold ${(draft.costingMode ?? "recipe") === mode ? "bg-amber-500 text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}
                        >
                          {mode === "recipe" ? "Recipe Cost" : "Direct Cost"}
                        </button>
                      ))}
                    </div>
                    {draft.costingMode === "direct" ? (
                      <div className="space-y-4">
                        <label className="block text-xs font-medium">
                          Direct Cost per Portion (BDT)
                          <NumericInput
                            required
                            type="number"
                            min="0.01"
                            step="any"
                            value={draft.directCost ?? 0}
                            onChange={(e) =>
                              update({ directCost: Number(e.target.value) })
                            }
                            className={`${inputClass} mt-1`}
                          />
                        </label>
                        <fieldset className="space-y-2">
                          <legend className="mb-2 text-xs font-semibold">
                            Included Operating Costs
                          </legend>
                          {(
                            ["rent", "lpg", "staff", "commission"] as const
                          ).map((key) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={draft.operatingCosts?.[key] ?? false}
                                onChange={(e) =>
                                  update({
                                    operatingCosts: {
                                      rent: false,
                                      lpg: false,
                                      staff: false,
                                      commission: false,
                                      ...draft.operatingCosts,
                                      [key]: e.target.checked,
                                    },
                                  })
                                }
                              />
                              {key === "lpg"
                                ? "LPG"
                                : key === "commission"
                                  ? `Commission (${(settings.commissionRate * 100).toFixed(1)}%)`
                                  : key === "rent"
                                    ? "Rent"
                                    : "Staff"}
                            </label>
                          ))}
                        </fieldset>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                          <h3 className="text-sm font-semibold">
                            Ingredients per Portion
                          </h3>
                          <button
                            type="button"
                            title="Add ingredient"
                            aria-label="Add ingredient"
                            disabled={!inventory.length}
                            onClick={() => {
                              const item = inventory[0];
                              update({
                                ingredients: [
                                  ...draft.ingredients,
                                  {
                                    inventoryItemId: item.id,
                                    itemName: item.name,
                                    quantity: 0,
                                    unit: item.unit,
                                  },
                                ],
                              });
                            }}
                            className="p-2 disabled:opacity-50"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <div className="space-y-3">
                          {draft.ingredients.map((ingredient, index) => {
                            const item = inventory.find(
                              (stock) =>
                                stock.id === ingredient.inventoryItemId,
                            );
                            const lineCost = item
                              ? ingredientCost(
                                  ingredient.quantity,
                                  ingredient.unit,
                                  item,
                                )
                              : null;
                            return (
                              <div
                                key={index}
                                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 sm:grid-cols-[minmax(0,1fr)_85px_80px_32px]"
                              >
                                <div className="col-span-3 sm:col-span-1">
                                  <select
                                    aria-label={`Ingredient ${index + 1}`}
                                    value={ingredient.inventoryItemId}
                                    onChange={(e) => {
                                      const next = inventory.find(
                                        (stock) => stock.id === e.target.value,
                                      )!;
                                      updateIngredient(index, {
                                        inventoryItemId: next.id,
                                        itemName: next.name,
                                        unit: next.unit,
                                      });
                                    }}
                                    className={inputClass}
                                  >
                                    {!item && (
                                      <option
                                        value={ingredient.inventoryItemId}
                                      >
                                        Missing: {ingredient.itemName}
                                      </option>
                                    )}
                                    {inventory.map((stock) => (
                                      <option key={stock.id} value={stock.id}>
                                        {stock.name}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {item
                                      ? `${formatBDT(item.unitCost)}/${item.unit}`
                                      : "Ingredient unavailable"}{" "}
                                    / Line cost: {money(lineCost)}
                                  </p>
                                </div>
                                <NumericInput
                                  required
                                  aria-label={`Ingredient quantity ${index + 1}`}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={ingredient.quantity}
                                  onChange={(e) =>
                                    updateIngredient(index, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                  className={inputClass}
                                />
                                <select
                                  aria-label={`Ingredient unit ${index + 1}`}
                                  value={ingredient.unit}
                                  onChange={(e) =>
                                    updateIngredient(index, {
                                      unit: e.target.value,
                                    })
                                  }
                                  className={inputClass}
                                >
                                  {[
                                    ...new Set([
                                      ingredient.unit,
                                      item?.unit ?? ingredient.unit,
                                      ...(item?.unit === "kg" ||
                                      item?.unit === "gram"
                                        ? ["kg", "gram"]
                                        : []),
                                    ]),
                                  ].map((unit) => (
                                    <option key={unit}>{unit}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  title="Remove ingredient"
                                  aria-label={`Remove ingredient ${index + 1}`}
                                  onClick={() =>
                                    update({
                                      ingredients: draft.ingredients.filter(
                                        (_, i) => i !== index,
                                      ),
                                    })
                                  }
                                  className="p-2 text-rose-600"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            );
                          })}
                          {!draft.ingredients.length && (
                            <p className="text-sm text-slate-500">
                              No ingredients added.
                            </p>
                          )}
                        </div>
                        <label className="block text-xs font-medium">
                          Extra Food / Packaging Cost per Portion (BDT)
                          <NumericInput
                            required
                            type="number"
                            min="0"
                            step="any"
                            value={draft.extraPortionCost ?? 0}
                            onChange={(e) =>
                              update({
                                extraPortionCost: Number(e.target.value),
                              })
                            }
                            className={`${inputClass} mt-1`}
                          />
                        </label>
                      </>
                    )}
                    <label className="block text-xs font-medium">
                      Selling Price (BDT)
                      {draft.publicMenuItemId && (
                        <span className="block mt-1 font-normal text-slate-500">
                          From Public Menu. Change the live price there, then
                          refresh this list.
                        </span>
                      )}
                      <NumericInput
                        disabled={!!draft.publicMenuItemId}
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={draft.sellingPrice}
                        onChange={(e) =>
                          update({ sellingPrice: Number(e.target.value) })
                        }
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  </section>
                  <section className="min-w-0 space-y-4 border-t border-slate-200 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0 dark:border-slate-700">
                    <h3 className="text-sm font-semibold">
                      Cost & Profit per Portion
                    </h3>
                    <dl className="space-y-2 text-sm">
                      {[
                        ["Food-only cost", preview.foodCost],
                        ["Rent", preview.overhead.rent],
                        ["LPG", preview.overhead.lpg],
                        ["Staff", preview.overhead.salary],
                        [
                          `Commission (${(preview.commissionRate * 100).toFixed(1)}%)`,
                          preview.commission,
                        ],
                        ["Full cost", preview.fullCost],
                        ["Food-only profit", preview.grossProfit],
                        ["Net profit", preview.netProfit],
                      ].map(([label, value]) => (
                        <div
                          key={label as string}
                          className="flex justify-between gap-3"
                        >
                          <dt>{label}</dt>
                          <dd className="shrink-0 font-semibold tabular-nums">
                            {money(value as number | null)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label
                          htmlFor="target-profit-margin"
                          className="text-sm font-semibold"
                        >
                          Target Profit Margin
                        </label>
                        <output
                          htmlFor="target-profit-margin"
                          className="text-sm font-semibold tabular-nums"
                        >
                          {margin}%
                        </output>
                      </div>
                      <div className="px-2">
                        <input
                          id="target-profit-margin"
                          type="range"
                          min="10"
                          max="100"
                          step="1"
                          value={margin}
                          aria-valuetext={`${margin}% profit margin`}
                          onChange={(e) => setMargin(Number(e.target.value))}
                          className="block h-8 w-full cursor-pointer accent-amber-500"
                        />
                        <div
                          aria-hidden="true"
                          className="flex justify-between text-[11px] tabular-nums text-slate-500"
                        >
                          <span>10%</span>
                          <span>100%</span>
                        </div>
                      </div>
                      <label className="my-3 flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={includeOperating}
                          onChange={(e) =>
                            setIncludeOperating(e.target.checked)
                          }
                          className="mt-0.5"
                        />
                        Apply included operating costs to suggested prices
                      </label>
                      <p className="text-xs text-slate-500">
                        Suggested Price /{" "}
                        {includeOperating ? "Net" : "Food-Only"} Margin
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {money(recommendation)}
                      </p>
                      {margin / 100 +
                        (includeOperating ? preview.commissionRate : 0) >=
                        1 && (
                        <p
                          role="status"
                          className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                        >
                          No valid price: profit margin plus included commission
                          must be below 100%.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={
                          recommendation === null || !!draft.publicMenuItemId
                        }
                        onClick={() =>
                          update({ sellingPrice: recommendation! })
                        }
                        className="mt-3 flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Check size={16} />
                        Use Suggested Price
                      </button>
                    </div>
                    {preview.foodCost === null && (
                      <p className="text-xs text-rose-600">
                        Costs are incomplete or unavailable.
                      </p>
                    )}
                  </section>
                </fieldset>
                <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h3 className="mb-3 text-sm font-semibold">
                    Margin Comparison /{" "}
                    {includeOperating ? "With Operating Costs" : "Food Only"}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2">Target</th>
                          <th>Price</th>
                          <th>Profit</th>
                          <th>Margin</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {MARGIN_OPTIONS.map((target) => {
                          const price = menuPriceForMargin(
                            preview.foodCost,
                            target,
                            includeOperating,
                            preview.overhead.total,
                            preview.commissionRate,
                          );
                          const profit =
                            price === null || preview.foodCost === null
                              ? null
                              : price *
                                  (1 -
                                    (includeOperating
                                      ? preview.commissionRate
                                      : 0)) -
                                preview.foodCost -
                                (includeOperating
                                  ? preview.overhead.total!
                                  : 0);
                          return (
                            <tr
                              key={target}
                              className="border-b border-slate-100 dark:border-slate-800"
                            >
                              <td className="py-3">{target}%</td>
                              <td>{money(price)}</td>
                              <td>{money(profit)}</td>
                              <td>
                                {price !== null && profit !== null
                                  ? `${((profit / price) * 100).toFixed(1)}%`
                                  : "Unavailable"}
                              </td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  disabled={
                                    busy ||
                                    price === null ||
                                    !!draft.publicMenuItemId
                                  }
                                  title={`Use ${target}% price`}
                                  aria-label={`Use ${target}% price`}
                                  onClick={() => {
                                    setMargin(target);
                                    update({ sellingPrice: price! });
                                  }}
                                  className="p-2 disabled:opacity-40"
                                >
                                  <Check size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
              <footer className="shrink-0 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
                {error && (
                  <p
                    role="alert"
                    className="mb-3 text-sm text-rose-600 dark:text-rose-400"
                  >
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={closeEditor}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !ready || catalogBusy}
                    className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {busy ? "Saving..." : "Save Menu Item"}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
