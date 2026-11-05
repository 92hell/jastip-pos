import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { cancelSoldOut, createOrder, getOrder, markShipped, replaceSoldOut, setItemStatus, updateOrder, type OrderInput } from "@/lib/orders";
import { db } from "./setup";

async function newOrder(items: Partial<OrderInput["items"][number]>[], bundles: OrderInput["bundles"] = []) {
  const c = await createClient(db, { name: "Siti", whatsapp: "", address: "", notes: "", isReseller: false });
  if (!c.ok) throw new Error("client");
  const input: OrderInput = {
    clientId: c.id, note: "", bundles, discount: "", applyVoucher: false, shipping: "",
    items: items.map((i) => ({ name: "Barang", store: "Toko", quantity: 1, unitPrice: "100rb", feeMode: "per_item", feeAmount: "10rb", feePercent: "", bundle: "", ...i })),
  };
  const r = await createOrder(db, input, null);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { id: r.id, input };
}

describe("Item status", () => {
  it("moves requested → bought → arrived → packed, and any step can be undone", async () => {
    const { id } = await newOrder([{ name: "Tas" }]);
    const [tas] = (await getOrder(db, id))!.items;
    expect(tas.status).toBe("requested");

    for (const status of ["bought", "arrived", "packed", "bought"] as const) {
      expect(await setItemStatus(db, id, tas.id, status)).toBe(true);
      expect((await getOrder(db, id))!.items[0].status).toBe(status);
    }
  });

  it("is kept when the order is edited; removed lines go, new lines start as requested", async () => {
    const { id, input } = await newOrder([{ name: "Tas" }, { name: "Dompet" }]);
    const [tas] = (await getOrder(db, id))!.items;
    await setItemStatus(db, id, tas.id, "bought");

    await updateOrder(db, id, { ...input, items: [{ ...input.items[0], id: tas.id, name: "Tas Coach" }, { ...input.items[0], name: "Kaos" }] });

    const items = (await getOrder(db, id))!.items;
    expect(items.map((i) => [i.name, i.status])).toEqual([["Tas Coach", "bought"], ["Kaos", "requested"]]);
    expect(items[0].id).toBe(tas.id);
  });

  it("cannot be changed through another order", async () => {
    const first = await newOrder([{ name: "Tas" }]);
    const second = await newOrder([{ name: "Dompet" }]);
    const [tas] = (await getOrder(db, first.id))!.items;

    expect(await setItemStatus(db, second.id, tas.id, "bought")).toBe(false);
    expect((await getOrder(db, first.id))!.items[0].status).toBe("requested");
  });

  it("shipping the order ships every item still coming, with courier and tracking number", async () => {
    const { id } = await newOrder([{ name: "Tas" }, { name: "Dompet" }]);
    const [, dompet] = (await getOrder(db, id))!.items;
    await setItemStatus(db, id, dompet.id, "sold_out");

    await markShipped(db, id, { courier: " JNE ", trackingNumber: "JP1234567890" });

    const saved = (await getOrder(db, id))!;
    expect(saved).toMatchObject({ courier: "JNE", trackingNumber: "JP1234567890" });
    expect(saved.shippedAt).not.toBeNull();
    expect(saved.items.map((i) => i.status)).toEqual(["shipped", "sold_out"]);
  });
});

describe("Sold-out items", () => {
  it("are not charged while she asks the client, and stay uncharged if called off", async () => {
    const { id } = await newOrder([{ name: "Tas" }, { name: "Serum", unitPrice: "200rb", feeMode: "percent", feePercent: "10" }]);
    const [, serum] = (await getOrder(db, id))!.items;
    expect((await getOrder(db, id))!.total).toBe(110_000 + 220_000);

    await setItemStatus(db, id, serum.id, "sold_out");
    let saved = (await getOrder(db, id))!;
    expect(saved.items[1]).toMatchObject({ status: "sold_out", soldOutResolution: "waiting", subtotal: 0, fee: 0 });
    expect(saved.total).toBe(110_000);

    await cancelSoldOut(db, id, serum.id);
    saved = (await getOrder(db, id))!;
    expect(saved.items[1].soldOutResolution).toBe("cancelled");
    expect(saved.total).toBe(110_000);
  });

  it("can be swapped for a similar item: same quantity and fee type, its own price, linked, and priced again", async () => {
    const { id } = await newOrder([{ name: "Serum A", quantity: 2, unitPrice: "200rb", feeMode: "percent", feePercent: "10", store: "Watsons" }]);
    const [serum] = (await getOrder(db, id))!.items;
    await setItemStatus(db, id, serum.id, "sold_out");

    const result = await replaceSoldOut(db, id, serum.id, { name: "Serum B", store: "", unitPrice: "180.000" });

    expect(result).toEqual({ ok: true });
    const saved = (await getOrder(db, id))!;
    expect(saved.items.map((i) => [i.name, i.status, i.soldOutResolution, i.quantity, i.store, i.subtotal, i.fee])).toEqual([
      ["Serum A", "sold_out", "replaced", 2, "Watsons", 0, 0],
      ["Serum B", "requested", null, 2, "Watsons", 360_000, 36_000],
    ]);
    expect(saved.items[1].replacesItemId).toBe(serum.id);
    expect(saved.total).toBe(396_000);
  });

  it("only sold-out items can be swapped or called off, and the replacement needs a name and a price", async () => {
    const { id } = await newOrder([{ name: "Tas" }]);
    const [tas] = (await getOrder(db, id))!.items;

    expect(await replaceSoldOut(db, id, tas.id, { name: "Tas lain", store: "", unitPrice: "90rb" })).toEqual({ ok: false, errors: { item: "not_found" } });
    expect(await cancelSoldOut(db, id, tas.id)).toBe(false);
    await setItemStatus(db, id, tas.id, "sold_out");
    expect(await replaceSoldOut(db, id, tas.id, { name: "", store: "", unitPrice: "abc" })).toEqual({
      ok: false, errors: { name: "required", unitPrice: "invalid_amount" },
    });
  });

  it("a bundle loses its fee only when all of its items sold out; undoing a sold-out charges again", async () => {
    const { id } = await newOrder(
      [{ name: "Serum", feeMode: "bundle", bundle: "b1" }, { name: "Toner", feeMode: "bundle", bundle: "b1" }],
      [{ key: "b1", label: "Skincare", fee: "50rb" }],
    );
    const [serum, toner] = (await getOrder(db, id))!.items;

    await setItemStatus(db, id, serum.id, "sold_out");
    expect((await getOrder(db, id))!).toMatchObject({ itemsTotal: 100_000, feesTotal: 50_000 });
    await setItemStatus(db, id, toner.id, "sold_out");
    expect((await getOrder(db, id))!).toMatchObject({ itemsTotal: 0, feesTotal: 0, total: 0 });
    await setItemStatus(db, id, serum.id, "requested");
    expect((await getOrder(db, id))!).toMatchObject({ itemsTotal: 100_000, feesTotal: 50_000, total: 150_000 });
    expect((await getOrder(db, id))!.items[0].soldOutResolution).toBeNull();
  });
});
