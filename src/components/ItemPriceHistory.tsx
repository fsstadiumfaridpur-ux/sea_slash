import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { InventoryItem, PurchaseRecord } from "../types";
import type { VendorLedgerEntry } from "../utils/vendorLedger";
import {
  itemPriceHistory,
  itemPriceSummary,
  filterItemPrices,
  priceHistoryStartDate,
  formatItemPrice,
  type ItemPricePoint,
} from "../utils/itemPriceHistory";
import {
  formatBDT,
  formatNumber,
  formatDatePretty,
  getTodayString,
} from "../utils/formatters";
import { isViewDate } from "../utils/viewPreferences";
import { useRememberedViewState } from "../lib/useRememberedViewState";
const field =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
function PriceChart({
  points,
  onSelect,
  active,
}: {
  points: ItemPricePoint[];
  onSelect: (id: string) => void;
  active: string | undefined;
}) {
  const titleId = useId();
  if (!points.length) return null;
  const width = 880,
    height = 280,
    left = 85,
    right = 22,
    top = 22,
    bottom = 50,
    plotW = width - left - right,
    plotH = height - top - bottom;
  const values = points.map((point) => point.unitPrice),
    minimum = Math.min(...values),
    maximum = Math.max(...values),
    padding = Math.max((maximum - minimum) * 0.15, maximum * 0.05, 0.000001),
    low = Math.max(0, minimum - padding),
    high = maximum + padding;
  const timestamps = points.map((point) =>
      Date.parse(`${point.date}T12:00:00Z`),
    ),
    start = Math.min(...timestamps),
    end = Math.max(...timestamps);
  const x = (index: number) =>
    left +
    (end === start
      ? plotW / 2
      : ((timestamps[index] - start) / (end - start)) * plotW);
  const y = (value: number) => top + ((high - value) / (high - low)) * plotH;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[600px] w-full"
        role="group"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Purchase unit price over time. Select a point to inspect its vendor,
          quantity and price.
        </title>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = low + (high - low) * fraction;
          return (
            <g key={fraction}>
              <line
                x1={left}
                y1={y(value)}
                x2={width - right}
                y2={y(value)}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
              />
              <text
                x={left - 10}
                y={y(value) + 4}
                textAnchor="end"
                fill="currentColor"
                className="text-slate-500"
                fontSize={11}
              >
                {formatItemPrice(value)}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          stroke="#b7791f"
          strokeWidth={2.5}
          points={points
            .map((point, index) => `${x(index)},${y(point.unitPrice)}`)
            .join(" ")}
        />
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={x(index)}
            cy={y(point.unitPrice)}
            r={active === point.id ? 6 : 4}
            fill={active === point.id ? "#92400e" : "#d99b36"}
            stroke="white"
            strokeWidth={1.5}
            tabIndex={0}
            role="button"
            aria-label={`${point.date}, ${point.vendor}, ${formatItemPrice(point.unitPrice)} per ${point.unit}`}
            onMouseEnter={() => onSelect(point.id)}
            onFocus={() => onSelect(point.id)}
            onClick={() => onSelect(point.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(point.id);
              }
            }}
          >
            <title>{`${formatDatePretty(point.date)} · ${point.vendor} · ${formatItemPrice(point.unitPrice)}/${point.unit}`}</title>
          </circle>
        ))}
        {[0, 0.25, 0.5, 0.75, 1]
          .filter((_, index) => end !== start || index === 2)
          .map((fraction) => (
            <text
              key={fraction}
              x={left + plotW * fraction}
              y={height - 23}
              textAnchor={
                fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
              }
              fill="currentColor"
              className="text-slate-500"
              fontSize={11}
            >
              {new Date(start + (end - start) * fraction).toLocaleDateString(
                "en-GB",
                {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                },
              )}
            </text>
          ))}
      </svg>
    </div>
  );
}
export function ItemPriceHistory({
  item,
  inventory,
  ledger,
  purchases,
  vendors,
  onSelectItem,
  onClose,
}: {
  item: InventoryItem;
  inventory: InventoryItem[];
  ledger: VendorLedgerEntry[];
  purchases: PurchaseRecord[];
  vendors: { id: string; name: string }[];
  onSelectItem: (id: string) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useRememberedViewState<string>(
    "inventory.priceHistory.range",
    "all",
    (value) => ["7", "30", "90", "all", "custom"].includes(String(value)),
  );
  const today = getTodayString();
  const [from, setFrom] = useState(() => priceHistoryStartDate(today, 30)),
    [to, setTo] = useState(today),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [item.id, range, from, to]);
  const history = useMemo(
    () => itemPriceHistory(item, ledger, purchases, vendors),
    [item, ledger, purchases, vendors],
  );
  const invalid =
    range === "custom" && (!isViewDate(from) || !isViewDate(to) || from > to);
  const rows = useMemo(
    () =>
      invalid
        ? []
        : filterItemPrices(
            history.points,
            range === "all"
              ? ""
              : range === "custom"
                ? from
                : priceHistoryStartDate(today, Number(range)),
            range === "all" ? "" : range === "custom" ? to : today,
          ),
    [history.points, range, from, to, today, invalid],
  );
  const summary = itemPriceSummary(rows),
    chartPoints = rows.slice(-120),
    active =
      chartPoints.find((point) => point.id === selected) ?? chartPoints.at(-1),
    totalPages = Math.max(1, Math.ceil(rows.length / 20)),
    currentPage = Math.min(page, totalPages),
    tableRows = [...rows]
      .reverse()
      .slice((currentPage - 1) * 20, currentPage * 20);
  const ChangeIcon =
    summary.change === null || summary.change === 0
      ? Minus
      : summary.change > 0
        ? TrendingUp
        : TrendingDown;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-price-history-title"
        className="max-h-[94dvh] w-full max-w-6xl space-y-5 overflow-y-auto rounded-xl bg-white p-4 text-slate-900 shadow-xl sm:p-6 dark:bg-slate-950 dark:text-slate-100"
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
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="item-price-history-title" className="text-xl font-semibold">
              Item Price History
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Compare recorded purchase prices per {item.unit}.
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close item price history"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </header>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm">
            Inventory item
            <select
              aria-label="Price history item"
              className={`${field} mt-1 w-full`}
              value={item.id}
              onChange={(event) => onSelectItem(event.target.value)}
            >
              {inventory.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Period
            <select
              aria-label="Price history period"
              className={`${field} mt-1 block`}
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              <option value="all">All recorded history</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {range === "custom" && (
            <>
              <label className="text-sm">
                From
                <input
                  aria-label="Price history from date"
                  type="date"
                  className={`${field} mt-1 block`}
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="text-sm">
                To
                <input
                  aria-label="Price history to date"
                  type="date"
                  className={`${field} mt-1 block`}
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Current stock: {formatNumber(item.currentStock)} {item.unit} · Current
          inventory price:{" "}
          <strong>
            {formatItemPrice(item.unitCost)}/{item.unit}
          </strong>
          . Purchase prices below come from saved bills and Bazaar restocks.
        </p>
        {invalid && (
          <p role="alert" className="text-sm text-rose-600">
            Choose valid dates with From before or equal to To.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Latest purchase price",
              summary.latest
                ? `${formatItemPrice(summary.latest.unitPrice)}/${item.unit}`
                : "—",
            ],
            [
              "Previous purchase price",
              summary.previous
                ? `${formatItemPrice(summary.previous.unitPrice)}/${item.unit}`
                : "—",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold">{value}</p>
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Change from previous purchase
            </p>
            <p
              className={`mt-1 flex items-center gap-2 text-lg font-semibold ${summary.change !== null && summary.change > 0 ? "text-rose-600" : summary.change !== null && summary.change < 0 ? "text-emerald-700" : ""}`}
            >
              <ChangeIcon size={18} />
              {summary.percent === null
                ? "Not enough history"
                : `${summary.percent > 0 ? "+" : ""}${summary.percent.toLocaleString("en-BD", { maximumFractionDigits: 2 })}%`}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">Lowest / highest in period</p>
            <p className="mt-1 text-lg font-semibold">
              {summary.low === null
                ? "—"
                : `${formatItemPrice(summary.low)} / ${formatItemPrice(summary.high!)}`}
            </p>
            <p className="text-xs text-slate-500">per {item.unit}</p>
          </div>
        </div>
        {!!rows.length && (
          <>
            <PriceChart
              points={chartPoints}
              active={active?.id}
              onSelect={setSelected}
            />
            {active && (
              <div
                aria-live="polite"
                className="rounded-lg bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30"
              >
                <strong>
                  {formatDatePretty(active.date)} · {active.vendor}
                </strong>
                <span className="ml-2">
                  {formatItemPrice(active.unitPrice)}/{item.unit} ·{" "}
                  {formatNumber(active.quantity)} {item.unit} ·{" "}
                  {active.source === "vendor"
                    ? "Vendor bill"
                    : "Bazaar purchase"}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-500">
              {rows.length > 120
                ? "The graph shows the latest 120 purchases in this period. All purchases remain in the table. "
                : ""}
              Each point is a purchase. Same-day entries follow saved record
              order. Summary prices use the selected period.
            </p>
          </>
        )}
        {!rows.length && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h3 className="font-medium">
              {history.points.length
                ? "No purchases in this period"
                : "No purchase price history yet"}
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
              {history.points.length
                ? "Choose a wider date range to view earlier purchases."
                : "Save a vendor bill linked to this inventory item with its quantity and unit, or record a Bazaar restock. Its price will appear here automatically. Historical prices are not inferred from current stock."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Purchase & vendor history</h3>
          <span className="text-xs text-slate-500">
            {rows.length} purchase{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {!!rows.length && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <tr>
                    {[
                      "Date",
                      "Vendor / supplier",
                      "Quantity purchased",
                      `Price / ${item.unit}`,
                      "Bill total",
                      "Source",
                    ].map((label) => (
                      <th
                        key={label}
                        className="whitespace-nowrap p-3 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((point) => (
                    <tr
                      key={point.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="whitespace-nowrap p-3">
                        {formatDatePretty(point.date)}
                      </td>
                      <td className="p-3">{point.vendor}</td>
                      <td className="p-3">
                        <span className="whitespace-nowrap">
                          {formatNumber(point.originalQuantity)}{" "}
                          {point.originalUnit}
                        </span>
                        {point.originalUnit !== item.unit && (
                          <small className="block text-slate-500">
                            = {formatNumber(point.quantity)} {item.unit}
                          </small>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 font-medium">
                        {formatItemPrice(point.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {formatBDT(point.total)}
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {point.source === "vendor"
                          ? "Vendor bill"
                          : "Bazaar restock"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <nav
                aria-label="Purchase history pages"
                className="flex items-center justify-end gap-3 text-sm"
              >
                <button
                  disabled={currentPage === 1}
                  className={`${field} disabled:opacity-40`}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  className={`${field} disabled:opacity-40`}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
        <p className="text-xs text-slate-500">
          Payments and balance adjustments do not count as purchases. Compatible
          units are converted; package sizes are used only where the bill
          records received inventory quantity.{" "}
          {history.excluded > 0
            ? `${history.excluded} linked record(s) excluded because the date, quantity, total or unit conversion is missing or invalid.`
            : ""}
        </p>
      </div>
    </div>
  );
}
