import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { InventoryItem, PurchaseRecord, RecipeItem } from "../types";
import type { VendorLedgerEntry } from "../utils/vendorLedger";
import { overallFoodCosts } from "../utils/overallFoodCosts";
import {
  formatItemPrice,
  priceHistoryStartDate,
} from "../utils/itemPriceHistory";
import { getTodayString, formatDatePretty } from "../utils/formatters";
const percent = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}%`;
const field =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
export function OverallCostOverview({
  inventory,
  ledger,
  purchases,
  recipes,
  threshold,
  target,
  onThreshold,
  onTarget,
  onClose,
}: {
  inventory: InventoryItem[];
  ledger: VendorLedgerEntry[];
  purchases: PurchaseRecord[];
  recipes: RecipeItem[];
  threshold: number;
  target: number;
  onThreshold: (value: number) => void;
  onTarget: (value: number) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState("30"),
    [activeDate, setActiveDate] = useState<string | null>(null);
  const today = getTodayString();
  const model = useMemo(
    () =>
      overallFoodCosts(
        inventory,
        ledger,
        purchases,
        recipes,
        days === "all"
          ? "0001-01-01"
          : priceHistoryStartDate(today, Number(days)),
        today,
        threshold,
        target,
      ),
    [inventory, ledger, purchases, recipes, days, today, threshold, target],
  );
  const notice = useMemo(
    () =>
      overallFoodCosts(
        inventory,
        ledger,
        purchases,
        recipes,
        priceHistoryStartDate(today, 30),
        today,
        threshold,
        target,
      ),
    [inventory, ledger, purchases, recipes, today, threshold, target],
  );
  const dialog = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const points = model.series;
  const active =
    points.find((point) => point.date === activeDate) ?? points.at(-1);
  const min = points.length
      ? Math.min(100, ...points.map((point) => point.index)) - 2
      : 98,
    max = points.length
      ? Math.max(100, ...points.map((point) => point.index)) + 2
      : 102;
  const start = Date.parse(`${points[0]?.date ?? today}T12:00:00Z`),
    end = Date.parse(`${points.at(-1)?.date ?? today}T12:00:00Z`);
  const x = (date: string) =>
      80 +
      (end === start
        ? 360
        : ((Date.parse(`${date}T12:00:00Z`) - start) / (end - start)) * 720),
    y = (index: number) => 20 + ((max - index) / (max - min)) * 190;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overall-cost-title"
        className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-4 text-slate-900 shadow-xl sm:p-6 dark:bg-slate-950 dark:text-slate-100 space-y-5"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const elements = dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),select,input,[tabindex="0"]',
            );
            if (!elements?.length) return;
            const first = elements[0],
              last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="flex justify-between gap-4">
          <div>
            <h2 id="overall-cost-title" className="text-xl font-semibold">
              Overall Food Cost Monitor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ingredient prices, cost pressure and menu price reviews.
            </p>
          </div>
          <button
            ref={close}
            onClick={onClose}
            aria-label="Close food cost monitor"
            className="self-start rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </header>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [
              "Overall price movement",
              model.change === null
                ? "Need more history"
                : percent(model.change),
            ],
            ["Prices rising", String(model.rising)],
            ["Prices falling", String(model.falling)],
            ["Ingredients tracked", `${model.tracked} / ${inventory.length}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Overall ingredient price index</h3>
          <select
            aria-label="Overall cost period"
            className={field}
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setActiveDate(null);
            }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All history</option>
          </select>
        </div>
        {points.length > 1 ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
              <svg
                viewBox="0 0 840 260"
                className="min-w-[600px] w-full"
                role="group"
                aria-label="Weighted ingredient price index, starting at 100"
              >
                {[0, 0.5, 1].map((fraction) => {
                  const value = min + (max - min) * fraction;
                  return (
                    <g key={fraction}>
                      <line
                        x1={80}
                        x2={800}
                        y1={y(value)}
                        y2={y(value)}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <text
                        x={68}
                        y={y(value) + 4}
                        textAnchor="end"
                        fill="currentColor"
                        fontSize={12}
                      >
                        {value.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={80}
                  x2={800}
                  y1={y(100)}
                  y2={y(100)}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
                <polyline
                  fill="none"
                  stroke="#b7791f"
                  strokeWidth={3}
                  points={points
                    .map((point) => `${x(point.date)},${y(point.index)}`)
                    .join(" ")}
                />
                {points.map((point) => (
                  <circle
                    key={point.date}
                    cx={x(point.date)}
                    cy={y(point.index)}
                    r={active?.date === point.date ? 5 : 3}
                    fill="#b7791f"
                    tabIndex={0}
                    role="button"
                    aria-label={`${point.date}, index ${point.index.toFixed(2)}`}
                    onFocus={() => setActiveDate(point.date)}
                    onMouseEnter={() => setActiveDate(point.date)}
                    onClick={() => setActiveDate(point.date)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveDate(point.date);
                      }
                    }}
                  >
                    <title>
                      {formatDatePretty(point.date)} · {point.index.toFixed(2)}
                    </title>
                  </circle>
                ))}
                <text x={80} y={246} fill="currentColor" fontSize={12}>
                  {formatDatePretty(points[0].date)}
                </text>
                <text
                  x={800}
                  y={246}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize={12}
                >
                  {formatDatePretty(points.at(-1)!.date)}
                </text>
              </svg>
            </div>
            {active && (
              <p aria-live="polite" className="text-sm">
                {formatDatePretty(active.date)} · Index{" "}
                <strong>{active.index.toFixed(2)}</strong> ·{" "}
                {percent(active.index - 100)} since chart start · {active.items}{" "}
                priced items
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-sm text-slate-500">
            More dated purchases are needed for an overall trend. Linked vendor
            bills and Bazaar restocks build it automatically.
          </p>
        )}
        <p className="text-xs text-slate-500">
          100 = prices at chart start. Daily changes compare the same known
          ingredients using fixed quantities from their first recorded purchase.
          New ingredients join after their first price, without creating a price
          jump. This measures price movement, not total spending. Unknown prices
          are never filled in. {model.untracked} item(s) have no usable purchase
          price. Flat prices mean no recorded change, not a fresh market quote.
        </p>
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20 space-y-3">
          <h3 className="flex gap-2 font-semibold">
            <Bell size={18} /> Menu price review alerts
          </h3>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              Cost-rise alert (%)
              <select
                aria-label="Cost rise alert threshold"
                className={`${field} ml-2`}
                value={threshold}
                onChange={(event) => onThreshold(Number(event.target.value))}
              >
                {[3, 5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Target ingredient cost (% of selling price)
              <select
                aria-label="Target food cost percentage"
                className={`${field} ml-2`}
                value={target}
                onChange={(event) => onTarget(Number(event.target.value))}
              >
                {[25, 30, 35, 40, 45, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Alerts always use a rolling 30-day comparison, regardless of the
            chart period. Settings are remembered for your account in this
            browser. These are in-app alerts, refreshed when purchase data loads
            or changes.
          </p>
          {notice.ingredientAlerts.length > 0 && (
            <p className="text-sm">
              <strong>
                {notice.ingredientAlerts.length} ingredient price alert(s):
              </strong>{" "}
              {notice.ingredientAlerts
                .map((trend) => `${trend.item.name} ${percent(trend.change)}`)
                .join(" · ")}
            </p>
          )}
          {notice.recipeAlerts.length > 0 ? (
            <p role="status" className="text-sm font-medium">
              Review {notice.recipeAlerts.length} dish price(s): their
              ingredient costs rose by at least {threshold}%, or exceed your{" "}
              {target}% target.
            </p>
          ) : (
            <p className="text-sm">
              No menu price alerts from the available recipe data.
            </p>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {notice.uncostedRecipes} recipe(s) cannot be tracked: add linked
            ingredient quantities and purchase history in Menu Pricing.
            Direct-cost dishes cannot follow ingredient prices automatically.
            Public-menu items need a matching costing recipe; uploading a photo
            alone does not provide food cost.
          </p>
        </section>
        {notice.dishes.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">
              Recipe cost & selling price review · rolling 30 days
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500">
                    {[
                      "Dish",
                      "Ingredient cost: before → now",
                      "Change",
                      "Food cost %",
                      "Selling price",
                      "Review price guide",
                    ].map((label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...notice.dishes]
                    .sort(
                      (a, b) =>
                        Number(b.review) - Number(a.review) ||
                        b.change - a.change,
                    )
                    .map((dish) => (
                      <tr
                        key={dish.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="p-3 font-medium">
                          {dish.name}
                          {dish.review && (
                            <span className="block text-xs text-amber-700 dark:text-amber-400">
                              Review recommended
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {formatItemPrice(dish.baseCost)} →{" "}
                          {formatItemPrice(dish.currentCost)}
                        </td>
                        <td className="p-3">{percent(dish.change)}</td>
                        <td className="p-3">
                          {dish.foodCostPercent === null
                            ? "Set selling price"
                            : `${dish.foodCostPercent.toFixed(1)}%`}
                        </td>
                        <td className="p-3">
                          {formatItemPrice(dish.sellingPrice)}
                        </td>
                        <td className="p-3">
                          {dish.review && dish.suggestedPrice !== null
                            ? formatItemPrice(dish.suggestedPrice)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Before = latest known price at the start of 30 days, or the first
              available purchase for a newer item. The guide preserves the
              earlier ingredient-cost ratio and meets your chosen food-cost
              target, rounded up to ৳5. It excludes rent, wages, commission, VAT
              and other overheads. Review full profitability in Menu Pricing
              before changing prices. Selling prices are never changed
              automatically.
            </p>
          </section>
        )}
        <section className="space-y-2">
          <h3 className="font-semibold">
            All ingredient price movements · selected period
          </h3>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  {[
                    "Item",
                    "Baseline / unit",
                    "Latest / unit",
                    "Change",
                    "Latest purchase",
                  ].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.trends.map((trend) => (
                  <tr
                    key={trend.item.id}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="p-3 font-medium">
                      {trend.item.name}
                      <small className="block text-slate-500">
                        per {trend.item.unit}
                      </small>
                    </td>
                    <td className="p-3">
                      {formatItemPrice(trend.baseline.unitPrice)}
                      <small className="block text-slate-500">
                        {formatDatePretty(trend.baseline.date)}
                      </small>
                    </td>
                    <td className="p-3">
                      {formatItemPrice(trend.latest.unitPrice)}
                    </td>
                    <td
                      className={`p-3 ${trend.change > 0 ? "text-rose-600" : trend.change < 0 ? "text-emerald-700" : ""}`}
                    >
                      {trend.comparable
                        ? percent(trend.change)
                        : "First price only"}
                    </td>
                    <td className="p-3">
                      {formatDatePretty(trend.latest.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Item changes compare the latest price with the last known price at
            the period start, or the first available purchase.{" "}
            {model.excludedRecords > 0
              ? `${model.excludedRecords} invalid linked records excluded.`
              : ""}
          </p>
        </section>
      </div>
    </div>
  );
}
