import { useEffect, useState, useRef } from "react";
import { Printer, RefreshCw, Save, X, ShoppingBag } from "lucide-react";
import {
  loadCustomerOrders,
  loadOrderingSettings,
  saveOrderingSettings,
  updateCustomerOrder,
} from "../lib/customerOrders";
import {
  canTransitionOrder,
  defaultOrderingSettings,
  orderStatuses,
  orderStatusLabel,
  type CustomerOrder,
  type OrderingSettings,
} from "../utils/customerOrders";
import { printCustomerOrderReceipt } from "../utils/customerOrderPrint";
import { formatBDT } from "../utils/formatters";
const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
function OrderEditor({
  order,
  onClose,
  onSaved,
}: {
  order: CustomerOrder;
  onClose: () => void;
  onSaved: (order: CustomerOrder) => void;
}) {
  const [status, setStatus] = useState(order.status),
    [fee, setFee] = useState(
      order.delivery_fee === null ? "" : String(order.delivery_fee),
    ),
    [paid, setPaid] = useState(String(order.paid_amount)),
    [note, setNote] = useState(order.staff_note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null),
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
  const dirty =
    status !== order.status ||
    fee !== (order.delivery_fee === null ? "" : String(order.delivery_fee)) ||
    Number(paid) !== order.paid_amount ||
    note !== order.staff_note;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(
        await updateCustomerOrder(
          order,
          status,
          fee === "" ? null : Number(fee),
          Number(paid),
          note,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <section
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const elements = dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-editor-title"
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-950 dark:text-white"
      >
        <header className="mb-4 flex justify-between gap-3">
          <div>
            <h2 id="order-editor-title" className="text-lg font-semibold">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h2>
            <p className="text-xs text-slate-500">
              {new Date(order.created_at).toLocaleString("en-GB", {
                timeZone: "Asia/Dhaka",
              })}
            </p>
          </div>
          <button ref={close} aria-label="Close order" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
          <strong>{order.customer_name}</strong> ·{" "}
          <a href={`tel:${order.phone}`} className="underline">
            {order.phone}
          </a>
          <p className="mt-1">
            {order.area} · {order.address}
          </p>
          {order.notes && <p className="mt-2">Customer note: {order.notes}</p>}
        </div>
        <ul className="my-4 divide-y divide-slate-100 dark:divide-slate-800">
          {order.items.map((line) => (
            <li
              key={line.id}
              className="flex justify-between gap-3 py-3 text-sm"
            >
              <span>
                {line.quantity} × {line.name}
              </span>
              <strong>{formatBDT(line.quantity * line.price)}</strong>
            </li>
          ))}
        </ul>
        <p className="mb-3 text-sm">
          <strong>Food subtotal: {formatBDT(order.subtotal)}</strong>
        </p>
        {order.payment_method === "bkash" && (
          <p className="mb-4 rounded-lg bg-pink-50 p-3 text-sm text-pink-950">
            bKash transaction: <strong>{order.transaction_id}</strong>. Check
            your merchant account before recording received money.
          </p>
        )}
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Order status
              <select
                className={`${field} mt-1`}
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                {orderStatuses
                  .filter((value) => canTransitionOrder(order.status, value))
                  .map((value) => (
                    <option key={value} value={value}>
                      {orderStatusLabel(value)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Delivery charge · choose before printing
              <select
                aria-label="Delivery charge for order"
                className={`${field} mt-1`}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                disabled={["completed", "cancelled"].includes(order.status)}
              >
                <option value="">Not confirmed yet</option>
                {[20, 40, 60].map((value) => (
                  <option key={value} value={value}>
                    ৳{value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Verified amount received (BDT)
              <input
                required
                type="number"
                min={0}
                step="0.01"
                max={order.subtotal + (Number(fee) || 0)}
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <div className="pt-2 text-sm">
              <p>
                Total{fee === "" ? " + delivery" : ""}:{" "}
                <strong>
                  {formatBDT(order.subtotal + (Number(fee) || 0))}
                </strong>
              </p>
              <p>
                Due{fee === "" ? " + delivery" : ""}:{" "}
                <strong>
                  {formatBDT(
                    Math.max(
                      0,
                      order.subtotal + (Number(fee) || 0) - (Number(paid) || 0),
                    ),
                  )}
                </strong>
              </p>
            </div>
          </div>
          <label className="block text-sm">
            Internal note
            <textarea
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <p className="text-xs text-slate-500">
            Record only money you have verified. Orders do not automatically
            post sales or bKash ledger entries; include delivered orders in your
            regular sales entry. Cancellation does not issue refunds.
          </p>
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              <Save size={16} />
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy || dirty || order.delivery_fee === null}
              onClick={() => {
                try {
                  printCustomerOrderReceipt(order);
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
            >
              <Printer size={16} />
              Print receipt
            </button>
          </div>
          {(order.delivery_fee === null || dirty) && (
            <p className="text-xs text-amber-700">
              Choose ৳20 / ৳40 / ৳60 and save changes before printing the
              receipt.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
export function CustomerOrdersView({ isAdmin }: { isAdmin: boolean }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]),
    [selected, setSelected] = useState<CustomerOrder | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("active"),
    [search, setSearch] = useState(""),
    [settings, setSettings] = useState<OrderingSettings>(
      defaultOrderingSettings,
    ),
    [settingsOpen, setSettingsOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  async function refresh() {
    try {
      const [rows, config] = await Promise.all([
        loadCustomerOrders(500),
        loadOrderingSettings(),
      ]);
      setOrders(rows ?? []);
      if (!settingsOpen) setSettings(config ?? defaultOrderingSettings);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden && !settingsOpen) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [settingsOpen]);
  const shown = orders.filter(
    (order) =>
      (filter === "all" ||
        (filter === "active" &&
          !["completed", "cancelled"].includes(order.status)) ||
        filter === order.status) &&
      `${order.customer_name} ${order.phone} ${order.id} ${order.area}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Online Orders</h2>
          <p className="mt-1 text-xs text-slate-500">
            Home delivery · Cash on delivery / bKash · Refreshes every 15
            seconds while this page is open.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#/order"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Customer order page ↗
          </a>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Order settings
            </button>
          )}
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {settingsOpen && isAdmin && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            try {
              setSettings(await saveOrderingSettings(settings));
              setNotice("Order settings saved.");
              setSettingsOpen(false);
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4 rounded-xl border p-4"
        >
          <h3 className="font-semibold">Online ordering settings</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.acceptingOrders}
              onChange={(e) =>
                setSettings({ ...settings, acceptingOrders: e.target.checked })
              }
            />
            Accept online orders
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              WhatsApp order number
              <input
                required
                pattern="01[0-9]{9}"
                value={settings.whatsappNumber}
                onChange={(e) =>
                  setSettings({ ...settings, whatsappNumber: e.target.value })
                }
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-sm">
              bKash number
              <input
                pattern="01[0-9]{9}"
                value={settings.bkashNumber}
                onChange={(e) =>
                  setSettings({ ...settings, bkashNumber: e.target.value })
                }
                className={`${field} mt-1`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.bkashEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, bkashEnabled: e.target.checked })
                }
              />
              Allow bKash payments
            </label>
            <label className="text-sm">
              bKash account type
              <select
                value={settings.bkashType}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bkashType: e.target.value as typeof settings.bkashType,
                  })
                }
                className={`${field} mt-1`}
              >
                <option value="merchant">Merchant · Payment</option>
                <option value="personal">Personal · Send Money</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Customer notice
            <textarea
              maxLength={600}
              value={settings.notice}
              onChange={(e) =>
                setSettings({ ...settings, notice: e.target.value })
              }
              className={`${field} mt-1`}
            />
          </label>
          <p className="text-xs text-slate-500">
            Delivery options are ৳20, ৳40 and ৳60. Choose the location-based
            charge on each order before receipt printing.
          </p>
          <button
            disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            {saving ? "Saving…" : "Save order settings"}
          </button>
        </form>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search name, phone, order or area"
          aria-label="Search online orders"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${field} max-w-sm`}
        />
        <select
          aria-label="Filter online orders"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${field} max-w-xs`}
        >
          <option value="active">Active orders</option>
          <option value="all">All orders</option>
          {orderStatuses.map((status) => (
            <option key={status} value={status}>
              {orderStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-500">
        {shown.length} shown · Latest 500 orders. Enter a phone or order
        reference to search these records.
      </p>
      {loading ? (
        <p>Loading orders…</p>
      ) : !shown.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <ShoppingBag className="mx-auto mb-3 text-amber-600" />
          <p>No orders in this view.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs dark:bg-slate-900">
              <tr>
                {[
                  "Order / date",
                  "Customer",
                  "Delivery",
                  "Total / received",
                  "Status",
                  "",
                ].map((label) => (
                  <th key={label} className="whitespace-nowrap p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="p-3">
                    <strong>#{order.id.slice(0, 8).toUpperCase()}</strong>
                    <small className="block text-slate-500">
                      {new Date(order.created_at).toLocaleString("en-GB", {
                        timeZone: "Asia/Dhaka",
                      })}
                    </small>
                  </td>
                  <td className="p-3">
                    {order.customer_name}
                    <small className="block text-slate-500">
                      {order.phone}
                    </small>
                  </td>
                  <td className="p-3">
                    {order.area}
                    <small className="block text-slate-500">
                      {order.delivery_fee === null
                        ? "Fee to confirm"
                        : formatBDT(order.delivery_fee)}
                    </small>
                  </td>
                  <td className="p-3 font-semibold">
                    {formatBDT(order.total)}
                    {order.delivery_fee === null ? " + delivery" : ""}
                    <small className="block font-normal text-slate-500">
                      Received {formatBDT(order.paid_amount)} ·{" "}
                      {order.payment_status.replace("_", " ")}
                    </small>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${order.status === "pending" ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-800"}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setSelected(order)}
                      className="whitespace-nowrap rounded-lg border px-3 py-2"
                    >
                      Manage / print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <OrderEditor
          key={selected.id + selected.updated_at}
          order={selected}
          onClose={() => setSelected(null)}
          onSaved={(next) => {
            setSelected(next);
            setOrders((current) =>
              current.map((order) => (order.id === next.id ? next : order)),
            );
            setNotice("Order updated.");
          }}
        />
      )}
    </section>
  );
}
