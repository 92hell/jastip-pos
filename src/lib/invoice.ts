import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { events, orderBundles, orderItems, orders, clients, payments } from "@/lib/db/schema";
import { orderBalance, type Balance } from "@/lib/balance";
import { getSettings, type Settings } from "@/lib/settings";

export type Invoice = {
  number: string;
  createdAt: Date;
  clientName: string;
  eventName: string | null;
  items: { name: string; quantity: number; unitPrice: number; subtotal: number; fee: number; status: string; soldOutResolution: string | null }[];
  bundles: { label: string; fee: number }[];
  itemsTotal: number;
  feesTotal: number;
  discount: number;
  voucher: number;
  shipping: number | null;
  total: number;
  balance: Balance;
  payments: { kind: string; amount: number; paidOn: string }[];
  courier: string;
  trackingNumber: string;
  shop: Pick<Settings, "shopName" | "tagline" | "instagram" | "whatsapp" | "paymentAccounts" | "rules">;
};

/**
 * The client's view of an order, for the invoice link: no phone number, address, notes, staff
 * names or payment proofs. Null for an unknown token. Clients of an anonymised record get nothing.
 */
export async function getInvoice(db: Db, token: string): Promise<Invoice | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [row] = await db
    .select({ order: orders, clientName: clients.name, anonymizedAt: clients.anonymizedAt, eventName: events.name })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.invoiceToken, token));
  if (!row || row.anonymizedAt) return null;
  const o = row.order;
  const items = await db
    .select({ name: orderItems.name, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, subtotal: orderItems.subtotal, fee: orderItems.fee, status: orderItems.status, soldOutResolution: orderItems.soldOutResolution, bundleId: orderItems.bundleId })
    .from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.position));
  const bundles = await db.select({ id: orderBundles.id, label: orderBundles.label, fee: orderBundles.fee }).from(orderBundles).where(eq(orderBundles.orderId, o.id)).orderBy(asc(orderBundles.position));
  const money = await db.select({ kind: payments.kind, amount: payments.amount, paidOn: payments.paidOn }).from(payments).where(eq(payments.orderId, o.id)).orderBy(asc(payments.paidOn), asc(payments.id));
  const settings = await getSettings(db);
  const charged = (bundleId: number) => items.some((i) => i.bundleId === bundleId && i.status !== "sold_out");
  return {
    number: o.number,
    createdAt: o.createdAt,
    clientName: row.clientName,
    eventName: row.eventName,
    items: items.map(({ bundleId: _b, ...i }) => i), // eslint-disable-line @typescript-eslint/no-unused-vars
    bundles: bundles.filter((b) => charged(b.id)).map(({ label, fee }) => ({ label, fee })),
    itemsTotal: o.itemsTotal, feesTotal: o.feesTotal, discount: o.discount, voucher: o.voucher, shipping: o.shipping, total: o.total,
    balance: orderBalance(o.total, o.dpPercent, money),
    payments: money,
    courier: o.courier,
    trackingNumber: o.trackingNumber,
    shop: {
      shopName: settings.shopName, tagline: settings.tagline, instagram: settings.instagram, whatsapp: settings.whatsapp,
      paymentAccounts: settings.paymentAccounts, rules: settings.rules,
    },
  };
}
