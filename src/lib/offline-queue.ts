/**
 * Shopping-list ticks made without signal (abroad, in a mall basement), kept on the phone until
 * they can be sent. One entry per item: ticking it again replaces the earlier change. Stored in
 * localStorage, so closing the app loses nothing; cleared on sign-out.
 */
export type Change = { orderId: number; itemId: number; status: "requested" | "bought" | "sold_out" };
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** "ok": saved; "rejected": the server refused it for good (do not retry); throws: try again later. */
export type Send = (change: Change) => Promise<"ok" | "rejected">;

const KEY = "jastip-pending";

export class OfflineQueue {
  constructor(private readonly store: KeyValueStore) {}

  pending(): Change[] {
    try {
      const value = JSON.parse(this.store.getItem(KEY) ?? "[]");
      return Array.isArray(value) ? value.filter(isChange) : [];
    } catch {
      return [];
    }
  }

  statusOf(itemId: number): Change["status"] | undefined {
    return this.pending().find((c) => c.itemId === itemId)?.status;
  }

  add(change: Change) {
    this.save([...this.pending().filter((c) => c.itemId !== change.itemId), change]);
  }

  clear() {
    this.store.removeItem(KEY);
  }

  /**
   * Sends what is waiting, oldest first. Afterwards only what reached the server (sent or refused)
   * is removed; a failed change stays, and a tick made while sending is kept even for the same item.
   */
  async flush(send: Send) {
    let sent = 0;
    let dropped = 0;
    let failed = 0;
    const done: Change[] = [];
    for (const change of this.pending()) {
      try {
        if ((await send(change)) === "ok") sent++;
        else dropped++;
        done.push(change);
      } catch {
        failed++;
      }
    }
    const same = (a: Change, b: Change) => a.itemId === b.itemId && a.status === b.status && a.orderId === b.orderId;
    this.save(this.pending().filter((c) => !done.some((d) => same(c, d))));
    return { sent, failed, dropped };
  }

  private save(changes: Change[]) {
    if (changes.length === 0) this.store.removeItem(KEY);
    else this.store.setItem(KEY, JSON.stringify(changes));
  }
}

function isChange(value: unknown): value is Change {
  const c = value as Change;
  return Boolean(c) && Number.isSafeInteger(c.orderId) && Number.isSafeInteger(c.itemId) && ["requested", "bought", "sold_out"].includes(c.status);
}
