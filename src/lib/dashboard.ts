import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clients, events, orderItems, orders, payments } from "@/lib/db/schema";
import { orderBalance, type Balance } from "@/lib/balance";

/** Start and end of the current month in Jakarta, as instants and as YYYY-MM-DD days. */
export function jakartaMonth(now = new Date()) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const day = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  return {
    fromDay: day(y, m),
    toDay: day(next[0], next[1]),
    // Midnight in Jakarta (UTC+7, no daylight saving) is 17:00 UTC the day before.
    from: new Date(`${day(y, m)}T00:00:00+07:00`),
    to: new Date(`${day(next[0], next[1])}T00:00:00+07:00`),
  };
}

type OrderMoneyRow = { id: number; number: string; clientName: string; total: number; dpPercent: number | null; paid: number; eventId: number | null; feesTotal: number; itemsTotal: number };
export type OrderWithBalance = Omit<OrderMoneyRow, "paid"> & { balance: Balance };

/** Every order with what is paid on it (payments minus refunds and money moved to credit). */
async function ordersWithBalance(db: Db, eventId?: number): Promise<OrderWithBalance[]> {
  const rows: OrderMoneyRow[] = await db
    .select({
      id: orders.id, number: orders.number, clientName: clients.name, total: orders.total, dpPercent: orders.dpPercent, eventId: orders.eventId,
      feesTotal: orders.feesTotal, itemsTotal: orders.itemsTotal,
      paid: sql<number>`coalesce((select sum(case when p.kind = 'payment' then p.amount else -p.amount end) from payments p where p.order_id = ${orders.id}), 0)::bigint`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(eventId ? eq(orders.eventId, eventId) : undefined)
    .orderBy(orders.id);
  return rows.map(({ paid, ...o }) => ({ ...o, balance: orderBalance(o.total, o.dpPercent, [{ kind: "payment", amount: paid }]) }));
}

export type WorkItem = { orderId: number; orderNumber: string; clientName: string; itemName: string; quantity: number };

async function itemsWithStatus(db: Db, where: ReturnType<typeof and>): Promise<WorkItem[]> {
  return db
    .select({ orderId: orders.id, orderNumber: orders.number, clientName: clients.name, itemName: orderItems.name, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(clients, eq(clients.id, orders.clientId))
    .where(where)
    .orderBy(orders.id, orderItems.position);
}

export type Dashboard = {
  /** Units still to buy, per open event (and one-off orders as eventId null). */
  toBuy: { eventId: number | null; eventName: string | null; quantity: number }[];
  /** Sold out, waiting for the client: swap or call off? */
  waitingForClient: WorkItem[];
  /** Arrived with her, to pack. */
  toPack: WorkItem[];
  /** Packed, to send. */
  toShip: WorkItem[];
  /** Orders whose DP is not fully paid yet. */
  dpDue: OrderWithBalance[];
  /** Orders paid beyond their total: refund or keep as credit. */
  overpaid: OrderWithBalance[];
  money: { outstanding: number; receivedThisMonth: number; feesThisMonth: number };
};

export async function getDashboard(db: Db, now = new Date()): Promise<Dashboard> {
  const month = jakartaMonth(now);
  const all = await ordersWithBalance(db);

  const toBuy = await db
    .select({ eventId: orders.eventId, eventName: events.name, quantity: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(events, eq(events.id, orders.eventId))
    .where(eq(orderItems.status, "requested"))
    .groupBy(orders.eventId, events.name, events.startsOn)
    .orderBy(sql`${events.startsOn} nulls last`);

  const [{ received }] = await db
    .select({
      received: sql<number>`coalesce(sum(case when ${payments.kind} = 'payment' and ${payments.method} <> 'credit' then ${payments.amount} when ${payments.kind} = 'refund' then -${payments.amount} else 0 end), 0)::bigint`.mapWith(Number),
    })
    .from(payments)
    .where(and(gte(payments.paidOn, month.fromDay), lt(payments.paidOn, month.toDay)));

  const [{ fees }] = await db
    .select({ fees: sql<number>`coalesce(sum(${orders.feesTotal}), 0)::bigint`.mapWith(Number) })
    .from(orders)
    .where(and(gte(orders.createdAt, month.from), lt(orders.createdAt, month.to)));

  return {
    toBuy,
    waitingForClient: await itemsWithStatus(db, and(eq(orderItems.status, "sold_out"), eq(orderItems.soldOutResolution, "waiting"))),
    toPack: await itemsWithStatus(db, and(eq(orderItems.status, "arrived"))),
    toShip: await itemsWithStatus(db, and(eq(orderItems.status, "packed"))),
    dpDue: all.filter((o) => o.balance.dpDue > 0),
    overpaid: all.filter((o) => o.balance.overpaid > 0),
    money: {
      outstanding: all.reduce((sum, o) => sum + o.balance.due, 0),
      receivedThisMonth: received,
      feesThisMonth: fees,
    },
  };
}

export type EventSummary = {
  orders: number;
  itemsTotal: number;
  /** The jastip fees: what she earns on the event. */
  feesTotal: number;
  total: number;
  paid: number;
  outstanding: number;
  soldOut: number;
};

/** One event's money: orders, item value, fees earned, paid and still owed. */
export async function getEventSummary(db: Db, eventId: number): Promise<EventSummary> {
  const list = await ordersWithBalance(db, eventId);
  const [{ soldOut }] = await db
    .select({ soldOut: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orderItems.status, "sold_out")));
  return {
    orders: list.length,
    itemsTotal: list.reduce((s, o) => s + o.itemsTotal, 0),
    feesTotal: list.reduce((s, o) => s + o.feesTotal, 0),
    total: list.reduce((s, o) => s + o.total, 0),
    paid: list.reduce((s, o) => s + o.balance.paid, 0),
    outstanding: list.reduce((s, o) => s + o.balance.due, 0),
    soldOut,
  };
}
