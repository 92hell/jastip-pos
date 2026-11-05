import { describe, expect, it } from "vitest";
import { orderBalance } from "@/lib/balance";

const pay = (amount: number) => ({ kind: "payment" as const, amount });

describe("What a client has paid and still owes", () => {
  it("nothing paid: everything is due, and the DP target is shown", () => {
    expect(orderBalance(1_000_000, 50, [])).toEqual({
      paid: 0, due: 1_000_000, dpAmount: 500_000, dpDue: 500_000, overpaid: 0, status: "unpaid",
    });
  });

  it("the DP paid: the rest is due when the items arrive", () => {
    expect(orderBalance(1_000_000, 50, [pay(500_000)])).toMatchObject({ paid: 500_000, due: 500_000, dpDue: 0, status: "dp_paid" });
  });

  it("less than the DP is a partial payment; with no DP target any payment is partial", () => {
    expect(orderBalance(1_000_000, 50, [pay(200_000)])).toMatchObject({ dpDue: 300_000, status: "partial" });
    expect(orderBalance(1_000_000, null, [pay(200_000)])).toMatchObject({ dpAmount: null, dpDue: 0, status: "partial" });
  });

  it("paid in full, in any number of payments", () => {
    expect(orderBalance(1_000_000, 50, [pay(500_000), pay(300_000), pay(200_000)])).toMatchObject({ due: 0, status: "paid" });
  });

  it("an item called off after paying leaves the client overpaid, until refunded or moved to credit", () => {
    const paidBefore = [pay(1_000_000)];
    expect(orderBalance(800_000, null, paidBefore)).toMatchObject({ paid: 1_000_000, due: 0, overpaid: 200_000, status: "overpaid" });
    expect(orderBalance(800_000, null, [...paidBefore, { kind: "refund", amount: 200_000 }])).toMatchObject({ paid: 800_000, overpaid: 0, status: "paid" });
    expect(orderBalance(800_000, null, [...paidBefore, { kind: "to_credit", amount: 200_000 }])).toMatchObject({ paid: 800_000, overpaid: 0, status: "paid" });
  });

  it("a free order (everything sold out and called off) with nothing paid is settled", () => {
    expect(orderBalance(0, 50, [])).toMatchObject({ due: 0, dpAmount: 0, status: "paid" });
  });

  it("DP amounts are rounded up to whole rupiah", () => {
    expect(orderBalance(333_333, 50, [])).toMatchObject({ dpAmount: 166_667 });
  });
});
