import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate, changePassword } from "@/lib/auth/accounts";
import { LoginLimiter } from "@/lib/auth/login-limiter";
import { createSession, validateSession } from "@/lib/auth/sessions";
import { bootstrap } from "@/lib/bootstrap";
import { listClients } from "@/lib/clients";
import { DEMO_ACCOUNTS } from "@/lib/demo";
import { listOrders } from "@/lib/orders";
import { users } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { db } from "./setup";

afterEach(() => vi.unstubAllEnvs());

describe("First start", () => {
  it("creates the owner from OWNER_USERNAME / OWNER_PASSWORD, and nothing else", async () => {
    vi.stubEnv("OWNER_USERNAME", "laili");
    vi.stubEnv("OWNER_PASSWORD", "a-long-owner-password");
    vi.stubEnv("OWNER_NAME", "Laili");

    await bootstrap(db);
    await bootstrap(db);

    expect(await db.select().from(users)).toHaveLength(1);
    expect((await authenticate(db, "laili", "a-long-owner-password"))?.role).toBe("owner");
    expect((await getSettings(db)).paymentAccounts).toEqual([]);
  });

  it("in demo mode resets to the sample shop: fake payment accounts, invented clients and orders; everyone is signed out", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await bootstrap(db);
    const [admin] = await db.select().from(users);
    const { token } = await createSession(db, admin.id);

    await bootstrap(db);

    expect(await validateSession(db, token)).toBeNull();
    expect((await getSettings(db)).paymentAccounts).toEqual(DEMO_ACCOUNTS);
    expect(DEMO_ACCOUNTS.every((a) => /^0+$/.test(a.number) && a.holder.includes("Demo"))).toBe(true);
    expect(await authenticate(db, "demo", "demo-jastip-password")).not.toBeNull();
    const orders = await listOrders(db);
    expect(orders).toHaveLength(3);
    expect(orders.every((o) => o.total > 0)).toBe(true);
    expect((await listClients(db)).every((c) => c.whatsapp.startsWith("6281200000"))).toBe(true);
  });
});

describe("Password recovery", () => {
  function configure(password: string, code?: string) {
    vi.stubEnv("OWNER_USERNAME", "laili");
    vi.stubEnv("OWNER_PASSWORD", password);
    if (code) vi.stubEnv("OWNER_PASSWORD_RESET", code);
  }

  it("OWNER_PASSWORD_RESET puts the owner's password back to OWNER_PASSWORD once per code, signing out every device", async () => {
    configure("the-first-password");
    await bootstrap(db);
    const laili = (await authenticate(db, "laili", "the-first-password"))!;
    const changed = await createSession(db, laili.id);
    await changePassword(db, { userId: laili.id, username: "laili", address: "x", keepToken: changed.token }, { current: "the-first-password", next: "forgotten-password", confirm: "forgotten-password" }, new LoginLimiter());

    configure("a-temporary-password", "2026-11-05");
    await bootstrap(db);

    expect(await authenticate(db, "laili", "a-temporary-password")).not.toBeNull();
    expect(await authenticate(db, "laili", "forgotten-password")).toBeNull();
    expect(await validateSession(db, changed.token)).toBeNull();

    // She signs in and picks her own password; the free server restarts with the same settings.
    const back = await createSession(db, laili.id);
    await changePassword(db, { userId: laili.id, username: "laili", address: "x", keepToken: back.token }, { current: "a-temporary-password", next: "her-own-password-2", confirm: "her-own-password-2" }, new LoginLimiter());
    await bootstrap(db);
    expect(await authenticate(db, "laili", "her-own-password-2")).not.toBeNull();
    expect(await validateSession(db, back.token)).not.toBeNull();

    // A new code resets it again.
    configure("a-temporary-password", "2026-12-01");
    await bootstrap(db);
    expect(await authenticate(db, "laili", "a-temporary-password")).not.toBeNull();
  });

  it("a recovery with a password shorter than 12 characters is refused and changes nothing", async () => {
    configure("the-first-password");
    await bootstrap(db);

    configure("short", "2026-11-05");
    await expect(bootstrap(db)).rejects.toThrow(/12 characters/);
    expect(await authenticate(db, "laili", "the-first-password")).not.toBeNull();
  });
});
