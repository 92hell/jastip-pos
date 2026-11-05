import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import { getInvoice } from "@/lib/invoice";
import { createOrder, getOrder, setItemStatus, cancelSoldOut, type OrderInput } from "@/lib/orders";
import { clientCredit, deletePayment, getProof, orderMoney, recordPayment, renewInvoiceLink, settleOverpayment } from "@/lib/payments";
import { DEFAULT_SETTINGS, updateSettings } from "@/lib/settings";
import { db } from "./setup";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const TODAY = "2026-11-05";

async function newOrder(overrides: Partial<OrderInput> = {}, clientName = "Siti") {
  const c = await createClient(db, { name: clientName, whatsapp: "", address: "Jl. Rahasia 1", notes: "catatan pribadi", isReseller: false });
  if (!c.ok) throw new Error("client");
  const r = await createOrder(db, {
    clientId: c.id, note: "", bundles: [], discount: "", applyVoucher: false, shipping: "", dpPercent: "50",
    items: [
      { name: "Tas", store: "Coach", quantity: 1, unitPrice: "800rb", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "" },
      { name: "Dompet", store: "Coach", quantity: 1, unitPrice: "200rb", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "" },
    ],
    ...overrides,
  }, null);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { orderId: r.id, clientId: c.id };
}

const pay = (amount: string, method: "transfer" | "qris" | "cash" | "credit" = "transfer", proof?: Uint8Array) => ({ amount, method, paidOn: TODAY, note: "", proof });

describe("Payments", () => {
  it("a DP then the rest: the balance follows", async () => {
    const { orderId } = await newOrder();
    expect((await orderMoney(db, orderId))!.balance).toMatchObject({ due: 1_000_000, dpAmount: 500_000, status: "unpaid" });

    expect(await recordPayment(db, orderId, pay("500rb"), null)).toEqual({ ok: true });
    expect((await orderMoney(db, orderId))!.balance).toMatchObject({ paid: 500_000, due: 500_000, status: "dp_paid" });

    await recordPayment(db, orderId, pay("500.000", "qris"), null);
    const money = (await orderMoney(db, orderId))!;
    expect(money.balance).toMatchObject({ due: 0, status: "paid" });
    expect(money.payments.map((p) => [p.kind, p.method, p.amount])).toEqual([["payment", "transfer", 500_000], ["payment", "qris", 500_000]]);
  });

  it("keep a photo of the transfer receipt only when it really is an image of at most 800 KB", async () => {
    const { orderId } = await newOrder();

    expect(await recordPayment(db, orderId, pay("100rb", "transfer", JPEG), null)).toEqual({ ok: true });
    expect(await recordPayment(db, orderId, pay("100rb", "transfer", new TextEncoder().encode("<html>not an image")), null)).toEqual({ ok: false, errors: { proof: "proof_not_image" } });
    const big = new Uint8Array(800 * 1024 + 1);
    big.set(JPEG);
    expect(await recordPayment(db, orderId, pay("100rb", "transfer", big), null)).toEqual({ ok: false, errors: { proof: "proof_too_large" } });

    const [first] = (await orderMoney(db, orderId))!.payments;
    expect(first.hasProof).toBe(true);
    expect(await getProof(db, first.id)).toMatchObject({ type: "image/jpeg" });
  });

  it("refuse an amount that is not a positive rupiah amount, and an impossible date", async () => {
    const { orderId } = await newOrder();

    expect(await recordPayment(db, orderId, { ...pay("0"), paidOn: "2026-02-30" }, null)).toEqual({
      ok: false, errors: { amount: "invalid_amount", paidOn: "invalid_date" },
    });
  });

  it("a payment entered by mistake can be removed", async () => {
    const { orderId } = await newOrder();
    await recordPayment(db, orderId, pay("500rb"), null);
    const [p] = (await orderMoney(db, orderId))!.payments;

    await deletePayment(db, orderId, p.id);

    expect((await orderMoney(db, orderId))!.balance.paid).toBe(0);
  });
});

