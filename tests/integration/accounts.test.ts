import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { authenticate, changePassword, ensureOwner } from "@/lib/auth/accounts";
import { LoginLimiter } from "@/lib/auth/login-limiter";
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

describe("Changing the password", () => {
  const NEW = "kopi susu gula aren 2";

  async function signedIn() {
    const owner = await ensureOwner(db, OWNER);
    const here = await createSession(db, owner.id);
    const otherPhone = await createSession(db, owner.id);
    return { owner, here: here.token, otherPhone: otherPhone.token, who: { userId: owner.id, username: owner.username, address: "10.0.0.1", keepToken: here.token } };
  }

  it("replaces the password and signs out every other device, keeping this one signed in", async () => {
    const { who, here, otherPhone } = await signedIn();

    const result = await changePassword(db, who, { current: OWNER.password, next: NEW, confirm: NEW }, new LoginLimiter());

    expect(result).toEqual({ ok: true });
    expect(await authenticate(db, "laili", NEW)).not.toBeNull();
    expect(await authenticate(db, "laili", OWNER.password)).toBeNull();
    expect((await validateSession(db, here))?.username).toBe("laili");
    expect(await validateSession(db, otherPhone)).toBeNull();
  });

  it("refuses a wrong current password, and after 5 wrong tries refuses even the right one for a while", async () => {
    const { who, otherPhone } = await signedIn();
    const limiter = new LoginLimiter();

    expect(await changePassword(db, who, { current: "not-my-password", next: NEW, confirm: NEW }, limiter))
      .toEqual({ ok: false, errors: { current: "wrong" } });
    for (let i = 0; i < 4; i++) await changePassword(db, who, { current: "not-my-password", next: NEW, confirm: NEW }, limiter);
    expect(await changePassword(db, who, { current: OWNER.password, next: NEW, confirm: NEW }, limiter))
      .toEqual({ ok: false, blocked: true, errors: {} });

    expect(await authenticate(db, "laili", OWNER.password)).not.toBeNull();
    expect(await validateSession(db, otherPhone)).not.toBeNull();
  });

  it("checks each field: all required, at least 12 characters, typed twice the same, different from the current one", async () => {
    const { who } = await signedIn();
    const limiter = new LoginLimiter();
    const attempt = (current: string, next: string, confirm: string) => changePassword(db, who, { current, next, confirm }, limiter);

    expect(await attempt("", "", "")).toEqual({ ok: false, errors: { current: "required", next: "required", confirm: "required" } });
    expect(await attempt(OWNER.password, "pendek", "pendek")).toEqual({ ok: false, errors: { next: "too_short" } });
    expect(await attempt(OWNER.password, "x".repeat(201), "x".repeat(201))).toEqual({ ok: false, errors: { next: "too_long" } });
    expect(await attempt(OWNER.password, NEW, "kopi susu gula aren 3")).toEqual({ ok: false, errors: { confirm: "mismatch" } });
    expect(await attempt(OWNER.password, OWNER.password, OWNER.password)).toEqual({ ok: false, errors: { next: "same" } });

    expect(await authenticate(db, "laili", OWNER.password)).not.toBeNull();
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
