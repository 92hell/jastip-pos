"use server";

import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { createOrder, updateOrder, type OrderInput } from "@/lib/orders";
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