describe("Called-off items already paid for", () => {
  async function paidThenCalledOff() {
    const { orderId, clientId } = await newOrder();
    await recordPayment(db, orderId, pay("1jt"), null);
    const [, dompet] = (await getOrder(db, orderId))!.items;
    await setItemStatus(db, orderId, dompet.id, "sold_out");
    await cancelSoldOut(db, orderId, dompet.id);
    return { orderId, clientId };
  }

  it("leave the client overpaid; she sends the difference back", async () => {
    const { orderId } = await paidThenCalledOff();
    expect((await orderMoney(db, orderId))!.balance).toMatchObject({ overpaid: 200_000, status: "overpaid" });

    expect(await settleOverpayment(db, orderId, "refund", { method: "transfer", paidOn: TODAY }, null)).toEqual({ ok: true });

    const money = (await orderMoney(db, orderId))!;
    expect(money.balance).toMatchObject({ paid: 800_000, overpaid: 0, status: "paid" });
    expect(money.payments.at(-1)).toMatchObject({ kind: "refund", amount: 200_000 });
    expect(await settleOverpayment(db, orderId, "refund", { paidOn: TODAY }, null)).toEqual({ ok: false, errors: { order: "not_overpaid" } });
  });

  it("or keeps it as credit, which pays part of the client's next order (never more than they have or owe)", async () => {
    const { orderId, clientId } = await paidThenCalledOff();
    await settleOverpayment(db, orderId, "credit", { paidOn: TODAY }, null);
    expect(await clientCredit(db, clientId)).toBe(200_000);

    const next = await createOrder(db, {
      clientId, note: "", bundles: [], discount: "", applyVoucher: false, shipping: "", dpPercent: "",
      items: [{ name: "Kaos", store: "", quantity: 1, unitPrice: "150rb", feeMode: "nett", feeAmount: "", feePercent: "", bundle: "" }],
    }, null);
    if (!next.ok) throw new Error("order");

    expect(await recordPayment(db, next.id, pay("200rb", "credit"), null)).toEqual({ ok: false, errors: { amount: "over_credit" } });
    expect(await recordPayment(db, next.id, pay("150rb", "credit"), null)).toEqual({ ok: true });
    expect((await orderMoney(db, next.id))!.balance.status).toBe("paid");
    expect(await clientCredit(db, clientId)).toBe(50_000);

    const [used] = (await orderMoney(db, next.id))!.payments;
    await deletePayment(db, next.id, used.id);
    expect(await clientCredit(db, clientId)).toBe(200_000);
  });
});

describe("The client's invoice link", () => {
  it("shows the order, its status and balance, and her payment accounts, but nothing private", async () => {
    await updateSettings(db, { ...DEFAULT_SETTINGS, voucherAmount: "10000", paymentAccounts: [{ bank: "BCA", holder: "Contoh Demo", number: "0000000000" }] });
    const { orderId } = await newOrder();
    await recordPayment(db, orderId, pay("500rb", "transfer", JPEG), null);
    const order = (await getOrder(db, orderId))!;

    const invoice = await getInvoice(db, order.invoiceToken);

    expect(invoice).toMatchObject({
      number: order.number, clientName: "Siti", total: 1_000_000,
      balance: { paid: 500_000, due: 500_000, status: "dp_paid" },
      shop: { shopName: "JASTIP TITIPLAILIYUK", paymentAccounts: [{ bank: "BCA", number: "0000000000" }] },
    });
    expect(invoice!.items.map((i) => [i.name, i.status])).toEqual([["Tas", "requested"], ["Dompet", "requested"]]);
    const text = JSON.stringify(invoice);
    for (const secret of ["Jl. Rahasia", "catatan pribadi", "proof", "invoiceToken", "createdBy"]) expect(text).not.toContain(secret);
  });

  it("is a 128-bit token; unknown or malformed tokens show nothing; a new link replaces the old one", async () => {
    const { orderId } = await newOrder();
    const old = (await getOrder(db, orderId))!.invoiceToken;
    expect(old).toMatch(/^[0-9a-f]{32}$/);

    const renewed = await renewInvoiceLink(db, orderId);

    expect(await getInvoice(db, old)).toBeNull();
    expect(await getInvoice(db, renewed)).not.toBeNull();
    expect(await getInvoice(db, "../../etc/passwd")).toBeNull();
    expect(await getInvoice(db, "0".repeat(32))).toBeNull();
  });

  it("every order gets its own link", async () => {
    const a = await newOrder({}, "Siti");
    const b = await newOrder({}, "Dina");

    expect((await getOrder(db, a.orderId))!.invoiceToken).not.toBe((await getOrder(db, b.orderId))!.invoiceToken);
  });
});
