"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { formId, formLocale, formText } from "@/lib/server/forms";
import type { FieldErrors } from "@/lib/settings";
import { addStock, correctStock, createStockItem, deleteStockItem, deleteStockMove, recordStockSale, updateStockItem } from "@/lib/stock";

export type StockState = { errors?: FieldErrors; doneAt?: number };

const itemInput = (form: FormData) => ({
  name: formText(form, "name"),
  store: formText(form, "store"),
  unitCost: formText(form, "unitCost"),
  price: formText(form, "price"),
  eventId: formText(form, "eventId"),
  note: formText(form, "note"),
});

/** Creates (no id, with the first quantity) or updates a stock item. */
export async function saveStockItem(_state: StockState, form: FormData): Promise<StockState> {
  const locale = formLocale(form);
  const user = await requireUser(locale);
  const id = formId(form, "id");
  if (id) {
    const result = await updateStockItem(getDb(), id, itemInput(form));
    if (!result.ok) return { errors: result.errors };
    refresh();
    return { doneAt: Date.now() };
  }
  const result = await createStockItem(getDb(), { ...itemInput(form), quantity: formText(form, "quantity") }, user.id);
  if (!result.ok) return { errors: result.errors };
  redirect(`/${locale}/stock/${result.id}?saved=1`);
}

export async function sellStock(_state: StockState, form: FormData): Promise<StockState> {
  const user = await requireUser(formLocale(form));
  const method = formText(form, "method");
  const result = await recordStockSale(getDb(), formId(form, "id"), {
    quantity: formText(form, "quantity"),
    unitPrice: formText(form, "unitPrice"),
    method: method === "transfer" || method === "qris" ? method : "cash",
    eventId: formText(form, "eventId"),
    soldOn: formText(form, "soldOn"),
    note: formText(form, "note"),
  }, user.id);
  if (!result.ok) return { errors: result.errors };
  refresh();
  return { doneAt: Date.now() };
}

export async function addMoreStock(_state: StockState, form: FormData): Promise<StockState> {
  const user = await requireUser(formLocale(form));
  const result = await addStock(getDb(), formId(form, "id"), { quantity: formText(form, "quantity"), note: formText(form, "note") }, user.id);
  if (!result.ok) return { errors: result.errors };
  refresh();
  return { doneAt: Date.now() };
}

export async function recountStock(_state: StockState, form: FormData): Promise<StockState> {
  const user = await requireUser(formLocale(form));
  const result = await correctStock(getDb(), formId(form, "id"), { counted: formText(form, "counted"), note: formText(form, "note") }, user.id);
  if (!result.ok) return { errors: result.errors };
  refresh();
  return { doneAt: Date.now() };
}

export async function undoStockMove(form: FormData) {
  await requireUser(formLocale(form));
  await deleteStockMove(getDb(), formId(form, "id"), formId(form, "moveId"));
  refresh();
}

export async function removeStockItem(form: FormData) {
  const locale = formLocale(form);
  await requireUser(locale);
  await deleteStockItem(getDb(), formId(form, "id"));
  redirect(`/${locale}/stock`);
}
