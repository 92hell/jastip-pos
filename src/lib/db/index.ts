import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { jastipDb?: Db };

/** One pool per server process (and per dev hot-reload), from DATABASE_URL. */
export function getDb(): Db {
  if (!globalForDb.jastipDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.jastipDb = drizzle(new Pool({ connectionString: url, max: 10 }), { schema });
  }
  return globalForDb.jastipDb;
}

/** For tests: use this database instead of the one from DATABASE_URL. */
export function setDb(db: Db) {
  globalForDb.jastipDb = db;
}
