import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { getDashboard, getEventSummary, jakartaMonth } from "@/lib/dashboard";
import { createEvent } from "@/lib/events";
import { cancelSoldOut, createOrder, getOrder, setItemStatus, type OrderInput } from "@/lib/orders";
import { recordPayment } from "@/lib/payments";
import { db } from "./setup";

const NOW = new Date("2026-11-20T05:00:00Z");

async function client(name: string) {
  const r = await createClient(db, { name, whatsapp: "", address: "", notes: "", isReseller: false });
  if (!r.ok) throw new Error("client");
  return r.id;
}

async function order(clientId: number, eventId: number | undefined, items: [string, string, number?][], dp = "", fee = "") {
  const input: OrderInput = {
    clientId, eventId, note: "", bundles: [], discount: "", applyVoucher: false, shipping: "", dpPercent: dp,
    items: items.map(([name, price, qty]) => ({
      name, store: "", quantity: qty ?? 1, unitPrice: price, feeMode: fee ? "per_item" : "nett", feeAmount: fee, feePercent: "", bundle: "",
    })),
  };
  const r = await createOrder(db, input, null, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

describe("Dashboard", () => {
  it("lists what needs doing: buy, answer from the client, pack, ship", async () => {
    const trip = await createEvent(db, { kind: "trip", name: "Jastip SG", location: "", startsOn: "2026-12-01", endsOn: "2026-12-03", orderDeadline: "", note: "" });
    if (!trip.ok) throw new Error("event");
    const siti = await client("Siti");
    const tripOrder = await order(siti, trip.id, [["Tas", "500rb", 2], ["Dompet", "100rb"], ["Topi", "50rb"], ["Kaos", "80rb"]]);
    await order(siti, undefined, [["Buku", "90rb", 3]]);
    const [, dompet, topi, kaos] = (await getOrder(db, tripOrder))!.items;
    await setItemStatus(db, tripOrder, dompet.id, "sold_out");
    await setItemStatus(db, tripOrder, topi.id, "arrived");
    await setItemStatus(db, tripOrder, kaos.id, "packed");

    const d = await getDashboard(db, NOW);

    expect(d.toBuy).toEqual([
      { eventId: trip.id, eventName: "Jastip SG", quantity: 2 },
      { eventId: null, eventName: null, quantity: 3 },
    ]);
    expect(d.waitingForClient.map((i) => i.itemName)).toEqual(["Dompet"]);
    expect(d.toPack.map((i) => i.itemName)).toEqual(["Topi"]);
    expect(d.toShip.map((i) => i.itemName)).toEqual(["Kaos"]);

    await cancelSoldOut(db, tripOrder, dompet.id);
    expect((await getDashboard(db, NOW)).waitingForClient).toEqual([]);
  });

  it("shows DPs not yet paid, overpaid orders, what clients still owe, and this month's money", async () => {
    const siti = await client("Siti");
    const dina = await client("Dina");
    const dpOrder = await order(siti, undefined, [["Tas", "1jt"]], "50", "50rb");
    const paidOrder = await order(dina, undefined, [["Parfum", "400rb"], ["Serum", "100rb"]]);
    await recordPayment(db, dpOrder, { amount: "200rb", method: "transfer", paidOn: "2026-11-10", note: "" }, null);
    await recordPayment(db, paidOrder, { amount: "500rb", method: "qris", paidOn: "2026-10-31", note: "" }, null);
    const [, serum] = (await getOrder(db, paidOrder))!.items;
    await setItemStatus(db, paidOrder, serum.id, "sold_out");
    await cancelSoldOut(db, paidOrder, serum.id);

    const d = await getDashboard(db, NOW);

    expect(d.dpDue.map((o) => [o.clientName, o.balance.dpDue])).toEqual([["Siti", 325_000]]);
    expect(d.overpaid.map((o) => [o.clientName, o.balance.overpaid])).toEqual([["Dina", 100_000]]);
    expect(d.money).toEqual({
      outstanding: 1_050_000 - 200_000,
      // Only November payments; the October one is last month's money.
      receivedThisMonth: 200_000,
      stockValue: 0,
      stockProfitThisMonth: 0,
      feesThisMonth: 50_000,
    });
  });

  it("counts a month in Jakarta time", () => {
    expect(jakartaMonth(new Date("2026-11-30T17:30:00Z"))).toMatchObject({ fromDay: "2026-12-01", toDay: "2027-01-01" });
    expect(jakartaMonth(new Date("2026-11-30T16:30:00Z")).fromDay).toBe("2026-11-01");
  });
});

describe("Event summary", () => {
  it("adds up an event's orders, the fees she earns on it, what is paid and still owed", async () => {
    const trip = await createEvent(db, { kind: "bazaar", name: "Bazaar", location: "", startsOn: "2026-12-01", endsOn: "2026-12-01", orderDeadline: "", note: "" });
    if (!trip.ok) throw new Error("event");
    const siti = await client("Siti");
    const a = await order(siti, trip.id, [["Tas", "300rb"]], "", "30rb");
    await order(siti, trip.id, [["Kaos", "100rb", 2], ["Topi", "50rb"]], "", "10rb");
    await order(siti, undefined, [["Lain", "999rb"]]);
    await recordPayment(db, a, { amount: "330rb", method: "cash", paidOn: "2026-11-20", note: "" }, null);

    expect(await getEventSummary(db, trip.id)).toEqual({
      orders: 2, itemsTotal: 550_000, feesTotal: 60_000, total: 610_000, paid: 330_000, outstanding: 280_000, soldOut: 0, stockSales: 0, stockProfit: 0,
    });
  });
});
