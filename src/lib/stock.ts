import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clients, events, orderItems, orders, stockItems, stockMoves, type ItemStatus, type StockItem, type StockMove } from "@/lib/db/schema";
import { fieldErrors } from "@/lib/clients";
import { parseRupiah } from "@/lib/money";
import { jakartaToday } from "@/lib/server/public-url";
import type { FieldErrors } from "@/lib/settings";

/**
 * Ready stock. What is left of an item is never stored: it is what came in and went out through
 * stock moves (added, sold directly, recounted), minus what orders take (every order line that uses
 * the item, unless it was marked sold out). So editing or deleting an order, or undoing a sale,
 * gives the stock back by itself. Every change locks the item's row first, so two sales of the last
 * unit cannot both succeed.
 */

export type StockResult = { ok: true } | { ok: false; errors: FieldErrors };

const MAX_UNITS = 9_999;

const amount = (opts: { zero?: boolean } = {}) =>
  z.string().transform((v, ctx) => {
    const n = parseRupiah(v);
    if (n === null) ctx.addIssue({ code: "custom", message: "required" });
    else if (Number.isNaN(n) || n > 1_000_000_000 || (!opts.zero && n <= 0)) ctx.addIssue({ code: "custom", message: "invalid_amount" });
    return n ?? 0;
  });

const units = (min: number) => z.coerce.number().int("invalid_quantity").min(min, "invalid_quantity").max(MAX_UNITS, "invalid_quantity");

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "invalid_date");

const eventRef = z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v));

const itemSchema = z.object({
  name: z.string().trim().min(1, "required").max(120, "too_long"),
  store: z.string().trim().max(80, "too_long"),
  unitCost: amount({ zero: true }),
  price: amount(),
  eventId: eventRef,
  note: z.string().trim().max(300, "too_long"),
});

export type StockItemInput = z.input<typeof itemSchema>;

const saleSchema = z.object({
  quantity: units(1),
  unitPrice: amount({ zero: true }),
  method: z.enum(["transfer", "qris", "cash"]),
  eventId: eventRef,
  soldOn: day,
  note: z.string().trim().max(300, "too_long"),
});

export type StockSaleInput = z.input<typeof saleSchema>;

async function eventExists(db: Db, id: number | null) {
  if (id === null) return true;
  const [row] = await db.select({ id: events.id }).from(events).where(eq(events.id, id));
  return Boolean(row);
}

/** Locks the items' rows (in id order, so two transactions never wait on each other in a circle). */
async function lockItems(tx: Db, ids: number[]) {
  if (ids.length === 0) return [];
  return tx.select().from(stockItems).where(inArray(stockItems.id, ids)).orderBy(asc(stockItems.id)).for("update");
}

