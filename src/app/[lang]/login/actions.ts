"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n";
import { authenticate } from "@/lib/auth/accounts";
import { SESSION_COOKIE } from "@/lib/auth/current-user";
import { sharedLoginLimiter } from "@/lib/auth/login-limiter";
import { createSession, deleteSession } from "@/lib/auth/sessions";
import { getDb } from "@/lib/db";
import { clientAddress } from "@/lib/server/request";

export type LoginState = { error?: "invalid" | "blocked" | "required"; username?: string };

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const locale = String(form.get("locale"));
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "required", username };

  const address = await clientAddress();
  const limiter = sharedLoginLimiter();
  if (limiter.isBlocked(username, address)) return { error: "blocked", username };
  const user = await authenticate(getDb(), username, password);
  if (!user) {
    limiter.recordFailure(username, address);
    return { error: "invalid", username };
  }
  limiter.recordSuccess(username, address);

  const { token, expiresAt } = await createSession(getDb(), user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect(`/${isLocale(locale) ? locale : "id"}/dashboard`);
}

export async function logout(form: FormData) {
  const locale = String(form.get("locale"));
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect(`/${isLocale(locale) ? locale : "id"}/login`);
}
