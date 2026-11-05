import { describe, expect, it } from "vitest";
import { OfflineQueue, type Change, type KeyValueStore } from "@/lib/offline-queue";

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const change = (itemId: number, status: Change["status"]): Change => ({ orderId: 1, itemId, status });

describe("Ticks made without signal", () => {
  it("are kept on the phone, one per item: the latest tick wins", () => {
    const queue = new OfflineQueue(memory());
    queue.add(change(1, "bought"));
    queue.add(change(2, "sold_out"));
    queue.add(change(1, "requested"));

    expect(queue.pending()).toEqual([change(2, "sold_out"), change(1, "requested")]);
    expect(queue.statusOf(1)).toBe("requested");
  });

  it("survive closing the app (they are stored, not only in memory)", () => {
    const store = memory();
    new OfflineQueue(store).add(change(1, "bought"));

    expect(new OfflineQueue(store).pending()).toEqual([change(1, "bought")]);
  });

  it("are sent in order when back online; what was sent is removed, what failed stays for next time", async () => {
    const queue = new OfflineQueue(memory());
    queue.add(change(1, "bought"));
    queue.add(change(2, "bought"));
    queue.add(change(3, "bought"));
    const sent: number[] = [];

    const result = await queue.flush(async (c) => {
      if (c.itemId === 2) throw new Error("network");
      sent.push(c.itemId);
      return "ok";
    });

    expect(sent).toEqual([1, 3]);
    expect(result).toEqual({ sent: 2, failed: 1, dropped: 0 });
    expect(queue.pending()).toEqual([change(2, "bought")]);
  });

  it("drop a change the server refuses for good (e.g. the item was deleted), instead of retrying forever", async () => {
    const queue = new OfflineQueue(memory());
    queue.add(change(1, "bought"));

    expect(await queue.flush(async () => "rejected")).toEqual({ sent: 0, failed: 0, dropped: 1 });
    expect(queue.pending()).toEqual([]);
  });

  it("ignore damaged stored data, and are cleared on sign-out", () => {
    const store = memory();
    store.setItem("jastip-pending", "{not json");
    const queue = new OfflineQueue(store);
    expect(queue.pending()).toEqual([]);

    queue.add(change(1, "bought"));
    queue.clear();
    expect(new OfflineQueue(store).pending()).toEqual([]);
  });

  it("keep a tick made while the earlier ones are being sent", async () => {
    const queue = new OfflineQueue(memory());
    queue.add(change(1, "bought"));

    await queue.flush(async () => {
      queue.add(change(1, "requested"));
      queue.add(change(2, "bought"));
      return "ok";
    });

    expect(queue.pending()).toEqual([change(1, "requested"), change(2, "bought")]);
  });
});