/** What is left of each item: its moves, minus the order lines that use it (except one order's own, when editing it). */
async function availableOf(db: Db, ids: number[], exceptOrderId?: number): Promise<Map<number, number>> {
  const left = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) return left;
  const moved = await db
    .select({ id: stockMoves.stockItemId, n: sql<number>`sum(${stockMoves.quantity})::int` })
    .from(stockMoves)
    .where(inArray(stockMoves.stockItemId, ids))
    .groupBy(stockMoves.stockItemId);
  const taken = await db
    .select({ id: orderItems.stockItemId, n: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .where(and(inArray(orderItems.stockItemId, ids), ne(orderItems.status, "sold_out"), exceptOrderId ? ne(orderItems.orderId, exceptOrderId) : undefined))
    .groupBy(orderItems.stockItemId);
  for (const r of moved) left.set(r.id, (left.get(r.id) ?? 0) + r.n);
  for (const r of taken) if (r.id !== null) left.set(r.id, (left.get(r.id) ?? 0) - r.n);
  return left;
}

/**
 * For an order being saved (inside its transaction): every stock line must fit in what is left.
 * Lines marked sold out take nothing. Returns field errors, or null when it all fits.
 */
export async function checkOrderStock(
  tx: Db, lines: { stockItemId?: number | null; quantity: number; status: ItemStatus }[], exceptOrderId?: number,
): Promise<FieldErrors | null> {
  const ids = [...new Set(lines.flatMap((l) => (l.stockItemId ? [l.stockItemId] : [])))];
  if (ids.length === 0) return null;
  const found = new Set((await lockItems(tx, ids)).map((r) => r.id));
  const left = await availableOf(tx, ids, exceptOrderId);
  const errors: FieldErrors = {};
  for (const [i, line] of lines.entries()) {
    if (!line.stockItemId || line.status === "sold_out") continue;
    if (!found.has(line.stockItemId)) {
      errors[`items.${i}.name`] = "not_found";
      continue;
    }
    const remaining = (left.get(line.stockItemId) ?? 0) - line.quantity;
    left.set(line.stockItemId, remaining);
    if (remaining < 0) errors[`items.${i}.quantity`] = "not_enough_stock";
  }
  return Object.keys(errors).length ? errors : null;
}

/** A called-off stock line coming back into an order (inside the order's transaction): is there enough left? */
export async function stockAllows(tx: Db, stockItemId: number, quantity: number) {
  await lockItems(tx, [stockItemId]);
  return ((await availableOf(tx, [stockItemId])).get(stockItemId) ?? 0) >= quantity;
}

export async function createStockItem(db: Db, input: StockItemInput & { quantity: string }, userId: number | null, now = new Date()): Promise<{ ok: true; id: number } | { ok: false; errors: FieldErrors }> {
  const parsed = itemSchema.extend({ quantity: units(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { quantity, ...item } = parsed.data;
  if (!(await eventExists(db, item.eventId))) return { ok: false, errors: { eventId: "required" } };
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(stockItems).values(item).returning({ id: stockItems.id });
    await tx.insert(stockMoves).values({ stockItemId: row.id, kind: "added", quantity, movedOn: jakartaToday(now), createdBy: userId });
    return { ok: true as const, id: row.id };
  });
}

export async function updateStockItem(db: Db, id: number, input: StockItemInput): Promise<StockResult> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!(await eventExists(db, parsed.data.eventId))) return { ok: false, errors: { eventId: "required" } };
  const updated = await db.update(stockItems).set(parsed.data).where(eq(stockItems.id, id)).returning({ id: stockItems.id });
  return updated.length ? { ok: true } : { ok: false, errors: { item: "not_found" } };
}

/** Removes an item entered by mistake; refused once an order has used it (the order still needs it). */
export async function deleteStockItem(db: Db, id: number) {
  const [used] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.stockItemId, id)).limit(1);
  if (used) return false;
  const deleted = await db.delete(stockItems).where(eq(stockItems.id, id)).returning({ id: stockItems.id });
  return deleted.length > 0;
}

/** Runs `change` with the item locked and what is left of it. */
async function withItem<T>(db: Db, id: number, change: (tx: Db, item: StockItem, left: number) => Promise<T>): Promise<T | null> {
  return db.transaction(async (tx) => {
    const [item] = await lockItems(tx as unknown as Db, [id]);
    if (!item) return null;
    const left = (await availableOf(tx as unknown as Db, [id])).get(id) ?? 0;
    return change(tx as unknown as Db, item, left);
  });
}

/** More of the same item in hand. */
export async function addStock(db: Db, id: number, input: { quantity: string; note: string }, userId: number | null, now = new Date()): Promise<StockResult> {
  const parsed = z.object({ quantity: units(1), note: z.string().trim().max(300, "too_long") }).safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const done = await withItem(db, id, async (tx) => {
    await tx.insert(stockMoves).values({ stockItemId: id, kind: "added", quantity: parsed.data.quantity, note: parsed.data.note, movedOn: jakartaToday(now), createdBy: userId });
    return true;
  });
  return done ? { ok: true } : { ok: false, errors: { item: "not_found" } };
}

/** She counted what is left (something broke, went missing, or was miscounted): the difference is recorded with her note. */
export async function correctStock(db: Db, id: number, input: { counted: string; note: string }, userId: number | null, now = new Date()): Promise<StockResult> {
  const parsed = z.object({ counted: units(0), note: z.string().trim().min(1, "required").max(300, "too_long") }).safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const done = await withItem(db, id, async (tx, _item, left) => {
    const difference = parsed.data.counted - left;
    if (difference !== 0) {
      await tx.insert(stockMoves).values({ stockItemId: id, kind: "adjusted", quantity: difference, note: parsed.data.note, movedOn: jakartaToday(now), createdBy: userId });
    }
    return true;
  });
  return done ? { ok: true } : { ok: false, errors: { item: "not_found" } };
}

