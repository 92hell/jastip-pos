import type { Change } from "./offline-queue";

/** Sends one shopping-list tick to the server; throws when it should be tried again later. */
export async function sendChange(change: Change): Promise<"ok" | "rejected"> {
  const response = await fetch("/api/items/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
    credentials: "same-origin",
  });
  if (response.status === 204) return "ok";
  if (response.status === 400 || response.status === 404) return "rejected";
  throw new Error(`Not sent (${response.status})`);
}
