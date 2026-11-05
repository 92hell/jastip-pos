import { describe, expect, it } from "vitest";
import { createClient, deleteClient, getClient, listClients, updateClient } from "@/lib/clients";
import { createOrder } from "@/lib/orders";
import { db } from "./setup";

const SITI = { name: "Siti", whatsapp: "0812-3456-7890", address: "BSD Cluster A", notes: "Suka skincare", isReseller: false };

describe("Clients", () => {
  it("are saved with their WhatsApp number in international form", async () => {
    const result = await createClient(db, SITI);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await getClient(db, result.id)).toMatchObject({ name: "Siti", whatsapp: "6281234567890", isReseller: false });
  });

  it("refuse a missing name, a number that is not a phone, and a number another client already has", async () => {
    await createClient(db, SITI);

    const bad = await createClient(db, { ...SITI, name: " ", whatsapp: "12ab" });
    const duplicate = await createClient(db, { ...SITI, name: "Siti lagi", whatsapp: "+62 812 3456 7890" });

    expect(bad).toEqual({ ok: false, errors: { name: "required", whatsapp: "invalid_phone" } });
    expect(duplicate).toEqual({ ok: false, errors: { whatsapp: "duplicate_phone" } });
  });

  it("can be marked as reseller and edited; several clients may have no number", async () => {
    const created = await createClient(db, { ...SITI, whatsapp: "" });
    await createClient(db, { ...SITI, name: "Dina", whatsapp: "" });
    if (!created.ok) throw new Error("not created");

    await updateClient(db, created.id, { ...SITI, whatsapp: "", isReseller: true, notes: "Reseller Bintaro" });

    expect(await getClient(db, created.id)).toMatchObject({ isReseller: true, notes: "Reseller Bintaro" });
  });

  it("are found by part of the name or of the number, newest first, with their order count", async () => {
    await createClient(db, SITI);
    await createClient(db, { ...SITI, name: "Dina Pratiwi", whatsapp: "081298765432" });

    expect((await listClients(db, "pratiwi")).map((c) => c.name)).toEqual(["Dina Pratiwi"]);
    expect((await listClients(db, "98765")).map((c) => c.name)).toEqual(["Dina Pratiwi"]);
    expect((await listClients(db)).map((c) => [c.name, c.orders])).toEqual([["Dina Pratiwi", 0], ["Siti", 0]]);
  });

  it("without orders are deleted; with orders they are anonymised and the orders stay", async () => {
    const without = await createClient(db, { ...SITI, whatsapp: "" });
    const withOrders = await createClient(db, SITI);
    if (!without.ok || !withOrders.ok) throw new Error("not created");
    await createOrder(db, {
      clientId: withOrders.id, note: "", bundles: [], discount: "", applyVoucher: false, shipping: "",
      items: [{ name: "Tas", store: "", quantity: "1", unitPrice: "350.000", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "" }],
    } as never, null);

    expect(await deleteClient(db, without.id)).toBe("deleted");
    expect(await deleteClient(db, withOrders.id)).toBe("anonymized");

    expect(await getClient(db, without.id)).toBeNull();
    expect(await getClient(db, withOrders.id)).toMatchObject({ name: `Klien dihapus #${withOrders.id}`, whatsapp: "", address: "", notes: "" });
    expect(await listClients(db)).toEqual([]);
    expect((await createClient(db, SITI)).ok).toBe(true);
  });
});
