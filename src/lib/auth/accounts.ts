import "server-only";
import { createHash } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import type { LoginLimiter } from "./login-limiter";
import { deleteOtherSessions, deleteUserSessions } from "./sessions";

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;

/** Compared against when the username does not exist, so a wrong username takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

/** The user for these credentials, or null; the caller cannot tell a wrong username from a wrong password. */
export async function authenticate(db: Db, username: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.username, normalizeUsername(username)));
  if (!user) {
    dummyHash ??= hash("not-a-real-password");
    await verify(await dummyHash, password);
    return null;
  }
  return (await verify(user.passwordHash, password)) ? user : null;
}

export type PasswordChange = { current: string; next: string; confirm: string };
export type PasswordError = "required" | "wrong" | "too_short" | "too_long" | "same" | "mismatch";
export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; blocked?: true; errors: Partial<Record<keyof PasswordChange, PasswordError>> };

/**
 * Changes a signed-in user's password. The current password is required, and wrong guesses count
 * towards the same limit as signing in. Every other session of the user ends; the one making the
 * change (keepToken) stays signed in.
 */
export async function changePassword(
  db: Db,
  who: { userId: number; username: string; address: string; keepToken: string },
  input: PasswordChange,
  limiter: LoginLimiter,
): Promise<PasswordChangeResult> {
  const errors: Partial<Record<keyof PasswordChange, PasswordError>> = {};
  if (!input.current) errors.current = "required";
  if (!input.next) errors.next = "required";
  else if (input.next.length < MIN_PASSWORD) errors.next = "too_short";
  else if (input.next.length > MAX_PASSWORD) errors.next = "too_long";
  if (!input.confirm) errors.confirm = "required";
  else if (input.next && input.confirm !== input.next) errors.confirm = "mismatch";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (limiter.isBlocked(who.username, who.address)) return { ok: false, blocked: true, errors: {} };
  const [user] = await db.select().from(users).where(eq(users.id, who.userId));
  if (!user || !(await verify(user.passwordHash, input.current))) {
    limiter.recordFailure(who.username, who.address);
    return { ok: false, errors: { current: "wrong" } };
  }
  limiter.recordSuccess(who.username, who.address);
  if (input.next === input.current) return { ok: false, errors: { next: "same" } };

  const passwordHash = await hash(input.next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await deleteOtherSessions(tx, user.id, who.keepToken);
  });
  return { ok: true };
}

/**
 * For a forgotten password: puts the owner's password back to OWNER_PASSWORD and signs out every
 * device, once per OWNER_PASSWORD_RESET code. The code (only its hash) is remembered, so the free
 * server restarting with the same settings does not undo a password she has since chosen.
 * Returns whether the password was reset.
 */
export async function recoverOwnerPassword(db: Db, owner: { username: string; password: string; code: string }): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.username, normalizeUsername(owner.username)));
  if (!user || user.role !== "owner") return false;
  const code = createHash("sha256").update(owner.code).digest("hex");
  if (user.recoveryCode === code) return false;
  if (owner.password.length < MIN_PASSWORD) {
    throw new Error(`The owner password must be at least ${MIN_PASSWORD} characters`);
  }
  const passwordHash = await hash(owner.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, recoveryCode: code }).where(eq(users.id, user.id));
    await deleteUserSessions(tx, user.id);
  });
  return true;
}

/**
 * Creates the owner account on first start from OWNER_USERNAME / OWNER_PASSWORD. Once it exists it
 * is left alone: the password is then changed in the app (Account page), not by the configuration.
 */
export async function ensureOwner(
  db: Db,
  owner: { username: string; password: string; displayName: string },
): Promise<User> {
  const username = normalizeUsername(owner.username);
  const [existing] = await db.select().from(users).where(eq(users.username, username));
  if (existing) return existing;
  if (owner.password.length < MIN_PASSWORD) {
    throw new Error(`The owner password must be at least ${MIN_PASSWORD} characters`);
  }
  const [created] = await db
    .insert(users)
    .values({ username, passwordHash: await hash(owner.password), displayName: owner.displayName, role: "owner" })
    .returning();
  return created;
}
