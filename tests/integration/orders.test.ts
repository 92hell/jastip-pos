import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { createOrder, getOrder, listOrders, updateOrder, type OrderInput } from "@/lib/orders";
import { updateSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { db } from "./setup";

async function client(name = "Siti", whatsapp = "") {
  const result = await createClient(db, { name, whatsapp, address: "", notes: "", isReseller: false });
  if (!result.ok) throw new Error("client not created");
  return result.id;
}

const item = (overrides: Partial<OrderInput["items"][number]> = {}): OrderInput["items"][number] => ({
  name: "Tas Charles & Keith", store: "Grand Indonesia", quantity: 1, unitPrice: "350.000",
  feeMode: "per_item", feeAmount: "25rb", feePercent: "", bundle: "", ...overrides,
});

const order = (clientId: number, overrides: Partial<OrderInput> = {}): OrderInput => ({
  clientId, note: "", items: [item()], bundles: [], discount: "", applyVoucher: false, shipping: "", ...overrides,
});

describe("Orders", () => {
  it("are priced on the server and stored with their lines, bundles and totals", async () => {
    const siti = await client();

    const result = await createOrder(db, order(siti, {
      bundles: [{ key: "b1", label: "Skincare", fee: "50rb" }],
      items: [
        item(),
        item({ name: "Parfum", unitPrice: "420rb", feeMode: "nett" }),
        item({ name: "Serum", unitPrice: "120.000", feeMode: "bundle", bundle: "b1" }),
        item({ name: "Toner", unitPrice: "80rb", quantity: 2, feeMode: "bundle", bundle: "b1" }),
        item({ name: "Sepatu", unitPrice: "1jt", feeMode: "percent", feePercent: "7,5" }),
      ],
      discount: "5rb",
      shipping: "18.000",
    }), null);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));

    const saved = await getOrder(db, result.id);
    expect(saved).toMatchObject({
      itemsTotal: 350_000 + 420_000 + 120_000 + 160_000 + 1_000_000,
      feesTotal: 25_000 + 50_000 + 75_000,
      discount: 5_000,
      shipping: 18_000,
      total: 2_050_000 + 150_000 - 5_000 + 18_000,
      client: { name: "Siti" },
    });
    expect(saved!.items.map((i) => [i.name, i.feeMode, i.subtotal, i.fee])).toEqual([
      ["Tas Charles & Keith", "per_item", 350_000, 25_000],
      ["Parfum", "nett", 420_000, 0],
      ["Serum", "bundle", 120_000, 0],
      ["Toner", "bundle", 160_000, 0],
      ["Sepatu", "percent", 1_000_000, 75_000],
    ]);
    expect(saved!.items[2].bundleId).toBe(saved!.bundles[0].id);
    expect(saved!.bundles).toMatchObject([{ label: "Skincare", fee: 50_000 }]);
  });

  it("are numbered per year, TLY-2026-0001 onwards, without gaps or repeats", async () => {
    const siti = await client();
    const numbers = [];
    for (let i = 0; i < 3; i++) {
      const r = await createOrder(db, order(siti), null, new Date("2026-12-31T16:30:00Z"));
      if (r.ok) numbers.push(r.number);
    }
    const nextYear = await createOrder(db, order(siti), null, new Date("2026-12-31T17:30:00Z"));

    expect(numbers).toEqual(["TLY-2026-0001", "TLY-2026-0002", "TLY-2026-0003"]);
    // 17:30 UTC on 31 Dec is already 1 January in Jakarta.
    expect(nextYear.ok && nextYear.number).toBe("TLY-2027-0001");
  });

  it("take the voucher amount from the shop settings when ticked", async () => {
    const siti = await client();
    await updateSettings(db, { ...DEFAULT_SETTINGS, voucherAmount: "15000" });

    const r = await createOrder(db, order(siti, { applyVoucher: true }), null);

    expect(r.ok && (await getOrder(db, r.id))).toMatchObject({ voucherApplied: true, voucher: 15_000, total: 360_000 });
  });

  it("refuse bad input field by field, and an unknown or deleted client", async () => {
    const siti = await client();

    const r = await createOrder(db, order(siti, {
      items: [item({ name: "", quantity: 0, unitPrice: "abc", feeMode: "percent", feePercent: "150" }), item({ feeMode: "bundle", bundle: "nope" })],
      shipping: "-1",
    }), null);
    const noItems = await createOrder(db, order(siti, { items: [] }), null);
    const nobody = await createOrder(db, order(9999), null);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({
        "items.0.name": "required",
        "items.0.quantity": "invalid_quantity",
        "items.0.unitPrice": "invalid_amount",
        shipping: "invalid_amount",
      });
    }
    expect(noItems).toEqual({ ok: false, errors: { items: "no_items" } });
    expect(nobody).toEqual({ ok: false, errors: { clientId: "required" } });
  });

  it("can be edited: lines are replaced and the totals priced again, the number stays", async () => {
    const siti = await client();
    const created = await createOrder(db, order(siti), null);
    if (!created.ok) throw new Error("not created");

    const updated = await updateOrder(db, created.id, order(siti, { items: [item({ quantity: 2 })], shipping: "20rb" }));

    expect(updated).toEqual({ ok: true, id: created.id, number: created.number });
    const saved = await getOrder(db, created.id);
    expect(saved).toMatchObject({ itemsTotal: 700_000, feesTotal: 50_000, shipping: 20_000, total: 770_000 });
    expect(saved!.items).toHaveLength(1);
  });

  it("are listed newest first and found by number or client name", async () => {
    const siti = await client("Siti");
    const dina = await client("Dina");
    await createOrder(db, order(siti), null);
    await createOrder(db, order(dina), null);

    expect((await listOrders(db)).map((o) => o.clientName)).toEqual(["Dina", "Siti"]);
    expect((await listOrders(db, { q: "din" })).map((o) => o.clientName)).toEqual(["Dina"]);
    expect((await listOrders(db, { q: "0001" })).map((o) => o.clientName)).toEqual(["Siti"]);
    expect((await listOrders(db, { clientId: siti })).map((o) => o.clientName)).toEqual(["Siti"]);
  });
});
