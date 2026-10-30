import { supabase } from "./supabase";
import type {
  CustomerOrder,
  OrderingSettings,
  OrderReceipt,
  OrderStatus,
} from "../utils/customerOrders";
async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Online ordering is not connected.");
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Online ordering setup is not complete yet. Please contact the restaurant."
        : error.message,
    );
  return data as T;
}
export const loadOrderingSettings = () =>
  rpc<OrderingSettings>("get_restaurant_ordering_settings");
export const saveOrderingSettings = (settings: OrderingSettings) =>
  rpc<OrderingSettings>("save_restaurant_ordering_settings", {
    p_settings: settings,
  });
export const submitCustomerOrder = (
  token: string,
  payload: Record<string, unknown>,
) =>
  rpc<OrderReceipt>("place_restaurant_order", {
    p_token: token,
    p_payload: payload,
  });
export const getOrderReceipt = (token: string) =>
  rpc<OrderReceipt | null>("get_restaurant_order_receipt", { p_token: token });
export const loadCustomerOrders = (limit = 100) =>
  rpc<CustomerOrder[]>("list_restaurant_orders", { p_limit: limit });
export const updateCustomerOrder = (
  order: CustomerOrder,
  status: OrderStatus,
  fee: number | null,
  paidAmount: number,
  note: string,
) =>
  rpc<CustomerOrder>("update_restaurant_order", {
    p_id: order.id,
    p_expected_updated_at: order.updated_at,
    p_status: status,
    p_delivery_fee: fee,
    p_paid_amount: paidAmount,
    p_note: note,
  });

export const getPendingOrderCount = () =>
  rpc<number>("get_restaurant_pending_order_count");
