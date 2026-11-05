"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/db/schema";
import { cancelSoldOut, createOrder, markShipped, replaceSoldOut, setItemStatus, updateOrder, type OrderInput } from "@/lib/orders";
import { formId, formLocale, formText } from "@/lib/server/forms";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/db/schema";
import { deletePayment, recordPayment, renewInvoiceLink, settleOverpayment } from "@/lib/payments";
import { isLocale, type Locale } from "@/i18n";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import type { FieldErrors } from "@/lib/settings";

export type OrderState = { errors?: FieldErrors };

/**
 * Creates (no id) or updates an order from the form's JSON. Everything in it is validated and the
 * order is priced again on the server; then the order's page opens.
 */
export async function saveOrder(_state: OrderState, form: FormData): Promise<OrderState> {
  const value = String(form.get("locale"));
  const locale: Locale = isLocale(value) ? value : "id";
  const user = await requireUser(locale);
  let input: OrderInput;
  try {
    input = JSON.parse(String(form.get("order") ?? ""));
  } catch {
    return { errors: { order: "invalid" } };
  }
  const id = Number(form.get("id"));
  const result = id ? await updateOrder(getDb(), id, input) : await createOrder(getDb(), input, user.id);
  if (!result.ok) return { errors: result.errors };
  redirect(`/${locale}/orders/${result.id}?saved=1`);
}


/** Sets one item's status (from the order page or the shopping list). */
export async function changeItemStatus(form: FormData) {
  await requireUser(formLocale(form));
  const status = formText(form, "status") as ItemStatus;
  if (!ITEM_STATUSES.includes(status)) return;
  await setItemStatus(getDb(), formId(form, "orderId"), formId(form, "itemId"), status);
  refresh();
}

export async function cancelItem(form: FormData) {
  await requireUser(formLocale(form));
  await cancelSoldOut(getDb(), formId(form, "orderId"), formId(form, "itemId"));
  refresh();
}

export type ReplaceState = { errors?: FieldErrors; done?: boolean };

export async function replaceItem(_state: ReplaceState, form: FormData): Promise<ReplaceState> {
  await requireUser(formLocale(form));
  const result = await replaceSoldOut(getDb(), formId(form, "orderId"), formId(form, "itemId"), {
    name: formText(form, "name"),
    store: formText(form, "store"),
    unitPrice: formText(form, "unitPrice"),
  });
  if (!result.ok) return { errors: result.errors };
  refresh();
  return { done: true };
}

export async function shipOrder(form: FormData) {
  await requireUser(formLocale(form));
  await markShipped(getDb(), formId(form, "orderId"), { courier: formText(form, "courier"), trackingNumber: formText(form, "trackingNumber") });
  refresh();
}

export type PaymentState = { errors?: FieldErrors; savedAt?: number };

/** Records a payment; the proof photo arrives already made smaller by the browser. */
export async function savePayment(_state: PaymentState, form: FormData): Promise<PaymentState> {
  const user = await requireUser(formLocale(form));
  const file = form.get("proof");
  const proof = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null;
  const method = formText(form, "method") as PaymentMethod;
  const result = await recordPayment(getDb(), formId(form, "orderId"), {
    amount: formText(form, "amount"),
    method: PAYMENT_METHODS.includes(method) ? method : "transfer",
    paidOn: formText(form, "paidOn"),
    note: formText(form, "note"),
    proof,
  }, user.id);
  if (!result.ok) return { errors: result.errors };
  refresh();
  return { savedAt: Date.now() };
}

export async function removePayment(form: FormData) {
  await requireUser(formLocale(form));
  await deletePayment(getDb(), formId(form, "orderId"), formId(form, "paymentId"));
  refresh();
}

export async function settle(form: FormData) {
  const user = await requireUser(formLocale(form));
  const how = formText(form, "how") === "credit" ? "credit" : "refund";
  await settleOverpayment(getDb(), formId(form, "orderId"), how, { paidOn: formText(form, "paidOn") }, user.id);
  refresh();
}

export async function newInvoiceLink(form: FormData) {
  await requireUser(formLocale(form));
  await renewInvoiceLink(getDb(), formId(form, "orderId"));
  refresh();
}
