import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import {
  clients, ITEM_STATUSES, orderBundles, orderCounters, orderItems, orders, events,
  type Client, type ItemStatus, type Order, type OrderItem, type ShopEvent,
} from "@/lib/db/schema";
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
    /** An existing line being edited (keeps its status); absent for a new line. */
    id: z.number().int().positive().optional(),
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
    return { id: item.id, name: item.name, store: item.store, quantity: item.quantity, unitPrice: item.unitPrice ?? 0, fee };
  });

export const orderSchema = z
  .object({
    clientId: z.coerce.number().int().positive("required"),
    /** Empty for a one-off order outside any event. */
    eventId: z.coerce.number().int().min(0).optional().transform((v) => v || null),
    note: z.string().trim().max(1000, "too_long"),
    items: z.array(itemSchema).min(1, "no_items").max(MAX_ITEMS, "too_many"),
    bundles: z.array(z.object({ key: z.string().min(1).max(20), label: z.string().trim().max(60, "too_long"), fee: rupiahField() })).max(20, "too_many"),
    discount: rupiahField(true),
    /** DP to ask for first, in percent; empty for none. */
    dpPercent: z
      .union([z.literal(""), z.null(), z.coerce.number().int("invalid_percent").min(1, "invalid_percent").max(100, "invalid_percent")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
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

type Existing = { orderId: number; eventId: number | null; items: Map<number, Pick<OrderItem, "status">> };

/**
 * Validates, checks the client and event, and prices the order on the server (browser totals are
 * never trusted). When editing, lines keep their status, and sold-out lines stay uncharged.
 */
async function prepare(db: Db, input: OrderInput, existing?: Existing) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, errors: fieldErrors(parsed.error) };
  const order = parsed.data;
  const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId));
  if (!client || client.anonymizedAt) return { ok: false as const, errors: { clientId: "required" } };
  if (order.eventId) {
    const [event] = await db.select({ closedAt: events.closedAt }).from(events).where(eq(events.id, order.eventId));
    if (!event) return { ok: false as const, errors: { eventId: "required" } };
    if (event.closedAt && order.eventId !== existing?.eventId) return { ok: false as const, errors: { eventId: "event_closed" } };
  }
  const status = (item: { id?: number }): ItemStatus => (item.id && existing?.items.get(item.id)?.status) || "requested";
  const voucher = order.applyVoucher ? (await getSettings(db)).voucherAmount : 0;
  const pricing: PricingInput = {
    items: order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice, fee: item.fee, soldOut: status(item) === "sold_out" })),
    bundles: order.bundles.map((b) => ({ key: b.key, fee: b.fee ?? 0 })),
    discount: order.discount ?? 0,
    voucher,
    shipping: order.shipping,
  };
  return { ok: true as const, order, priced: priceOrder(pricing), existing };
}

type Prepared = Extract<Awaited<ReturnType<typeof prepare>>, { ok: true }>;

const lineFields = (item: Prepared["order"]["items"][number], bundleIds: Map<string, number>) => ({
  name: item.name,
  store: item.store,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  feeMode: item.fee.mode,
  feeAmount: item.fee.mode === "per_item" ? item.fee.amount : null,
  feeBasisPoints: item.fee.mode === "percent" ? item.fee.basisPoints : null,
  bundleId: item.fee.mode === "bundle" ? bundleIds.get(item.fee.bundle)! : null,
});

/** Bundles are written afresh; existing lines are updated in place (keeping status), new ones added, removed ones deleted. */
async function writeLines(tx: Db, orderId: number, { order, priced, existing }: Prepared) {
  await tx.delete(orderBundles).where(eq(orderBundles.orderId, orderId));
  const bundleIds = new Map<string, number>();
  for (const [position, bundle] of order.bundles.entries()) {
    const [row] = await tx
      .insert(orderBundles)
      .values({ orderId, position, label: bundle.label, fee: bundle.fee ?? 0 })
      .returning({ id: orderBundles.id });
    bundleIds.set(bundle.key, row.id);
  }
  const kept = new Set<number>();
  for (const [position, item] of order.items.entries()) {
    const values = { ...lineFields(item, bundleIds), position, subtotal: priced.lines[position].subtotal, fee: priced.lines[position].fee };
    if (item.id && existing?.items.has(item.id) && !kept.has(item.id)) {
      kept.add(item.id);
      await tx.update(orderItems).set(values).where(eq(orderItems.id, item.id));
    } else {
      await tx.insert(orderItems).values({ orderId, ...values });
    }
  }
  const removed = [...(existing?.items.keys() ?? [])].filter((id) => !kept.has(id));
  if (removed.length) await tx.delete(orderItems).where(inArray(orderItems.id, removed));
}

