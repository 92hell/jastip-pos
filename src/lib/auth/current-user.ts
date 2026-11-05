import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import type { Locale } from "@/i18n";
import { validateSession, type SessionUser } from "./sessions";

export const SESSION_COOKIE = "jastip_session";

/** The signed-in user for this request (read once per request), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token);
});

/** The signed-in user, or a redirect to the sign-in page. Call it in every page and action that needs one. */
export async function requireUser(locale: Locale): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

export async function requireOwner(locale: Locale): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (user.role !== "owner") redirect(`/${locale}/dashboard`);
  return user;
}
