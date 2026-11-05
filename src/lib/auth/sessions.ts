import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";

export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

export type SessionUser = Pick<User, "id" | "username" | "displayName" | "role">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Starts a session: returns the token for the cookie (32 random bytes) and when it expires. */
export async function createSession(db: Db, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * The signed-in user for this token, or null. Expired sessions are deleted; a session past half its
 * life is extended, so someone using the app every day is not signed out.
 */
export async function validateSession(db: Db, token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ expiresAt: sessions.expiresAt, id: users.id, username: users.username, displayName: users.displayName, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.expiresAt.getTime() - now < (SESSION_DAYS / 2) * DAY_MS) {
    await db.update(sessions).set({ expiresAt: new Date(now + SESSION_DAYS * DAY_MS) }).where(eq(sessions.id, id));
  }
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role };
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Ends every session of a user. */
export async function deleteUserSessions(db: Db, userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Ends every session of a user except this one, e.g. after a password change on this phone. */
export async function deleteOtherSessions(db: Db, userId: number, keepToken: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, hashToken(keepToken))));
}