function totals({ order, priced }: Prepared) {
  return {
    eventId: order.eventId,
    dpPercent: order.dpPercent,
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

/** Updates the order's lines (each keeps its status), bundles and amounts; its number stays. */
export async function updateOrder(db: Db, id: number, input: OrderInput): Promise<OrderResult> {
  const [current] = await db.select({ number: orders.number, eventId: orders.eventId }).from(orders).where(eq(orders.id, id));
  if (!current) return { ok: false, errors: { order: "not_found" } };
  const lines = await db.select({ id: orderItems.id, status: orderItems.status }).from(orderItems).where(eq(orderItems.orderId, id));
  const prepared = await prepare(db, input, { orderId: id, eventId: current.eventId, items: new Map(lines.map((l) => [l.id, l])) });
  if (!prepared.ok) return prepared;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM orders WHERE id = ${id} FOR UPDATE`);
    await tx
      .update(orders)
      .set({ clientId: prepared.order.clientId, updatedAt: new Date(), ...totals(prepared) })
      .where(eq(orders.id, id));
    await writeLines(tx as unknown as Db, id, prepared);
  });
  return { ok: true, id, number: current.number };
}

/** Prices a saved order again from its stored lines, e.g. after an item sold out or was replaced. */
async function reprice(tx: Db, orderId: number) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  const bundles = await tx.select().from(orderBundles).where(eq(orderBundles.orderId, orderId)).orderBy(asc(orderBundles.position));
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.position));
  const voucher = order.voucherApplied ? (await getSettings(tx)).voucherAmount : 0;
  const priced = priceOrder({
    items: items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      soldOut: item.status === "sold_out",
      fee:
        item.feeMode === "per_item" ? { mode: "per_item", amount: item.feeAmount ?? 0 }
        : item.feeMode === "percent" ? { mode: "percent", basisPoints: item.feeBasisPoints ?? 0 }
        : item.feeMode === "bundle" && item.bundleId ? { mode: "bundle", bundle: String(item.bundleId) }
        : { mode: "nett" },
    })),
    bundles: bundles.map((b) => ({ key: String(b.id), fee: b.fee })),
    discount: order.discount,
    voucher,
    shipping: order.shipping,
  });
  for (const [i, item] of items.entries()) {
    await tx.update(orderItems).set({ subtotal: priced.lines[i].subtotal, fee: priced.lines[i].fee }).where(eq(orderItems.id, item.id));
  }
  await tx
    .update(orders)
    .set({ voucher: priced.voucher, itemsTotal: priced.itemsTotal, feesTotal: priced.feesTotal, total: priced.total, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

/** Runs `change` on one line of an order under the order's lock, then prices the order again. */
async function changeLine(db: Db, orderId: number, itemId: number, change: (tx: Db, item: OrderItem) => Promise<boolean>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM orders WHERE id = ${orderId} FOR UPDATE`);
    const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
    if (!item || !(await change(tx as unknown as Db, item))) return false;
    await reprice(tx as unknown as Db, orderId);
    return true;
  });
}

/**
 * Moves an item along: requested → bought → arrived → packed → shipped, or to sold_out (then it
 * waits for the client's answer and is not charged). Any step can be undone.
 */
export async function setItemStatus(db: Db, orderId: number, itemId: number, status: ItemStatus) {
  if (!ITEM_STATUSES.includes(status)) return false;
  return changeLine(db, orderId, itemId, async (tx, item) => {
    if (item.status === status) return true;
    await tx
      .update(orderItems)
      .set({ status, soldOutResolution: status === "sold_out" ? "waiting" : null, statusChangedAt: new Date() })
      .where(eq(orderItems.id, item.id));
    return true;
  });
}

/** The client called a sold-out item off. */
export async function cancelSoldOut(db: Db, orderId: number, itemId: number) {
  return changeLine(db, orderId, itemId, async (tx, item) => {
    if (item.status !== "sold_out") return false;
    await tx.update(orderItems).set({ soldOutResolution: "cancelled", statusChangedAt: new Date() }).where(eq(orderItems.id, item.id));
    return true;
  });
}

