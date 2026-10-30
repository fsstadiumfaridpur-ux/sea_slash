import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { customerOrderReceiptHtml } from "./customerOrderPrint";
import {
  cartQuote,
  canTransitionOrder,
  whatsappOrderUrl,
  type CustomerOrder,
} from "./customerOrders";
test("online orders validate server prices, isolate private data, retry safely, and protect receipt/payment updates", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create table public.restaurant_public_menu(id boolean primary key,menu jsonb);
 create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='admin',false)$$;
 create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;`);
    const sql = await readFile(
      new URL("../../supabase-customer-orders.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const defaults=(await db.query<{settings:any}>('select settings from restaurant_ordering_settings')).rows[0].settings;
    assert.equal(defaults.acceptingOrders,false);assert.equal(defaults.whatsappNumber,'');assert.equal(defaults.bkashNumber,'');assert.equal(defaults.bkashEnabled,false);
    await db.exec(`update restaurant_ordering_settings set settings=settings || '{"acceptingOrders":true,"whatsappNumber":"01700000000","bkashNumber":"01800000000","bkashEnabled":true}'::jsonb`);
    const menu = {
      items: [
        {
          id: "dosa",
          name: "Palong Paneer Dosa",
          price: 250,
          photoUrl: "https://example.com/dosa.jpg",
          published: true,
          available: true,
        },
        {
          id: "off",
          name: "Off dish",
          price: 10,
          published: true,
          available: false,
        },
        {
          id: "hidden",
          name: "Hidden",
          price: 10,
          published: false,
          available: true,
        },
      ],
    };
    await db.query(
      "insert into public.restaurant_public_menu values(true,$1::jsonb)",
      [JSON.stringify(menu)],
    );
    const payload = {
      name: "Test customer",
      phone: "01700000001",
      area: "Test area",
      address: "Sample delivery address",
      notes: "No onion",
      paymentMethod: "bkash",
      transactionId: "TEST1234",
      website: "",
      items: [{ id: "dosa", quantity: 2 }],
      expectedSubtotal: 500,
      paid_amount: 500,
      status: "completed",
      delivery_fee: 0,
    };
    const place = async (token: string, value = payload) =>
      (
        await db.query<{ value: any }>(
          "select public.place_restaurant_order($1::uuid,$2::jsonb) value",
          [token, JSON.stringify(value)],
        )
      ).rows[0].value;
    const token = "00000000-0000-4000-8000-000000000001";
    await db.exec("set role anon;select set_config('test.role','',false)");
    const receipt = await place(token);
    assert.equal(receipt.subtotal, 500);
    assert.equal(receipt.total, 500);
    assert.equal(receipt.delivery_fee, null);
    assert.equal(receipt.paid_amount, 0);
    assert.equal(receipt.status, "pending");
    assert.equal(receipt.payment_status, "unverified");
    for (const key of [
      "phone",
      "customer_name",
      "address",
      "area",
      "token",
      "transaction_id",
      "fingerprint",
      "staff_note",
    ])
      assert.equal(key in receipt, false);
    assert.equal((await place(token)).id, receipt.id);
    await assert.rejects(
      place(token, { ...payload, notes: "changed" }),
      /checkout has already/,
    );
    await assert.rejects(
      db.query("select * from public.restaurant_customer_orders"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.list_restaurant_orders(100)"),
      /access required|permission denied/,
    );
    await assert.rejects(
      db.query("select public.get_restaurant_pending_order_count()"),
      /access required|permission denied/,
    );
    const fresh = () => crypto.randomUUID();
    await assert.rejects(
      place(fresh(), { ...payload, expectedSubtotal: 1 }),
      /prices changed/,
    );
    await assert.rejects(
      place(fresh(), {
        ...payload,
        items: [{ id: "off", quantity: 1 }],
        expectedSubtotal: 10,
      }),
      /unavailable/,
    );
    await assert.rejects(
      place(fresh(), {
        ...payload,
        items: [{ id: "hidden", quantity: 1 }],
        expectedSubtotal: 10,
      }),
      /unavailable/,
    );
    await assert.rejects(
      place(fresh(), {
        ...payload,
        items: [{ id: "dosa", quantity: 1.5 }],
        expectedSubtotal: 375,
      }),
      /Quantity/,
    );
    await assert.rejects(
      place(fresh(), {
        ...payload,
        items: [
          { id: "dosa", quantity: 1 },
          { id: "dosa", quantity: 1 },
        ],
      }),
      /Duplicate/,
    );
    await assert.rejects(
      place(fresh(), { ...payload, website: "bot" }),
      /Enter your name/,
    );
    await assert.rejects(
      place(fresh(), { ...payload, transactionId: "x" }),
      /transaction ID/,
    );
    await db.exec(
      "reset role;set role authenticated;select set_config('test.role','chef',false)",
    );
    await assert.rejects(
      db.query("select public.list_restaurant_orders(100)"),
      /access required|permission denied/,
    );
    await db.exec("select set_config('test.role','manager',false)");
    let order = (
      await db.query<{ value: CustomerOrder[] }>(
        "select public.list_restaurant_orders(100) value",
      )
    ).rows[0].value[0];
    assert.equal(order.phone, payload.phone);
    assert.equal("token" in order, false);
    assert.equal("fingerprint" in order, false);
    const update = async (
      status: string,
      fee: number | null,
      paid: number,
      revision = order.updated_at,
    ) =>
      (
        await db.query<{ value: CustomerOrder }>(
          "select public.update_restaurant_order($1::uuid,$2::timestamptz,$3,$4::numeric,$5::numeric,$6) value",
          [order.id, revision, status, fee, paid, "Verified by test"],
        )
      ).rows[0].value;
    await assert.rejects(
      update("out_for_delivery", null, 0),
      /Invalid order status/,
    );
    await assert.rejects(update("accepted", 30, 0), /valid status/);
    await assert.rejects(update("accepted", 20, 521), /valid status/);
    const oldRevision = order.updated_at;
    order = await update("accepted", 40, 500);
    assert.equal(order.total, 540);
    assert.equal(order.paid_amount, 500);
    assert.equal(order.payment_status, "part_paid");
    await assert.rejects(
      update("preparing", 40, 500, oldRevision),
      /changed in another session/,
    );
    order = await update("preparing", 40, 500);
    await assert.rejects(
      update("out_for_delivery", null, 500),
      /delivery charge first/,
    );
    order = await update("out_for_delivery", 40, 500);
    order = await update("completed", 40, 540);
    assert.equal(order.payment_status, "paid");
    assert.equal(order.total, 540);
    await assert.rejects(update("completed", 60, 540), /finished order/);
    assert.match(customerOrderReceiptHtml(order), /Delivery charge/);
    assert.match(customerOrderReceiptHtml(order), /৳40.00/);
    assert.doesNotMatch(
      customerOrderReceiptHtml({
        ...order,
        customer_name: "<script>alert(1)</script>",
      }),
      /<script>/,
    );
    assert.throws(
      () => customerOrderReceiptHtml({ ...order, delivery_fee: null }),
      /before printing/,
    );
    await assert.rejects(
      db.query("select public.save_restaurant_ordering_settings($1::jsonb)", [
        JSON.stringify({
          acceptingOrders: false,
          bkashEnabled: true,
          whatsappNumber: "01356154690",
          bkashNumber: "01516542905",
          bkashType: "merchant",
          notice: "",
        }),
      ]),
      /Administrator access/,
    );
    await db.exec("select set_config('test.role','admin',false)");
    await db.query(
      "select public.save_restaurant_ordering_settings($1::jsonb)",
      [
        JSON.stringify({
          acceptingOrders: false,
          bkashEnabled: true,
          whatsappNumber: "01356154690",
          bkashNumber: "01516542905",
          bkashType: "merchant",
          notice: "",
        }),
      ],
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(place(fresh()), /paused/);
    // An already accepted request remains safely retrievable even after ordering pauses.
    assert.equal((await place(token)).id, receipt.id);
  } finally {
    await db.close();
  }
});
test("customer cart and WhatsApp use public menu prices and enforce availability", () => {
  const items = [
    {
      id: "dish",
      name: "Dosa & paneer",
      price: 250.25,
      photoUrl: "",
      published: true,
      available: true,
      description: "",
      category: "Dosa",
      badge: "",
      sortOrder: 0,
    },
    {
      id: "off",
      name: "Off",
      price: 1,
      photoUrl: "",
      published: true,
      available: false,
      description: "",
      category: "Dosa",
      badge: "",
      sortOrder: 1,
    },
  ];
  const quote = cartQuote({ dish: 2, off: 1, missing: 1 }, items);
  assert.equal(quote.subtotal, 500.5);
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.unavailable.length, 2);
  assert.equal(canTransitionOrder("pending", "completed"), false);
  assert.equal(canTransitionOrder("preparing", "out_for_delivery"), true);
  const url = whatsappOrderUrl(
    "01356154690",
    {
      id: "order",
      created_at: "",
      status: "pending",
      items: quote.lines,
      subtotal: 500.5,
      total: 500.5,
      delivery_fee: null,
      paid_amount: 0,
      payment_method: "cod",
      payment_status: "unpaid",
    },
    {
      name: "Test",
      phone: "01700000000",
      area: "Test area",
      address: "Example address",
    },
  );
  assert.ok(url.startsWith("https://wa.me/8801356154690?text="));
  assert.match(decodeURIComponent(url), /restaurant will confirm/);
  assert.equal(cartQuote({ dish: 0 }, items).lines.length, 0);
});
