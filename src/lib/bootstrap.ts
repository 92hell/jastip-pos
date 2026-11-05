import "server-only";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, type Db } from "@/lib/db";
import { ensureOwner, recoverOwnerPassword } from "@/lib/auth/accounts";
import { DEMO_PASSWORD, DEMO_USERNAME, isDemo } from "@/lib/server/request";
import { resetDemo } from "@/lib/demo";

/**
 * Runs once when the server starts: applies database migrations, creates the owner account from
 * OWNER_USERNAME / OWNER_PASSWORD on first start (or puts its password back to OWNER_PASSWORD when
 * a new OWNER_PASSWORD_RESET code is set), and in demo mode loads the sample shop.
 */
export async function bootstrap(db: Db = getDb()) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  if (isDemo()) {
    await resetDemo(db, { username: DEMO_USERNAME, password: DEMO_PASSWORD });
    return;
  }
  const { OWNER_USERNAME, OWNER_PASSWORD, OWNER_NAME, OWNER_PASSWORD_RESET } = process.env;
  if (OWNER_USERNAME && OWNER_PASSWORD) {
    await ensureOwner(db, { username: OWNER_USERNAME, password: OWNER_PASSWORD, displayName: OWNER_NAME || OWNER_USERNAME });
    if (OWNER_PASSWORD_RESET && (await recoverOwnerPassword(db, { username: OWNER_USERNAME, password: OWNER_PASSWORD, code: OWNER_PASSWORD_RESET }))) {
      console.warn(`The password of ${OWNER_USERNAME} was reset to OWNER_PASSWORD and every device signed out. Sign in with it and choose a new one in the app.`);
    }
  }
}
