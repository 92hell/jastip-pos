import "server-only";
import { headers } from "next/headers";

/**
 * The app's public address, for links sent to clients: PUBLIC_URL when set, otherwise the address
 * this request came in on (behind the host's proxy, its X-Forwarded-Proto/Host).
 */
export async function publicUrl(): Promise<string> {
  const configured = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Today in Jakarta, as YYYY-MM-DD. */
export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}