const replacementSchema = z.object({
  name: z.string().trim().min(1, "required").max(120, "too_long"),
  store: z.string().trim().max(80, "too_long"),
  unitPrice: rupiahField(),
});

/**
 * The client took a similar item instead: it is added to the same order (same quantity and fee
 * type, at its own price), linked to the sold-out one, and the order is priced again.
 */
export async function replaceSoldOut(
  db: Db, orderId: number, itemId: number, input: z.input<typeof replacementSchema>,
): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const parsed = replacementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const done = await changeLine(db, orderId, itemId, async (tx, item) => {
    if (item.status !== "sold_out") return false;
    const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${orderItems.position}), -1)::int` }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const { id: _id, ...rest } = item; // eslint-disable-line @typescript-eslint/no-unused-vars
    await tx.insert(orderItems).values({
      ...rest,
      position: last + 1,
      name: parsed.data.name,
      store: parsed.data.store || item.store,
      unitPrice: parsed.data.unitPrice ?? 0,
      status: "requested",
      soldOutResolution: null,
      statusChangedAt: new Date(),
      replacesItemId: item.id,
    });
    await tx.update(orderItems).set({ soldOutResolution: "replaced", statusChangedAt: new Date() }).where(eq(orderItems.id, item.id));
    return true;
  });
  return done ? { ok: true } : { ok: false, errors: { item: "not_found" } };
}

/** Sent to the client: every item not sold out becomes shipped, with the courier and tracking number. */
export async function markShipped(db: Db, orderId: number, input: { courier: string; trackingNumber: string }) {
  const courier = input.courier.trim().slice(0, 40);
  const trackingNumber = input.trackingNumber.trim().slice(0, 60);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM orders WHERE id = ${orderId} FOR UPDATE`);
    await tx.update(orders).set({ courier, trackingNumber, shippedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx
      .update(orderItems)
      .set({ status: "shipped", statusChangedAt: new Date() })
      .where(and(eq(orderItems.orderId, orderId), sql`${orderItems.status} <> 'sold_out'`));
  });
}

export type OrderDetail = Order & {
  client: Pick<Client, "id" | "name" | "whatsapp" | "isReseller" | "anonymizedAt">;
  event: Pick<ShopEvent, "id" | "name"> | null;
  bundles: { id: number; position: number; label: string; fee: number }[];
  items: OrderItem[];
};

export async function getOrder(db: Db, id: number): Promise<OrderDetail | null> {
  const [row] = await db
    .select({
      order: orders,
      client: { id: clients.id, name: clients.name, whatsapp: clients.whatsapp, isReseller: clients.isReseller, anonymizedAt: clients.anonymizedAt },
      event: { id: events.id, name: events.name },
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.id, id));
  if (!row) return null;
  const bundles = await db
    .select({ id: orderBundles.id, position: orderBundles.position, label: orderBundles.label, fee: orderBundles.fee })
    .from(orderBundles)
    .where(eq(orderBundles.orderId, id))
    .orderBy(asc(orderBundles.position));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position));
  return { ...row.order, client: row.client, event: row.event?.id ? row.event : null, bundles, items };
}

export type OrderRow = Pick<Order, "id" | "number" | "total" | "createdAt" | "dpPercent"> & {
  clientName: string; clientId: number; isReseller: boolean;
  /** Kept by her so far: payments minus refunds and money moved to credit. */
  paid: number;
};

/** Orders, newest first, searched by number or client name; optionally for one client. */
export async function listOrders(db: Db, { q = "", clientId, eventId }: { q?: string; clientId?: number; eventId?: number } = {}, limit = 50): Promise<OrderRow[]> {
  const term = q.trim();
  const search = term ? or(ilike(orders.number, `%${escapeLike(term)}%`), ilike(clients.name, `%${escapeLike(term)}%`)) : undefined;
  return db
    .select({
      id: orders.id, number: orders.number, total: orders.total, createdAt: orders.createdAt, dpPercent: orders.dpPercent,
      clientName: clients.name, clientId: clients.id, isReseller: clients.isReseller,
      paid: sql<number>`coalesce((select sum(case when p.kind = 'payment' then p.amount else -p.amount end) from payments p where p.order_id = ${orders.id}), 0)::bigint`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(clientId ? eq(orders.clientId, clientId) : eventId ? eq(orders.eventId, eventId) : search)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit);
}

