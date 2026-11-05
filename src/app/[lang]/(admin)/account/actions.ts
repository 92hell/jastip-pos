"use server";

import { cookies } from "next/headers";
import { isLocale } from "@/i18n";
import { changePassword, type PasswordChange, type PasswordError } from "@/lib/auth/accounts";
import { requireUser, SESSION_COOKIE } from "@/lib/auth/current-user";
import { sharedLoginLimiter } from "@/lib/auth/login-limiter";
import { getDb } from "@/lib/db";
import { clientAddress, isDemo } from "@/lib/server/request";

export type PasswordState = {
  status?: "changed" | "failed" | "blocked" | "demo";
  errors?: Partial<Record<keyof PasswordChange, PasswordError>>;
  changedAt?: number;
};

/** Any signed-in user, for their own account. Refused in the demo, where everyone shares one account. */
export async function changeMyPassword(_state: PasswordState, form: FormData): Promise<PasswordState> {
  const locale = String(form.get("locale"));
  const user = await requireUser(isLocale(locale) ? locale : "id");
  if (isDemo()) return { status: "demo" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";

  const result = await changePassword(
    getDb(),
    { userId: user.id, username: user.username, address: await clientAddress(), keepToken: token },
    { current: String(form.get("current") ?? ""), next: String(form.get("next") ?? ""), confirm: String(form.get("confirm") ?? "") },
    sharedLoginLimiter(),
  );
  if (result.ok) return { status: "changed", changedAt: Date.now() };
  return { status: result.blocked ? "blocked" : "failed", errors: result.errors };
}
