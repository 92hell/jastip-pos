import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/current-user";
import { validateSession } from "@/lib/auth/sessions";
import { getDb } from "@/lib/db";
import { setItemStatus } from "@/lib/orders";

const STATUSES = ["requested", "bought", "sold_out"] as const;

/**
 * Shopping-list ticks sent by the app, also ones queued while offline (src/lib/offline-queue.ts).
 * Unlike Server Actions this endpoint gets no automatic CSRF check, so the request must come from
 * the app's own pages (Origin equals Host) and carry a valid session.
 *   204 saved · 401 signed out (kept, sent after signing in) · 403 other site · 400/404 refused for good
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response(null, { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await validateSession(getDb(), token))) return new Response(null, { status: 401 });

  let body: { orderId?: unknown; itemId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { orderId, itemId, status } = body;
  if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(itemId) || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return new Response(null, { status: 400 });
  }
  const saved = await setItemStatus(getDb(), orderId as number, itemId as number, status as (typeof STATUSES)[number]);
  return new Response(null, { status: saved ? 204 : 404 });
}
