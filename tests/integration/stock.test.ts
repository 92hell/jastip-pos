import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { getDashboard, getEventSummary } from "@/lib/dashboard";
import { createEvent, shoppingList } from "@/lib/events";
import { createOrder, getOrder, setItemStatus, updateOrder, type OrderInput } from "@/lib/orders";
import {
  addStock, availableStock, correctStock, createStockItem, deleteStockItem, deleteStockMove, getStockItem, listStock, recordStockSale, updateStockItem,
} from "@/lib/stock";
import { db } from "./setup";

const NOW = new Date("2026-11-20T05:00:00Z");

async function client(name: string, isReseller = false) {
  const r = await createClient(db, { name, whatsapp: "", address: "", notes: "", isReseller });
  if (!r.ok) throw new Error("client");
  return r.id;
}

async function event(kind: "trip" | "bazaar" | "wholesale", name: string) {
  const r = await createEvent(db, { kind, name, location: "", startsOn: "2026-11-21", endsOn: "2026-11-22", orderDeadline: "", note: "" });
  if (!r.ok) throw new Error("event");
  return r.id;
}

/** Tumbler: bought 5 at 250rb each, sold at 350rb. */
async function tumblers(quantity = "5") {
  const r = await createStockItem(db, { name: "Tumbler Starbucks SG", store: "Starbucks", unitCost: "250rb", price: "350rb", quantity, eventId: "", note: "" }, null);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

function stockOrder(clientId: number, eventId: number | undefined, lines: { stockItemId?: number; name: string; quantity: number; price: string; id?: number }[]): OrderInput {
  return {
    clientId, eventId, note: "", bundles: [], discount: "", applyVoucher: false, shipping: "", dpPercent: "",
    items: lines.map((l) => ({
      id: l.id, stockItemId: l.stockItemId, name: l.name, store: "", quantity: l.quantity, unitPrice: l.price, feeMode: "nett", feeAmount: "", feePercent: "", bundle: "",
    })),
  };
}

const sale = (quantity: string, unitPrice = "350rb", eventId: number | "" = "") => ({ quantity, unitPrice, method: "cash" as const, eventId: String(eventId), soldOn: "2026-11-21", note: "" });

describe("Ready stock", () => {
  it("is sold at a bazaar and to a reseller: what is left, what it is worth, and the profit", async () => {
    const bazaar = await event("bazaar", "Bazaar AEON BSD");
    const wholesale = await event("wholesale", "Grosir Desember");
    const item = await tumblers();
    const dina = await client("Dina", true);

    expect(await recordStockSale(db, item, sale("2", "350rb", bazaar), null)).toEqual({ ok: true });
    const order = await createOrder(db, stockOrder(dina, wholesale, [{ stockItemId: item, name: "Tumbler Starbucks SG", quantity: 1, price: "300rb" }]), null, NOW);
    expect(order.ok).toBe(true);

    const [row] = await listStock(db);
    // 5 in, 2 sold at the bazaar, 1 to Dina: 2 left, worth 2 × 250rb at cost.
    expect(row).toMatchObject({ id: item, available: 2, sold: 3, value: 500_000, revenue: 1_000_000, profit: 250_000 });
    const detail = (await getStockItem(db, item))!;
    expect(detail.orderLines).toEqual([expect.objectContaining({ clientName: "Dina", quantity: 1, amount: 300_000 })]);
    expect(detail.moves.map((m) => [m.kind, m.quantity])).toEqual([["sale", -2], ["added", 5]]);

    // The bazaar's money is the direct sales; the reseller order is in the wholesale event like any order.
    expect(await getEventSummary(db, bazaar)).toMatchObject({ orders: 0, stockSales: 700_000, stockProfit: 200_000 });
    expect(await getEventSummary(db, wholesale)).toMatchObject({ orders: 1, total: 300_000, stockSales: 0, stockProfit: 50_000 });
  });

  it("cannot be sold beyond what is left, in a sale or an order; editing an order counts its own lines as its own", async () => {
    const item = await tumblers("2");
    const siti = await client("Siti");

    const first = await createOrder(db, stockOrder(siti, undefined, [{ stockItemId: item, name: "Tumbler", quantity: 2, price: "350rb" }]), null, NOW);
    if (!first.ok) throw new Error("order");
    expect(await createOrder(db, stockOrder(siti, undefined, [{ stockItemId: item, name: "Tumbler", quantity: 1, price: "350rb" }]), null, NOW))
      .toEqual({ ok: false, errors: { "items.0.quantity": "not_enough_stock" } });
    expect(await recordStockSale(db, item, sale("1"), null)).toEqual({ ok: false, errors: { quantity: "not_enough_stock" } });

    const [line] = (await getOrder(db, first.id))!.items;
    expect((await updateOrder(db, first.id, stockOrder(siti, undefined, [{ id: line.id, stockItemId: item, name: "Tumbler", quantity: 2, price: "340rb" }]))).ok).toBe(true);
    expect(await updateOrder(db, first.id, stockOrder(siti, undefined, [{ id: line.id, stockItemId: item, name: "Tumbler", quantity: 3, price: "340rb" }])))
      .toEqual({ ok: false, errors: { "items.0.quantity": "not_enough_stock" } });
    expect((await getOrder(db, first.id))!.items[0]).toMatchObject({ quantity: 2, unitPrice: 340_000 });
  });

  it("comes back when an order line is removed or called off, or a sale is undone; a recount says why", async () => {
    const item = await tumblers("3");
    const siti = await client("Siti");
    const order = await createOrder(db, stockOrder(siti, undefined, [
      { stockItemId: item, name: "Tumbler", quantity: 1, price: "350rb" },
      { stockItemId: item, name: "Tumbler", quantity: 1, price: "350rb" },
    ]), null, NOW);
    if (!order.ok) throw new Error("order");
    await recordStockSale(db, item, sale("1"), null);
    const available = async () => (await listStock(db))[0].available;
    expect(await available()).toBe(0);

    const [a] = (await getOrder(db, order.id))!.items;
    await updateOrder(db, order.id, stockOrder(siti, undefined, [{ id: a.id, stockItemId: item, name: "Tumbler", quantity: 1, price: "350rb" }]));
    expect(await available()).toBe(1);

    await setItemStatus(db, order.id, a.id, "sold_out");
    expect(await available()).toBe(2);

    const saleMove = (await getStockItem(db, item))!.moves.find((m) => m.kind === "sale")!;
    expect(await deleteStockMove(db, item, saleMove.id)).toBe(true);
    expect(await available()).toBe(3);

    // She counts 2 on the shelf (one broke): the correction is recorded with her note.
    expect(await correctStock(db, item, { counted: "2", note: "1 pecah" }, null)).toEqual({ ok: true });
    expect(await available()).toBe(2);
    expect((await getStockItem(db, item))!.moves[0]).toMatchObject({ kind: "adjusted", quantity: -1, note: "1 pecah" });

    expect(await addStock(db, item, { quantity: "4", note: "" }, null)).toEqual({ ok: true });
    expect(await available()).toBe(6);
  });

  it("a called-off stock line cannot come back once that stock has been sold to someone else", async () => {
    const item = await tumblers("1");
    const siti = await client("Siti");
    const order = await createOrder(db, stockOrder(siti, undefined, [{ stockItemId: item, name: "Tumbler", quantity: 1, price: "350rb" }]), null, NOW);
    if (!order.ok) throw new Error("order");
    const [line] = (await getOrder(db, order.id))!.items;
    await setItemStatus(db, order.id, line.id, "sold_out");
    await recordStockSale(db, item, sale("1"), null);

    expect(await setItemStatus(db, order.id, line.id, "arrived")).toBe(false);
    expect((await getOrder(db, order.id))!.items[0].status).toBe("sold_out");
  });

  it("a stock line arrives with the order already in hand, so it is not on the shopping list, and it is ready to pack", async () => {
    const trip = await event("trip", "Jastip SG");
    const item = await tumblers();
    const siti = await client("Siti");
    const order = await createOrder(db, {
      ...stockOrder(siti, trip, [{ stockItemId: item, name: "Tumbler Starbucks SG", quantity: 1, price: "350rb" }]),
      items: [
        { stockItemId: item, name: "Tumbler Starbucks SG", store: "", quantity: 1, unitPrice: "350rb", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "" },
        { name: "Tas", store: "Charles & Keith", quantity: 1, unitPrice: "900rb", feeMode: "per_item", feeAmount: "50rb", feePercent: "", bundle: "" },
      ],
    }, null, NOW);
    if (!order.ok) throw new Error("order");

    expect((await getOrder(db, order.id))!.items.map((i) => [i.name, i.status])).toEqual([["Tumbler Starbucks SG", "arrived"], ["Tas", "requested"]]);
    expect((await shoppingList(db, trip)).flatMap((g) => g.items.map((i) => i.name))).toEqual(["Tas"]);
    expect((await getDashboard(db, NOW)).toPack.map((i) => i.itemName)).toEqual(["Tumbler Starbucks SG"]);
  });

  it("shows on the dashboard: stock value, and this month's stock profit and cash from direct sales", async () => {
    const item = await tumblers();
    await recordStockSale(db, item, { ...sale("1"), soldOn: "2026-11-05" }, null);
    await recordStockSale(db, item, { ...sale("1"), soldOn: "2026-10-30" }, null);

    const { money } = await getDashboard(db, NOW);

    expect(money).toMatchObject({ stockValue: 3 * 250_000, stockProfitThisMonth: 100_000, receivedThisMonth: 350_000 });
  });

  it("an item entered by mistake can be deleted, but not once an order has used it", async () => {
    const mistake = await tumblers("1");
    const used = await tumblers("1");
    const siti = await client("Siti");
    await createOrder(db, stockOrder(siti, undefined, [{ stockItemId: used, name: "Tumbler", quantity: 1, price: "350rb" }]), null, NOW);

    expect(await deleteStockItem(db, mistake)).toBe(true);
    expect(await deleteStockItem(db, used)).toBe(false);
    expect((await listStock(db)).map((r) => r.id)).toEqual([used]);
  });

  it("checks each field and offers only what is left for orders", async () => {
    expect(await createStockItem(db, { name: "", store: "", unitCost: "abc", price: "", quantity: "0", eventId: "", note: "" }, null))
      .toEqual({ ok: false, errors: { name: "required", unitCost: "invalid_amount", price: "required", quantity: "invalid_quantity" } });
    const item = await tumblers("1");
    expect(await recordStockSale(db, item, { ...sale("0"), unitPrice: "" }, null))
      .toEqual({ ok: false, errors: { quantity: "invalid_quantity", unitPrice: "required" } });
    expect(await updateStockItem(db, item, { name: "Tumbler SG 500ml", store: "Starbucks", unitCost: "240rb", price: "360rb", eventId: "", note: "" })).toEqual({ ok: true });
    expect(await availableStock(db)).toEqual([{ id: item, name: "Tumbler SG 500ml", store: "Starbucks", price: 360_000, available: 1 }]);

    await recordStockSale(db, item, sale("1"), null);
    expect(await availableStock(db)).toEqual([]);
  });
});
