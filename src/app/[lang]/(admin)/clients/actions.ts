"use server";

import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n";
import { requireUser } from "@/lib/auth/current-user";
import { createClient, deleteClient, updateClient } from "@/lib/clients";
import { getDb } from "@/lib/db";
import type { FieldErrors } from "@/lib/settings";

export type ClientState = { errors?: FieldErrors };

const localeOf = (form: FormData): Locale => {
  const value = String(form.get("locale"));
  return isLocale(value) ? value : "id";
};

/** Creates (no id) or updates a client, then opens its page. */
export async function saveClient(_state: ClientState, form: FormData): Promise<ClientState> {
  const locale = localeOf(form);
  await requireUser(locale);
  const input = {
    name: String(form.get("name") ?? ""),
    whatsapp: String(form.get("whatsapp") ?? ""),
    address: String(form.get("address") ?? ""),
    notes: String(form.get("notes") ?? ""),
    isReseller: form.get("isReseller") === "on",
  };
  const id = Number(form.get("id"));
  const result = id ? await updateClient(getDb(), id, input) : await createClient(getDb(), input);
  if (!result.ok) return { errors: result.errors };
  redirect(`/${locale}/clients/${result.id}?saved=1`);
}

export async function removeClient(form: FormData) {
  const locale = localeOf(form);
  await requireUser(locale);
  await deleteClient(getDb(), Number(form.get("id")));
  redirect(`/${locale}/clients`);
}
