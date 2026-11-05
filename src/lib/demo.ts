import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { ensureOwner } from "@/lib/auth/accounts";
import { DEFAULT_SETTINGS, updateSettings } from "@/lib/settings";

/** Clearly fake accounts: the public demo never shows real bank details. */
export const DEMO_ACCOUNTS = [
  { bank: "BCA", holder: "Contoh Demo Jastip", number: "0000000000" },
  { bank: "Bank Jago", holder: "Contoh Demo Jastip", number: "000000000000" },
];

/** Puts the public demo back to its starting point: the demo admin and the sample shop settings. */
export async function resetDemo(db: Db, admin: { username: string; password: string }) {
  await db.execute(sql`TRUNCATE users, sessions, business_settings RESTART IDENTITY CASCADE`);
  await ensureOwner(db, { ...admin, displayName: "Laili (demo)" });
  const saved = await updateSettings(db, {
    ...DEFAULT_SETTINGS,
    voucherAmount: String(DEFAULT_SETTINGS.voucherAmount),
    paymentAccounts: DEMO_ACCOUNTS,
  });
  if (!saved.ok) throw new Error(`Demo settings are invalid: ${JSON.stringify(saved.errors)}`);
}
