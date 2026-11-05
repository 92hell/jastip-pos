import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export const MIN_PASSWORD = 12;

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

/**
 * Creates the owner account on first start from OWNER_USERNAME / OWNER_PASSWORD. Once it exists it
 * is left alone: the password is then changed in the app, not by the configuration.
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
