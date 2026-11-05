import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clients, EVENT_KINDS, orderItems, orders, events, type ItemStatus, type SoldOutResolution, type ShopEvent } from "@/lib/db/schema";
import { fieldErrors } from "@/lib/clients";
import type { FieldErrors } from "@/lib/settings";

/** YYYY-MM-DD that is a real day (no 30 February: Date would roll it over to March). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "invalid_date");

export const eventSchema = z
  .object({
    kind: z.enum(EVENT_KINDS),
    name: z.string().trim().min(1, "required").max(80, "too_long"),
    location: z.string().trim().max(80, "too_long"),
    startsOn: isoDate,
    endsOn: isoDate,
    orderDeadline: z.union([z.literal(""), isoDate]).transform((v) => v || null),
    note: z.string().trim().max(1000, "too_long"),
  })
  .superRefine((event, ctx) => {
    if (event.endsOn < event.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "before_start" });
    if (event.orderDeadline && event.orderDeadline > event.endsOn) ctx.addIssue({ code: "custom", path: ["orderDeadline"], message: "after_event" });
  });

export type EventInput = z.input<typeof eventSchema>;
export type EventResult = { ok: true; id: number } | { ok: false; errors: FieldErrors };

export async function createEvent(db: Db, input: EventInput): Promise<EventResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const [row] = await db.insert(events).values(parsed.data).returning({ id: events.id });
  return { ok: true, id: row.id };
}

export async function updateEvent(db: Db, id: number, input: EventInput): Promise<EventResult> {
  if (!(await getEvent(db, id))) return { ok: false, errors: { name: "not_found" } };
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  await db.update(events).set(parsed.data).where(eq(events.id, id));
  return { ok: true, id };
}

export async function getEvent(db: Db, id: number): Promise<ShopEvent | null> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row ?? null;
}

/** Closed events take no new orders; their existing orders carry on. */
export async function setEventClosed(db: Db, id: number, closed: boolean) {
  await db.update(events).set({ closedAt: closed ? new Date() : null }).where(eq(events.id, id));
}

/** A event without orders can be deleted; one with orders is closed instead (its orders keep it). */
export async function deleteEvent(db: Db, id: number): Promise<"deleted" | "has_orders"> {
  const [{ n }] = await db.select({ n: count() }).from(orders).where(eq(orders.eventId, id));
  if (n > 0) return "has_orders";
  await db.delete(events).where(eq(events.id, id));
  return "deleted";
}

export type EventRow = ShopEvent & { orders: number; toBuy: number };

/** Open events first (soonest first), then closed ones (latest first), with their order and to-buy counts. */
export async function listEvents(db: Db): Promise<EventRow[]> {
  const rows = await db
    .select({
      event: events,
      orders: sql<number>`count(distinct ${orders.id})::int`,
      toBuy: sql<number>`coalesce(sum(case when ${orderItems.status} = 'requested' then ${orderItems.quantity} end), 0)::int`,
    })
    .from(events)
    .leftJoin(orders, eq(orders.eventId, events.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .groupBy(events.id)
    .orderBy(sql`${events.closedAt} is not null`, asc(events.startsOn), desc(events.id));
  return rows.map((r) => ({ ...r.event, orders: r.orders, toBuy: r.toBuy }));
}

/** Events that still take orders, for the order form. */
export async function openEvents(db: Db): Promise<Pick<ShopEvent, "id" | "kind" | "name" | "startsOn">[]> {
  return db.select({ id: events.id, kind: events.kind, name: events.name, startsOn: events.startsOn }).from(events).where(isNull(events.closedAt)).orderBy(asc(events.startsOn));
}

export type ShoppingItem = {
  itemId: number;
  orderId: number;
  orderNumber: string;
  clientName: string;
  clientWhatsapp: string;
  name: string;
  quantity: number;
  status: ItemStatus;
  soldOutResolution: SoldOutResolution | null;
};

/**
 * Everything to buy on a event, grouped by store (stores A–Z, items without a store last): items
 * still to buy, those already bought (ticked) and those sold out.
 */
export async function shoppingList(db: Db, eventId: number): Promise<{ store: string; items: ShoppingItem[] }[]> {
  const rows = await db
    .select({
      itemId: orderItems.id,
      orderId: orders.id,
      orderNumber: orders.number,
      clientName: clients.name,
      clientWhatsapp: clients.whatsapp,
      name: orderItems.name,
      store: orderItems.store,
      quantity: orderItems.quantity,
      status: orderItems.status,
      soldOutResolution: orderItems.soldOutResolution,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(and(eq(orders.eventId, eventId), inArray(orderItems.status, ["requested", "bought", "sold_out"])))
    .orderBy(asc(orderItems.name), asc(orders.number));
  const groups = new Map<string, ShoppingItem[]>();
  for (const { store, ...item } of rows) {
    const key = store.trim();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "id")))
    .map(([store, items]) => ({ store, items }));
}
