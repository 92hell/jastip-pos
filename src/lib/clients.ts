import "server-only";
import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clients, orders, type Client } from "@/lib/db/schema";
import type { FieldErrors } from "@/lib/settings";
import { normalizeWhatsapp } from "@/lib/whatsapp";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "required").max(80, "too_long"),
  whatsapp: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return "";
      const digits = normalizeWhatsapp(v);
      if (!digits) ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return digits ?? "";
    }),
  address: z.string().trim().max(400, "too_long"),
  notes: z.string().trim().max(1000, "too_long"),
  isReseller: z.boolean(),
});

export type ClientInput = z.input<typeof clientSchema>;
export type ClientResult = { ok: true; id: number } | { ok: false; errors: FieldErrors };

export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

/** Another client already has this WhatsApp number: almost always the same person. */
async function duplicateWhatsapp(db: Db, whatsapp: string, exceptId?: number) {
  if (!whatsapp) return false;
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.whatsapp, whatsapp), exceptId ? sql`${clients.id} <> ${exceptId}` : undefined));
  return Boolean(row);
}

export async function createClient(db: Db, input: ClientInput): Promise<ClientResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (await duplicateWhatsapp(db, parsed.data.whatsapp)) return { ok: false, errors: { whatsapp: "duplicate_phone" } };
  const [created] = await db.insert(clients).values(parsed.data).returning({ id: clients.id });
  return { ok: true, id: created.id };
}

export async function updateClient(db: Db, id: number, input: ClientInput): Promise<ClientResult> {
  const existing = await getClient(db, id);
  if (!existing || existing.anonymizedAt) return { ok: false, errors: { name: "not_found" } };
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (await duplicateWhatsapp(db, parsed.data.whatsapp, id)) return { ok: false, errors: { whatsapp: "duplicate_phone" } };
  await db.update(clients).set(parsed.data).where(eq(clients.id, id));
  return { ok: true, id };
}

export async function getClient(db: Db, id: number): Promise<Client | null> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ?? null;
}

export type ClientRow = Pick<Client, "id" | "name" | "whatsapp" | "isReseller"> & { orders: number };

/** Clients in use, searched by name or WhatsApp digits, most recent first. */
export async function listClients(db: Db, q = "", limit = 50): Promise<ClientRow[]> {
  const term = q.trim();
  const digits = normalizeWhatsapp(term) ?? term.replace(/\D/g, "");
  const search = term
    ? or(ilike(clients.name, `%${escapeLike(term)}%`), digits.length >= 4 ? ilike(clients.whatsapp, `%${digits}%`) : undefined)
    : undefined;
  return db
    .select({ id: clients.id, name: clients.name, whatsapp: clients.whatsapp, isReseller: clients.isReseller, orders: count(orders.id) })
    .from(clients)
    .leftJoin(orders, eq(orders.clientId, clients.id))
    .where(and(isNull(clients.anonymizedAt), search))
    .groupBy(clients.id)
    .orderBy(desc(clients.createdAt), desc(clients.id))
    .limit(limit);
}

/**
 * Deletes a client without orders. A client with orders is anonymised instead: their name becomes
 * "Klien dihapus #id" and WhatsApp, address and notes are wiped, while the orders keep adding up.
 */
export async function deleteClient(db: Db, id: number): Promise<"deleted" | "anonymized" | "not_found"> {
  const client = await getClient(db, id);
  if (!client || client.anonymizedAt) return "not_found";
  const [{ n }] = await db.select({ n: count() }).from(orders).where(eq(orders.clientId, id));
  if (n === 0) {
    await db.delete(clients).where(eq(clients.id, id));
    return "deleted";
  }
  await db
    .update(clients)
    .set({ name: `Klien dihapus #${id}`, whatsapp: "", address: "", notes: "", isReseller: false, anonymizedAt: new Date() })
    .where(eq(clients.id, id));
  return "anonymized";
}

export function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
