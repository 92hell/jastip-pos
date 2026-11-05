"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { OfflineQueue, type Change } from "@/lib/offline-queue";
import { sendChange } from "@/lib/send-change";

const CHANGED = "jastip-queue-changed";
const queue = () => new OfflineQueue(window.localStorage);
const notify = () => window.dispatchEvent(new Event(CHANGED));
const subscribe = (callback: () => void) => {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
};

/** The waiting change for this item, if any ("" when none), kept in step with the stored queue. */
function usePending(itemId: number) {
  return useSyncExternalStore(subscribe, () => queue().statusOf(itemId) ?? "", () => "");
}

type Labels = { bought: string; soldOut: string; notSent: string };

/**
 * "Bought" and "Sold out" on the shopping list. Shown at once; sent now when there is signal,
 * otherwise kept on the phone and sent later (SyncStatus).
 */
export function ShoppingItemActions({ orderId, itemId, name, status, labels }: {
  orderId: number; itemId: number; name: string; status: "requested" | "bought"; labels: Labels;
}) {
  const router = useRouter();
  const pending = usePending(itemId);
  const shown = (pending || status) as Change["status"];
  const bought = shown === "bought";

  async function set(next: Change["status"]) {
    const change = { orderId, itemId, status: next };
    queue().add(change);
    notify();
    if (!navigator.onLine) return;
    const result = await queue().flush(sendChange);
    notify();
    if (result.sent || result.dropped) router.refresh();
  }

  if (shown === "sold_out") {
    return <span className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-danger">{labels.soldOut} · {labels.notSent}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => set(bought ? "requested" : "bought")} aria-pressed={bought} aria-label={`${labels.bought}: ${name}`}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${bought ? "bg-success text-white" : "border-2 border-ink hover:bg-sky-soft"}`}>
        {bought ? "✓ " : ""}{labels.bought}
      </button>
      {!bought && (
        <button type="button" onClick={() => set("sold_out")} aria-label={`${labels.soldOut}: ${name}`}
          className="rounded-full border border-danger px-3 py-1.5 text-sm font-semibold text-danger hover:bg-red-50">{labels.soldOut}</button>
      )}
      {pending && <span className="text-xs font-semibold text-muted">{labels.notSent}</span>}
    </div>
  );
}

/** How many ticks wait to be sent; sends them when the page opens and whenever signal comes back. */
export function SyncStatus({ pendingText, syncedText }: { pendingText: string; syncedText: string }) {
  const router = useRouter();
  const count = useSyncExternalStore(subscribe, () => queue().pending().length, () => 0);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    async function send() {
      if (!navigator.onLine || queue().pending().length === 0) return;
      const result = await queue().flush(sendChange);
      notify();
      if (result.sent || result.dropped) {
        setSynced(queue().pending().length === 0);
        router.refresh();
      }
    }
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [router]);

  return (
    <p role="status" className="text-sm font-semibold">
      {count > 0 ? pendingText.replace("{n}", String(count)) : synced ? syncedText : ""}
    </p>
  );
}
