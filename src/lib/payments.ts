import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clientCredits, orders, payments, PAYMENT_METHODS, type Payment, type PaymentMethod } from "@/lib/db/schema";
import { orderBalance, type Balance } from "@/lib/balance";
import { fieldErrors } from "@/lib/clients";
import { parseRupiah } from "@/lib/money";
import type { FieldErrors } from "@/lib/settings";

export const MAX_PROOF_BYTES = 800 * 1024;

/** JPEG, PNG or WebP, recognised by their first bytes (not by what the browser claims). */
export function proofType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "invalid_date");

const amount = z.string().transform((v, ctx) => {
  const n = parseRupiah(v);
  if (n === null) ctx.addIssue({ code: "custom", message: "required" });
  else if (Number.isNaN(n) || n <= 0 || n > 1_000_000_000) ctx.addIssue({ code: "custom", message: "invalid_amount" });
  return n ?? 0;
});

const paymentSchema = z.object({
  amount,
  method: z.enum(PAYMENT_METHODS),
  paidOn: day,
  note: z.string().trim().max(300, "too_long"),
});

export type PaymentInput = z.input<typeof paymentSchema> & { proof?: Uint8Array | null };
export type MoneyResult = { ok: true } | { ok: false; errors: FieldErrors };

export type OrderMoney = {
  payments: (Omit<Payment, "proof"> & { hasProof: boolean })[];
  balance: Balance;
  /** The client's credit available for this order. */
  credit: number;
};

async function creditOf(db: Db, clientId: number) {
  const [{ sum }] = await db
    .select({ sum: sql<number>`coalesce(sum(${clientCredits.amount}), 0)::bigint` })
    .from(clientCredits)
    .where(eq(clientCredits.clientId, clientId));
  return Number(sum);
}

export async function clientCredit(db: Db, clientId: number) {
  return creditOf(db, clientId);
}

/** Payments, refunds and credit moves on an order, with its balance. Proof images are not loaded. */
export async function orderMoney(db: Db, orderId: number): Promise<OrderMoney | null> {
  const [order] = await db.select({ total: orders.total, dpPercent: orders.dpPercent, clientId: orders.clientId }).from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const rows = await db
    .select({
      id: payments.id, orderId: payments.orderId, kind: payments.kind, method: payments.method, amount: payments.amount,
      paidOn: payments.paidOn, note: payments.note, proofType: payments.proofType, createdBy: payments.createdBy, createdAt: payments.createdAt,
      hasProof: sql<boolean>`${payments.proof} is not null`,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(asc(payments.paidOn), asc(payments.id));
  return { payments: rows, balance: orderBalance(order.total, order.dpPercent, rows), credit: await creditOf(db, order.clientId) };
}

/** Locks the order and its client, so two payments using the same credit cannot both succeed. */
async function lockOrder(tx: Db, orderId: number) {
  const result = await tx.execute(sql`SELECT o.client_id FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ${orderId} FOR UPDATE`);
  const row = result.rows[0] as { client_id: number } | undefined;
  return row?.client_id ?? null;
}

/**
 * Records money from the client. Paying with credit uses the client's credit (never more than they
 * have, nor more than is still due). A proof photo must be a JPEG, PNG or WebP of at most 800 KB.
 */
export async function recordPayment(db: Db, orderId: number, input: PaymentInput, userId: number | null): Promise<MoneyResult> {
  const parsed = paymentSchema.safeParse(input);
  const errors: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
  let type: string | null = null;
  if (input.proof && input.proof.length > 0) {
    type = proofType(input.proof);
    if (input.proof.length > MAX_PROOF_BYTES) errors.proof = "proof_too_large";
    else if (!type) errors.proof = "proof_not_image";
  }
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };
  const { amount: value, method, paidOn, note } = parsed.data;

  return db.transaction(async (tx): Promise<MoneyResult> => {
    const clientId = await lockOrder(tx as unknown as Db, orderId);
    if (!clientId) return { ok: false, errors: { order: "not_found" } };
    if (method === "credit") {
      const money = (await orderMoney(tx as unknown as Db, orderId))!;
      if (value > Math.min(money.credit, money.balance.due)) return { ok: false, errors: { amount: "over_credit" } };
    }
    const [payment] = await tx
      .insert(payments)
      .values({ orderId, kind: "payment", method, amount: value, paidOn, note, proof: input.proof?.length ? Buffer.from(input.proof) : null, proofType: type, createdBy: userId })
      .returning({ id: payments.id });
    if (method === "credit") await tx.insert(clientCredits).values({ clientId, orderId, paymentId: payment.id, amount: -value });
    return { ok: true };
  });
}

/**
 * An order paid beyond its total (something was called off): the difference is sent back (refund)
 * or kept as the client's credit for a next order.
 */
export async function settleOverpayment(
  db: Db, orderId: number, how: "refund" | "credit", input: { method?: PaymentMethod; paidOn: string; note?: string }, userId: number | null,
): Promise<MoneyResult> {
  if (!day.safeParse(input.paidOn).success) return { ok: false, errors: { paidOn: "invalid_date" } };
  return db.transaction(async (tx): Promise<MoneyResult> => {
    const clientId = await lockOrder(tx as unknown as Db, orderId);
    if (!clientId) return { ok: false, errors: { order: "not_found" } };
    const { overpaid } = (await orderMoney(tx as unknown as Db, orderId))!.balance;
    if (overpaid <= 0) return { ok: false, errors: { order: "not_overpaid" } };
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId, kind: how === "refund" ? "refund" : "to_credit", method: how === "refund" ? (input.method ?? "transfer") : null,
        amount: overpaid, paidOn: input.paidOn, note: (input.note ?? "").trim().slice(0, 300), createdBy: userId,
      })
      .returning({ id: payments.id });
    if (how === "credit") await tx.insert(clientCredits).values({ clientId, orderId, paymentId: payment.id, amount: overpaid });
    return { ok: true };
  });
}

/** Removes an entry recorded by mistake; credit it used or created is undone with it. */
export async function deletePayment(db: Db, orderId: number, paymentId: number) {
  await db.transaction(async (tx) => {
    await lockOrder(tx as unknown as Db, orderId);
    await tx.delete(payments).where(and(eq(payments.id, paymentId), eq(payments.orderId, orderId)));
  });
}

export async function getProof(db: Db, paymentId: number) {
  const [row] = await db.select({ proof: payments.proof, type: payments.proofType }).from(payments).where(eq(payments.id, paymentId));
  return row?.proof ? { bytes: row.proof, type: row.type ?? "application/octet-stream" } : null;
}

/** A new invoice link for the order; the old one stops working. */
export async function renewInvoiceLink(db: Db, orderId: number) {
  const token = randomBytes(16).toString("hex");
  await db.update(orders).set({ invoiceToken: token }).where(eq(orders.id, orderId));
  return token;
}
