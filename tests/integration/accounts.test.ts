import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { authenticate, ensureOwner } from "@/lib/auth/accounts";
import { createSession, deleteSession, SESSION_DAYS, validateSession } from "@/lib/auth/sessions";
import { sessions, users } from "@/lib/db/schema";
import { db } from "./setup";

const OWNER = { username: "Laili", password: "a-long-owner-password", displayName: "Laili" };

describe("Accounts", () => {
  it("creates the owner account once from the configured username and password", async () => {
    await ensureOwner(db, OWNER);
    await ensureOwner(db, { ...OWNER, password: "a-different-password" });

    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ username: "laili", role: "owner", displayName: "Laili" });
    expect(all[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(await authenticate(db, "laili", "a-long-owner-password")).not.toBeNull();
  });

  it("signs in with the right password, any case of username, and refuses everything else the same way", async () => {
    await ensureOwner(db, OWNER);

    expect((await authenticate(db, " LAILI ", OWNER.password))?.username).toBe("laili");
    expect(await authenticate(db, "laili", "wrong-password")).toBeNull();
    expect(await authenticate(db, "nobody", OWNER.password)).toBeNull();
  });

  it("refuses an owner password shorter than 12 characters", async () => {
    await expect(ensureOwner(db, { ...OWNER, password: "too-short" })).rejects.toThrow(/12 characters/);
  });
});

describe("Sessions", () => {
  it("a session token signs the user in until it expires; only its hash is stored", async () => {
    const owner = await ensureOwner(db, OWNER);
    const { token, expiresAt } = await createSession(db, owner.id);

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect((await validateSession(db, token))?.username).toBe("laili");
    const stored = await db.select().from(sessions);
    expect(stored[0].id).not.toContain(token);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan((SESSION_DAYS - 1) * 86_400_000);

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await validateSession(db, token)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("signing out ends the session; unknown tokens are refused", async () => {
    const owner = await ensureOwner(db, OWNER);
    const { token } = await createSession(db, owner.id);

    await deleteSession(db, token);

    expect(await validateSession(db, token)).toBeNull();
    expect(await validateSession(db, "not-a-real-token")).toBeNull();
  });

  it("a session in its second half is extended, so a shop in daily use stays signed in", async () => {
    const owner = await ensureOwner(db, OWNER);
    const { token } = await createSession(db, owner.id);
    const soon = new Date(Date.now() + 2 * 86_400_000);
    await db.update(sessions).set({ expiresAt: soon });

    await validateSession(db, token);

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, owner.id));
    expect(row.expiresAt.getTime()).toBeGreaterThan(soon.getTime() + 86_400_000);
  });
});
