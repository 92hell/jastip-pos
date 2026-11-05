import "server-only";
import { listClients } from "@/lib/clients";
import type { Db } from "@/lib/db";
import { formatPercent } from "@/lib/money";
import type { OrderDetail } from "@/lib/orders";
import type { OrderFormValues } from "./OrderForm";
import type { Locale } from "@/i18n";

/** Clients to choose from in the order form (her client list is small enough to list whole). */
export async function clientOptions(db: Db) {
  return (await listClients(db, "", 1000)).map(({ id, name, isReseller }) => ({ id, name, isReseller })).sort((a, b) => a.name.localeCompare(b.name));
}

const plain = (n: number | null) => (n === null ? "" : String(n));

/** A saved order back into the form's typed values. */
export function toFormValues(order: OrderDetail, locale: Locale): OrderFormValues {
  const bundleKey = new Map(order.bundles.map((b, i) => [b.id, `b${i + 1}`]));
  return {
    clientId: String(order.clientId),
    note: order.note,
    discount: order.discount ? String(order.discount) : "",
    applyVoucher: order.voucherApplied,
    shipping: plain(order.shipping),
    bundles: order.bundles.map((b, i) => ({ key: `b${i + 1}`, label: b.label, fee: String(b.fee) })),
    items: order.items.map((item, i) => ({
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
