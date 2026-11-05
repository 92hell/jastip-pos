import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { createEvent, deleteEvent, listEvents, setEventClosed, shoppingList, updateEvent, type EventInput } from "@/lib/events";
import { createOrder, getOrder, setItemStatus, updateOrder, type OrderInput } from "@/lib/orders";
import { db } from "./setup";

const event = (overrides: Partial<EventInput> = {}): EventInput => ({
  kind: "trip", name: "Jastip Singapore", location: "Singapore", startsOn: "2026-12-12", endsOn: "2026-12-15", orderDeadline: "2026-12-10", note: "", ...overrides,
});

async function client(name = "Siti") {
  const r = await createClient(db, { name, whatsapp: "", address: "", notes: "", isReseller: false });
  if (!r.ok) throw new Error("client");
  return r.id;
}

const line = (name: string, store: string, quantity = 1): OrderInput["items"][number] => ({
  name, store, quantity, unitPrice: "100rb", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "",
});

const order = (clientId: number, eventId: number | undefined, items: OrderInput["items"]): OrderInput => ({
  clientId, eventId, note: "", items, bundles: [], discount: "", applyVoucher: false, shipping: "",
});

describe("Events (trips, open POs, bazaars, wholesale)", () => {
  it("are checked: the end is not before the start, and the order deadline is not after the end", async () => {
    expect(await createEvent(db, event({ kind: "bazaar", name: "Bazaar AEON", orderDeadline: "" }))).toMatchObject({ ok: true });

    expect(await createEvent(db, event({ name: "", endsOn: "2026-12-01", orderDeadline: "2026-12-20" }))).toEqual({
      ok: false, errors: { name: "required", endsOn: "before_start", orderDeadline: "after_event" },
    });
    expect(await createEvent(db, event({ orderDeadline: "2026-12-20" }))).toEqual({ ok: false, errors: { orderDeadline: "after_event" } });
    expect(await createEvent(db, event({ startsOn: "2026-02-30" }))).toEqual({ ok: false, errors: { startsOn: "invalid_date" } });
  });

  it("are listed open first (soonest first), then closed, with their orders and how many items are still to buy", async () => {
    const later = await createEvent(db, event({ name: "Jastip Tokyo", startsOn: "2027-03-01", endsOn: "2027-03-05", orderDeadline: "" }));
    const sooner = await createEvent(db, event());
    const closed = await createEvent(db, event({ kind: "wholesale", name: "Grosir sisa stok", startsOn: "2026-11-01", endsOn: "2026-11-01", orderDeadline: "" }));
    if (!later.ok || !sooner.ok || !closed.ok) throw new Error("events");
    await setEventClosed(db, closed.id, true);
    await createOrder(db, order(await client(), sooner.id, [line("Tas", "Coach", 2), line("Dompet", "Coach")]), null);

    const list = await listEvents(db);

    expect(list.map((e) => e.name)).toEqual(["Jastip Singapore", "Jastip Tokyo", "Grosir sisa stok"]);
    expect(list[0]).toMatchObject({ orders: 1, toBuy: 3 });
  });

  it("closed events take no new orders; their orders can still be edited, and reopening takes orders again", async () => {
    const created = await createEvent(db, event());
    if (!created.ok) throw new Error("event");
    const siti = await client();
    const existing = await createOrder(db, order(siti, created.id, [line("Tas", "Coach")]), null);
    if (!existing.ok) throw new Error("order");
    await setEventClosed(db, created.id, true);

    expect(await createOrder(db, order(siti, created.id, [line("Tas", "Coach")]), null)).toEqual({ ok: false, errors: { eventId: "event_closed" } });
    expect((await updateOrder(db, existing.id, order(siti, created.id, [line("Tas besar", "Coach")]))).ok).toBe(true);

    await setEventClosed(db, created.id, false);
    expect((await createOrder(db, order(siti, created.id, [line("Tas", "Coach")]), null)).ok).toBe(true);
  });

  it("without orders can be deleted; with orders they stay", async () => {
    const empty = await createEvent(db, event());
    const used = await createEvent(db, event());
    if (!empty.ok || !used.ok) throw new Error("events");
    await createOrder(db, order(await client(), used.id, [line("Tas", "Coach")]), null);

    expect(await deleteEvent(db, empty.id)).toBe("deleted");
    expect(await deleteEvent(db, used.id)).toBe("has_orders");
    expect((await updateEvent(db, used.id, event({ name: "Jastip SG" }))).ok).toBe(true);
  });

  it("have a shopping list by store (A–Z, no store last) with what to buy, what is bought and what sold out", async () => {
    const created = await createEvent(db, event());
    if (!created.ok) throw new Error("event");
    const siti = await client("Siti");
    const dina = await client("Dina");
    await createOrder(db, order(siti, created.id, [line("Tas", "Coach"), line("Coklat", ""), line("Parfum", "Sephora")]), null);
    const second = await createOrder(db, order(dina, created.id, [line("Dompet", "Coach", 2), line("Lipstik", "Sephora")]), null);
    if (!second.ok) throw new Error("order");
    const [dompet, lipstik] = (await getOrder(db, second.id))!.items;
    await setItemStatus(db, second.id, dompet.id, "bought");
    await setItemStatus(db, second.id, lipstik.id, "arrived");

    const list = await shoppingList(db, created.id);

    expect(list.map((g) => [g.store, g.items.map((i) => `${i.name} ×${i.quantity} ${i.clientName} ${i.status}`)])).toEqual([
      ["Coach", ["Dompet ×2 Dina bought", "Tas ×1 Siti requested"]],
      ["Sephora", ["Parfum ×1 Siti requested"]],
      ["", ["Coklat ×1 Siti requested"]],
    ]);
  });
});
