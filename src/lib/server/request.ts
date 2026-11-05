import "server-only";
import { headers } from "next/headers";

/**
 * The visitor's network address, for throttling. Behind the host's proxy (TRUST_PROXY=true) it is
 * the last X-Forwarded-For entry, the one the proxy itself added; otherwise all requests share one.
 */
export async function clientAddress(): Promise<string> {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || "unknown";
}

export const isDemo = () => process.env.DEMO_MODE === "true";
export const DEMO_USERNAME = "demo";
export const DEMO_PASSWORD = "demo-jastip-password";
