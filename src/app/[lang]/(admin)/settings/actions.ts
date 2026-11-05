"use server";

import { isLocale } from "@/i18n";
import { requireOwner } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { updateSettings, type FieldErrors } from "@/lib/settings";

export type SettingsState = { status?: "saved" | "failed"; errors?: FieldErrors; savedAt?: number };

const MAX_ACCOUNTS = 5;

/** Owner only. The form posts accounts as bank_0, holder_0, number_0, …; empty rows are skipped. */
export async function saveSettings(_state: SettingsState, form: FormData): Promise<SettingsState> {
  const locale = String(form.get("locale"));
  await requireOwner(isLocale(locale) ? locale : "id");
  const field = (name: string) => String(form.get(name) ?? "");

  const accounts = [];
  for (let i = 0; i < MAX_ACCOUNTS + 1; i++) {
    const account = { bank: field(`bank_${i}`), holder: field(`holder_${i}`), number: field(`number_${i}`) };
    if (account.bank.trim() || account.holder.trim() || account.number.trim()) accounts.push(account);
  }

  const result = await updateSettings(getDb(), {
    shopName: field("shopName"),
    tagline: field("tagline"),
    location: field("location"),
    instagram: field("instagram"),
    whatsapp: field("whatsapp"),
    paymentAccounts: accounts,
    rules: field("rules"),
    voucherAmount: field("voucherAmount"),
  });
  return result.ok ? { status: "saved", savedAt: Date.now() } : { status: "failed", errors: result.errors };
}
