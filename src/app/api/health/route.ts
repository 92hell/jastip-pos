import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** For the host's health check: 200 when the app runs and its database answers. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "database unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
