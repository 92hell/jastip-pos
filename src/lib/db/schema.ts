import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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

export type User = typeof users.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
