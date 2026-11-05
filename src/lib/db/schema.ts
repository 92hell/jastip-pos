import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** People who run the shop: the owner (Laili) and any helpers she adds later. Clients never sign in. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "helper"] }).notNull().default("helper"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Signed-in sessions. The browser holds a random token; only its SHA-256 hash is stored, so a copy
 * of this table cannot be used to sign in.
 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentAccount = { bank: string; holder: string; number: string };

/**
 * The shop's own details, shown to clients on invoices: one row. Payment accounts are entered in the
 * app, never in code, so the public demo only ever shows fake ones.
 */
export const businessSettings = pgTable(
  "business_settings",
  {
    id: integer("id").primaryKey().default(1),
    shopName: text("shop_name").notNull(),
    tagline: text("tagline").notNull().default(""),
    location: text("location").notNull().default(""),
    instagram: text("instagram").notNull().default(""),
    whatsapp: text("whatsapp").notNull().default(""),
    paymentAccounts: jsonb("payment_accounts").$type<PaymentAccount[]>().notNull().default([]),
    rules: text("rules").notNull().default(""),
    voucherAmount: integer("voucher_amount").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("business_settings_single_row", sql`${t.id} = 1`)],
);

/**
 * The people Laili shops for. A client with orders is never deleted (the money must still add up);
 * deleting one anonymises it instead: name, WhatsApp, address and notes are wiped (UU PDP).
 */
export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** International digits, e.g. 6281234567890; empty when unknown. */
    whatsapp: text("whatsapp").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isReseller: boolean("is_reseller").notNull().default(false),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clients_whatsapp_unique").on(t.whatsapp).where(sql`${t.whatsapp} <> ''`), index("clients_name_idx").on(t.name)],
);

const money = (name: string) => bigint(name, { mode: "number" });

/** What kind of event orders belong to. */
export const EVENT_KINDS = ["trip", "bazaar", "wholesale", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * Something she takes orders for: a shopping trip or open PO ("Jastip Singapore 12–15 Des"), a
 * bazaar, a wholesale sale of excess stock, or anything else. One-off orders belong to no event.
 */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: EVENT_KINDS }).notNull().default("trip"),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  /** Last day to order; null when open until she closes it. */
  orderDeadline: date("order_deadline"),
  note: text("note").notNull().default(""),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Where an item is: asked for, bought, arrived with her, packed, sent to the client, or sold out. */
export const ITEM_STATUSES = ["requested", "bought", "arrived", "packed", "shipped", "sold_out"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
/**
 * A sold-out item, after she has asked the client: waiting for their answer, swapped for a similar
 * item (a new line in the same order), or called off. It is never charged.
 */
export const SOLD_OUT_RESOLUTIONS = ["waiting", "replaced", "cancelled"] as const;
export type SoldOutResolution = (typeof SOLD_OUT_RESOLUTIONS)[number];

/** An order: what a client asked for, priced by src/lib/pricing.ts. Totals are stored as priced on save. */
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    /** TLY-2026-0001: numbered per year, never reused. */
    number: text("number").notNull().unique(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    eventId: integer("event_id").references(() => events.id, { onDelete: "restrict" }),
    note: text("note").notNull().default(""),
    courier: text("courier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    discount: money("discount").notNull().default(0),
    voucherApplied: boolean("voucher_applied").notNull().default(false),
    /** The voucher actually taken off (it never takes the total below zero). */
    voucher: money("voucher").notNull().default(0),
    /** Ongkir; null until she knows it. */
    shipping: money("shipping"),
    itemsTotal: money("items_total").notNull(),
    feesTotal: money("fees_total").notNull(),
    total: money("total").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_client_idx").on(t.clientId), index("orders_event_idx").on(t.eventId), index("orders_created_idx").on(t.createdAt)],
);

/** Several items sharing one flat fee ("bundling fee 50rb"). */
export const orderBundles = pgTable("order_bundles", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull().default(""),
  fee: money("fee").notNull(),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    /** Where to buy it, for the shopping list. */
    store: text("store").notNull().default(""),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    feeMode: text("fee_mode", { enum: ["per_item", "percent", "nett", "bundle"] }).notNull(),
    /** per_item: rupiah per unit. */
    feeAmount: money("fee_amount"),
    /** percent: basis points (1000 = 10%). */
    feeBasisPoints: integer("fee_basis_points"),
    bundleId: integer("bundle_id").references(() => orderBundles.id, { onDelete: "set null" }),
    subtotal: money("subtotal").notNull(),
    fee: money("fee").notNull(),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("requested"),
    soldOutResolution: text("sold_out_resolution", { enum: SOLD_OUT_RESOLUTIONS }),
    /** The sold-out item this one replaces. */
    replacesItemId: integer("replaces_item_id"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** The last order number used per year. */
export const orderCounters = pgTable("order_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull(),
});

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type ShopEvent = typeof events.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