/** Sold directly, without an order: at a bazaar, or to someone who paid on the spot. */
export async function recordStockSale(db: Db, id: number, input: StockSaleInput, userId: number | null): Promise<StockResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const sale = parsed.data;
  if (!(await eventExists(db, sale.eventId))) return { ok: false, errors: { eventId: "required" } };
  const result = await withItem<StockResult>(db, id, async (tx, _item, left) => {
    if (sale.quantity > left) return { ok: false, errors: { quantity: "not_enough_stock" } };
    await tx.insert(stockMoves).values({
      stockItemId: id, kind: "sale", quantity: -sale.quantity, unitPrice: sale.unitPrice, method: sale.method,
      eventId: sale.eventId, movedOn: sale.soldOn, note: sale.note, createdBy: userId,
    });
    return { ok: true };
  });
  return result ?? { ok: false, errors: { item: "not_found" } };
}

/** Undoes a sale, an addition or a recount, unless that would leave less than nothing (it was already sold on). */
export async function deleteStockMove(db: Db, id: number, moveId: number) {
  const done = await withItem(db, id, async (tx, _item, left) => {
    const [move] = await tx.select().from(stockMoves).where(and(eq(stockMoves.id, moveId), eq(stockMoves.stockItemId, id)));
    if (!move || left - move.quantity < 0) return false;
    await tx.delete(stockMoves).where(eq(stockMoves.id, moveId));
    return true;
  });
  return done === true;
}

/** Profit is worked out at the item's cost as it is now: correcting the cost corrects past profit too. */
export type StockRow = Pick<StockItem, "id" | "name" | "store" | "unitCost" | "price"> & {
  available: number;
  /** Units sold, directly or in orders. */
  sold: number;
  /** What is left, at cost. */
  value: number;
  /** Money from the units sold: direct sales, and order lines (price and any fee). */
  revenue: number;
  profit: number;
};

// Written out in full: in a query on one table Drizzle leaves column names unqualified, and a bare
// "id" inside these subqueries would mean the subquery's own row.
const ITEM_ID = sql.raw(`"stock_items"."id"`);
const directSold = sql<number>`coalesce((select -sum(m.quantity) from stock_moves m where m.stock_item_id = ${ITEM_ID} and m.kind = 'sale'), 0)::int`;
const directRevenue = sql<number>`coalesce((select -sum(m.quantity * m.unit_price) from stock_moves m where m.stock_item_id = ${ITEM_ID} and m.kind = 'sale'), 0)::bigint`;
const moved = sql<number>`coalesce((select sum(m.quantity) from stock_moves m where m.stock_item_id = ${ITEM_ID}), 0)::int`;
const inOrders = sql<number>`coalesce((select sum(i.quantity) from order_items i where i.stock_item_id = ${ITEM_ID} and i.status <> 'sold_out'), 0)::int`;
const orderRevenue = sql<number>`coalesce((select sum(i.subtotal + i.fee) from order_items i where i.stock_item_id = ${ITEM_ID} and i.status <> 'sold_out'), 0)::bigint`;

export async function listStock(db: Db): Promise<StockRow[]> {
  const rows = await db
    .select({
      id: stockItems.id, name: stockItems.name, store: stockItems.store, unitCost: stockItems.unitCost, price: stockItems.price,
      moved: moved.mapWith(Number), inOrders: inOrders.mapWith(Number), directSold: directSold.mapWith(Number),
      directRevenue: directRevenue.mapWith(Number), orderRevenue: orderRevenue.mapWith(Number),
    })
    .from(stockItems)
    .orderBy(asc(stockItems.name), asc(stockItems.id));
  return rows
    .map(({ moved: m, inOrders: o, directSold: d, directRevenue: dr, orderRevenue: or, ...item }) => {
      const available = m - o;
      const sold = d + o;
      const revenue = dr + or;
      return { ...item, available, sold, value: available * item.unitCost, revenue, profit: revenue - sold * item.unitCost };
    })
    // In stock first, then the sold-out ones.
    .sort((a, b) => Number(b.available > 0) - Number(a.available > 0));
}

/** For the order form: items with something left, at their usual price. */
export async function availableStock(db: Db) {
  return (await listStock(db))
    .filter((r) => r.available > 0)
    .map(({ id, name, store, price, available }) => ({ id, name, store, price, available }));
}

