import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "@/lib/auth/accounts";
import { createSession, validateSession } from "@/lib/auth/sessions";
import { bootstrap } from "@/lib/bootstrap";
import { DEMO_ACCOUNTS } from "@/lib/demo";
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

  it("in demo mode resets to the sample shop with fake payment accounts, and signs everyone out", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await bootstrap(db);
    const [admin] = await db.select().from(users);
    const { token } = await createSession(db, admin.id);

    await bootstrap(db);

    expect(await validateSession(db, token)).toBeNull();
    expect((await getSettings(db)).paymentAccounts).toEqual(DEMO_ACCOUNTS);
    expect(DEMO_ACCOUNTS.every((a) => /^0+$/.test(a.number) && a.holder.includes("Demo"))).toBe(true);
    expect(await authenticate(db, "demo", "demo-jastip-password")).not.toBeNull();
  });
});
