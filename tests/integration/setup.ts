import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, inject } from "vitest";
import { setDb, type Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const pool = new Pool({ connectionString: inject("databaseUrl") });
export const db: Db = drizzle(pool, { schema });
setDb(db);

/** Every test starts from empty tables (test files run one at a time). */
beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, sessions, business_settings RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
