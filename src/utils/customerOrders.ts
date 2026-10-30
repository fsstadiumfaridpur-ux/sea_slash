import type { PublicMenuItem } from "./publicMenu";
export const orderStatuses = [
  "pending",
  "accepted",
  "preparing",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export interface OrderingSettings {
  acceptingOrders: boolean;
  deliveryFees: number[];
  whatsappNumber: string;
  bkashNumber: string;
  bkashType: "personal" | "merchant";
  bkashEnabled: boolean;
  notice: string;
}
export interface OrderLine {
  id: string;
  name: string;
  quantity: number;
  price: number;
  photoUrl: string;
}
export interface CustomerOrder {
  id: string;
  created_at: string;
  updated_at: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  notes: string;
  items: OrderLine[];
  subtotal: number;
  delivery_fee: number | null;
  total: number;
  paid_amount: number;
  payment_method: "cod" | "bkash";
  payment_status: "unpaid" | "unverified" | "part_paid" | "paid";
  transaction_id: string;
  staff_note: string;
}
export interface OrderReceipt {
  id: string;
  created_at: string;
  status: OrderStatus;
  items: OrderLine[];
  subtotal: number;
  delivery_fee: number | null;
  total: number;
  paid_amount: number;
  payment_method: "cod" | "bkash";
  payment_status: "unpaid" | "unverified" | "part_paid" | "paid";
}
export const defaultOrderingSettings: OrderingSettings = {
  acceptingOrders: false,
  deliveryFees: [20, 40, 60],
  whatsappNumber: "",
  bkashNumber: "",
  bkashType: "merchant",
  bkashEnabled: false,
  notice: "",
};
export function cartQuote(
  cart: Record<string, number>,
  items: PublicMenuItem[],
) {
  let subtotal = 0;
  const lines: OrderLine[] = [];
  const unavailable: string[] = [];
  for (const [id, quantity] of Object.entries(cart)) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) continue;
    const item = items.find((row) => row.id === id);
    if (!item || !item.published || !item.available) {
      unavailable.push(item?.name ?? "Removed dish");
      continue;
    }
    lines.push({
      id,
      name: item.name,
      quantity,
      price: item.price,
      photoUrl: item.photoUrl,
    });
    subtotal += Math.round(item.price * 100) * quantity;
  }
  return {
    lines,
    subtotal: subtotal / 100,
    unavailable,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}
export function whatsappOrderUrl(
  number: string,
  receipt: OrderReceipt,
  details: { name: string; phone: string; area: string; address: string },
) {
  let digits = number.replace(/\D/g, "");
  if (digits.startsWith("01")) digits = "88" + digits;
  const text = `Sea Slash · Order ${receipt.id}\n${receipt.items.map((item) => `${item.quantity} × ${item.name} — ৳${(item.quantity * item.price).toFixed(2)}`).join("\n")}\nDelivery: ${receipt.delivery_fee === null ? "৳20 / ৳40 / ৳60 — restaurant will confirm" : `৳${receipt.delivery_fee}`}\n${receipt.delivery_fee === null ? "Food total (delivery extra)" : "Total"}: ৳${receipt.total}\n${details.name} · ${details.phone}\n${details.area}\n${details.address}\nPayment: ${receipt.payment_method === "bkash" ? `bKash · ${receipt.payment_status.replace("_", " ")}` : "Cash on delivery"}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return (
    from === to ||
    (
      {
        pending: ["accepted", "cancelled"],
        accepted: ["preparing", "cancelled"],
        preparing: ["out_for_delivery", "cancelled"],
        out_for_delivery: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      } as Record<OrderStatus, string[]>
    )[from].includes(to)
  );
}
export const orderStatusLabel = (status: string) =>
  ({
    pending: "Awaiting confirmation",
    accepted: "Accepted",
    preparing: "Preparing",
    out_for_delivery: "Out for delivery",
    completed: "Delivered",
    cancelled: "Cancelled",
  })[status] ?? status;
