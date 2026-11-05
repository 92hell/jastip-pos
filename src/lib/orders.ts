import "server-only";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clients, orderBundles, orderCounters, orderItems, orders, type Client, type Order, type OrderItem } from "@/lib/db/schema";
import { escapeLike, fieldErrors } from "@/lib/clients";
import { parsePercent, parseRupiah } from "@/lib/money";
import { FEE_MODES, priceOrder, type Fee, type PricingInput } from "@/lib/pricing";
import { getSettings, type FieldErrors } from "@/lib/settings";

const MAX_ITEMS = 50;

/** An amount field as typed ("25rb", "350.000"); required unless `optional`. */
const rupiahField = (optional = false) =>
  z.string().transform((v, ctx) => {
    const value = parseRupiah(v);
    if (value === null) {
      if (!optional) ctx.addIssue({ code: "custom", message: "required" });
      return null;
    }
    if (Number.isNaN(value) || value > 1_000_000_000) {
      ctx.addIssue({ code: "custom", message: "invalid_amount" });
      return null;
    }
    return value;
  });

const itemSchema = z
  .object({
    name: z.string().trim().min(1, "required").max(120, "too_long"),
    store: z.string().trim().max(80, "too_long"),
    quantity: z.coerce.number().int("invalid_quantity").min(1, "invalid_quantity").max(999, "invalid_quantity"),
    unitPrice: rupiahField(),
    feeMode: z.enum(FEE_MODES),
    feeAmount: z.string(),
    feePercent: z.string(),
    bundle: z.string(),
  })
  .transform((item, ctx) => {
    let fee: Fee;
    switch (item.feeMode) {
      case "per_item": {
        const amount = parseRupiah(item.feeAmount);
        if (amount === null || Number.isNaN(amount) || amount > 1_000_000_000) {
          ctx.addIssue({ code: "custom", path: ["feeAmount"], message: amount === null ? "required" : "invalid_amount" });
          return z.NEVER;
        }
        fee = { mode: "per_item", amount };
        break;
      }
      case "percent": {
        const basisPoints = parsePercent(item.feePercent);
        if (Number.isNaN(basisPoints)) {
          ctx.addIssue({ code: "custom", path: ["feePercent"], message: "invalid_percent" });
          return z.NEVER;
        }
        fee = { mode: "percent", basisPoints };
        break;
      }
      case "bundle":
        if (!item.bundle) {
          ctx.addIssue({ code: "custom", path: ["bundle"], message: "required" });
          return z.NEVER;
        }
        fee = { mode: "bundle", bundle: item.bundle };
        break;
      default:
        fee = { mode: "nett" };
    }
    return { name: item.name, store: item.store, quantity: item.quantity, unitPrice: item.unitPrice ?? 0, fee };
  });

export const orderSchema = z
  .object({
    clientId: z.coerce.number().int().positive("required"),
    note: z.string().trim().max(1000, "too_long"),
    items: z.array(itemSchema).min(1, "no_items").max(MAX_ITEMS, "too_many"),
    bundles: z.array(z.object({ key: z.string().min(1).max(20), label: z.string().trim().max(60, "too_long"), fee: rupiahField() })).max(20, "too_many"),
    discount: rupiahField(true),
    applyVoucher: z.boolean(),
    shipping: rupiahField(true),
  })
  .superRefine((order, ctx) => {
    const keys = new Set(order.bundles.map((b) => b.key));
    if (keys.size !== order.bundles.length) ctx.addIssue({ code: "custom", path: ["bundles"], message: "invalid" });
    order.items.forEach((item, i) => {
      if (item.fee.mode === "bundle" && !keys.has(item.fee.bundle)) ctx.addIssue({ code: "custom", path: ["items", i, "bundle"], message: "required" });
    });
  });

export type OrderInput = z.input<typeof orderSchema>;
export type OrderResult = { ok: true; id: number; number: string } | { ok: false; errors: FieldErrors };

/** Validates, checks the client, and prices the order on the server (browser totals are never trusted). */
async function prepare(db: Db, input: OrderInput) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, errors: fieldErrors(parsed.error) };
  const order = parsed.data;
  const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId));
  if (!client || client.anonymizedAt) return { ok: false as const, errors: { clientId: "required" } };
  const voucher = order.applyVoucher ? (await getSettings(db)).voucherAmount : 0;
  const pricing: PricingInput = {
    items: order.items.map(({ quantity, unitPrice, fee }) => ({ quantity, unitPrice, fee })),
    bundles: order.bundles.map((b) => ({ key: b.key, fee: b.fee ?? 0 })),
    discount: order.discount ?? 0,
    voucher,
    shipping: order.shipping,
  };
  return { ok: true as const, order, priced: priceOrder(pricing) };
}

type Prepared = Extract<Awaited<ReturnType<typeof prepare>>, { ok: true }>;

