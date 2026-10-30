import "./CustomerOrdering.css";
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Plus, Minus, CheckCircle } from "lucide-react";
import { getPublicMenu } from "../lib/publicMenu";
import {
  getOrderReceipt,
  loadOrderingSettings,
  submitCustomerOrder,
} from "../lib/customerOrders";
import {
  cartQuote,
  defaultOrderingSettings,
  orderStatusLabel,
  whatsappOrderUrl,
  type OrderingSettings,
  type OrderReceipt,
} from "../utils/customerOrders";
import type { PublicMenuItem } from "../utils/publicMenu";
import { formatBDT } from "../utils/formatters";
const field =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 focus:border-amber-700";
function storedCart() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("sea_slash_customer_cart") ?? "{}",
    );
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}
export function CustomerOrdering() {
  const [items, setItems] = useState<PublicMenuItem[]>([]),
    [settings, setSettings] = useState<OrderingSettings>(
      defaultOrderingSettings,
    ),
    [cart, setCart] = useState<Record<string, number>>(storedCart),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("All"),
    [query, setQuery] = useState(""),
    [checkout, setCheckout] = useState(false),
    [receipt, setReceipt] = useState<OrderReceipt | null>(null),
    [details, setDetails] = useState<{
      name: string;
      phone: string;
      area: string;
      address: string;
    } | null>(null),
    [receiptError, setReceiptError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    area: "",
    address: "",
    notes: "",
    paymentMethod: "cod",
    transactionId: "",
    website: "",
  });
  const token = useRef("");
  const submitLock = useRef(false);
  const quote = cartQuote(cart, items);
  async function refresh() {
    setError("");
    try {
      const [menu, next] = await Promise.all([
        getPublicMenu(),
        loadOrderingSettings(),
      ]);
      setItems(menu.items);
      setSettings(next ?? defaultOrderingSettings);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    document.title = "Order Online | Sea Slash";
    void refresh();
    try {
      const saved =
        new URLSearchParams(window.location.hash.split("?")[1] ?? "").get(
          "receipt",
        ) ?? localStorage.getItem("sea_slash_last_order_token");
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) {
        token.current = saved;
        void getOrderReceipt(saved)
          .then((next) => {
            if (next) {
              setReceipt(next);
              setCart({});
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sea_slash_customer_cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    if (!receipt || !token.current) return;
    let active = true;
    const poll = () => {
      if (document.hidden) return;
      void getOrderReceipt(token.current)
        .then((next) => {
          if (active && next) {
            setReceipt(next);
            setReceiptError("");
          }
        })
        .catch(() => {
          if (active)
            setReceiptError(
              "Status could not refresh. Your order is still recorded.",
            );
        });
    };
    const timer = window.setInterval(poll, 20000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [receipt?.id]);
  useEffect(() => {
    if (receipt) window.scrollTo({ top: 0 });
  }, [receipt?.id]);
  function adjust(id: string, delta: number) {
    setCart((current) => {
      const next = { ...current },
        quantity = Math.max(0, Math.min(20, (current[id] ?? 0) + delta));
      if (quantity) next[id] = quantity;
      else delete next[id];
      return next;
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current) return;
    if (
      !settings.acceptingOrders ||
      !quote.lines.length ||
      quote.unavailable.length
    )
      return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!token.current) token.current = crypto.randomUUID();
      try {
        localStorage.setItem("sea_slash_last_order_token", token.current);
      } catch {}
      const next = await submitCustomerOrder(token.current, {
        ...form,
        transactionId: form.paymentMethod === "bkash" ? form.transactionId : "",
        items: quote.lines.map((line) => ({
          id: line.id,
          quantity: line.quantity,
        })),
        expectedSubtotal: quote.subtotal,
      });
      setDetails({
        name: form.name,
        phone: form.phone,
        area: form.area,
        address: form.address,
      });
      setReceipt(next);
      setCart({});
      setCheckout(false);
    } catch (cause) {
      try {
        const existing = token.current
          ? await getOrderReceipt(token.current)
          : null;
        if (existing) {
          setDetails(null);
          setReceipt(existing);
          setCart({});
          setCheckout(false);
          return;
        }
      } catch {}
      setError((cause as Error).message);
      void getPublicMenu()
        .then((menu) => setItems(menu.items))
        .catch(() => {});
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  const visible = items
    .filter(
      (item) =>
        item.published &&
        (category === "All" || item.category === category) &&
        `${item.name} ${item.description}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <main
      data-checkout={checkout}
      className="customer-order-page min-h-screen bg-[#fbf5e9] text-stone-900"
    >
      <header className="sticky top-0 z-20 border-b border-amber-900/15 bg-[#45101b] px-3 py-3 text-[#fff0cc] sm:px-4 sm:py-4">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-2 sm:gap-4">
          <a href="#/menu" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img
              src="/sea-slash-logo.svg"
              alt="Sea Slash"
              className="h-10 w-10 shrink-0 rounded-full object-contain bg-white sm:h-12 sm:w-12"
            />
            <span>
              <strong className="whitespace-nowrap font-serif text-lg sm:text-xl">
                Sea Slash
              </strong>
              <small className="customer-order-tagline text-xs text-amber-200">
                Freshly made. Delivered to you.
              </small>
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-3">
            <a href="#/menu" className="text-xs underline sm:text-sm">
              Menu
            </a>
            {!receipt && (
              <button
                disabled={busy}
                onClick={() => {
                  setCheckout(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex items-center gap-1 rounded-full border border-amber-200/40 px-3 py-2 text-sm"
              >
                <ShoppingBag size={16} />
                {quote.count}
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto w-full min-w-0 max-w-6xl px-3 py-5 sm:px-4 sm:py-10">
        {receipt ? (
          <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-amber-200 bg-white p-5 sm:p-8">
            <CheckCircle className="text-emerald-700" size={34} />
            <h1 className="font-serif text-3xl">Order received</h1>
            <p>
              Your order is{" "}
              <strong>{orderStatusLabel(receipt.status).toLowerCase()}</strong>.
              {receipt.status === "cancelled"
                ? "Contact the restaurant about any payment or refund."
                : receipt.status === "completed"
                  ? "Thank you for ordering with us."
                  : receipt.status === "out_for_delivery"
                    ? "Your food is on its way."
                    : "Please wait for the restaurant to confirm delivery."}
            </p>
            <p className="text-xs text-stone-500">
              Order #{receipt.id.slice(0, 8).toUpperCase()} ·{" "}
              {new Date(receipt.created_at).toLocaleString("en-GB", {
                timeZone: "Asia/Dhaka",
              })}
            </p>
            <ul className="divide-y">
              {receipt.items.map((line) => (
                <li key={line.id} className="flex justify-between gap-4 py-3">
                  <span>
                    {line.quantity} × {line.name}
                  </span>
                  <strong>{formatBDT(line.quantity * line.price)}</strong>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t pt-4">
              <p className="flex justify-between">
                <span>Food subtotal</span>
                <strong>{formatBDT(receipt.subtotal)}</strong>
              </p>
              <p className="flex justify-between gap-4">
                <span>Delivery</span>
                <strong>
                  {receipt.delivery_fee === null
                    ? "৳20 / ৳40 / ৳60 · to confirm"
                    : formatBDT(receipt.delivery_fee)}
                </strong>
              </p>
              <p className="flex justify-between">
                <span>
                  {receipt.delivery_fee === null
                    ? "Food total (delivery extra)"
                    : "Total"}
                </span>
                <strong>{formatBDT(receipt.total)}</strong>
              </p>
              <p className="flex justify-between">
                <span>Verified payment</span>
                <strong>{formatBDT(receipt.paid_amount)}</strong>
              </p>
              <p className="flex justify-between">
                <span>
                  Amount due{receipt.delivery_fee === null ? " + delivery" : ""}
                </span>
                <strong>
                  {formatBDT(Math.max(0, receipt.total - receipt.paid_amount))}
                </strong>
              </p>
              <p className="text-xs text-stone-500">
                {receipt.payment_method === "bkash" &&
                receipt.payment_status === "unverified"
                  ? "Your bKash transaction is awaiting manual verification."
                  : "Payment status: " +
                    receipt.payment_status.replace("_", " ")}
              </p>
            </div>
            {receiptError && (
              <p role="status" className="text-sm text-amber-800">
                {receiptError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <a
                href={
                  details
                    ? whatsappOrderUrl(
                        settings.whatsappNumber,
                        receipt,
                        details,
                      )
                    : `https://wa.me/880${settings.whatsappNumber.slice(1)}?text=${encodeURIComponent("Please check Sea Slash order " + receipt.id)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
              >
                Send order to WhatsApp
              </a>
              <button
                onClick={() => {
                  void getOrderReceipt(token.current)
                    .then(setReceipt)
                    .catch((cause) => setReceiptError(cause.message));
                }}
                className="rounded-xl border px-4 py-3 text-sm"
              >
                Refresh status
              </button>
              <button
                onClick={() => {
                  setReceipt(null);
                  setDetails(null);
                  token.current = "";
                  try {
                    localStorage.removeItem("sea_slash_last_order_token");
                  } catch {}
                }}
                className="rounded-xl border px-4 py-3 text-sm"
              >
                New order
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Your order is saved in the restaurant’s Orders panel. WhatsApp
              opens a prepared message; press Send there to send it.
            </p>
          </section>
        ) : (
          <>
            <div className="customer-order-intro mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-800">
                  Indian & Kebab · Home delivery
                </p>
                <h1 className="font-serif text-3xl sm:text-5xl">
                  A royal meal, at home.
                </h1>
                <p className="mt-3 max-w-xl text-sm text-stone-600">
                  Choose your favourites. Delivery is ৳20, ৳40 or ৳60 by
                  location, confirmed by our team.
                </p>
              </div>
              <button
                onClick={() => {
                  setCheckout(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex items-center gap-2 rounded-xl bg-[#591728] px-4 py-3 font-semibold text-white"
              >
                <ShoppingBag size={18} />
                Your bag · {quote.count}
              </button>
            </div>
            {settings.notice && (
              <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                {settings.notice}
              </p>
            )}
            {!loading && !settings.acceptingOrders && (
              <p
                role="status"
                className="mb-5 rounded-xl bg-amber-100 p-4 text-sm"
              >
                Online ordering is currently paused. Please contact the
                restaurant.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
              >
                {error}{" "}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="ml-2 underline"
                >
                  Refresh menu
                </button>
              </p>
            )}
            <div className="customer-order-layout grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_350px]">
              <section className="customer-order-catalog min-w-0">
                <input
                  aria-label="Search dishes to order"
                  placeholder="Search dishes…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={`${field} mb-3`}
                />
                <div className="customer-order-categories mb-5 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-2">
                  {["All", ...new Set(items.map((item) => item.category))].map(
                    (name) => (
                      <button
                        key={name}
                        onClick={() => setCategory(name)}
                        className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${category === name ? "border-[#591728] bg-[#591728] text-white" : "bg-white"}`}
                      >
                        {name}
                      </button>
                    ),
                  )}
                </div>
                {loading ? (
                  <p>Loading your menu…</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {visible.map((item) => (
                      <article
                        key={item.id}
                        className="min-w-0 overflow-hidden rounded-2xl border border-amber-900/10 bg-white shadow-sm"
                      >
                        {item.photoUrl && (
                          <div className="relative h-48 bg-stone-100">
                            <img
                              src={item.photoUrl}
                              alt={item.name}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                            {!item.available && (
                              <span className="absolute inset-0 grid place-items-center bg-black/20 text-xl font-bold text-white">
                                <span className="rounded-full bg-red-700 px-5 py-2">
                                  OFF
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                        <div className="p-4">
                          <p className="text-xs text-amber-800">
                            {item.category}
                          </p>
                          <h2 className="mt-1 font-serif text-xl font-semibold">
                            {item.name}
                          </h2>
                          {item.description.trim() && (
                            <p className="mt-2 text-sm text-stone-500 sm:min-h-10">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-4 flex items-center justify-between">
                            <strong>{formatBDT(item.price)}</strong>
                            <button
                              disabled={
                                busy ||
                                !item.available ||
                                !settings.acceptingOrders ||
                                (quote.lines.length >= 20 && !cart[item.id]) ||
                                (cart[item.id] ?? 0) >= 20
                              }
                              onClick={() => adjust(item.id, 1)}
                              aria-label={`Add ${item.name} to bag`}
                              className="rounded-full bg-[#591728] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                            >
                              + Add{cart[item.id] ? ` (${cart[item.id]})` : ""}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {!loading && !visible.length && (
                  <p className="py-8 text-stone-500">No dishes found.</p>
                )}
              </section>
              <aside
                id="order-cart"
                className="customer-order-bag min-w-0 scroll-mt-20 rounded-2xl border border-amber-900/10 bg-white p-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCheckout(false);
                    window.scrollTo({ top: 0 });
                  }}
                  className="customer-order-back mb-4 min-h-11 text-sm font-semibold text-[#591728]"
                >
                  ← Back to menu
                </button>
                <h2 className="mb-4 font-serif text-2xl">Your bag</h2>
                {quote.unavailable.length > 0 && (
                  <div
                    role="alert"
                    className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                  >
                    Some dishes are no longer available.{" "}
                    <button
                      className="underline"
                      onClick={() =>
                        setCart(
                          Object.fromEntries(
                            quote.lines.map((line) => [line.id, line.quantity]),
                          ),
                        )
                      }
                    >
                      Remove unavailable dishes
                    </button>
                  </div>
                )}
                {!quote.lines.length ? (
                  <p className="py-6 text-sm text-stone-500">
                    Add a dish to get started.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y">
                      {quote.lines.map((line) => (
                        <li key={line.id} className="py-3">
                          <div className="flex justify-between gap-3 text-sm">
                            <strong>{line.name}</strong>
                            <span>{formatBDT(line.quantity * line.price)}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              disabled={busy}
                              aria-label={`Remove one ${line.name}`}
                              onClick={() => adjust(line.id, -1)}
                              className="rounded-md border p-1"
                            >
                              <Minus size={15} />
                            </button>
                            <span className="text-sm">{line.quantity}</span>
                            <button
                              disabled={busy || line.quantity >= 20}
                              aria-label={`Add one ${line.name}`}
                              onClick={() => adjust(line.id, 1)}
                              className="rounded-md border p-1"
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="my-4 border-t pt-4 text-sm">
                      <p className="flex justify-between font-semibold">
                        <span>Food subtotal</span>
                        <span>{formatBDT(quote.subtotal)}</span>
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        Delivery extra: ৳20 / ৳40 / ৳60. We confirm the charge
                        by location before delivery.
                      </p>
                    </div>
                    {!checkout ? (
                      <button
                        disabled={
                          !settings.acceptingOrders ||
                          !!quote.unavailable.length
                        }
                        onClick={() => setCheckout(true)}
                        className="w-full rounded-xl bg-[#591728] px-4 py-3 font-semibold text-white disabled:opacity-40"
                      >
                        Continue to checkout
                      </button>
                    ) : (
                      <form onSubmit={submit} className="space-y-3">
                        <h3 className="font-semibold">Delivery details</h3>
                        <fieldset disabled={busy} className="space-y-3">
                          <label className="block text-sm">
                            Your name
                            <input
                              required
                              minLength={2}
                              maxLength={100}
                              autoComplete="name"
                              value={form.name}
                              onChange={(e) =>
                                setForm({ ...form, name: e.target.value })
                              }
                              className={`${field} mt-1`}
                            />
                          </label>
                          <label className="block text-sm">
                            Phone number
                            <input
                              required
                              type="tel"
                              autoComplete="tel"
                              pattern="[+0-9 ()-]{10,20}"
                              maxLength={20}
                              value={form.phone}
                              onChange={(e) =>
                                setForm({ ...form, phone: e.target.value })
                              }
                              className={`${field} mt-1`}
                            />
                          </label>
                          <label className="block text-sm">
                            Area / locality
                            <input
                              required
                              minLength={2}
                              maxLength={100}
                              value={form.area}
                              onChange={(e) =>
                                setForm({ ...form, area: e.target.value })
                              }
                              className={`${field} mt-1`}
                            />
                          </label>
                          <label className="block text-sm">
                            Full delivery address
                            <textarea
                              required
                              minLength={8}
                              maxLength={400}
                              autoComplete="street-address"
                              value={form.address}
                              onChange={(e) =>
                                setForm({ ...form, address: e.target.value })
                              }
                              className={`${field} mt-1`}
                            />
                          </label>
                          <label className="block text-sm">
                            Notes (optional)
                            <textarea
                              maxLength={400}
                              value={form.notes}
                              onChange={(e) =>
                                setForm({ ...form, notes: e.target.value })
                              }
                              className={`${field} mt-1`}
                            />
                          </label>
                          <div className="hidden" aria-hidden="true">
                            <input
                              tabIndex={-1}
                              autoComplete="off"
                              value={form.website}
                              onChange={(e) =>
                                setForm({ ...form, website: e.target.value })
                              }
                            />
                          </div>
                          <label className="block text-sm">
                            Payment
                            <select
                              value={form.paymentMethod}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  paymentMethod: e.target.value,
                                })
                              }
                              className={`${field} mt-1`}
                            >
                              <option value="cod">Cash on delivery</option>
                              {settings.bkashEnabled && (
                                <option value="bkash">bKash</option>
                              )}
                            </select>
                          </label>
                          {form.paymentMethod === "bkash" && (
                            <div className="rounded-xl bg-pink-50 p-3 text-sm">
                              <p>
                                Use bKash{" "}
                                <strong>
                                  {settings.bkashType === "merchant"
                                    ? "Payment"
                                    : "Send Money"}
                                </strong>{" "}
                                to <strong>{settings.bkashNumber}</strong>.
                              </p>
                              <p className="mt-2">
                                Pay the food subtotal:{" "}
                                <strong>{formatBDT(quote.subtotal)}</strong>.
                                Delivery is extra and collected separately.
                              </p>
                              <label className="mt-3 block">
                                Transaction ID
                                <input
                                  required
                                  pattern="[A-Za-z0-9]{6,30}"
                                  maxLength={30}
                                  value={form.transactionId}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      transactionId: e.target.value,
                                    })
                                  }
                                  className={`${field} mt-1`}
                                />
                              </label>
                              <p className="mt-2 text-xs">
                                We verify payments manually. An entered ID does
                                not confirm payment.
                              </p>
                            </div>
                          )}
                        </fieldset>
                        <button
                          type="submit"
                          disabled={
                            busy ||
                            !settings.acceptingOrders ||
                            !!quote.unavailable.length ||
                            quote.lines.length > 20 ||
                            quote.count > 100
                          }
                          className="w-full rounded-xl bg-[#591728] px-4 py-3 font-semibold text-white disabled:opacity-40"
                        >
                          {busy ? "Placing order…" : "Place delivery order"}
                        </button>
                        <p className="text-xs text-stone-500">
                          Your name, phone and address are shared with the
                          restaurant for delivery. Orders require restaurant
                          confirmation.
                        </p>
                      </form>
                    )}
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
      {!receipt && !checkout && quote.count > 0 && (
        <div className="customer-order-mobile-bag">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setCheckout(true);
              window.scrollTo({ top: 0 });
            }}
          >
            <ShoppingBag size={20} />
            <span>
              View bag · {quote.count} item{quote.count === 1 ? "" : "s"}
            </span>
            <strong>{formatBDT(quote.subtotal)}</strong>
          </button>
        </div>
      )}
    </main>
  );
}