export type StockOrderLine = { orderId: number; orderNumber: string; clientName: string; quantity: number; amount: number; status: ItemStatus; createdAt: Date };
export type StockDetail = StockRow & Pick<StockItem, "note" | "eventId"> & {
  eventName: string | null;
  moves: (StockMove & { eventName: string | null })[];
  orderLines: StockOrderLine[];
};

export async function getStockItem(db: Db, id: number): Promise<StockDetail | null> {
  const row = (await listStock(db)).find((r) => r.id === id);
  if (!row) return null;
  const [item] = await db.select({ note: stockItems.note, eventId: stockItems.eventId, eventName: events.name }).from(stockItems).leftJoin(events, eq(events.id, stockItems.eventId)).where(eq(stockItems.id, id));
  const moves = await db
    .select({ move: stockMoves, eventName: events.name })
    .from(stockMoves)
    .leftJoin(events, eq(events.id, stockMoves.eventId))
    .where(eq(stockMoves.stockItemId, id))
    .orderBy(desc(stockMoves.movedOn), desc(stockMoves.id));
  const orderLines = await db
    .select({
      orderId: orders.id, orderNumber: orders.number, clientName: clients.name, quantity: orderItems.quantity,
      amount: sql<number>`(${orderItems.subtotal} + ${orderItems.fee})::bigint`.mapWith(Number), status: orderItems.status, createdAt: orders.createdAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(and(eq(orderItems.stockItemId, id), ne(orderItems.status, "sold_out")))
    .orderBy(desc(orders.createdAt));
  return { ...row, note: item.note, eventId: item.eventId, eventName: item.eventName, moves: moves.map((m) => ({ ...m.move, eventName: m.eventName })), orderLines };
}

/** Stock money for an event: direct sales there, and the profit on all stock sold there (direct and in its orders). */
export async function eventStock(db: Db, eventId: number) {
  const [direct] = await db
    .select({
      sales: sql<number>`coalesce(-sum(${stockMoves.quantity} * ${stockMoves.unitPrice}), 0)::bigint`.mapWith(Number),
      profit: sql<number>`coalesce(-sum(${stockMoves.quantity} * (${stockMoves.unitPrice} - ${stockItems.unitCost})), 0)::bigint`.mapWith(Number),
    })
    .from(stockMoves)
    .innerJoin(stockItems, eq(stockItems.id, stockMoves.stockItemId))
    .where(and(eq(stockMoves.kind, "sale"), eq(stockMoves.eventId, eventId)));
  const [inOrders] = await db
    .select({ profit: sql<number>`coalesce(sum(${orderItems.subtotal} + ${orderItems.fee} - ${orderItems.quantity} * ${stockItems.unitCost}), 0)::bigint`.mapWith(Number) })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(stockItems, eq(stockItems.id, orderItems.stockItemId))
    .where(and(eq(orders.eventId, eventId), ne(orderItems.status, "sold_out")));
  return { stockSales: direct.sales, stockProfit: direct.profit + inOrders.profit };
}

/** Stock money for a month: what is left at cost, cash from direct sales, and the profit on everything sold. */
export async function monthStock(db: Db, month: { fromDay: string; toDay: string; from: Date; to: Date }) {
  const value = (await listStock(db)).reduce((sum, r) => sum + Math.max(r.value, 0), 0);
  const [direct] = await db
    .select({
      sales: sql<number>`coalesce(-sum(${stockMoves.quantity} * ${stockMoves.unitPrice}), 0)::bigint`.mapWith(Number),
      profit: sql<number>`coalesce(-sum(${stockMoves.quantity} * (${stockMoves.unitPrice} - ${stockItems.unitCost})), 0)::bigint`.mapWith(Number),
    })
    .from(stockMoves)
    .innerJoin(stockItems, eq(stockItems.id, stockMoves.stockItemId))
    .where(and(eq(stockMoves.kind, "sale"), gte(stockMoves.movedOn, month.fromDay), lt(stockMoves.movedOn, month.toDay)));
  const [inOrders] = await db
    .select({ profit: sql<number>`coalesce(sum(${orderItems.subtotal} + ${orderItems.fee} - ${orderItems.quantity} * ${stockItems.unitCost}), 0)::bigint`.mapWith(Number) })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(stockItems, eq(stockItems.id, orderItems.stockItemId))
    .where(and(ne(orderItems.status, "sold_out"), gte(orders.createdAt, month.from), lt(orders.createdAt, month.to)));
  return { value, directSales: direct.sales, profit: direct.profit + inOrders.profit };
}
