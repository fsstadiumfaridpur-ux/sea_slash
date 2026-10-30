import type { CustomerOrder } from "./customerOrders";
import { orderStatusLabel } from "./customerOrders";
const escape = (value: unknown) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const money = (amount: number) =>
  `৳${amount.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function customerOrderReceiptHtml(order: CustomerOrder) {
  if (order.delivery_fee === null)
    throw new Error(
      "Save a delivery charge of ৳20, ৳40 or ৳60 before printing.",
    );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Order ${escape(order.id.slice(0, 8).toUpperCase())}</title><style>@page{size:80mm ${Math.max(180, 120 + order.items.length * 16)}mm;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;font:12px Arial,sans-serif;color:#151515}h1{font:700 24px Georgia,serif;margin:8px 0 4px}.center{text-align:center}.muted{font-size:10px;color:#555}.divider{border-top:1px dashed #999;margin:12px 0}table{width:100%;border-collapse:collapse}td,th{padding:7px 0;text-align:left;vertical-align:top}.right{text-align:right;white-space:nowrap}.name{font-weight:700}.total{font-size:16px;font-weight:700}p{margin:5px 0;line-height:1.5}.small{font-size:9px;overflow-wrap:anywhere}@media print{button{display:none}}</style></head><body><div class="center"><h1>Sea Slash</h1><p>INDIAN &amp; KEBAB</p><p>Home delivery receipt</p><p class="name">#${escape(order.id.slice(0, 8).toUpperCase())}</p><p class="muted">${escape(new Date(order.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }))}</p><p>${escape(orderStatusLabel(order.status))}</p></div><div class="divider"></div><p class="name">${escape(order.customer_name)}</p><p>${escape(order.phone)}</p><p>${escape(order.area)}</p><p>${escape(order.address)}</p>${order.notes ? `<p>Customer note: ${escape(order.notes)}</p>` : ""}<div class="divider"></div><table><thead><tr><th>Dish / quantity</th><th class="right">Amount</th></tr></thead><tbody>${order.items.map((item) => `<tr><td>${escape(item.name)}<br><span class="muted">${item.quantity} × ${money(item.price)}</span></td><td class="right">${money(item.quantity * item.price)}</td></tr>`).join("")}</tbody></table><div class="divider"></div><table><tr><td>Food subtotal</td><td class="right">${money(order.subtotal)}</td></tr><tr><td>Delivery charge</td><td class="right">${money(order.delivery_fee)}</td></tr><tr class="total"><td>Total</td><td class="right">${money(order.total)}</td></tr><tr><td>Verified payment</td><td class="right">${money(order.paid_amount)}</td></tr><tr class="total"><td>Due</td><td class="right">${money(Math.max(0, order.total - order.paid_amount))}</td></tr></table><p class="muted">${order.payment_method === "bkash" ? "bKash" : "Cash on delivery"} · ${escape(order.payment_status.replace("_", " "))}</p>${order.payment_method === "bkash" && order.payment_status === "unverified" ? "<p>bKash payment has not yet been verified.</p>" : ""}<div class="divider"></div><p class="center">Thank you for dining with us.</p><p class="small">Order reference: ${escape(order.id)}</p></body></html>`;
}
export function printCustomerOrderReceipt(order: CustomerOrder) {
  const html = customerOrderReceiptHtml(order);
  const popup = window.open("", "_blank", "width=480,height=740");
  if (!popup) throw new Error("Allow pop-ups to print the receipt.");
  popup.document.write(html);
  popup.document.close();
  void popup.document.fonts.ready.then(() => {
    popup.focus();
    popup.print();
  });
}