async function writeLines(tx: Db, orderId: number, { order, priced }: Prepared) {
  const bundleIds = new Map<string, number>();
  for (const [position, bundle] of order.bundles.entries()) {
    const [row] = await tx
      .insert(orderBundles)
      .values({ orderId, position, label: bundle.label, fee: bundle.fee ?? 0 })
      .returning({ id: orderBundles.id });
    bundleIds.set(bundle.key, row.id);
  }
  if (order.items.length > 0) {
    await tx.insert(orderItems).values(
      order.items.map((item, position) => ({
        orderId,
        position,
        name: item.name,
        store: item.store,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        feeMode: item.fee.mode,
        feeAmount: item.fee.mode === "per_item" ? item.fee.amount : null,
        feeBasisPoints: item.fee.mode === "percent" ? item.fee.basisPoints : null,
        bundleId: item.fee.mode === "bundle" ? bundleIds.get(item.fee.bundle)! : null,
        subtotal: priced.lines[position].subtotal,
        fee: priced.lines[position].fee,
      })),
    );
  }
}

function totals({ order, priced }: Prepared) {
  return {
    note: order.note,
    discount: priced.discount,
    voucherApplied: order.applyVoucher,
    voucher: priced.voucher,
    shipping: priced.shipping,
    itemsTotal: priced.itemsTotal,
    feesTotal: priced.feesTotal,
    total: priced.total,
  };
}

/** The year in Jakarta time, for order numbers. */
function jakartaYear(now: Date) {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric" }).format(now));
}

export async function createOrder(db: Db, input: OrderInput, userId: number | null, now = new Date()): Promise<OrderResult> {
  const prepared = await prepare(db, input);
  if (!prepared.ok) return prepared;
  return db.transaction(async (tx) => {
    const year = jakartaYear(now);
    // One row per year, incremented under its row lock: numbers are unique and never reused.
    const [counter] = await tx
      .insert(orderCounters)
      .values({ year, last: 1 })
      .onConflictDoUpdate({ target: orderCounters.year, set: { last: sql`${orderCounters.last} + 1` } })
      .returning({ last: orderCounters.last });
    const number = `TLY-${year}-${String(counter.last).padStart(4, "0")}`;
    const [order] = await tx
      .insert(orders)
      .values({ number, clientId: prepared.order.clientId, createdBy: userId, createdAt: now, updatedAt: now, ...totals(prepared) })
      .returning({ id: orders.id });
    await writeLines(tx as unknown as Db, order.id, prepared);
    return { ok: true as const, id: order.id, number };
  });
}

/** Replaces the order's items, bundles and amounts; its number and client history stay. */
export async function updateOrder(db: Db, id: number, input: OrderInput): Promise<OrderResult> {
  const [existing] = await db.select({ number: orders.number }).from(orders).where(eq(orders.id, id));
  if (!existing) return { ok: false, errors: { order: "not_found" } };
  const prepared = await prepare(db, input);
  if (!prepared.ok) return prepared;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM orders WHERE id = ${id} FOR UPDATE`);
    await tx.delete(orderItems).where(eq(orderItems.orderId, id));
    await tx.delete(orderBundles).where(eq(orderBundles.orderId, id));
    await tx
      .update(orders)
      .set({ clientId: prepared.order.clientId, updatedAt: new Date(), ...totals(prepared) })
      .where(eq(orders.id, id));
    await writeLines(tx as unknown as Db, id, prepared);
  });
  return { ok: true, id, number: existing.number };
}

export type OrderDetail = Order & {
  client: Pick<Client, "id" | "name" | "whatsapp" | "isReseller" | "anonymizedAt">;
  bundles: { id: number; position: number; label: string; fee: number }[];
  items: OrderItem[];
};

export async function getOrder(db: Db, id: number): Promise<OrderDetail | null> {
  const [row] = await db
    .select({ order: orders, client: { id: clients.id, name: clients.name, whatsapp: clients.whatsapp, isReseller: clients.isReseller, anonymizedAt: clients.anonymizedAt } })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(eq(orders.id, id));
  if (!row) return null;
  const bundles = await db
    .select({ id: orderBundles.id, position: orderBundles.position, label: orderBundles.label, fee: orderBundles.fee })
    .from(orderBundles)
    .where(eq(orderBundles.orderId, id))
    .orderBy(asc(orderBundles.position));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position));
  return { ...row.order, client: row.client, bundles, items };
}

export type OrderRow = Pick<Order, "id" | "number" | "total" | "createdAt"> & { clientName: string; clientId: number; isReseller: boolean };

/** Orders, newest first, searched by number or client name; optionally for one client. */
export async function listOrders(db: Db, { q = "", clientId }: { q?: string; clientId?: number } = {}, limit = 50): Promise<OrderRow[]> {
  const term = q.trim();
  const search = term ? or(ilike(orders.number, `%${escapeLike(term)}%`), ilike(clients.name, `%${escapeLike(term)}%`)) : undefined;
  return db
    .select({ id: orders.id, number: orders.number, total: orders.total, createdAt: orders.createdAt, clientName: clients.name, clientId: clients.id, isReseller: clients.isReseller })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(clientId ? eq(orders.clientId, clientId) : search)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit);
}

