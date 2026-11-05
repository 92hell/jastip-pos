import "server-only";
import { listClients } from "@/lib/clients";
import { openEvents } from "@/lib/events";
import type { Dictionary } from "@/i18n/id";
import type { Db } from "@/lib/db";
import { formatPercent } from "@/lib/money";
import type { OrderDetail } from "@/lib/orders";
import type { OrderFormValues } from "./OrderForm";
import type { Locale } from "@/i18n";

/** Clients to choose from in the order form (her client list is small enough to list whole). */
export async function clientOptions(db: Db) {
  return (await listClients(db, "", 1000)).map(({ id, name, isReseller }) => ({ id, name, isReseller })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Events that take orders, labelled with their kind; plus the order's own event when editing (even if closed). */
export async function eventOptions(db: Db, t: Dictionary["events"], current?: { id: number; name: string } | null) {
  const events = (await openEvents(db)).map((e) => ({ id: e.id, label: `${e.name} (${t.kinds[e.kind]})` }));
  if (current && !events.some((e) => e.id === current.id)) events.unshift({ id: current.id, label: current.name });
  return events;
}

/** The order form's "take from ready stock" texts. */
export function stockText(t: Dictionary) {
  const { fromStock, fromStockButton, fromStockOption, stockLine, left } = t.stock;
  return { fromStock, fromStockButton, fromStockOption, stockLine, left };
}

const plain = (n: number | null) => (n === null ? "" : String(n));

/** A saved order back into the form's typed values. */
export function toFormValues(order: OrderDetail, locale: Locale): OrderFormValues {
  const bundleKey = new Map(order.bundles.map((b, i) => [b.id, `b${i + 1}`]));
  return {
    clientId: String(order.clientId),
    eventId: order.eventId ? String(order.eventId) : "",
    note: order.note,
    discount: order.discount ? String(order.discount) : "",
    dpPercent: order.dpPercent === null ? "" : String(order.dpPercent),
    applyVoucher: order.voucherApplied,
    shipping: plain(order.shipping),
    bundles: order.bundles.map((b, i) => ({ key: `b${i + 1}`, label: b.label, fee: String(b.fee) })),
    items: order.items.map((item, i) => ({
      id: item.id,
      stockItemId: item.stockItemId,
      key: i + 1,
      name: item.name,
      store: item.store,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      feeMode: item.feeMode,
      feeAmount: plain(item.feeAmount),
      feePercent: item.feeBasisPoints === null ? "" : formatPercent(item.feeBasisPoints, locale),
      bundle: item.bundleId ? (bundleKey.get(item.bundleId) ?? "") : "",
    })),
  };
}
